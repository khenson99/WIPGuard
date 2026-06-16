# Runbook: Postgres volume fill — ImladrisMetricLineage (June 2026)

**Status:** prevention shipped (#582/#584 retention + per-source lineage cap, #599 bounded
reads + disk health check). The historical data backlog was reclaimed operationally on
2026-06-16 (see "Reclaim performed"). This doc is the postmortem + the reusable reclaim
procedure if `ImladrisMetricLineage` (or any table) ever bloats the volume again.

Related: [db-pruning.md](db-pruning.md) (the retention policy), [oom-crash-loop.md](oom-crash-loop.md)
(the cron-memory sibling), [deploy-downtime.md](deploy-downtime.md), and
[../db-growth-controls.md](../db-growth-controls.md).

## Symptom

Postgres volume fills → `No space left on device` for `pgsql_tmp` temp files → connection
establishment stalls → Prisma connect timeouts → everything DB-backed fails, including Google
sign-in. First acute window 2026-06-11 07:49–07:54 UTC; disk pressure recurred for days.

## Root causes

1. **Unbounded lineage reads (the trigger).** Dashboard/board-pack reads loaded
   `ImladrisMetricLineage` for the full canonical-metric history. With ~36.7M lineage rows, a
   single read sorts/hashes GBs and spills 20+ GB to `pgsql_tmp`; several concurrent reads fill
   the volume. Fixed by **#599** (bounded reads) and the `MAX_LINEAGE_EVIDENCE_ROWS = 500` cap in
   `src/lib/imladris/service.ts`.
2. **Unbounded lineage growth (the fuel).** Materialization wrote a fresh canonical metric value
   (periodEnd = now ⇒ new unique key) plus a full lineage copy every sync cycle, and a few metric
   values carried ~300K+ lineage rows. Fixed by **#582/#584**: lineage TTL
   (`IMLADRIS_LINEAGE_RETENTION_DAYS`, default 14), per-source cap
   (`capLineageRecordsPerSource`, default 1,000 rows/source/metric value), metric-value thinning,
   and outbox retention.

## Why a manual reclaim was still needed

The deployed retention prunes by age (`computedAt < now − 14d`). The bloat backlog was all from
2026-06-05…06-11 — *inside* the 14-day window — so retention correctly pruned 0 of it while the
disk stayed critical. Retention prevents future bloat; it does not retroactively clear a backlog
that hasn't aged out. A second-order effect: canonical/lineage **writes were failing on the full
disk**, so canonical materialization silently froze (max `computedAt` stuck at 2026-06-11) even
though raw ingestion kept working.

## Reclaim performed (2026-06-16)

Verified state before: `ImladrisMetricLineage` ≈ 15 GB / ~36.7M rows (genuinely *live* rows, not
dead-tuple bloat — so `VACUUM` alone reclaims nothing); only **24 "winner" rows** (latest per
`(metricKey, organizationId, userId, calculationVersion)`) are ever read, holding ~272,680 lineage
rows (~0.7%).

Because the rows were live, row-by-row `DELETE` was too slow (a single 100k batch exceeded a 150s
timeout with 4 indexes to maintain). Used an **atomic CTAS swap** instead — one transaction,
rollback-safe, frees disk at COMMIT, no `VACUUM FULL` needed:

```sql
BEGIN;  -- run with lock_timeout=90s, statement_timeout=0
LOCK TABLE "ImladrisMetricLineage" IN ACCESS EXCLUSIVE MODE;
CREATE TABLE "ImladrisMetricLineage_swap" (LIKE "ImladrisMetricLineage" INCLUDING DEFAULTS);
INSERT INTO "ImladrisMetricLineage_swap"
  SELECT l.* FROM "ImladrisMetricLineage" l
  WHERE l."metricValueId" IN (
    SELECT DISTINCT ON ("metricKey","organizationId","userId","calculationVersion") id
    FROM "ImladrisCanonicalMetricValue"
    ORDER BY "metricKey","organizationId","userId","calculationVersion",
             "periodEnd" DESC,"computedAt" DESC);          -- keep winners only
DROP TABLE "ImladrisMetricLineage";
ALTER TABLE "ImladrisMetricLineage_swap" RENAME TO "ImladrisMetricLineage";
-- recreate PK + indexes + FKs with identical names (capture via pg_get_indexdef /
-- pg_get_constraintdef first); FKs: metricValueId→canonical ON DELETE CASCADE,
-- rawRecordId→raw ON DELETE SET NULL.
COMMIT;
ANALYZE "ImladrisMetricLineage";
```

Pre-checks: confirm `count(*)` of winner lineage, that no winner row has an orphan `rawRecordId`
(FK would fail), and that nothing has an incoming FK to the table (none does — it's a leaf).

Result: lineage **15 GB → 104 MB / 272,680 rows**, DB **16 GB → 987 MB**, disk **95% → 3%**. The
old-code canonical⨝lineage read now runs in 63 ms in-memory (no temp spill). Materialization
unfroze on the next sync cycle (writes succeeded once disk was free).

### During the reclaim — temp-spill firefighting

While reclaiming, the still-running reads re-spilled 20+ GB to `pgsql_tmp`. Mitigations used:

- Cancel/terminate runaway reads:
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query ILIKE '%ImladrisMetricLineage%' AND state='active' AND now()-query_start > interval '20s';`
- Cluster-wide temp ceiling so a runaway aborts instead of filling disk:
  `ALTER SYSTEM SET temp_file_limit='16GB'; SELECT pg_reload_conf();` — **left in place** as a
  backstop (16 GB is far above any legitimate query here but below the 50 GB volume). Reset with
  `ALTER SYSTEM RESET temp_file_limit; SELECT pg_reload_conf();`.

## Autovacuum

Autovacuum had **never run** on the old table: default `autovacuum_*_scale_factor = 0.2` put the
trigger at ~7.35M tuples. Per-table settings now applied:

```sql
ALTER TABLE "ImladrisMetricLineage" SET (
  autovacuum_vacuum_scale_factor=0.02, autovacuum_vacuum_threshold=10000,
  autovacuum_vacuum_insert_scale_factor=0.02, autovacuum_vacuum_insert_threshold=10000,
  autovacuum_analyze_scale_factor=0.02, autovacuum_analyze_threshold=10000);
```

## Monitoring gap (action for the operator)

Disk **detection** is solid but **alert routing is not wired in code**:

- `/api/health/db` and `/api/health` report `degraded`/503 over threshold (warn 75% / critical 90%)
  but are **report-only** — nothing polls them to notify.
- Railway's healthcheck targets `/api/health/live`, which is **liveness-only** (always 200), so it
  does not consume the disk signal.
- **The SQL endpoint is blind to the failure mode.** It counts `pg_database_size()` (relations)
  plus WAL when readable, but **not temp files** — and every fill in this incident was `pgsql_tmp`
  sort-spill. A cron polling `/api/health/db` would report `ok` while `pgsql_tmp` fills the disk, so
  it is **not** a sufficient backstop. Don't build one and assume you're covered.

**Do this — the only alarm that sees the real failure mode is the filesystem-level Railway volume
metric:** in the Railway dashboard → `postgres-volume` (50 GB) → Metrics/Alerts, add a usage alert
at ~70% routed to a channel you watch (Slack/email). Railway's CLI has no `alert` command, so this
is dashboard-only and can't be set or verified from the repo. The in-app `/api/health/db` endpoint
stays useful as a *secondary, structural* signal (which table/relation is growing), not as the disk
alarm. Without the volume alert, the disk can climb silently (as it did to 95% here).

## Guardrails

Inspect prod read-only (`SET default_transaction_read_only = on` / `EXPLAIN`). Volume resizing is a
paid, operator-only action. The reclaim deletes only superseded lineage and never the latest row per
metric — dashboards read only winners.

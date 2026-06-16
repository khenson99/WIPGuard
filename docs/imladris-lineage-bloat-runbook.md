# ImladrisMetricLineage bloat — incident runbook & reclaim plan

**Status:** code fixes landed on this branch; production reclaim steps below require Kyle's
approval (data deletion / maintenance window / volume sizing are gated).

## Incident summary (2026-06-11 07:49–07:54 UTC)

Production Railway Postgres (project **WIPGuard**, service **Postgres**) ran out of volume space.
`pgsql_tmp` temp files filled the disk → `No space left on device` → connection establishment
stalled → Prisma connect timeouts → broken Google sign-in.

Two independent root causes, both in the Imladris metrics path:

1. **Unbounded lineage reads (the trigger).** The dashboard readers
   (`buildImladrisMetrics`, `buildCompanyTrackerDashboard`, `buildInvestorDashboardExport`)
   used `include: { lineage }` on a query over the **full** canonical-metric history.
   With ~36.7M lineage rows, that pulled the entire lineage set through a sort that spilled
   ~23 GB into `pgsql_tmp`, exhausting the volume. (Observed live: 6 lineage SELECTs running
   12+ minutes in `BuffileWrite`/`BuffileRead`.)
2. **Unbounded lineage growth (the fuel).** `materialize*` wrote a fresh canonical metric value
   every sync cycle (periodEnd = now lands in the unique key) plus a full lineage copy, even when
   nothing changed. The worker (every 5 min) + `wipguard-cron-sync` (every 10 min) drove the
   lineage table to ~15 GB / ~36.7M rows.

## Verified production state (read-only, 2026-06-15)

| Fact | Value |
|---|---|
| `ImladrisMetricLineage` total size | ~15 GB (12 GB heap + 3.2 GB indexes) |
| Lineage rows (`reltuples` estimate) | ~36,749,068 |
| `n_live_tup` stat (stale/unreliable) | 1,202,264 |
| Canonical metric value rows | 3,408 (periodEnd 2026-06-05 → 2026-06-11) |
| **Latest-per-group "winner" rows** | **24** |
| **Lineage on winners (the only rows dashboards read)** | **~272,680 (~0.7%)** |
| Largest single winner lineage | `marketing.conversion_rate` / `marketing.website_traffic`: 86,401 rows each |
| `last_autovacuum` on lineage | **never** (autovacuum_count = 0) |
| Volume (df) | 46 GB total — appears already resized from the 19.5 GB in the original alert |
| Blockers (repl slots / prepared xacts / long idle-in-txn) | none |

**Implication:** ~99.3% of the lineage table belongs to superseded (non-latest) canonical rows
that no code reads. The keep-set is tiny (~273K rows).

## Code fixes on this branch (no prod action required)

1. **Bounded lineage reads** — `src/lib/imladris/winner-lineage.ts` (`attachWinnerLineage`).
   The three dashboard readers now fetch the full history **without** lineage, pick the winners,
   then load lineage via a second query bounded to the winner ids
   (`where: { id: { in: winnerIds } }, include: { lineage }`). Company-tracker source coverage is
   computed from winners (current availability), not the full history.
2. **No-op write skip** — `replaceLineage` compares the desired lineage signature set against the
   stored rows and skips the delete+insert when unchanged.
3. **Same-day metric reuse** — `upsertCanonicalMetric` reuses the latest same-UTC-day canonical row
   (refreshing `computedAt`) instead of inserting a new snapshot when value/status/confidence/
   warnings are unchanged. This collapses ~288 inserts/day/metric to ~1.
4. **Winner-protected, batched retention** — `src/lib/imladris/lineage-retention.ts`
   (`pruneImladrisMetricLineage`), wired into `runAnalyticsSync` (worker + cron). Deletes lineage
   for superseded canonical rows older than `IMLADRIS_LINEAGE_RETENTION_DAYS` (default 30) in
   `ctid`-targeted batches, capped at `IMLADRIS_LINEAGE_PRUNE_MAX_ROWS` per run (default 200,000).
   Never deletes the latest row per group; never deletes canonical values; fails safe (never fails
   the sync cycle). `EXPLAIN` confirms it index-scans `ImladrisMetricLineage_metricValueId_idx`.

Tests: 999 passing across `src/lib/imladris`, `src/lib/sync`, `src/app/api/cron/sync`, including
new regression tests for the skip/reuse write path, the bounded-read path, and the batched prune.

> Note: with all current data < 10 days old, the default 30-day retention window prunes **nothing
> immediately**. It is the steady-state maintenance mechanism. Clearing the existing ~36.5M-row
> backlog needs one of the reclaim options below.

## Reclaim plan (requires Kyle's approval)

Disk headroom now: 46 GB volume, ~16 GB used, ~30 GB free — enough to `VACUUM FULL` the 15 GB table.

### Option A — maintenance window, fastest full reclaim (recommended)

1. Deploy this branch. Growth stops immediately.
2. Drain the backlog. Either:
   - set `IMLADRIS_LINEAGE_RETENTION_DAYS=3` and `IMLADRIS_LINEAGE_PRUNE_MAX_ROWS=2000000`, let the
     worker drain over a few cycles; **or**
   - one-time manual batched delete (read the runbook's `pruneImladrisMetricLineage` query; run in
     batches of 50k so locks stay short).
   Target end state: lineage live rows ~36.7M → ~273K.
3. Reclaim disk (ACCESS EXCLUSIVE lock; dashboards briefly unavailable — minutes):
   ```sql
   VACUUM (FULL, ANALYZE) "ImladrisMetricLineage";
   ```
   (`pg_repack` is the online alternative but needs the extension installed + ~2× free space;
   `VACUUM FULL` is built-in and we have a window.)
4. Tune autovacuum so it actually fires going forward (see below).
5. (Optional, Kyle-only, paid) resize the volume back down once usage is verified low. Do **not**
   shrink before reclaim is confirmed.

### Option B — zero-downtime, slower

1. Deploy. Growth stops.
2. Lower the retention window; batched retention drains superseded rows over hours. Autovacuum
   (once tuned) marks freed space reusable, so the table stops growing — but the ~15 GB file is
   **not** returned to the OS without `VACUUM FULL`/`pg_repack`. Use when a window isn't available;
   schedule the rewrite later.

### Why autovacuum never ran + fix

Default `autovacuum_vacuum_insert_scale_factor = 0.2` and `autovacuum_vacuum_scale_factor = 0.2`
mean the insert/dead-tuple trigger on this table is ~`1000 + 0.2 × 36.7M ≈ 7.35M` — never reached
between (never-run) vacuums. Set per-table options so it self-maintains:

```sql
ALTER TABLE "ImladrisMetricLineage" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 10000,
  autovacuum_vacuum_insert_scale_factor = 0.02,
  autovacuum_vacuum_insert_threshold = 10000,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 10000
);
```

Consider a follow-up: investigate why `marketing.conversion_rate` / `marketing.website_traffic`
attach ~86K lineage rows to a single metric value — even the keep-set is dominated by these two.

## Maintenance-window execution (copy-paste) — Kyle runs these

Prereqs: low-traffic window; dashboards may be briefly unavailable during `VACUUM FULL`. All deletes
keep the latest row per group, so the dashboards' data is never affected. Run from the repo.

**1. Pre-checks (read-only):**
```bash
railway ssh --service Postgres -- bash -lc 'psql -U postgres -d railway -c "
  SELECT pg_size_pretty(pg_total_relation_size('\''\"ImladrisMetricLineage\"'\'')) AS lineage_size,
         (SELECT reltuples::bigint FROM pg_class WHERE relname='\''ImladrisMetricLineage'\'') AS est_rows;
  SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;"'
railway ssh --service Postgres -- bash -lc 'df -h /var/lib/postgresql/data | tail -1'
```

**2. Drain the backlog in 50k batches (each its own transaction → short locks).** This deletes
lineage for every NON-latest canonical row (provably unread), keeping all 24 winners:
```bash
railway ssh --service Postgres -- bash -lc 'while :; do
  n=$(psql -U postgres -d railway -tA -c "
    WITH latest AS (
      SELECT DISTINCT ON (\"metricKey\",\"organizationId\",\"userId\",\"calculationVersion\") id
      FROM \"ImladrisCanonicalMetricValue\"
      ORDER BY \"metricKey\",\"organizationId\",\"userId\",\"calculationVersion\",\"periodEnd\" DESC,\"computedAt\" DESC)
    DELETE FROM \"ImladrisMetricLineage\"
    WHERE ctid IN (
      SELECT l.ctid FROM \"ImladrisMetricLineage\" l
      WHERE l.\"metricValueId\" NOT IN (SELECT id FROM latest)
      LIMIT 50000)");
  echo \"deleted batch: $n\";
  [ \"$n\" -lt 50000 ] && break;
done'
```
> To keep an audit window instead of a full clear, add `AND l."metricValueId" IN (SELECT v.id FROM "ImladrisCanonicalMetricValue" v WHERE v."periodEnd" < now() - interval '7 days')` to the inner select. (The shipped worker already does winner-protected, age-windowed pruning automatically.)

**3. Verify the keep-set remains (~273K winner rows):**
```bash
railway ssh --service Postgres -- bash -lc 'psql -U postgres -d railway -c "SELECT count(*) FROM \"ImladrisMetricLineage\";"'
```

**4. Reclaim disk to the OS (ACCESS EXCLUSIVE lock; minutes — reads the old 12 GB heap):**
```bash
railway ssh --service Postgres -- bash -lc 'psql -U postgres -d railway -c "VACUUM (FULL, ANALYZE) \"ImladrisMetricLineage\";"'
```

**5. Make autovacuum self-maintain this table going forward:**
```bash
railway ssh --service Postgres -- bash -lc 'psql -U postgres -d railway -c "
  ALTER TABLE \"ImladrisMetricLineage\" SET (
    autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 10000,
    autovacuum_vacuum_insert_scale_factor = 0.02, autovacuum_vacuum_insert_threshold = 10000,
    autovacuum_analyze_scale_factor = 0.02, autovacuum_analyze_threshold = 10000);"'
```

**6. Post-reclaim check** (rerun step 1 — expect lineage size ≈ tens of MB, disk freed). Then decide
on volume sizing (paid, Kyle-only) — leaving headroom is fine; don't shrink before this is verified.

## Guardrails honored

All production inspection was read-only (`SET default_transaction_read_only = on` / `EXPLAIN`).
No volume resize, no `VACUUM`, no deletes were executed. The destructive/maintenance steps above
are documented for Kyle to run (or approve) explicitly.

# Runbook: WIPGuard prod — DB retention/pruning go-live verification

**Date:** 2026-06-16 (UTC) · **Scope:** observational verification only (no code/config changes
were made during verification) · **Verified commits:** `3adaec13` (#606) through `7e2d998f` (#598)

Related: [db-pruning.md](db-pruning.md) (the retention policy),
[postgres-disk-incident-2026-06.md](postgres-disk-incident-2026-06.md) (the acute incident this
verifies recovery from), [oom-crash-loop.md](oom-crash-loop.md), and
[concurrent-index-migrations.md](concurrent-index-migrations.md).

## TL;DR

DB retention/pruning is live and running cleanly every ~10 min, with bounded memory and no
OOM/crash. The acute incident (Postgres volume-full + OOM crash-loop) is resolved. One open
question remains: whether pruning bounds *steady-state* growth once rows age past the 14-day
retention TTL — expected to first show ~2026-06-24, tracked by the `wipguard-db-growth-watch`
scheduled task.

## What was verified

- **Cron fires reliably** — 18+ consecutive `wipguard-cron-sync` fires on a clean ~10-min cadence,
  each returning `202 {"queued":true,"mode":"background"}` from `/api/cron/sync`. No gaps.
- **Multiple full cycles observed end-to-end** on the deployed code (e.g. 06:40, 07:00, and 18:40
  UTC — the last on `7e2d998f`/#598).
- **Pruning runs clean** — all three growth-control pruners returned result objects (not errors):
  `lineagePruning`/`metricValuePruning`/`outboxPruning` each `deletedRows: 0`; snapshot `pruning`
  `deleted: 0`; `retention` materialized.
- **No pruning error keys** — none of `analytics_sync.lineage_pruning_failed`,
  `…metric_value_pruning_failed`, `…outbox_pruning_failed`, `…imladris_materialization_failed`.
- **Memory bounded** — no OOM and no crash-restart; each full cycle completed inside one continuous
  container life (`/api/health` uptime spanned the cycle). Prior incident peaked ~3.4 GB; nothing
  comparable. (Note: PR #594's `[cron-sync:mem]` RSS logging did not ship in the deployed code, so
  memory is confirmed via no-restart + health rather than mem log lines.)
- **Health stable** — `status: ok`; pool healthy (0 errors, 0 exhaustion); storage ~2–3% of the
  50 GB volume.
- **Deferred prune indexes APPLIED** — the `CONCURRENTLY` migration
  `20260615120000_add_retention_prune_indexes` is skipped at deploy by design, but all three indexes
  exist in prod (applied out-of-band): `SecurityAuditEvent_createdAt_idx`,
  `ImladrisSourceSyncRun_startedAt_idx`, `ImladrisRawSourceRecord_createdAt_idx`.

## Table sizes (prod, 2026-06-16)

| Table | Size | ~Rows |
|---|---|---|
| ImladrisMetricLineage | 300 MB | 818,604 |
| ImladrisRawSourceRecord | 159 MB | 109,167 |
| ImladrisSourceSyncRun | 24 MB | 36,610 |
| AnalyticsSnapshot | 17 MB | 821 |
| ImladrisCanonicalMetricValue | 3.6 MB | 3,168 |
| OutboxEvent | 1.4 MB | 1,546 |

Total DB ~1.1–1.6 GB / 50 GB volume (~2–3%). The lineage table is substantial, so the clean no-OOM
run was a meaningful memory test. `deletedRows: 0` reflects rows still inside the 14-day retention
window, not an idle pruner.

## Open follow-ups (prioritized)

1. **Confirm growth plateaus** — the real incident-prevention proof. Retention TTLs: lineage 14d,
   metric-values 14d, outbox 14d/30d. `deletedRows` should turn non-zero ~2026-06-24 (14 days after
   the ~June-10 recovery) and DB size should flatten. Tracked by `wipguard-db-growth-watch` (daily) +
   `wipguard-db-growth-watch-plateau` (hourly, June 23–26).
2. **Stop the cron reporting `ok: false` every cycle** — it's degraded purely from unrelated
   third-party integration failures (SEMrush "API UNITS BALANCE IS ZERO"; Google Calendar API
   disabled; Slack `missing_scope`). A permanently-degraded sync masks new failures — fix or
   explicitly suppress so `ok` is a real signal.
3. **Decouple pruning from the flaky integrations** — cycle runtime ~6 min, almost entirely
   external-API timeouts. It's inside the 10-min window (advisory lock prevents stacking), but a slow
   prune would be indistinguishable from the usual timeouts. Separate-budget/log the prune passes;
   consider the in-flight `/api/cron/db-prune` split.
4. **Add retention telemetry/alerting** — emit `[retention:metrics]` per cycle and a
   `[retention:alert]` when rows past TTL aren't being deleted (silent-regrowth guard). (Tracked in a
   separate PR.)

## How to reproduce

- Cron firing: `railway logs -s wipguard-cron-sync --since 30m --json`
- Cycle/pruning/errors: `railway logs -s WIPGuard-app --since 15m --json`, inspect the
  `background degraded` body for pruner result objects + grep the 4 error keys
- Health: `curl https://wipguard-app-production.up.railway.app/api/health`
- Index/size check (read-only): `railway run -s Postgres -- node <script>` querying `pg_indexes` /
  `pg_class` via `DATABASE_PUBLIC_URL`

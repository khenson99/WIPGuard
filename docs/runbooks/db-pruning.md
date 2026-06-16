# Database retention & pruning

Context: on 2026-06-10 the production Postgres volume filled at ~10GB, Postgres
crash-looped in WAL recovery on "No space left on device", and every DB-backed
feature (including Google sign-in) went down. The volume was grown to 20GB, but
nothing bounded table growth.

## Relationship to `docs/db-growth-controls.md`

This job is **complementary** to the controls in
[`docs/db-growth-controls.md`](db-growth-controls.md), and the two delete
**disjoint** sets of tables — there is no overlap in what gets removed:

- **db-growth-controls (runs inside the sync cycle)** bounds the tables that
  grew without bound and caused the outage: `ImladrisMetricLineage` (8.1 GB /
  91% of the DB at the outage — superseded lineage generations) via a 14-day
  TTL + per-source write cap, plus `ImladrisCanonicalMetricValue` thinning and
  `OutboxEvent` retention.
- **This job (a standalone daily cron)** bounds the *other* append-only tables
  — `ImladrisRawSourceRecord`, `ImladrisSourceSyncRun`, `MetricHistory`,
  `SecurityAuditEvent`, `AnalyticsSnapshot` — and adds the size/WAL visibility
  endpoint (`/api/health/db`) that neither system had before.

Two deliberate design choices follow from the outage: (1) this job is
**decoupled from the sync cycle**, so retention keeps running even when sync is
failing (the failure mode that let the original table grow unnoticed); and
(2) there is a **synergy with the lineage TTL** — once db-growth-controls ages
out superseded lineage, the old `ImladrisRawSourceRecord` rows that lineage
used to reference fall outside the 13-month window with no remaining lineage,
so this job can finally reclaim them.

## What consumes space (write-path analysis)

The tables below are the ones this job manages. (`ImladrisMetricLineage`,
`ImladrisCanonicalMetricValue`, and `OutboxEvent` — the dominant growers — are
handled by db-growth-controls, not here.) Before this work, the only delete
path among these was `AnalyticsSnapshot` (whose pruner only runs as a side
effect of the `/api/cron/sync` analytics sync — so pruning stops exactly when
sync starts failing). The cron sync fires every 10 minutes
(`railway/cron-sync`, `*/10 * * * *`), which sets the write rates below.

| Table | Write path | Growth shape | Heavy columns |
| --- | --- | --- | --- |
| `ImladrisRawSourceRecord` | upserted per `(provider, objectType, externalId, scopeKey)` on every provider sync (`src/lib/imladris/ingestion.ts`) | grows with total source-object cardinality across ~18 providers; rows are never deleted | `payload Json` (full provider object) |
| `ImladrisSourceSyncRun` | one row created per provider per ingestion call — every 10-minute cron tick | O(1k) rows/day, ~1M rows/year | `checkpoint Json`, `lastError Text` |
| `MetricHistory` | `createMany` of ~50 metrics × 3 range presets per user per sync tick (`src/lib/analytics/metric-history.ts`) | ~20k+ rows/day per active user | row count (reads only ever take the latest ~12 per key) |
| `AnalyticsSnapshot` | per provider/preset/sync; new row per `toDate` | bounded at 30d **only while sync succeeds** | `payload Json` |
| `SecurityAuditEvent` | every auth/permission decision (`src/lib/security-audit.ts`) | proportional to traffic; reads cap at the latest 200 | `details Json`, `userAgent` |

`OutboxEvent` is handled by db-growth-controls. Other append-only tables
(`WorkflowTriggerEvent`, `FunnelEvent`, `IntegrationReceipt`,
`SubmissionEvent`) still have no sweeper; they are lower-rate by code path —
watch their real sizes via `/api/health/db` and extend the policy if they show
up in the top tables.

To verify sizes against the live database (read-only):

```sql
SELECT pg_size_pretty(pg_database_size(current_database()));

SELECT c.relname,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       pg_size_pretty(pg_relation_size(c.oid))       AS heap,
       GREATEST(c.reltuples, 0)::bigint              AS approx_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 15;
```

## Product invariants the policy must not break

1. **13-month Imladris lookback.** `getImladrisHistoricalWindow()`
   (`src/lib/imladris/ingestion.ts`) is `now − 13 months`; materialization
   selects raw records whose `occurredAt`/`sourceCreatedAt`/`sourceUpdatedAt`
   fall inside a period within that window. Canonical metric values and their
   lineage for that window must survive.
2. **Standing finance objects are read at any age.** `financeWindowWhere`
   (`src/lib/imladris/materialization.ts`) selects
   `FINANCE_STANDING_OBJECT_TYPES` (subscription, deal, balance, snapshot,
   active_customer_ref, …) with `timestamp <= periodEnd` — i.e. arbitrarily
   old rows feed point-in-time finance metrics. These object types are never
   pruned.
3. **Lineage is not FK-protected.** `ImladrisMetricLineage.rawRecordId` is
   `onDelete: SetNull` — deleting a referenced raw record silently destroys
   lineage. The pruner must (and does) exclude lineage-referenced rows with an
   explicit `NOT EXISTS`, evaluated inside the `DELETE` statement itself so a
   concurrent materialization cannot race it.
4. **Sync-run deletion cascades to raw records.** `ImladrisRawSourceRecord.
   syncRunId` is `onDelete: Cascade`, and a never-re-upserted record still
   points at its *original* run. Only sync runs with **zero** remaining raw
   records are deleted, after raw-record pruning has run.
5. **Monthly P&L history snapshots are permanent.** The
   `financial-planning`/`monthly` `AnalyticsSnapshot` rows are the long-term
   financial history and are exempt (same exemption as the existing
   `pruneAnalyticsSnapshots`).

## Retention policy

All windows are env-configurable and clamped to a floor so misconfiguration
can never violate the invariants above. Defaults:

| Table | Env var | Default | Floor | Extra protection |
| --- | --- | --- | --- | --- |
| `ImladrisRawSourceRecord` | `DB_PRUNE_RAW_RECORD_RETENTION_DAYS` | 425d | 410d (> any 13-month span + margin) | every timestamp (`occurredAt`, `sourceCreatedAt`, `sourceUpdatedAt`, `createdAt`, `updatedAt`) must be older than the cutoff; no `ImladrisMetricLineage` reference; `objectType` not a standing finance type |
| `ImladrisSourceSyncRun` | `DB_PRUNE_SYNC_RUN_RETENTION_DAYS` | 90d | 30d | only runs with no remaining raw records |
| `MetricHistory` | `DB_PRUNE_METRIC_HISTORY_RETENTION_DAYS` | 425d | 30d | — |
| `SecurityAuditEvent` | `DB_PRUNE_SECURITY_AUDIT_RETENTION_DAYS` | 425d | 90d | — |
| `AnalyticsSnapshot` | `ANALYTICS_SNAPSHOT_RETENTION_DAYS` (existing) | 30d | 7d | monthly P&L history context exempt |

Because a record is only prunable when **all** of its timestamps are stale,
anything still being returned by a provider sync keeps a fresh `updatedAt`
and is untouchable regardless of its business date.

## How the job runs

- **Endpoint:** `POST /api/cron/db-prune` — authorized by the same
  `x-cron-secret` header / `CRON_SYNC_SECRET` (or `INTEGRATION_SYNC_SECRET`)
  used by `/api/cron/sync`. Background by default (202), `?wait=1` to block.
- **Schedule:** `railway/cron-db-prune` — a Railway cron service (same
  curl-image pattern as `railway/cron-sync`) hitting the endpoint daily at
  03:47 UTC. Point `TARGET_URL` at
  `https://<app-host>/api/cron/db-prune?wait=1`.
- **Batched deletes:** every delete is `DELETE … WHERE id IN (SELECT … LIMIT
  batch)` in its own short transaction — no long-running locks. Batch size via
  `DB_PRUNE_BATCH_SIZE` (default 1000), per-table batch cap via
  `DB_PRUNE_MAX_BATCHES_PER_TABLE` (default 200), wall-clock budget via
  `DB_PRUNE_TIME_BUDGET_MS` (default 240000). A run that hits a cap reports
  `truncated: true` and simply continues the next day — the job is idempotent.
  The per-table order rotates by calendar day so that, if one table's deletes
  are pathologically slow and exhaust the time budget, it can't starve the
  same later tables on every run.
- **Dry run:** body `{ "dryRun": true }` or query `?dryRun=1` counts
  prunable rows without deleting. `DB_PRUNE_FORCE_DRY_RUN=true` forces every
  run (including scheduled ones) into dry-run mode — use it as a kill switch
  or during rollout.
- **Structured logs:** each batch and each table summary is logged as
  `[db-prune] <json>` (table, deleted, batches, cutoff, dryRun, durationMs),
  visible in Railway logs for WIPGuard-app.

This job is the **only** code path that deletes retention-managed rows
(plus the pre-existing snapshot pruning inside `/api/cron/sync`).

## Visibility & alerting

`GET /api/health/db` (unauthenticated, coarse — booleans/counts only, same
conventions as `/api/health/auth`) reports:

- `databaseBytes` (`pg_database_size`), `walBytes`, and `monitoredBytes`
  (= database + WAL) against the configured degraded threshold
  (`DB_HEALTH_SIZE_DEGRADED_GB`, default 15 — i.e. 75% of the 20GB volume),
- `walReadable` — `pg_ls_waldir()` needs the `pg_monitor` role; if the app's
  DB user lacks it, `walBytes` is null, `walReadable` is false, and WAL is
  **not** counted toward the threshold,
- the top tables by `pg_total_relation_size` (total / tableBytes [heap+TOAST,
  where JSON payloads live] / indexBytes / approximate row count).

Returns HTTP 503 with `status: "degraded"` when `monitoredBytes` exceeds the
threshold or the DB is unreachable.

**WAL caveat — important.** The 2026-06-10 fill was driven by WAL during
recovery, and `pg_database_size` counts relations only. This endpoint now
folds WAL into `monitoredBytes` *when the role can read it*, but temp files
and replication-slot retention are still invisible to any in-DB query. Treat
**Railway's volume-usage metric as the primary disk alarm** and this endpoint
as the structural/secondary signal; a green check with `walReadable: false`
has not seen WAL at all.

## Indexes

The prune predicates filter a single timestamp (`createdAt` / `startedAt`)
per table. `MetricHistory` and `AnalyticsSnapshot` already have a `capturedAt`
index; migration `20260615120000_add_retention_prune_indexes` adds
`createdAt`/`startedAt` indexes to `SecurityAuditEvent`,
`ImladrisSourceSyncRun`, and `ImladrisRawSourceRecord` (no existing index on
those leads with a plain timestamp, so the prune would otherwise seq-scan).

The migration runs inside a transaction (the `migrate.cjs` runner refuses
`CONCURRENTLY`), so on the large existing tables a non-concurrent
`CREATE INDEX` briefly holds a `SHARE` lock (blocks writes during the build).
To avoid that on the next deploy, an operator MAY pre-create them by hand in a
low-traffic window — the migration's `IF NOT EXISTS` then no-ops:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImladrisRawSourceRecord_createdAt_idx" ON "ImladrisRawSourceRecord"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ImladrisSourceSyncRun_startedAt_idx"   ON "ImladrisSourceSyncRun"("startedAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SecurityAuditEvent_createdAt_idx"      ON "SecurityAuditEvent"("createdAt");
```

## Rollout

1. Deploy. Run a manual dry run and review the counts:
   `curl -X POST "$APP/api/cron/db-prune?wait=1&dryRun=1" -H "x-cron-secret: $SECRET"`
2. Create the `wipguard-cron-db-prune` Railway service from
   `railway/cron-db-prune` (set `TARGET_URL`, `CRON_SYNC_SECRET`). Optionally
   set `DB_PRUNE_FORCE_DRY_RUN=true` on WIPGuard-app for a few scheduled runs
   and compare logs.
3. Remove `DB_PRUNE_FORCE_DRY_RUN` to enable real deletes. The first runs
   delete in daily capped slices until the backlog converges; raise
   `DB_PRUNE_MAX_BATCHES_PER_TABLE` temporarily (or loop `?wait=1` runs
   manually) to drain faster.
4. Add an uptime/alert check on `GET /api/health/db` expecting HTTP 200.

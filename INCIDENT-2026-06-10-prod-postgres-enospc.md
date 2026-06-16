# Incident: Prod Postgres down — volume full (ENOSPC)

**Date:** 2026-06-10 · **Status:** RESOLVED (service restored 17:18 UTC) — prevention work open · **Impact:** Entire prod app (wipguard-app-production.up.railway.app) returned 502 for ~17h; all integrations, cron syncs, and funnel collection failed.

## Resolution (2026-06-10, executed with approval)

- `railway redeploy --service Postgres -y` at ~17:16 UTC → WAL redo completed in ~90s on the grown 20GB volume (`redo done at 15/6DC0B078`) → `database system is ready to accept connections` at 17:18:06 UTC.
- App recovered without redeploy: `/api/health/live` 200, `/api/health` (DB-backed) 200, `/api/integrations` 401-unauth (correct). Cron sync resumed immediately (snapshots captured 17:10–17:16 sweep).
- Post-restart state: DB 8,992MB + WAL 624MB on 20GB volume (~50% headroom).

## Second outage same day (app crash, ~19:53–00:39 UTC)

- Postgres entered recovery mode again ~19:53 UTC — **not ENOSPC** (volume 10.3/19.5GB). Suspected DB container memory pressure during heavy `ImladrisMetricLineage` reads introduced by #580 derived metrics (PG logged a giant multi-hundred-param lineage SELECT around the crash). Needs confirmation; raises the priority of the lineage growth-controls work from "disk" to "disk + memory."
- The app crash-looped against the recovering DB, exhausted `restartPolicyMaxRetries: 10`, and stayed **Crashed** (502) — Railway does not auto-recover a service that has exhausted retries even after its dependency heals. Consider a higher retry budget or restartPolicyType ALWAYS for the app.
- The 17:45 UTC auto-deploy of fix #581 (`ea926f9b`) had also CRASHED at boot during DB instability, so traffic had stayed on pre-fix code.
- Restored 00:39 UTC 2026-06-11 via approved `railway redeploy --service WIPGuard-app -y`: clean boot on `ea926f9b`, migrations consistent, health 200s.

## Fix #581 verification (env-managed placeholder poisoning)

- Merged as PR #581 (`ea926f9b`): placeholder never persisted again; rows without a real secret no longer block env fallback (`connectionBlocksEnvFallback`); previously-poisoned rows self-heal on the next run. 7 regression tests; 36 tests across the 3 touched test files pass in this worktree.
- Local proof: two consecutive `runHealthChecksSync` runs are STABLE at 9 OK / 3 FAIL with only true upstream errors (pre-fix, run 2 collapsed to 2 OK / 10 FAIL on placeholder garbage).
- True remaining failures: SEMrush API units balance zero (billing); local Reddit token lacks `adsread` (one-time reconnect; prod's OAuth grant is fine); **new bug exposed**: Meta Page health check sends `since == until` (single-day range serialized to date strings) which Graph rejects — chipped as a follow-up with diagnosis (fetchers-ads.ts ~1626–1682).
- **Second bug exposed by #581 (FIXED — merged as PR #586)**: prod Linear sync failed GraphQL validation — `Variable "$updatedAfter" of type "DateTime!" used in position expecting type "DateTimeOrDuration"` (Linear evolved their filter scalar). Two-line fix in `src/lib/analytics/fetchers-development.ts`.
- **Third bug exposed by #586 (FIXED — PR #591)**: with types valid, Linear's executor rejected the query — "Query too complex. Complexity: 37,577.9. Maximum allowed: 10,000." `projects(first: 50)` × nested `issues(first: 100)` dominated. Rebalanced to projects(20)/nested issues(25) — zero truncation (outer `$projectAfter` pagination + existing `ImladrisProjectIssues` per-project overflow pagination). First-ever successful live `fetchLinearData` run: 522 issues / 34 projects. **The Linear data sync has never once worked in production** — three stacked failures (credentials → scalar → complexity) each masked the next.
- Prod self-heal confirmed from the fix's brief 17:45–19:53 serving window: Mercury ERROR→CONNECTED, SEMrush now reports its true quota error instead of placeholder "WRONG KEY".
- Operational fact: prod sync cron (`wipguard-cron-sync`) fires every **20 minutes** (not 10) as a one-shot Railway cron; it survived the outage and resumed on schedule.

## Confirmed root cause (post-restart measurements)

- **`ImladrisMetricLineage` = 8,164MB — 91% of the database — with 21,983,741 live rows.** `replaceLineage` (`src/lib/imladris/materialization.ts` ~1311) writes one lineage row per contributing raw record per metric value on every 10-minute materialization, and lineage for old metric values never ages out. This is live data, not bloat — `VACUUM FULL` will not reclaim it; the fix is design-level (see follow-ups).
- Secondary: **`OutboxEvent` 664MB / 906,352 rows** (oldest 2026-02-16), no cleanup anywhere.
- Earlier suspects ruled out: FunnelEvent/FunnelVisitor are tiny (456 / 8 rows); AnalyticsSnapshot retention works (811 rows, 15MB).
- The relation that hit ENOSPC (`52578` = `RetentionTenantCurrent`) was merely the unlucky writer when the disk filled.

## Post-restart integration state (prod, 17:10–17:16 UTC sweep)

- Healthy & syncing: Google Workspace, HubSpot (raw ingestion partial warning), Slack (connected; snapshot ERROR — investigate scopes), Coda, **Reddit (real OAuth grant with refresh token — adsread fine in prod)**, Stripe, Webflow, Google Ads, Pylon, **Meta Ads + Meta Page (real OAuth rows — no placeholder poisoning here)**, Google Analytics.
- Failing **due to the env-managed placeholder bug** (row's accessToken is the literal `env-managed`, which then gets used as the credential and blocks env fallback): **Linear (401), Mercury ("Refresh token is missing"), SEMrush ("ERROR 120 :: WRONG KEY" — masking the real zero-balance issue)**. The env tokens themselves are valid (verified directly).

## Timeline (UTC)

| Time | Event |
|---|---|
| ≤ 2026-06-10 00:36 | Postgres volume (then ~9.3GB) fills. First observed `FATAL: could not extend file "base/16384/52578": No space left on device` during WAL redo of a `Heap/DELETE` record (`xmax: 17123987`). |
| 00:36+ | Crash loop: start → recovery interrupted → redo → ENOSPC → shutdown. Retries exhausted; container stopped. |
| (unknown) | postgres-volume grown to **20GB provisioned** (now shows 9,944MB used / 20,000MB). **Service was never restarted**, so Postgres never retried recovery on the larger disk. |
| ~15:13 | App container still serving `/api/health/live` 200 (route doesn't touch DB). |
| ~18:15 | All routes 502 ("Application failed to respond"); app logs full of Prisma `P1001: Can't reach database server at postgres.railway.internal`; `POST /api/cron/sync` failing every 10 min (cron service schedule `*/10 * * * *`). |

## Evidence

- Postgres deploy logs: repeated `No space left on device` during `WAL redo`, `database system was interrupted while in recovery`, `Stopping Container`.
- `railway volume list`: `postgres-volume 9944MB/20000MB` (grown), `wipguard-app-volume 1059MB/50000MB` (fine).
- pgbackrest sidecar at boot: `volume 9307 MiB; sized wal-drop=500 MiB queue-max=4653 MiB` — WAL archive queue alone may consume up to ~4.6GB of the (old) 9.3GB volume.
- **Backup posture concern:** restore-gate prints `WAL_RECOVER_FROM_BUCKET=` (empty) — no off-volume WAL recovery bucket configured. Verify an external backup target exists before relying on "restore from backup."
- Public TCP proxy (`yamanote.proxy.rlwy.net:57335`) accepts TCP but RSTs all Postgres/TLS traffic — consistent with the target DB being down (not a separate issue).

## Likely growth drivers (code analysis — confirm with SQL below)

Pruning exists **only** for `AnalyticsSnapshot` (`ANALYTICS_SNAPSHOT_RETENTION_DAYS`, enforced in `src/lib/sync/analytics.ts` → `src/lib/analytics/snapshots.ts`). No retention found for:

1. **`FunnelEvent` / `FunnelVisitor`** — written by the *public* `/api/analytics/funnel/collect` endpoint on every website page view (`src/lib/analytics/visitor-funnel.ts`: `funnelEvent.create` per event). Unbounded.
2. **`OutboxEvent`** — created by automations runtime, event bus, and Slack notifications (`src/lib/event-bus.ts`, `src/lib/automations/runtime.ts`, `src/lib/integrations/slack-notifications.ts`). No consumer-side cleanup found. Unbounded.
3. **Imladris raw layer** (`ImladrisRawSourceRecord`, `ImladrisSourceSyncRun`) and observability/audit tables (`IntegrationReceipt`, `SecurityAuditEvent`, `WorkflowTriggerEvent`, `MetricHistory`, `CeoMetricValueSnapshot`, `SubmissionEvent`) — append-mostly, fed by the 10-minute cron; no pruning found.
4. **WAL backlog** — heavy churn (10-min syncs + snapshot pruning deletes) plus a possibly stalled/local-only archive queue.

The failing redo record is a `Heap/DELETE` — heavy delete churn (e.g. snapshot pruning) was active when the disk filled; deletes still consume WAL/space before vacuum reclaims.

## Recovery plan (pending approval — NOT executed)

1. Restart/redeploy the **Postgres** service (`railway redeploy --service Postgres` or dashboard). The grown 20GB volume gives WAL redo ~10GB headroom; recovery should complete.
2. Watch logs for `redo done` → `database system is ready to accept connections`.
3. Verify app recovery: `/api/health/live` 200, then DB-backed routes.
4. If redo still hits ENOSPC: grow volume further (Railway supports online grow) and restart again. Treat pgbackrest restore as last resort — external bucket existence unverified.
5. Run the diagnostics SQL below; decide retention work from real sizes.

## Post-restart diagnostics (read-only, paste into psql)

```sql
-- What hit ENOSPC?
SELECT relname FROM pg_class WHERE relfilenode = 52578;
-- Top 20 relations by total size
SELECT relname, pg_size_pretty(pg_total_relation_size(c.oid)) AS total
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE relkind IN ('r','m') AND n.nspname = 'public'
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 20;
-- WAL on disk
SELECT pg_size_pretty(sum(size)) AS wal_size FROM pg_ls_waldir();
-- Database total
SELECT pg_size_pretty(pg_database_size(current_database()));
-- Dead-tuple pressure
SELECT relname, n_dead_tup, n_live_tup FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
```

## Prevention follow-ups

- Add retention/pruning jobs for `FunnelEvent`/`FunnelVisitor`, `OutboxEvent`, Imladris raw records, and observability tables (mirror the `AnalyticsSnapshot` pattern).
- Add volume-usage alerting (Railway metrics) well below 100%.
- Configure/verify an **off-volume** pgbackrest target (`WAL_RECOVER_FROM_BUCKET` currently empty).
- Set `INTEGRATION_TOKEN_SECRET` in prod (currently falls back to `NEXTAUTH_SECRET`; rotating that would orphan stored integration tokens).
- Unrelated to the outage but found in the same sweep: SEMrush API units balance is zero (same token local+prod); prod PostHog lacks `POSTHOG_PROJECT_ID`.

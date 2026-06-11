# Database growth controls

Context: on 2026-06-10 the Railway Postgres volume (20GB) hit ENOSPC and the
database crash-looped for ~17h. Two tables grew without bound:

| Table                   | Size at outage | Rows        | Cause |
| ----------------------- | -------------- | ----------- | ----- |
| `ImladrisMetricLineage` | 8,164MB (91% of DB) | 21,983,741 | Every 10-minute sync materializes canonical metric values with `periodEnd = now`, minting NEW `ImladrisCanonicalMetricValue` rows each cycle; `replaceLineage` writes one lineage row per contributing raw record per value, and lineage of superseded values was never aged out (~273 retained generations per raw record). |
| `OutboxEvent`           | 664MB          | 906,352     | No cleanup anywhere; events accumulated since 2026-02-16. |

## Controls

All controls run continuously inside the shared sync cycle
(`runAnalyticsSync` in `src/lib/sync/analytics.ts`), which both the worker
orchestrator (`worker/sync-runner.ts` → `src/lib/sync/orchestrator.ts`) and
the legacy cron route (`/api/cron/sync`) call. Results appear in the sync
output as `lineagePruning` / `outboxPruning` (the name `retention` was already
taken by customer-retention materialization), and pruning errors surface as
partial failures so a silently regrowing table stays visible.

### 1. Lineage retention — `src/lib/imladris/lineage-retention.ts`

Deletes lineage rows belonging to metric values that are **(a)** older than
`IMLADRIS_LINEAGE_RETENTION_DAYS` (default 14), **(b)** not the latest
reader-visible value of their `(organizationId, userId, metricKey)` group, and
**(c)** reader-visible at all (`periodEnd <= now`). The canonical metric value
rows are kept — they power history trends and are small; only their per-record
lineage detail is dropped.

Why this is safe for the lineage feature (source provenance for trusted
metrics): every read path — `imladris/service.ts`, `company-tracker.ts`,
`investor-dashboard-export.ts`, `investor/board-pack.ts`, `ceo/service.ts` —
loads lineage only via `include: { lineage }` on the **latest** metric value
per metricKey; `imladris/history.ts` never includes lineage; there are no
reverse lookups by `rawRecordId`. CEO/board reports copy lineage into
`CeoMetricSourceLineage` at generation time, so existing reports are
unaffected. The 14-day window also covers the monthly board-pack cron, which
reads month-end metric values days after the month closes. Regenerating an
export backdated further than the window yields metric values without lineage
detail (readers fall back to the metric definition's source keys).

### 2. Lineage write cap — `capLineageRecordsPerSource` in `src/lib/imladris/materialization.ts`

Bounds rows persisted per metric value at
`IMLADRIS_LINEAGE_MAX_ROWS_PER_SOURCE` (default 1,000) **per sourceKey**, not
globally, so every contributing source stays represented in provenance even
when truncated. Keeps each source's most recently captured records with a
deterministic id tie-break. This is defense-in-depth against pathological
per-cycle volume (e.g. a PostHog event backfill); the retention job above is
the primary control.

### 3. Outbox retention — `src/lib/events/outbox-retention.ts`

- `DISPATCHED` (terminal success): deleted after
  `OUTBOX_DISPATCHED_RETENTION_DAYS` (default 14), measured by `dispatchedAt`
  (fallback `createdAt`).
- `DEAD_LETTER` (terminal failure): deleted after
  `OUTBOX_DEAD_LETTER_RETENTION_DAYS` (default 30) so they stay inspectable
  (`/api/events/dead-letter`) and replayable (`/api/events` replay) for a
  month.
- `PENDING` / `FAILED` are the live retry queue (`pollPendingEvents`) and are
  **never** deleted, regardless of age.

Status counts in `/api/events` metrics reflect the retained window.

## Why no schema migration

Deliberate: on a ~9GB table, the safest migration is none. Both pruners use
LIMIT-bounded, autocommitted `DELETE` statements driven by existing indexes
(`ImladrisMetricLineage.metricValueId`; `ImladrisCanonicalMetricValue` and the
post-cleanup `OutboxEvent` table are small), so no statement's locks or WAL
grow with the backlog and no long transactions are held. Each pass is also
time-budgeted (`IMLADRIS_LINEAGE_PRUNE_BUDGET_MS` default 60s,
`OUTBOX_PRUNE_BUDGET_MS` default 15s); an interrupted pass reports
`completed: false` and resumes on the next sync cycle. Raw SQL is used because
Prisma's `deleteMany` cannot bound rows per statement.

## Draining the existing backlog

No manual action is required: with a 60s/cycle budget at ~10K rows per
statement, the ~22M-row lineage backlog drains in roughly a day of normal
sync cycles, and the outbox backlog in a few cycles. Watch the sync output's
`lineagePruning.deletedRows` / `completed` fields (worker logs or
`/api/cron/sync?wait=1` response).

During the drain the analytics module runs up to ~75s longer per cycle
(`IMLADRIS_LINEAGE_PRUNE_BUDGET_MS` + `OUTBOX_PRUNE_BUDGET_MS`). The worker's
whole-cycle timeout is `WORKER_SYNC_TIMEOUT` (default 300s); if cycles already
run near that ceiling, either raise it temporarily or lower the prune budgets
— an interrupted pass is harmless and resumes next cycle.

## Reclaiming disk after the drain

`DELETE` makes space reusable (autovacuum) — the tables stop growing and new
writes reuse freed pages — but does not shrink files on disk. After
`lineagePruning.completed: true` appears consistently:

1. `VACUUM (VERBOSE, ANALYZE) "ImladrisMetricLineage";` — confirms dead tuples
   are reclaimed and refreshes planner stats.
2. To return the ~7-8GB to the OS, run `pg_repack` (no long exclusive lock) or
   `VACUUM FULL "ImladrisMetricLineage";` (takes an exclusive lock — only
   during a maintenance window with the worker/cron paused). With retention
   active, the steady-state table is a few hundred MB, so this is a one-time
   cleanup.
3. Check Railway volume metrics afterwards; alert headroom should be set well
   below 20GB.

## Tuning

| Env var | Default | Effect |
| --- | --- | --- |
| `IMLADRIS_LINEAGE_RETENTION_DAYS` | 14 | Lower = smaller steady-state table; keep ≥ a few days above the board-pack generation lag. |
| `IMLADRIS_LINEAGE_MAX_ROWS_PER_SOURCE` | 1000 | Per-source lineage detail cap per metric value. |
| `IMLADRIS_LINEAGE_PRUNE_BUDGET_MS` | 60000 | Per-cycle pruning time budget. |
| `OUTBOX_DISPATCHED_RETENTION_DAYS` | 14 | Window for terminal-success events. |
| `OUTBOX_DEAD_LETTER_RETENTION_DAYS` | 30 | Window for inspectable/replayable dead letters. |
| `OUTBOX_PRUNE_BUDGET_MS` | 15000 | Per-cycle pruning time budget. |

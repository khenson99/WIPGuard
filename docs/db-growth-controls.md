# Database growth controls

Context: on 2026-06-10 the Railway Postgres volume (20GB) hit ENOSPC and the
database crash-looped for ~17h. Two tables grew without bound:

| Table                   | Size at outage | Rows        | Cause |
| ----------------------- | -------------- | ----------- | ----- |
| `ImladrisMetricLineage` | 8,164MB (91% of DB) | 21,983,741 | Every 10-minute sync materializes canonical metric values with `periodEnd = now`, minting NEW `ImladrisCanonicalMetricValue` rows each cycle; `replaceLineage` writes one lineage row per contributing raw record per value, and lineage of superseded values was never aged out (~273 retained generations per raw record). |
| `OutboxEvent`           | 664MB          | 906,352     | No cleanup anywhere; events accumulated since 2026-02-16. |
| `ImladrisRawSourceRecord` | not the acute driver | grows forever | Every 10-minute sync upserts raw provider snapshots; the table grows by NEW distinct objects (events, PRs, issues, balance/charge snapshots) and was never pruned. PR #594 fixed the acute OOM crash loop (materialization reads are 30-day-bounded) and deferred this prune to its own reader-audited control — section 5. |

## Controls

All controls run continuously inside the shared sync cycle
(`runAnalyticsSync` in `src/lib/sync/analytics.ts`), which both the worker
orchestrator (`worker/sync-runner.ts` → `src/lib/sync/orchestrator.ts`) and
the legacy cron route (`/api/cron/sync`) call. Results appear in the sync
output as `lineagePruning` / `metricValuePruning` / `outboxPruning` /
`rawSourceRecordPruning` (the name `retention` was already taken by
customer-retention materialization), and pruning errors surface as partial
failures so a silently regrowing table stays visible.

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

### 4. Metric value thinning — `src/lib/imladris/metric-value-retention.ts`

`ImladrisCanonicalMetricValue` itself gains one row per metric per user every
~10-minute cycle (`periodEnd = now` mints a new row each run) — slow but
unbounded. Rows older than `IMLADRIS_METRIC_VALUE_INTRADAY_RETENTION_DAYS`
(default 14) are thinned to **one row per (organizationId, userId, metricKey,
UTC day)** — the day's last `(periodEnd, computedAt)`, i.e. the end-of-day
value. Safe because `imladris/history.ts` buckets monthly (one best row per
metric per month) and backdated exports pick the latest row `<= toDate`, which
after thinning is that day's end-of-day value. Sub-daily resolution is only
lost for dates older than the intraday window.

Two extra guards: future-period rows (`periodEnd > now`) are never touched,
and only rows with **no lineage** are deleted (`NOT EXISTS` on
`ImladrisMetricLineage.metricValueId`). The lineage guard is load-bearing
twice over: the FK cascade from metric values to lineage can never fire (every
DELETE stays exactly LIMIT-bounded), and the thinner is strictly sequenced
behind the lineage pruner — the overall-latest value per group and anything
inside the lineage window still carry lineage and are untouchable. If lineage
pruning breaks, thinning fail-safes to a no-op for those rows.

### 5. Raw source record retention — `src/lib/imladris/raw-source-retention.ts`

`ImladrisRawSourceRecord` stores raw provider snapshots. Ingestion
(`src/lib/imladris/ingestion.ts`) UPSERTs on
`@@unique([provider, objectType, externalId, scopeKey])`, so a re-synced object
updates its row in place; the table grows by NEW distinct objects — PostHog
events, GitHub PRs, Linear issues, Mercury/Stripe balance & charge snapshots —
which arrive forever. Deletes rows that are BOTH older than
`IMLADRIS_RAW_SOURCE_RETENTION_DAYS` (default **365**) AND no longer referenced
by any metric value's lineage.

**Reader audit (the cutoff must be ≥ the longest window any reader needs):**

| Reader | Window |
| --- | --- |
| `materialization.ts` | 30 days (`providerWindowWhere`); `financeWindowWhere` also pulls *standing* objects — balances, subscriptions, deals — with no lower bound (wants the latest as-of `periodEnd`). |
| `expense-dashboard.ts` (`buildExpenseDashboard`) | presets 30d/90d/**180d**; Mercury balances unbounded. Monthly burn history. |
| `investor-dashboard-export.ts` (`buildInvestorDashboardExport`) | presets 30d/90d/**180d** via `recordWithinExportWindow`. |
| `company-goals.ts` (`buildCompanyGoalsDashboard`) | no date window — top 200 Linear projects by `sourceUpdatedAt`. |

The longest **bounded** reader window is **180 days**. `monthly-pnl-history.ts`
and `refresh-runner.ts` read back to `MONTHLY_HISTORY_START_DATE` (2025-01-01,
~18 months) but from `AnalyticsSnapshot`, a **different** table — no
`ImladrisRawSourceRecord` reader needs that horizon, so retention here does not
have to match it. The 365-day default is 2× the 180-day window, leaving margin
for dormant-but-live objects (a Linear project untouched for months but still
tracked; a standing balance from a provider that stopped syncing).

**Why `updatedAt`, not `createdAt`:** because ingestion upserts in place,
`createdAt` is fixed at first insert while `updatedAt` (`@updatedAt`) and the
source timestamps refresh on every re-sync. A row first seen a year ago but
re-synced yesterday has an old `createdAt` yet is fully reader-visible —
pruning on `createdAt` would delete live data. Ingestion clamps every persisted
source timestamp to ≤ the sync start time (`observableDate`) and `@updatedAt`
is stamped at write time, so `max(occurredAt, sourceCreatedAt, sourceUpdatedAt)
≤ updatedAt` always holds; therefore `updatedAt < cutoff` guarantees every
source timestamp on the row is older than the cutoff and no bounded-window
reader can select it.

**The `NOT EXISTS` lineage guard** (mirroring §4) is load-bearing twice over:
`ImladrisMetricLineage.rawRecordId` references this table with
`onDelete: SetNull`, so deleting only lineage-free rows means that FK action
never fires and each `DELETE` stays exactly LIMIT-bounded (no UPDATE storm on
the multi-GB lineage table); and it protects any raw record whose provenance a
current metric value still points at — including an old-but-still-latest
standing finance record — until its metric value is superseded and aged out by
the lineage pruner (§1). This sequences the pass strictly behind lineage
pruning; if lineage pruning is broken, this pass fail-safes to a no-op for
those rows.

## Why one schema migration (the raw-source index)

Sections 1, 3 and 4 add **no** migration: on a ~9GB table the safest migration
is none, and those pruners ride existing indexes
(`ImladrisMetricLineage.metricValueId`; `ImladrisCanonicalMetricValue` and the
post-cleanup `OutboxEvent` table are small). Section 5 needs one — its candidate
scan filters on `updatedAt`, which had no index — so it adds
`@@index([updatedAt])` on `ImladrisRawSourceRecord`
(`20260615120000_add_imladris_raw_source_record_retention_index`). The
`NOT EXISTS` probe rides the existing `ImladrisMetricLineage.rawRecordId` index.

Production applies migrations via `migrate.cjs` at container startup, which runs
each migration **inside a transaction** (and refuses any migration containing the
`CONCURRENTLY` keyword). An in-transaction `CREATE INDEX` on this large,
continuously-written table would hold an `ACCESS EXCLUSIVE` lock for the whole
build, so the index is built lock-free out-of-band instead: the migration uses
`CREATE INDEX IF NOT EXISTS`, and the operator runs the companion script against
production **before** the migration deploys (i.e. before merging to `main`, since
deploys auto-run on push):

```
psql "$DATABASE_URL" -f scripts/ops/20260615120000_imladris_raw_source_record_updatedat_index.lockfree.sql
```

That script issues `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (psql autocommits, so
no transaction); the migration's `IF NOT EXISTS` then no-ops. If the script is
skipped the migration still succeeds — it just builds the index in-transaction
with the brief lock, which is fine on fresh/small databases (CI, new envs).

All pruners use LIMIT-bounded, autocommitted `DELETE` statements, so no
statement's locks or WAL grow with the backlog and no long transactions are
held. Each pass is also time-budgeted (`IMLADRIS_LINEAGE_PRUNE_BUDGET_MS`
default 60s; `IMLADRIS_METRIC_VALUE_PRUNE_BUDGET_MS`, `OUTBOX_PRUNE_BUDGET_MS`
and `IMLADRIS_RAW_SOURCE_PRUNE_BUDGET_MS` default 15s); an interrupted pass
reports `completed: false` and resumes on the next sync cycle. Raw SQL is used
because Prisma's `deleteMany` cannot bound rows per statement.

## Draining the existing backlog

No manual action is required: with a 60s/cycle budget at ~10K rows per
statement, the ~22M-row lineage backlog drains in roughly a day of normal
sync cycles, and the outbox backlog in a few cycles. Watch the sync output's
`lineagePruning.deletedRows` / `completed` fields (worker logs or
`/api/cron/sync?wait=1` response).

During the drain the analytics module runs up to ~105s longer per cycle (the
sum of the four `*_PRUNE_BUDGET_MS` budgets: 60s + 15s + 15s + 15s). The
worker's whole-cycle timeout is `WORKER_SYNC_TIMEOUT` (default 300s); if cycles
already run near that ceiling, either raise it temporarily or lower the prune
budgets — an interrupted pass is harmless and resumes next cycle.

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
| `IMLADRIS_METRIC_VALUE_INTRADAY_RETENTION_DAYS` | 14 | Full intraday metric value detail kept this long; older days thin to one end-of-day row. Keep ≥ the lineage retention window (rows with lineage are skipped regardless). |
| `IMLADRIS_METRIC_VALUE_PRUNE_BUDGET_MS` | 15000 | Per-cycle thinning time budget. |
| `OUTBOX_DISPATCHED_RETENTION_DAYS` | 14 | Window for terminal-success events. |
| `OUTBOX_DEAD_LETTER_RETENTION_DAYS` | 30 | Window for inspectable/replayable dead letters. |
| `OUTBOX_PRUNE_BUDGET_MS` | 15000 | Per-cycle pruning time budget. |
| `IMLADRIS_RAW_SOURCE_RETENTION_DAYS` | 365 | Raw provider snapshots are deleted once `updatedAt` is older than this AND no metric value's lineage references them. Keep ≥ the longest reader window (180d for the expense/investor dashboards). |
| `IMLADRIS_RAW_SOURCE_PRUNE_BUDGET_MS` | 15000 | Per-cycle pruning time budget. |

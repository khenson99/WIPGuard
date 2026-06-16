# Postgres disk incident — June 2026

**Status:** volume at 18,598 MB / 20,000 MB (93%) as of 2026-06-11.
**Impact when full:** writes fail, the app goes down.
**Immediate mitigation:** grow the volume in the Railway dashboard (Postgres service → volume → grow). Do this first; everything below is the durable fix.

## What happened

Measured directly against production on 2026-06-12 (read-only):

| Consumer | Size | Rows | Cause |
| --- | --- | --- | --- |
| `ImladrisMetricLineage` | **15.17 GB** (12.0 GB heap + 3.15 GB indexes) | ~41.5M | Bug below — essentially all inserted between 2026-06-01 and 2026-06-11 |
| `OutboxEvent` | **664 MB** | 906K (904.8K `DEAD_LETTER`, 1.5K `PENDING`) | Dead letters accumulated Feb–May; nothing ever pruned the outbox |
| `ImladrisRawSourceRecord` | 143 MB | ~104K | Normal |
| Everything else | < 50 MB combined | — | The originally-suspected tables (AnalyticsSnapshot 16 MB, funnel tables < 1 MB, SecurityAuditEvent 112 KB) were immaterial |
| WAL | 144 MB | — | Normal (no inactive replication slots, archive off) |
| `wipguard_probe_*` databases | ~50 MB | — | Leftover probe DBs, safe to drop |

### Root cause of the lineage explosion

`runImladrisMaterializationSync` (and `runCompanyReadinessSetup`) passed
`periodEnd = now` into canonical materialization. `periodEnd` is part of the
canonical metric upsert key `(organizationId, userId, metricKey, periodEnd,
calculationVersion)`, so **every sync run minted a brand-new
`ImladrisCanonicalMetricValue` row instead of updating the existing one** —
3,408 metric values accumulated for just six days (Jun 5–11).

`replaceLineage` then "replaced" lineage for the *new* metric value id
(deleting nothing) and inserted a full copy of every matching raw-record
lineage row — ~12K rows per metric value on average, up to ~300K for
`marketing.website_traffic`. With the cron schedule every 10 minutes, that
compounded to ~4–6M rows/day.

The same explosion crashed the app: `buildCompanyTrackerDashboard` loaded
**all** canonical rows with `include: { lineage }` (no limit), pulling tens of
millions of rows into the Node heap → `FATAL ERROR: Reached heap limit` at
4 GB. The crashed app made `wipguard-cron-sync` fail too (it POSTs
`/api/cron/sync` and got 502s), which also stopped the one retention job that
did exist (AnalyticsSnapshot pruning — a 16 MB table).

### Why retention didn't save us

- The only scheduled pruning covered `AnalyticsSnapshot` (16 MB).
- `ImladrisMetricLineage`, `ImladrisCanonicalMetricValue`, `OutboxEvent`,
  `SecurityAuditEvent` and the funnel tables had **no retention at all**.
- The pruning that existed ran via `wipguard-cron-sync` → `POST /api/cron/sync`,
  which requires the app to be up. The app was OOM-crash-looping.

## The fix (this PR)

1. **Stop the growth** — `imladrisCanonicalPeriodEnd()` truncates `periodEnd`
   to the start of the current UTC day, so repeated runs upsert the same row
   (one metric value per metricKey per day). `replaceLineage` now inserts the
   fresh evidence set first and prunes rows older than its own insert stamp,
   so a crash or concurrent run can no longer duplicate or destroy lineage.
2. **Retention sweep** — `src/lib/ops/data-retention.ts` runs from
   `runAnalyticsSync()` (worker orchestrator **and** cron route), deleting in
   bounded batches per cycle:
   - lineage of superseded metric values older than `IMLADRIS_LINEAGE_RETENTION_DAYS` (default 7)
   - canonical metric values older than `IMLADRIS_METRIC_RETENTION_DAYS` (default 365)
   - `OutboxEvent` `DISPATCHED` > `OUTBOX_DISPATCHED_RETENTION_DAYS` (default 14)
   - `OutboxEvent` `DEAD_LETTER` > `OUTBOX_DEAD_LETTER_RETENTION_DAYS` (default 90)
   - `SecurityAuditEvent` > `SECURITY_AUDIT_RETENTION_DAYS` (default 365)
   - `FunnelEvent` > `FUNNEL_EVENT_RETENTION_DAYS` (default 365)

   Knobs: `DATA_RETENTION_ENABLED` (default true), `DATA_RETENTION_DRY_RUN`,
   `DATA_RETENTION_BATCH_SIZE` (20K), `DATA_RETENTION_MAX_ROWS_PER_RUN` (200K).
   Each run logs a `[data-retention]` JSON summary including
   `databaseSizeBytes`.
3. **Dashboard / export OOM fixes** —
   - `buildCompanyTrackerDashboard` aggregates lineage facts (count, source
     keys, latest capture) in SQL (`groupBy`), never loading rows.
   - `buildImladrisMetrics` and `buildInvestorDashboardExport` (which emit
     full per-row evidence and so can't aggregate) cap nested lineage loads
     at `MAX_LINEAGE_EVIDENCE_ROWS` (500) per metric value.
   All three previously did `include: { lineage }` with no bound and were the
   OOM vector that crash-looped the app.
4. **Monitoring** — `GET /api/health` now includes a `storage` check
   (`pg_database_size` vs `DATABASE_VOLUME_CAPACITY_MB`, default 20,000 MB).
   ≥75% → `warning` + `[health:storage]` error log; ≥90% → `critical`,
   overall `degraded`, HTTP 503.

## Operator actions

### 1. Immediately (no deploy needed)

- **Grow the volume** in Railway (Postgres → volume). Even 25–30 GB buys
  weeks of headroom while the backlog drains.
- Set up **Railway alerts**: project → Settings → Notifications / usage
  alerts for volume usage, and a log-based alert matching `[health:storage]`
  or `[data-retention]`.
- Point an external uptime monitor (Better Stack / UptimeRobot / Checkly) at
  `GET /api/health` — it returns 503 once disk usage is critical, so the
  existing "is it up" alarm doubles as the disk alarm.

### 2. After this PR deploys

The retention sweep drains the backlog automatically at ≤200K rows per
sync cycle (~hours to a couple of days for 41.5M rows). To drain it in one
supervised pass instead, use the one-time script — **requires explicit
operator approval, it deletes data**:

```bash
# Dry run first — prints exact counts, deletes nothing:
railway run --service WIPGuard-app npm run ops:db-disk-cleanup

# After reviewing the counts:
railway run --service WIPGuard-app npm run ops:db-disk-cleanup -- --execute
```

Defaults: keep lineage for the latest metric value per key + anything newer
than 7 days; delete `DEAD_LETTER` outbox rows older than 30 days and
`DISPATCHED` older than 14. All deletes are batched (20K/statement).

### 3. Reclaim the disk space (maintenance window)

Deleting rows does **not** shrink the volume — Postgres keeps freed pages for
reuse, so Railway keeps reporting ~18.6 GB until the tables are rewritten.
After the backlog is deleted, connect (`railway connect Postgres`) and run:

```sql
VACUUM (FULL, VERBOSE, ANALYZE) "ImladrisMetricLineage";
VACUUM (FULL, VERBOSE, ANALYZE) "ImladrisCanonicalMetricValue";
VACUUM (FULL, VERBOSE, ANALYZE) "OutboxEvent";
```

`VACUUM FULL` takes an ACCESS EXCLUSIVE lock per table while it rewrites;
with the backlog gone the surviving data is small (well under 1 GB), so each
statement should finish in seconds to a few minutes. Expected end state:
database ~1–2 GB on a 20–30 GB volume.

Optional cleanup of leftover probe databases:

```sql
SELECT datname FROM pg_database WHERE datname LIKE 'wipguard_probe_%';
-- for each: DROP DATABASE "wipguard_probe_<timestamp>";
```

### 4. Verify

- `GET /api/health` → `checks.storage.status: "ok"`, `usagePercent` < 60.
- Railway volume graph trends flat after the drop.
- `[data-retention]` log lines show small per-cycle deletions
  (steady state: a few thousand rows/day).
- `ImladrisCanonicalMetricValue` grows by ~1 row per metricKey per day.

## Open follow-ups

- The outbox dispatcher dead-letters nearly everything it touches (904.8K
  DEAD_LETTER vs ~0 DISPATCHED; last write 2026-05-06) — the event bus is
  effectively broken/abandoned and deserves its own investigation.
- The 500-row evidence cap on `buildImladrisMetrics` /
  `buildInvestorDashboardExport` is a defensive bound, not a product
  decision. If a metric legitimately needs more than 500 evidence rows
  surfaced, revisit `MAX_LINEAGE_EVIDENCE_ROWS` (and consider showing
  "showing 500 of N" in the UI). After the backlog drains and with the
  periodEnd + insert-then-prune fixes, real per-value lineage counts should
  sit well under the cap.

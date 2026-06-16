/**
 * Imladris raw source record retention.
 *
 * Companion to the other growth controls in docs/db-growth-controls.md. The
 * cron sync ingests raw provider snapshots every ~10 minutes
 * (src/lib/imladris/ingestion.ts). Ingestion UPSERTs on
 * `@@unique([provider, objectType, externalId, scopeKey])`, so a re-synced
 * object updates its row in place; the table grows by NEW distinct objects —
 * PostHog events, GitHub PRs, Linear issues, Mercury/Stripe balance & charge
 * snapshots — which arrive forever and are never pruned. This is the third
 * unbounded table behind the 2026-06-10 disk-full class of outage. PR #594
 * fixed the acute OOM crash loop (the materialization read is 30-day-bounded,
 * so unbounded table growth was not the acute driver) and explicitly deferred
 * pruning to here because it needs careful reader-auditing.
 *
 * READER AUDIT (every reader of ImladrisRawSourceRecord — the cutoff must be
 * >= the longest window any of them needs):
 *   - materialization.ts: 30-day window (providerWindowWhere). financeWindowWhere
 *     additionally pulls "standing" objects (balances, subscriptions, deals,
 *     active_customer_ref) with NO lower bound — it wants the LATEST such record
 *     as-of periodEnd.
 *   - expense-dashboard.ts (buildExpenseDashboard): range presets 30d/90d/180d
 *     (max 180d), plus Mercury balances with no lower bound. Builds monthly
 *     burn history.
 *   - investor-dashboard-export.ts (buildInvestorDashboardExport): range presets
 *     30d/90d/180d (max 180d) via recordWithinExportWindow.
 *   - company-goals.ts (buildCompanyGoalsDashboard): no date window — reads the
 *     200 most-recently-updated Linear project records (orderBy sourceUpdatedAt).
 * The longest BOUNDED reader window is therefore 180 days. (monthly-pnl-history.ts
 * and refresh-runner.ts read AnalyticsSnapshot back to MONTHLY_HISTORY_START_DATE
 * = 2025-01-01 — a DIFFERENT table; no ImladrisRawSourceRecord reader needs that
 * ~18-month horizon, so retention here does not have to match it.)
 *
 * WHY `updatedAt`, NOT `createdAt`, IS THE PRUNE COLUMN: because ingestion
 * upserts in place, `createdAt` is fixed at first insert while `updatedAt`
 * (@updatedAt) and the source timestamps refresh on every re-sync. A row first
 * seen a year ago but re-synced yesterday has an OLD createdAt and is fully
 * reader-visible — pruning on createdAt would delete live data. ingestion.ts
 * clamps every persisted source timestamp to <= the sync start time
 * (`observableDate`), and @updatedAt is stamped at write time, so the invariant
 *   max(occurredAt, sourceCreatedAt, sourceUpdatedAt) <= updatedAt
 * always holds. Hence `updatedAt < now - retentionDays` GUARANTEES every source
 * timestamp on the row is also older than the cutoff, so no bounded-window
 * reader (window <= retentionDays) can select it. The default of 365 days is
 * 2x the 180-day max window, leaving comfortable margin for dormant-but-live
 * objects (e.g. a Linear project not edited in months but still tracked, or a
 * standing balance from a provider that stopped syncing).
 *
 * THE `NOT EXISTS` LINEAGE GUARD is load-bearing twice over, exactly mirroring
 * the metric-value thinner (src/lib/imladris/metric-value-retention.ts):
 *   - ImladrisMetricLineage.rawRecordId references this table with
 *     `onDelete: SetNull`. Deleting only lineage-free rows means that FK action
 *     can never fire, so each DELETE stays exactly LIMIT-bounded and never
 *     amplifies into an UPDATE storm on the multi-GB lineage table.
 *   - It protects any raw record whose provenance a current metric value still
 *     points at — including an old-but-still-latest standing finance record that
 *     a fresh finance metric references. Such a record keeps lineage until its
 *     metric value is superseded AND aged out by the lineage pruner
 *     (IMLADRIS_LINEAGE_RETENTION_DAYS, default 14), only then becoming prunable.
 *     This sequences the pass strictly behind lineage pruning; if lineage pruning
 *     is broken or backlogged, this pass fail-safes to a no-op for those rows.
 *
 * Operational shape matches the other growth pruners: LIMIT-bounded,
 * autocommitted raw `DELETE` statements (Prisma's deleteMany cannot bound rows
 * per statement) driven by indexes — the new ImladrisRawSourceRecord.updatedAt
 * index for the outer scan and the existing ImladrisMetricLineage.rawRecordId
 * index for the NOT EXISTS probe — and a per-cycle time budget so a large
 * initial backlog drains incrementally across cycles instead of stalling a sync.
 * Deleted space is reclaimed by autovacuum; returning it to the OS needs
 * VACUUM FULL / pg_repack — see docs/db-growth-controls.md.
 */

import type { PrismaClientType } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 365;
const DEFAULT_BUDGET_MS = 15_000;
const DEFAULT_BATCH_SIZE = 10_000;

export interface PruneImladrisRawSourceRecordsInput {
  prisma: PrismaClientType;
  /**
   * Raw records whose `updatedAt` is older than this many days AND which no
   * longer back any metric value's lineage are deleted. Defaults to
   * IMLADRIS_RAW_SOURCE_RETENTION_DAYS (env) or 365 — comfortably beyond the
   * 180-day longest bounded reader window (expense + investor dashboards).
   */
  retentionDays?: number;
  /**
   * Soft time budget for one pruning pass. Defaults to
   * IMLADRIS_RAW_SOURCE_PRUNE_BUDGET_MS (env) or 15s. The pass stops at the
   * budget and resumes on the next sync cycle.
   */
  budgetMs?: number;
  /** Max raw records deleted per DELETE statement. */
  batchSize?: number;
  /** Test seam: reference time for the cutoff. Defaults to now. */
  now?: Date;
  /** Test seam: monotonic clock for the time budget. Defaults to Date.now. */
  clock?: () => number;
}

export interface PruneImladrisRawSourceRecordsResult {
  deletedRows: number;
  /** DELETE statements issued. */
  batches: number;
  cutoff: string;
  /**
   * False when the time budget expired before the backlog fully drained.
   * The next sync cycle picks up where this one stopped.
   */
  completed: boolean;
  durationMs: number;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallback;
}

export async function pruneImladrisRawSourceRecords(
  input: PruneImladrisRawSourceRecordsInput,
): Promise<PruneImladrisRawSourceRecordsResult> {
  const retentionDays = Math.max(
    1,
    Math.floor(
      input.retentionDays ??
        positiveIntFromEnv("IMLADRIS_RAW_SOURCE_RETENTION_DAYS", DEFAULT_RETENTION_DAYS),
    ),
  );
  const budgetMs = Math.max(
    1,
    Math.floor(
      input.budgetMs ?? positiveIntFromEnv("IMLADRIS_RAW_SOURCE_PRUNE_BUDGET_MS", DEFAULT_BUDGET_MS),
    ),
  );
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE));
  const now = input.now ?? new Date();
  const clock = input.clock ?? (() => Date.now());
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);

  const startedAt = clock();
  const deadline = startedAt + budgetMs;

  let deletedRows = 0;
  let batches = 0;
  let completed = false;

  // Each DELETE is a single bounded, autocommitted statement. The candidate
  // scan rides the ImladrisRawSourceRecord.updatedAt index; the NOT EXISTS
  // probe rides the ImladrisMetricLineage.rawRecordId index, keeping rows still
  // referenced by live lineage untouchable (so the SetNull FK action never
  // fires and each statement stays exactly LIMIT-bounded).
  while (clock() < deadline) {
    const deleted = await input.prisma.$executeRaw`
      DELETE FROM "ImladrisRawSourceRecord"
      WHERE "id" IN (
        SELECT r."id"
        FROM "ImladrisRawSourceRecord" r
        WHERE r."updatedAt" < ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM "ImladrisMetricLineage" l WHERE l."rawRecordId" = r."id"
          )
        LIMIT ${batchSize}
      )
    `;
    batches += 1;
    deletedRows += deleted;
    if (deleted < batchSize) {
      completed = true;
      break;
    }
  }

  return {
    deletedRows,
    batches,
    cutoff: cutoff.toISOString(),
    completed,
    durationMs: clock() - startedAt,
  };
}

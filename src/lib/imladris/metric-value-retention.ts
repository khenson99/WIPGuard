/**
 * Imladris canonical metric value thinning.
 *
 * Companion to src/lib/imladris/lineage-retention.ts (see
 * docs/db-growth-controls.md). The sync cycle materializes metric values with
 * `periodEnd = now`, so ImladrisCanonicalMetricValue gains one row per metric
 * per user every ~10 minutes (~144/day/metric) forever. Rows are narrow —
 * this is far slower growth than the lineage table behind the 2026-06-10
 * outage — but it is still unbounded and makes history scans heavier.
 *
 * Read-path facts that make daily thinning safe:
 *   - imladris/history.ts buckets MONTHLY (one best row per metricKey per
 *     month), so daily keepers exceed history's granularity needs.
 *   - Dashboards/exports read the latest reader-visible row per
 *     (organizationId, userId, metricKey); backdated exports pick the latest
 *     row with periodEnd <= toDate, which after thinning is that day's
 *     end-of-day value.
 *
 * Policy — delete rows that are ALL of:
 *   1. older than the intraday window (computedAt < now - retentionDays);
 *   2. reader-visible (periodEnd <= now) — future-period rows are kept;
 *   3. not their (organizationId, userId, metricKey, UTC day of periodEnd)
 *      group's keeper — the keeper is the day's last (periodEnd, computedAt),
 *      i.e. the end-of-day value. NULL org/user group together, so every
 *      scope variant keeps its own daily row;
 *   4. carrying NO lineage rows (NOT EXISTS).
 *
 * Guard 4 is load-bearing twice over:
 *   - ImladrisMetricLineage has `onDelete: Cascade` from metric values, so
 *     deleting only lineage-free rows means DELETE statements never cascade
 *     and stay exactly LIMIT-bounded (no lock/WAL amplification);
 *   - it sequences this pruner strictly AFTER the lineage pruner: the overall
 *     latest value per group and everything inside the lineage retention
 *     window still carry lineage and are untouchable here. If lineage pruning
 *     is broken or backlogged, thinning fail-safes to a no-op for those rows
 *     instead of deleting rows whose provenance is still live.
 */

import type { PrismaClientType } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTRADAY_RETENTION_DAYS = 14;
const DEFAULT_BUDGET_MS = 15_000;
const DEFAULT_BATCH_SIZE = 10_000;

export interface PruneImladrisMetricValuesInput {
  prisma: PrismaClientType;
  /**
   * Full intraday detail is kept for this many days; older values are thinned
   * to one row per metric per UTC day. Defaults to
   * IMLADRIS_METRIC_VALUE_INTRADAY_RETENTION_DAYS (env) or 14 — matching the
   * lineage retention window, since rows inside that window still carry
   * lineage and are skipped here anyway.
   */
  retentionDays?: number;
  /**
   * Soft time budget for one thinning pass. Defaults to
   * IMLADRIS_METRIC_VALUE_PRUNE_BUDGET_MS (env) or 15s.
   */
  budgetMs?: number;
  /** Max metric value rows deleted per DELETE statement. */
  batchSize?: number;
  /** Test seam: reference time for cutoffs. Defaults to now. */
  now?: Date;
  /** Test seam: monotonic clock for the time budget. Defaults to Date.now. */
  clock?: () => number;
}

export interface PruneImladrisMetricValuesResult {
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

export async function pruneImladrisMetricValues(
  input: PruneImladrisMetricValuesInput,
): Promise<PruneImladrisMetricValuesResult> {
  const retentionDays = Math.max(
    1,
    Math.floor(
      input.retentionDays ??
        positiveIntFromEnv(
          "IMLADRIS_METRIC_VALUE_INTRADAY_RETENTION_DAYS",
          DEFAULT_INTRADAY_RETENTION_DAYS,
        ),
    ),
  );
  const budgetMs = Math.max(
    1,
    Math.floor(
      input.budgetMs ??
        positiveIntFromEnv("IMLADRIS_METRIC_VALUE_PRUNE_BUDGET_MS", DEFAULT_BUDGET_MS),
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

  // The keeper subquery mirrors reader ordering (periodEnd DESC, computedAt
  // DESC over reader-visible rows) per UTC day; DISTINCT ON groups NULL
  // organizationId/userId together. Each DELETE is a single bounded
  // autocommitted statement; the NOT EXISTS probe rides the
  // ImladrisMetricLineage.metricValueId index.
  while (clock() < deadline) {
    const deleted = await input.prisma.$executeRaw`
      DELETE FROM "ImladrisCanonicalMetricValue"
      WHERE "id" IN (
        SELECT mv."id"
        FROM "ImladrisCanonicalMetricValue" mv
        WHERE mv."computedAt" < ${cutoff}
          AND mv."periodEnd" <= ${now}
          AND mv."id" NOT IN (
            SELECT DISTINCT ON (
              "organizationId", "userId", "metricKey", date_trunc('day', "periodEnd")
            ) "id"
            FROM "ImladrisCanonicalMetricValue"
            WHERE "periodEnd" <= ${now} AND "computedAt" <= ${now}
            ORDER BY
              "organizationId", "userId", "metricKey", date_trunc('day', "periodEnd"),
              "periodEnd" DESC, "computedAt" DESC
          )
          AND NOT EXISTS (
            SELECT 1 FROM "ImladrisMetricLineage" l WHERE l."metricValueId" = mv."id"
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

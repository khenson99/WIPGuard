/**
 * Retention/pruning for ImladrisMetricLineage.
 *
 * Why this exists
 * ---------------
 * Lineage rows are written per canonical metric value (one set of source-record
 * pointers per materialized metric). Canonical metric values accrue over time
 * (at least one new row per metric per day), so without pruning the lineage
 * table grows without bound — it reached ~15 GB / 1.2M rows and exhausted the
 * Postgres volume (production incident 2026-06-11).
 *
 * What is safe to delete
 * ----------------------
 * The dashboards (`buildImladrisMetrics`, `buildCompanyTrackerDashboard`,
 * `buildInvestorDashboardExport`) only ever load lineage for the *winning* row
 * per metric — the latest per (metricKey, organizationId, userId,
 * calculationVersion). The metric *history* view reads canonical rows WITHOUT
 * lineage. So lineage attached to any non-latest canonical row is never read.
 *
 * This prune therefore deletes lineage for canonical rows that are BOTH:
 *   1. older than the retention window (by periodEnd), AND
 *   2. not the latest row in their (metricKey, org, user, calcVersion) group.
 *
 * The "latest per group" guard means a metric that has not changed in a long
 * time (its winner row may have an old periodEnd) never loses the lineage the
 * dashboards still read. Canonical metric values themselves are never deleted
 * here — only their lineage.
 */

import type { PrismaClientType } from "@/lib/prisma";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_BATCH_SIZE = 10_000;
const MAX_BATCH_SIZE = 50_000;
/**
 * Per-run ceiling on deletions. The existing backlog of superseded lineage is
 * very large (tens of millions of rows), so an unbounded single DELETE would
 * hold long locks and emit a WAL/replication spike — itself an incident risk.
 * Draining a bounded slice each sync cycle lets the backlog clear gradually
 * without disrupting live traffic. Raise via env for a faster (still batched)
 * drain during a maintenance window.
 */
const DEFAULT_MAX_ROWS_PER_RUN = 200_000;

export function parseImladrisLineageRetentionDays(): number {
  return parsePositiveIntEnv("IMLADRIS_LINEAGE_RETENTION_DAYS", DEFAULT_RETENTION_DAYS);
}

export function parseImladrisLineageMaxRowsPerRun(): number {
  return parsePositiveIntEnv("IMLADRIS_LINEAGE_PRUNE_MAX_ROWS", DEFAULT_MAX_ROWS_PER_RUN);
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallback;
}

export interface PruneImladrisLineageInput {
  prisma: Pick<PrismaClientType, "$executeRaw">;
  /** Delete lineage for superseded canonical rows whose periodEnd is older than this. */
  olderThanDays?: number;
  /** Maximum lineage rows to delete in this run (drains the backlog gradually). */
  maxRowsPerRun?: number;
  /** Rows per DELETE statement. Kept small to bound lock duration. */
  batchSize?: number;
  /** Test seam. Defaults to now. */
  now?: Date;
}

export interface PruneImladrisLineageResult {
  deleted: number;
  cutoff: string;
  /** Whether the per-run cap was hit (backlog likely remains for the next cycle). */
  capped: boolean;
}

/**
 * Deletes lineage rows belonging to old, superseded canonical metric values, in
 * bounded batches. Never touches the latest row per metric group (the only rows
 * the dashboards read), and never deletes canonical metric values themselves.
 *
 * Deletion stops when the eligible set is drained OR the per-run cap is reached,
 * whichever comes first. Because the latest-per-group set is recomputed for each
 * batch, a row that becomes the new "latest" mid-drain is automatically spared.
 */
export async function pruneImladrisMetricLineage(
  input: PruneImladrisLineageInput,
): Promise<PruneImladrisLineageResult> {
  const olderThanDays = Math.max(1, Math.floor(input.olderThanDays ?? DEFAULT_RETENTION_DAYS));
  const cutoff = new Date((input.now ?? new Date()).getTime() - olderThanDays * 86_400_000);
  const maxRowsPerRun = Math.max(0, Math.floor(input.maxRowsPerRun ?? DEFAULT_MAX_ROWS_PER_RUN));
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE)),
  );

  let deleted = 0;
  while (deleted < maxRowsPerRun) {
    const limit = Math.min(batchSize, maxRowsPerRun - deleted);
    // ctid-targeted batch delete: select a bounded slice of eligible lineage
    // rows (superseded parent, older than cutoff) and delete exactly those.
    const batchDeleted = Number(
      await input.prisma.$executeRaw`
        DELETE FROM "ImladrisMetricLineage"
        WHERE ctid IN (
          SELECT l.ctid
          FROM "ImladrisMetricLineage" AS l
          JOIN "ImladrisCanonicalMetricValue" AS v ON l."metricValueId" = v."id"
          WHERE v."periodEnd" < ${cutoff}
            AND v."id" NOT IN (
              SELECT DISTINCT ON (
                latest."metricKey",
                latest."organizationId",
                latest."userId",
                latest."calculationVersion"
              ) latest."id"
              FROM "ImladrisCanonicalMetricValue" AS latest
              ORDER BY
                latest."metricKey",
                latest."organizationId",
                latest."userId",
                latest."calculationVersion",
                latest."periodEnd" DESC,
                latest."computedAt" DESC
            )
          LIMIT ${limit}
        )
      `,
    ) || 0;

    deleted += batchDeleted;
    if (batchDeleted < limit) break; // eligible set drained
  }

  return { deleted, cutoff: cutoff.toISOString(), capped: deleted >= maxRowsPerRun };
}

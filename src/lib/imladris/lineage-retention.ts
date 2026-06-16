/**
 * Imladris metric lineage retention.
 *
 * Why this exists: every sync cycle materializes canonical metric values with
 * `periodEnd = now`, so each cycle mints NEW ImladrisCanonicalMetricValue rows
 * and `replaceLineage` (src/lib/imladris/materialization.ts) writes a full
 * per-raw-record lineage set for each of them. Lineage attached to superseded
 * metric values was never aged out, which let ImladrisMetricLineage grow to
 * ~22M rows / ~8GB (91% of the database) and exhaust the 20GB Postgres volume
 * on 2026-06-10.
 *
 * Read-path audit (imladris/service.ts, imladris/company-tracker.ts,
 * imladris/investor-dashboard-export.ts, investor/board-pack.ts,
 * ceo/service.ts): lineage is ONLY read via `include: { lineage }` on the
 * latest reader-visible metric value per (organizationId, userId, metricKey).
 * There are no reverse lookups by rawRecordId and history trends
 * (imladris/history.ts) never include lineage. CEO/board reports copy lineage
 * into CeoMetricSourceLineage at generation time, so pruning does not affect
 * already-generated reports.
 *
 * Policy — delete lineage rows whose metric value is:
 *   1. older than the retention cutoff (computedAt < now - retentionDays), AND
 *   2. not the latest reader-visible value of its
 *      (organizationId, userId, metricKey) group, AND
 *   3. reader-visible at all (periodEnd <= now); future-period rows are kept.
 *
 * The canonical metric value rows themselves are kept — they power history
 * trends and are small. Only their per-record lineage detail is dropped.
 *
 * Operational safety on a multi-GB table (the reason this is raw SQL —
 * Prisma's deleteMany cannot bound row counts per statement):
 *   - every DELETE is bounded by an id-subquery LIMIT, so no statement (or
 *     its row locks) grows with the backlog and there are no long
 *     transactions or exclusive locks;
 *   - the pass is time-budgeted per sync cycle and resumes next cycle, so the
 *     initial multi-million-row backlog drains incrementally;
 *   - all access rides existing indexes (ImladrisMetricLineage.metricValueId);
 *     no schema migration is needed.
 *
 * Deleted space is made reusable by autovacuum (the table stops growing);
 * returning disk to the OS needs VACUUM FULL / pg_repack — see
 * docs/db-growth-controls.md.
 */

import type { PrismaClientType } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_BUDGET_MS = 60_000;
const DEFAULT_ID_BATCH_SIZE = 200;
const DEFAULT_ROW_BATCH_SIZE = 10_000;

export interface PruneImladrisMetricLineageInput {
  prisma: PrismaClientType;
  /**
   * Lineage for superseded metric values computed more than this many days
   * ago is deleted. Defaults to IMLADRIS_LINEAGE_RETENTION_DAYS (env) or 14.
   * 14 days comfortably covers the monthly board-pack cron, which reads
   * month-end metric values (and snapshots their lineage) days after the
   * month closes.
   */
  retentionDays?: number;
  /**
   * Soft time budget for one pruning pass. Defaults to
   * IMLADRIS_LINEAGE_PRUNE_BUDGET_MS (env) or 60s. The pass stops at the
   * budget and resumes on the next sync cycle.
   */
  budgetMs?: number;
  /** Max superseded metric value ids fetched per candidate scan. */
  idBatchSize?: number;
  /** Max lineage rows deleted per DELETE statement. */
  rowBatchSize?: number;
  /** Test seam: reference time for cutoffs. Defaults to now. */
  now?: Date;
  /** Test seam: monotonic clock for the time budget. Defaults to Date.now. */
  clock?: () => number;
}

export interface PruneImladrisMetricLineageResult {
  deletedRows: number;
  /**
   * Superseded metric values targeted this pass. Approximate when the budget
   * interrupts a batch: partially drained values are re-counted next cycle.
   */
  prunedMetricValues: number;
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

interface MetricValueIdRow {
  id: string;
}

export async function pruneImladrisMetricLineage(
  input: PruneImladrisMetricLineageInput,
): Promise<PruneImladrisMetricLineageResult> {
  const retentionDays = Math.max(
    1,
    Math.floor(
      input.retentionDays ??
        positiveIntFromEnv("IMLADRIS_LINEAGE_RETENTION_DAYS", DEFAULT_RETENTION_DAYS),
    ),
  );
  const budgetMs = Math.max(
    1,
    Math.floor(
      input.budgetMs ?? positiveIntFromEnv("IMLADRIS_LINEAGE_PRUNE_BUDGET_MS", DEFAULT_BUDGET_MS),
    ),
  );
  const idBatchSize = Math.max(1, Math.floor(input.idBatchSize ?? DEFAULT_ID_BATCH_SIZE));
  const rowBatchSize = Math.max(1, Math.floor(input.rowBatchSize ?? DEFAULT_ROW_BATCH_SIZE));
  const now = input.now ?? new Date();
  const clock = input.clock ?? (() => Date.now());
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);

  const startedAt = clock();
  const deadline = startedAt + budgetMs;

  let deletedRows = 0;
  let prunedMetricValues = 0;
  let batches = 0;
  let completed = false;

  outer: while (clock() < deadline) {
    // Find superseded, out-of-retention metric values that still carry
    // lineage. `latest` mirrors reader selection (periodEnd DESC, computedAt
    // DESC over reader-visible rows), so the value currently displayed for
    // every (organizationId, userId, metricKey) group always keeps its
    // lineage — including groups whose materialization stopped long ago.
    // DISTINCT ON groups NULL organizationId/userId together, matching scope
    // semantics. The EXISTS probe (ImladrisMetricLineage.metricValueId index)
    // keeps already-pruned values out of later scans, so the steady state is
    // a single cheap query per cycle.
    const candidates = await input.prisma.$queryRaw<MetricValueIdRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON ("organizationId", "userId", "metricKey") "id"
        FROM "ImladrisCanonicalMetricValue"
        WHERE "periodEnd" <= ${now} AND "computedAt" <= ${now}
        ORDER BY "organizationId", "userId", "metricKey", "periodEnd" DESC, "computedAt" DESC
      )
      SELECT mv."id"
      FROM "ImladrisCanonicalMetricValue" mv
      WHERE mv."computedAt" < ${cutoff}
        AND mv."periodEnd" <= ${now}
        AND mv."id" NOT IN (SELECT "id" FROM latest)
        AND EXISTS (
          SELECT 1 FROM "ImladrisMetricLineage" l WHERE l."metricValueId" = mv."id"
        )
      LIMIT ${idBatchSize}
    `;

    if (candidates.length === 0) {
      completed = true;
      break;
    }
    prunedMetricValues += candidates.length;
    const ids = candidates.map((row) => row.id);

    // Drain lineage for this id batch in bounded DELETE statements (each
    // autocommits) so locks and WAL per statement stay flat regardless of
    // backlog size.
    for (;;) {
      const deleted = await input.prisma.$executeRaw`
        DELETE FROM "ImladrisMetricLineage"
        WHERE "id" IN (
          SELECT "id"
          FROM "ImladrisMetricLineage"
          WHERE "metricValueId" = ANY(${ids})
          LIMIT ${rowBatchSize}
        )
      `;
      batches += 1;
      deletedRows += deleted;
      if (deleted < rowBatchSize) break; // this id batch is drained
      if (clock() >= deadline) break outer;
    }
  }

  return {
    deletedRows,
    prunedMetricValues,
    batches,
    cutoff: cutoff.toISOString(),
    completed,
    durationMs: clock() - startedAt,
  };
}

/**
 * Database pruning engine.
 *
 * The ONLY code path that is allowed to delete retention-managed rows.
 * Every delete is a bounded `DELETE … WHERE id IN (SELECT … LIMIT n)` batch
 * in its own implicit transaction, so the job never holds long-running locks
 * and can be interrupted at any point without leaving partial state — it
 * simply resumes on the next scheduled run.
 *
 * Invariants enforced here (see docs/runbooks/db-pruning.md):
 *  - Raw source records are only deleted when EVERY timestamp on the row
 *    (occurredAt, sourceCreatedAt, sourceUpdatedAt, createdAt, updatedAt) is
 *    older than the cutoff, which itself is floor-clamped to stay strictly
 *    outside the 13-month Imladris lookback window.
 *  - Raw source records referenced by ImladrisMetricLineage are never
 *    deleted (the FK is SetNull, so the check must be explicit). The
 *    NOT EXISTS is evaluated inside the DELETE statement itself, so a
 *    concurrent materialization cannot race the check.
 *  - Standing finance object types (read at any age by financeWindowWhere)
 *    are never deleted.
 *  - Sync runs are only deleted once they have no raw records left —
 *    ImladrisRawSourceRecord.syncRunId cascades on delete.
 *  - Monthly P&L history snapshots are exempt (same exemption as the
 *    existing pruneAnalyticsSnapshots in src/lib/analytics/snapshots.ts).
 */

import { Prisma } from "@/generated/prisma/client";
import {
  IMLADRIS_FINANCE_STANDING_BASE_OBJECT_TYPES,
  imladrisObjectTypeQueryVariants,
} from "@/lib/imladris/object-types";
import {
  cutoffForRetentionDays,
  resolveDbPrunePolicy,
  type DbPrunePolicy,
} from "@/lib/db-pruning/policy";

/**
 * Kept in lockstep with MONTHLY_HISTORY_CONTEXT_KEY / _RANGE_PRESET in
 * src/lib/analytics/monthly-pnl-history.ts (asserted by a unit test).
 * Redeclared locally so this module does not import the analytics stack.
 */
export const MONTHLY_HISTORY_SNAPSHOT_EXEMPTION = {
  contextKey: "financial-planning",
  rangePreset: "monthly",
} as const;

export const FINANCE_STANDING_OBJECT_TYPE_VARIANTS = imladrisObjectTypeQueryVariants(
  ...IMLADRIS_FINANCE_STANDING_BASE_OBJECT_TYPES,
);

export interface DbPrunePrismaClient {
  $executeRaw(query: Prisma.Sql): Promise<number>;
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

export type DbPruneLogger = (message: string) => void;

export interface PruneTableResult {
  table: string;
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  /** Rows deleted (real run) or rows currently matching the predicate (dry run). */
  rows: number;
  batches: number;
  /** True when the run stopped at a batch/time cap with work remaining. */
  truncated: boolean;
  durationMs: number;
  error?: string;
}

export interface DbPruneRunResult {
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalRows: number;
  truncated: boolean;
  policy: Omit<DbPrunePolicy, "forceDryRun">;
  tables: PruneTableResult[];
}

interface CountRow {
  count: number;
}

interface PruneTableSpec {
  table: string;
  retentionDays: number;
  cutoff: Date;
  countSql: Prisma.Sql;
  deleteSql: (batchSize: number) => Prisma.Sql;
}

function rawRecordPrunableWhere(cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    r."createdAt" < ${cutoff}
    AND r."updatedAt" < ${cutoff}
    AND COALESCE(r."occurredAt", 'epoch'::timestamp) < ${cutoff}
    AND COALESCE(r."sourceCreatedAt", 'epoch'::timestamp) < ${cutoff}
    AND COALESCE(r."sourceUpdatedAt", 'epoch'::timestamp) < ${cutoff}
    AND r."objectType" NOT IN (${Prisma.join(FINANCE_STANDING_OBJECT_TYPE_VARIANTS)})
    AND NOT EXISTS (
      SELECT 1
      FROM "ImladrisMetricLineage" l
      WHERE l."rawRecordId" = r."id"
    )`;
}

function syncRunPrunableWhere(cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    s."startedAt" < ${cutoff}
    AND NOT EXISTS (
      SELECT 1
      FROM "ImladrisRawSourceRecord" r
      WHERE r."syncRunId" = s."id"
    )`;
}

function snapshotPrunableWhere(cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    a."capturedAt" < ${cutoff}
    AND NOT (
      a."contextKey" = ${MONTHLY_HISTORY_SNAPSHOT_EXEMPTION.contextKey}
      AND a."rangePreset" = ${MONTHLY_HISTORY_SNAPSHOT_EXEMPTION.rangePreset}
    )`;
}

function buildPruneTableSpecs(policy: DbPrunePolicy, now: Date): PruneTableSpec[] {
  const rawRecordCutoff = cutoffForRetentionDays(now, policy.rawRecordRetentionDays);
  const syncRunCutoff = cutoffForRetentionDays(now, policy.syncRunRetentionDays);
  const metricHistoryCutoff = cutoffForRetentionDays(now, policy.metricHistoryRetentionDays);
  const securityAuditCutoff = cutoffForRetentionDays(now, policy.securityAuditRetentionDays);
  const snapshotCutoff = cutoffForRetentionDays(now, policy.analyticsSnapshotRetentionDays);

  return [
    // Ordered by expected space recovered. Raw records run before sync runs
    // so freshly-emptied runs qualify for deletion in the same pass.
    {
      table: "ImladrisRawSourceRecord",
      retentionDays: policy.rawRecordRetentionDays,
      cutoff: rawRecordCutoff,
      countSql: Prisma.sql`
        SELECT COUNT(*)::float8 AS count
        FROM "ImladrisRawSourceRecord" r
        WHERE ${rawRecordPrunableWhere(rawRecordCutoff)}`,
      deleteSql: (batchSize) => Prisma.sql`
        DELETE FROM "ImladrisRawSourceRecord"
        WHERE "id" IN (
          SELECT r."id"
          FROM "ImladrisRawSourceRecord" r
          WHERE ${rawRecordPrunableWhere(rawRecordCutoff)}
          LIMIT ${batchSize}
        )`,
    },
    {
      table: "ImladrisSourceSyncRun",
      retentionDays: policy.syncRunRetentionDays,
      cutoff: syncRunCutoff,
      countSql: Prisma.sql`
        SELECT COUNT(*)::float8 AS count
        FROM "ImladrisSourceSyncRun" s
        WHERE ${syncRunPrunableWhere(syncRunCutoff)}`,
      deleteSql: (batchSize) => Prisma.sql`
        DELETE FROM "ImladrisSourceSyncRun"
        WHERE "id" IN (
          SELECT s."id"
          FROM "ImladrisSourceSyncRun" s
          WHERE ${syncRunPrunableWhere(syncRunCutoff)}
          LIMIT ${batchSize}
        )`,
    },
    {
      table: "MetricHistory",
      retentionDays: policy.metricHistoryRetentionDays,
      cutoff: metricHistoryCutoff,
      countSql: Prisma.sql`
        SELECT COUNT(*)::float8 AS count
        FROM "MetricHistory" m
        WHERE m."capturedAt" < ${metricHistoryCutoff}`,
      deleteSql: (batchSize) => Prisma.sql`
        DELETE FROM "MetricHistory"
        WHERE "id" IN (
          SELECT m."id"
          FROM "MetricHistory" m
          WHERE m."capturedAt" < ${metricHistoryCutoff}
          LIMIT ${batchSize}
        )`,
    },
    {
      table: "SecurityAuditEvent",
      retentionDays: policy.securityAuditRetentionDays,
      cutoff: securityAuditCutoff,
      countSql: Prisma.sql`
        SELECT COUNT(*)::float8 AS count
        FROM "SecurityAuditEvent" e
        WHERE e."createdAt" < ${securityAuditCutoff}`,
      deleteSql: (batchSize) => Prisma.sql`
        DELETE FROM "SecurityAuditEvent"
        WHERE "id" IN (
          SELECT e."id"
          FROM "SecurityAuditEvent" e
          WHERE e."createdAt" < ${securityAuditCutoff}
          LIMIT ${batchSize}
        )`,
    },
    {
      table: "AnalyticsSnapshot",
      retentionDays: policy.analyticsSnapshotRetentionDays,
      cutoff: snapshotCutoff,
      countSql: Prisma.sql`
        SELECT COUNT(*)::float8 AS count
        FROM "AnalyticsSnapshot" a
        WHERE ${snapshotPrunableWhere(snapshotCutoff)}`,
      deleteSql: (batchSize) => Prisma.sql`
        DELETE FROM "AnalyticsSnapshot"
        WHERE "id" IN (
          SELECT a."id"
          FROM "AnalyticsSnapshot" a
          WHERE ${snapshotPrunableWhere(snapshotCutoff)}
          LIMIT ${batchSize}
        )`,
    },
  ];
}

const ROTATION_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rotate the per-table processing order by calendar day.
 *
 * The per-table batch cap (maxBatchesPerTable) already bounds how long any
 * one table holds the run in the common case, so it yields to the next table
 * long before the wall-clock budget matters. But if deletes are
 * pathologically slow (a single table's capped batches exceed the whole time
 * budget), a *fixed* order would let the first table starve every later table
 * on every run — the same tables would never be reached. Rotating the start
 * index by day guarantees that, across consecutive daily runs, every table
 * eventually leads and gets pruned.
 *
 * Trade-off: on days where ImladrisSourceSyncRun is ordered before
 * ImladrisRawSourceRecord, a sync run emptied in this run is only collected
 * on the next run. That lag is harmless — pruning is idempotent and
 * eventually consistent.
 */
export function rotateSpecsForDay<T>(specs: T[], now: Date): T[] {
  if (specs.length === 0) return specs;
  const dayIndex = Math.floor(now.getTime() / ROTATION_DAY_MS);
  const offset = ((dayIndex % specs.length) + specs.length) % specs.length;
  return [...specs.slice(offset), ...specs.slice(0, offset)];
}

function logStructured(logger: DbPruneLogger, payload: Record<string, unknown>): void {
  logger(`[db-prune] ${JSON.stringify(payload)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pruneTable(input: {
  prisma: DbPrunePrismaClient;
  spec: PruneTableSpec;
  dryRun: boolean;
  batchSize: number;
  maxBatches: number;
  deadlineMs: number;
  logger: DbPruneLogger;
}): Promise<PruneTableResult> {
  const { prisma, spec, dryRun, batchSize, maxBatches, deadlineMs, logger } = input;
  const startedMs = Date.now();
  const base = {
    table: spec.table,
    dryRun,
    retentionDays: spec.retentionDays,
    cutoff: spec.cutoff.toISOString(),
  };

  try {
    if (dryRun) {
      const rows = await prisma.$queryRaw<CountRow[]>(spec.countSql);
      const count = Math.max(0, Math.round(rows[0]?.count ?? 0));
      const result: PruneTableResult = {
        ...base,
        rows: count,
        batches: 0,
        truncated: false,
        durationMs: Date.now() - startedMs,
      };
      logStructured(logger, { event: "table_summary", ...result });
      return result;
    }

    let deleted = 0;
    let batches = 0;
    let lastBatchFull = false;

    while (batches < maxBatches && Date.now() < deadlineMs) {
      const affected = await prisma.$executeRaw(spec.deleteSql(batchSize));
      batches += 1;
      deleted += affected;
      lastBatchFull = affected >= batchSize;
      if (affected > 0) {
        logStructured(logger, {
          event: "batch",
          table: spec.table,
          batch: batches,
          affected,
          dryRun,
        });
      }
      if (!lastBatchFull) break;
    }

    const result: PruneTableResult = {
      ...base,
      rows: deleted,
      batches,
      truncated: lastBatchFull,
      durationMs: Date.now() - startedMs,
    };
    logStructured(logger, { event: "table_summary", ...result });
    return result;
  } catch (error) {
    const result: PruneTableResult = {
      ...base,
      rows: 0,
      batches: 0,
      truncated: false,
      durationMs: Date.now() - startedMs,
      error: errorMessage(error),
    };
    logStructured(logger, { event: "table_error", ...result });
    return result;
  }
}

export async function runDbPrune(input: {
  prisma: DbPrunePrismaClient;
  dryRun?: boolean;
  now?: Date;
  policy?: DbPrunePolicy;
  logger?: DbPruneLogger;
}): Promise<DbPruneRunResult> {
  const policy = input.policy ?? resolveDbPrunePolicy();
  const now = input.now ?? new Date();
  const dryRun = policy.forceDryRun || input.dryRun === true;
  const logger = input.logger ?? ((message: string) => console.info(message));
  const startedMs = Date.now();
  const deadlineMs = startedMs + policy.timeBudgetMs;
  const startedAt = new Date(startedMs).toISOString();

  logStructured(logger, {
    event: "run_start",
    startedAt,
    dryRun,
    forcedDryRun: policy.forceDryRun,
    batchSize: policy.batchSize,
    maxBatchesPerTable: policy.maxBatchesPerTable,
    timeBudgetMs: policy.timeBudgetMs,
  });

  const tables: PruneTableResult[] = [];
  for (const spec of rotateSpecsForDay(buildPruneTableSpecs(policy, now), now)) {
    tables.push(
      await pruneTable({
        prisma: input.prisma,
        spec,
        dryRun,
        batchSize: policy.batchSize,
        maxBatches: policy.maxBatchesPerTable,
        deadlineMs,
        logger,
      }),
    );
  }

  const finishedMs = Date.now();
  const reportedPolicy: Omit<DbPrunePolicy, "forceDryRun"> = {
    rawRecordRetentionDays: policy.rawRecordRetentionDays,
    syncRunRetentionDays: policy.syncRunRetentionDays,
    metricHistoryRetentionDays: policy.metricHistoryRetentionDays,
    securityAuditRetentionDays: policy.securityAuditRetentionDays,
    analyticsSnapshotRetentionDays: policy.analyticsSnapshotRetentionDays,
    batchSize: policy.batchSize,
    maxBatchesPerTable: policy.maxBatchesPerTable,
    timeBudgetMs: policy.timeBudgetMs,
  };
  const result: DbPruneRunResult = {
    ok: tables.every((table) => !table.error),
    dryRun,
    startedAt,
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: finishedMs - startedMs,
    totalRows: tables.reduce((sum, table) => sum + table.rows, 0),
    truncated: tables.some((table) => table.truncated),
    policy: reportedPolicy,
    tables,
  };

  logStructured(logger, {
    event: "run_summary",
    ok: result.ok,
    dryRun: result.dryRun,
    totalRows: result.totalRows,
    truncated: result.truncated,
    durationMs: result.durationMs,
  });

  return result;
}

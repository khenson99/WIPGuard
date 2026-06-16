/**
 * Database data-retention sweep.
 *
 * Bounded, batched deletion of operational data that otherwise grows without
 * limit. Born out of the June 2026 disk incident: the production Postgres
 * volume hit 93% capacity because ImladrisMetricLineage accumulated ~41.5M
 * rows (~15 GB) in one week (every sync run created a new canonical metric
 * value with a full copy of its evidence lineage) and OutboxEvent held ~900K
 * dead-letter rows (~660 MB) that nothing pruned.
 *
 * Design rules:
 *  - Every DELETE is batched (`id IN (SELECT id ... LIMIT n)`) so no single
 *    statement holds long locks or produces a multi-GB WAL spike.
 *  - Every table has a per-run row cap so a sweep cycle has a bounded cost.
 *  - The sweep never throws: each step's failure is captured in the summary
 *    so retention problems can't take down the surrounding sync cycle.
 *  - Dry-run mode (DATA_RETENTION_DRY_RUN=true) reports what would be
 *    deleted without deleting anything.
 *
 * Runs from runAnalyticsSync(), which is shared by the worker orchestrator
 * (worker/sync-runner.ts -> src/lib/sync/orchestrator.ts) and the cron route
 * (/api/cron/sync) — so retention stays alive as long as either path runs.
 *
 * See docs/runbooks/postgres-disk-incident-2026-06.md for the incident
 * write-up and the one-time backlog cleanup procedure.
 */

export interface DataRetentionPrisma {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface DataRetentionConfig {
  enabled: boolean;
  dryRun: boolean;
  /** Rows per DELETE statement. */
  batchSize: number;
  /** Max rows deleted per table per sweep run. */
  maxRowsPerTablePerRun: number;
  /**
   * Days a superseded canonical metric value keeps its lineage evidence.
   * The latest value per (organizationId, userId, metricKey) always keeps
   * its lineage regardless of age.
   */
  imladrisLineageRetentionDays: number;
  /** Days canonical metric value rows themselves are kept. */
  imladrisMetricRetentionDays: number;
  /** Days successfully dispatched outbox events are kept. */
  outboxDispatchedRetentionDays: number;
  /** Days dead-lettered outbox events are kept. */
  outboxDeadLetterRetentionDays: number;
  /** Days security audit events are kept. */
  securityAuditRetentionDays: number;
  /** Days visitor funnel events are kept. */
  funnelEventRetentionDays: number;
}

export interface RetentionStepResult {
  step: string;
  /** Rows deleted (or rows that WOULD be deleted in dry-run). */
  deleted: number;
  /** True when the per-table cap stopped the step before it finished. */
  capped: boolean;
  error?: string;
}

export interface DataRetentionSummary {
  enabled: boolean;
  dryRun: boolean;
  steps: RetentionStepResult[];
  totalDeleted: number;
  databaseSizeBytes: number | null;
  durationMs: number;
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallback;
}

export function loadDataRetentionConfig(): DataRetentionConfig {
  return {
    // Enabled by default: this module exists to keep production storage
    // bounded. Set DATA_RETENTION_ENABLED=false to disable entirely.
    enabled: process.env.DATA_RETENTION_ENABLED !== "false",
    dryRun: process.env.DATA_RETENTION_DRY_RUN === "true",
    batchSize: parsePositiveInt("DATA_RETENTION_BATCH_SIZE", 20_000),
    maxRowsPerTablePerRun: parsePositiveInt(
      "DATA_RETENTION_MAX_ROWS_PER_RUN",
      200_000,
    ),
    imladrisLineageRetentionDays: parsePositiveInt(
      "IMLADRIS_LINEAGE_RETENTION_DAYS",
      7,
    ),
    imladrisMetricRetentionDays: parsePositiveInt(
      "IMLADRIS_METRIC_RETENTION_DAYS",
      365,
    ),
    outboxDispatchedRetentionDays: parsePositiveInt(
      "OUTBOX_DISPATCHED_RETENTION_DAYS",
      14,
    ),
    outboxDeadLetterRetentionDays: parsePositiveInt(
      "OUTBOX_DEAD_LETTER_RETENTION_DAYS",
      90,
    ),
    securityAuditRetentionDays: parsePositiveInt(
      "SECURITY_AUDIT_RETENTION_DAYS",
      365,
    ),
    funnelEventRetentionDays: parsePositiveInt(
      "FUNNEL_EVENT_RETENTION_DAYS",
      365,
    ),
  };
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function asCount(rows: unknown): number {
  if (Array.isArray(rows) && rows.length > 0) {
    const value = (rows[0] as Record<string, unknown>).count;
    const parsed = typeof value === "bigint" ? Number(value) : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Delete rows matching `predicateSql` in batches of `batchSize`, stopping at
 * `maxRows`. `predicateSql` must only reference the target table's columns
 * and use placeholders starting at $1; `params` supplies their values.
 *
 * In dry-run mode, returns the number of rows that WOULD be deleted
 * (bounded by maxRows so the count query itself stays cheap).
 */
async function deleteInBatches(input: {
  prisma: DataRetentionPrisma;
  table: string;
  predicateSql: string;
  params: unknown[];
  batchSize: number;
  maxRows: number;
  dryRun: boolean;
}): Promise<{ deleted: number; capped: boolean }> {
  const { prisma, table, predicateSql, params, batchSize, maxRows, dryRun } =
    input;
  const limitPlaceholder = `$${params.length + 1}`;

  if (dryRun) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: unknown }>>(
      `SELECT count(*)::bigint AS count FROM (SELECT 1 FROM "${table}" WHERE ${predicateSql} LIMIT ${limitPlaceholder}) candidates`,
      ...params,
      maxRows + 1,
    );
    const count = asCount(rows);
    return { deleted: Math.min(count, maxRows), capped: count > maxRows };
  }

  let deleted = 0;
  while (deleted < maxRows) {
    const batch = Math.min(batchSize, maxRows - deleted);
    const affected = await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "id" IN (SELECT "id" FROM "${table}" WHERE ${predicateSql} LIMIT ${limitPlaceholder})`,
      ...params,
      batch,
    );
    deleted += affected;
    if (affected < batch) {
      return { deleted, capped: false };
    }
  }
  return { deleted, capped: true };
}

/**
 * Canonical metric values that are superseded (a newer value exists for the
 * same scope + metricKey) and older than the lineage retention window. Their
 * lineage evidence is pruned; the metric value row itself is kept for
 * history until imladrisMetricRetentionDays.
 */
const SUPERSEDED_METRIC_VALUES_SQL = `
  SELECT mv."id"
  FROM "ImladrisCanonicalMetricValue" mv
  WHERE mv."periodEnd" < $1
    AND EXISTS (
      SELECT 1 FROM "ImladrisCanonicalMetricValue" newer
      WHERE newer."metricKey" = mv."metricKey"
        AND newer."organizationId" IS NOT DISTINCT FROM mv."organizationId"
        AND newer."userId" IS NOT DISTINCT FROM mv."userId"
        AND newer."periodEnd" > mv."periodEnd"
    )
    AND EXISTS (
      SELECT 1 FROM "ImladrisMetricLineage" l WHERE l."metricValueId" = mv."id"
    )
  ORDER BY mv."periodEnd" ASC
  LIMIT $2
`;

async function pruneSupersededLineage(input: {
  prisma: DataRetentionPrisma;
  now: Date;
  config: DataRetentionConfig;
}): Promise<RetentionStepResult> {
  const { prisma, now, config } = input;
  const step = "imladrisSupersededLineage";
  const cutoff = daysAgo(now, config.imladrisLineageRetentionDays);

  let deleted = 0;
  let capped = false;

  // Up to 200 candidate metric values per run; lineage deletion is the
  // bounded resource (maxRowsPerTablePerRun), candidates are just pointers.
  const candidates = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    SUPERSEDED_METRIC_VALUES_SQL,
    cutoff,
    200,
  );

  for (const candidate of candidates) {
    if (deleted >= config.maxRowsPerTablePerRun) {
      capped = true;
      break;
    }
    const result = await deleteInBatches({
      prisma,
      table: "ImladrisMetricLineage",
      predicateSql: `"metricValueId" = $1`,
      params: [candidate.id],
      batchSize: config.batchSize,
      maxRows: config.maxRowsPerTablePerRun - deleted,
      dryRun: config.dryRun,
    });
    deleted += result.deleted;
    capped = capped || result.capped;
  }

  return { step, deleted, capped };
}

async function pruneExpiredMetricValues(input: {
  prisma: DataRetentionPrisma;
  now: Date;
  config: DataRetentionConfig;
}): Promise<RetentionStepResult> {
  const { prisma, now, config } = input;
  const step = "imladrisExpiredMetricValues";
  const cutoff = daysAgo(now, config.imladrisMetricRetentionDays);

  // ImladrisMetricLineage.metricValue is ON DELETE CASCADE, so deleting a
  // metric value cascades to its lineage. Delete one value at a time and
  // strip its lineage in batches FIRST so a single cascade can never delete
  // millions of rows in one transaction.
  const candidates = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ImladrisCanonicalMetricValue" WHERE "periodEnd" < $1 ORDER BY "periodEnd" ASC LIMIT $2`,
    cutoff,
    500,
  );

  let lineageDeleted = 0;
  let valuesDeleted = 0;
  let capped = false;

  for (const candidate of candidates) {
    if (lineageDeleted + valuesDeleted >= config.maxRowsPerTablePerRun) {
      capped = true;
      break;
    }
    const lineage = await deleteInBatches({
      prisma,
      table: "ImladrisMetricLineage",
      predicateSql: `"metricValueId" = $1`,
      params: [candidate.id],
      batchSize: config.batchSize,
      maxRows: config.maxRowsPerTablePerRun - lineageDeleted - valuesDeleted,
      dryRun: config.dryRun,
    });
    lineageDeleted += lineage.deleted;
    if (lineage.capped) {
      capped = true;
      break;
    }
    if (!config.dryRun) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ImladrisCanonicalMetricValue" WHERE "id" = $1`,
        candidate.id,
      );
    }
    valuesDeleted += 1;
  }

  return { step, deleted: lineageDeleted + valuesDeleted, capped };
}

export async function fetchDatabaseSizeBytes(
  prisma: DataRetentionPrisma,
): Promise<number | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ size: unknown }>>(
      `SELECT pg_database_size(current_database())::bigint AS size`,
    );
    if (Array.isArray(rows) && rows.length > 0) {
      const value = rows[0].size;
      const parsed = typeof value === "bigint" ? Number(value) : Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Run one bounded retention sweep. Never throws; failures are reported in
 * the returned summary (and logged) so callers can surface them without
 * aborting the surrounding sync cycle.
 */
export async function runDataRetentionSweep(input: {
  prisma: DataRetentionPrisma;
  now?: Date;
  config?: DataRetentionConfig;
}): Promise<DataRetentionSummary> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const config = input.config ?? loadDataRetentionConfig();
  const steps: RetentionStepResult[] = [];

  if (!config.enabled) {
    return {
      enabled: false,
      dryRun: config.dryRun,
      steps,
      totalDeleted: 0,
      databaseSizeBytes: await fetchDatabaseSizeBytes(input.prisma),
      durationMs: Date.now() - startedAt,
    };
  }

  const runStep = async (
    step: string,
    fn: () => Promise<RetentionStepResult>,
  ) => {
    try {
      steps.push(await fn());
    } catch (error) {
      steps.push({
        step,
        deleted: 0,
        capped: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await runStep("imladrisSupersededLineage", () =>
    pruneSupersededLineage({ prisma: input.prisma, now, config }),
  );

  await runStep("imladrisExpiredMetricValues", () =>
    pruneExpiredMetricValues({ prisma: input.prisma, now, config }),
  );

  await runStep("outboxDispatched", async () => {
    const result = await deleteInBatches({
      prisma: input.prisma,
      table: "OutboxEvent",
      predicateSql: `"status" = 'DISPATCHED' AND "dispatchedAt" < $1`,
      params: [daysAgo(now, config.outboxDispatchedRetentionDays)],
      batchSize: config.batchSize,
      maxRows: config.maxRowsPerTablePerRun,
      dryRun: config.dryRun,
    });
    return { step: "outboxDispatched", ...result };
  });

  await runStep("outboxDeadLetter", async () => {
    const result = await deleteInBatches({
      prisma: input.prisma,
      table: "OutboxEvent",
      predicateSql: `"status" = 'DEAD_LETTER' AND "createdAt" < $1`,
      params: [daysAgo(now, config.outboxDeadLetterRetentionDays)],
      batchSize: config.batchSize,
      maxRows: config.maxRowsPerTablePerRun,
      dryRun: config.dryRun,
    });
    return { step: "outboxDeadLetter", ...result };
  });

  await runStep("securityAuditEvents", async () => {
    const result = await deleteInBatches({
      prisma: input.prisma,
      table: "SecurityAuditEvent",
      predicateSql: `"createdAt" < $1`,
      params: [daysAgo(now, config.securityAuditRetentionDays)],
      batchSize: config.batchSize,
      maxRows: config.maxRowsPerTablePerRun,
      dryRun: config.dryRun,
    });
    return { step: "securityAuditEvents", ...result };
  });

  await runStep("funnelEvents", async () => {
    const result = await deleteInBatches({
      prisma: input.prisma,
      table: "FunnelEvent",
      predicateSql: `"occurredAt" < $1`,
      params: [daysAgo(now, config.funnelEventRetentionDays)],
      batchSize: config.batchSize,
      maxRows: config.maxRowsPerTablePerRun,
      dryRun: config.dryRun,
    });
    return { step: "funnelEvents", ...result };
  });

  const summary: DataRetentionSummary = {
    enabled: true,
    dryRun: config.dryRun,
    steps,
    totalDeleted: steps.reduce((sum, step) => sum + step.deleted, 0),
    databaseSizeBytes: await fetchDatabaseSizeBytes(input.prisma),
    durationMs: Date.now() - startedAt,
  };

  // Structured log line — Railway log alerting can match on `[data-retention]`.
  console.info("[data-retention]", JSON.stringify(summary));

  return summary;
}

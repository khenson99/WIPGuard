/**
 * Retention pruning telemetry + early-warning alerts.
 *
 * Background: the 2026-06-10 Postgres volume-full + OOM incident was caused by
 * ImladrisMetricLineage growing unbounded to ~22M rows / ~8GB (91% of the DB)
 * with NOTHING reporting it. Retention pruning now runs every sync cycle
 * (~10 min) — see src/lib/sync/analytics.ts and the three pruners in
 * src/lib/imladris/* and src/lib/events/outbox-retention.ts — but a pruner that
 * silently stops deleting (e.g. a query-plan regression, a bad cutoff, an index
 * drop) would let the table regrow exactly as before, invisibly.
 *
 * This module turns each cycle's prune results into:
 *   1. One structured info line per cycle (`[retention:metrics]`) carrying the
 *      delete counts, total DB bytes, the cheap lineage row estimate, and the
 *      age of the oldest lineage still present — a grep-able time series for
 *      Railway log dashboards.
 *   2. A loud error line (`[retention:alert]`) when lineage that should have
 *      aged out is still present AND the lineage pruner deleted nothing this
 *      cycle — the silent-regrowth failure mode that caused the outage.
 *   3. Budget-exhaustion warnings (`[retention:alert]`, reason
 *      `*_budget_exhausted`) when a pruner hit its time budget with rows still
 *      eligible — the early signal that a backlog is outpacing the per-cycle
 *      budget.
 *
 * Matches the existing `[tag] + JSON.stringify(...)` logging convention (see
 * `[health:storage]` in src/app/api/health/route.ts and
 * `[visitor-funnel.enrichment.metric]` in the cron route). Read queries reuse
 * the proven catalog-query patterns from src/app/api/health/db/route.ts
 * (`pg_database_size(...)::float8`, `GREATEST(c.reltuples, 0)::float8` over
 * pg_class) — `::float8` deserializes to a JS number, sidestepping BigInt.
 *
 * Every read query is best-effort: a failure here must NEVER break the sync, so
 * stats fall back to null and telemetry still emits what it has.
 */

import type { PrismaClientType } from "@/lib/prisma";
import type { PruneImladrisMetricLineageResult } from "@/lib/imladris/lineage-retention";
import type { PruneImladrisMetricValuesResult } from "@/lib/imladris/metric-value-retention";
import type { PruneOutboxEventsResult } from "@/lib/events/outbox-retention";
import type { GrowthPruneOutcome } from "@/lib/sync/analytics";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LINEAGE_RETENTION_DAYS = 14;
/**
 * Grace buffer added to the lineage TTL before the should-have-pruned alert
 * fires. Pruning is time-budgeted and the cutoff drifts within a cycle, so a
 * row sitting a few hours past the TTL is normal; the alert is for lineage
 * clearly stranded BEYOND the window. Defaults to
 * RETENTION_LINEAGE_ALERT_GRACE_DAYS (env) or 1.
 */
const DEFAULT_ALERT_GRACE_DAYS = 1;

/** The dominant growth table behind the 2026-06-10 outage. */
const LINEAGE_TABLE = "ImladrisMetricLineage";

export interface RetentionTelemetryInput {
  prisma: PrismaClientType;
  lineagePruning: GrowthPruneOutcome<PruneImladrisMetricLineageResult>;
  metricValuePruning: GrowthPruneOutcome<PruneImladrisMetricValuesResult>;
  outboxPruning: GrowthPruneOutcome<PruneOutboxEventsResult>;
}

/** Database-level stats sampled once per cycle. Any field is null on failure. */
interface RetentionDbStats {
  /** pg_database_size(current_database()) in bytes. */
  dbBytes: number | null;
  /** pg_class.reltuples estimate for the lineage table (cheap, no seq scan). */
  lineageRows: number | null;
  /**
   * Age in days (1 decimal) of the oldest ImladrisCanonicalMetricValue that
   * still carries lineage, by computedAt — the exact column the lineage pruner
   * filters on. null when no lineage-bearing rows exist.
   */
  oldestLineageAgeDays: number | null;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallback;
}

function isPruneError(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

function firstFiniteNumber(row: Record<string, unknown> | undefined, key: string): number | null {
  const raw = row?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "bigint") return Number(raw);
  return null;
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Sample the database stats for one cycle. Each query is isolated so one
 * failing read does not lose the others, and the whole thing is non-throwing:
 * the sync must not break because telemetry could not read a catalog table.
 */
export async function collectRetentionDbStats(
  prisma: PrismaClientType,
  now: Date,
): Promise<RetentionDbStats> {
  let dbBytes: number | null = null;
  let lineageRows: number | null = null;
  let oldestLineageAgeDays: number | null = null;

  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT pg_database_size(current_database())::float8 AS bytes
    `;
    dbBytes = firstFiniteNumber(rows?.[0], "bytes");
  } catch {
    dbBytes = null;
  }

  try {
    // Cheap planner estimate — NOT a COUNT(*) seq-scan over a multi-million-row
    // table. Mirrors src/app/api/health/db/route.ts.
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT GREATEST(c.reltuples, 0)::float8 AS rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ${LINEAGE_TABLE}
      LIMIT 1
    `;
    const rounded = firstFiniteNumber(rows?.[0], "rows");
    lineageRows = rounded === null ? null : Math.round(rounded);
  } catch {
    lineageRows = null;
  }

  try {
    // Oldest lineage still present, expressed as the age of the metric value it
    // hangs off. computedAt is exactly what lineage-retention.ts filters on, so
    // this is the faithful "is anything past the TTL still here?" signal. The
    // EXISTS probe rides the ImladrisMetricLineage.metricValueId index, so only
    // lineage-bearing rows count (lineage-free rows are irrelevant here).
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT MIN(mv."computedAt") AS oldest
      FROM "ImladrisCanonicalMetricValue" mv
      WHERE EXISTS (
        SELECT 1 FROM "ImladrisMetricLineage" l WHERE l."metricValueId" = mv."id"
      )
    `;
    const oldest = rows?.[0]?.oldest;
    if (oldest instanceof Date) {
      oldestLineageAgeDays = roundTo1((now.getTime() - oldest.getTime()) / DAY_MS);
    } else if (typeof oldest === "string") {
      const parsed = new Date(oldest);
      if (!Number.isNaN(parsed.getTime())) {
        oldestLineageAgeDays = roundTo1((now.getTime() - parsed.getTime()) / DAY_MS);
      }
    }
  } catch {
    oldestLineageAgeDays = null;
  }

  return { dbBytes, lineageRows, oldestLineageAgeDays };
}

/**
 * Emit one cycle's retention telemetry: always the `[retention:metrics]` info
 * line, plus `[retention:alert]` error lines for the should-have-pruned and
 * budget-exhaustion conditions. Wholly non-throwing — telemetry must never
 * break the sync.
 */
export async function emitRetentionTelemetry(
  input: RetentionTelemetryInput,
  now: Date = new Date(),
): Promise<void> {
  try {
    const { lineagePruning, metricValuePruning, outboxPruning } = input;

    const lineageDeleted = isPruneError(lineagePruning) ? null : lineagePruning.deletedRows;
    const metricValueDeleted = isPruneError(metricValuePruning)
      ? null
      : metricValuePruning.deletedRows;
    const outboxDeleted = isPruneError(outboxPruning)
      ? null
      : outboxPruning.deletedDispatched + outboxPruning.deletedDeadLetter;

    const stats = await collectRetentionDbStats(input.prisma, now);
    const lineageRetentionDays = positiveIntFromEnv(
      "IMLADRIS_LINEAGE_RETENTION_DAYS",
      DEFAULT_LINEAGE_RETENTION_DAYS,
    );

    // (1) One structured info line per cycle — the grep-able time series.
    console.info(
      "[retention:metrics]",
      JSON.stringify({
        lineageDeleted,
        metricValueDeleted,
        outboxDeleted,
        dbBytes: stats.dbBytes,
        lineageRows: stats.lineageRows,
        oldestLineageAgeDays: stats.oldestLineageAgeDays,
        lineageRetentionDays,
      }),
    );

    // (2) Should-have-pruned alert: lineage clearly past the TTL (+ grace) is
    // still present AND this cycle deleted nothing — the silent-regrowth mode
    // that caused the 2026-06-10 outage. Only fires when both signals are
    // known (a prune error is already surfaced separately by the cron route).
    const graceDays = positiveIntFromEnv(
      "RETENTION_LINEAGE_ALERT_GRACE_DAYS",
      DEFAULT_ALERT_GRACE_DAYS,
    );
    const alertThresholdDays = lineageRetentionDays + graceDays;
    if (
      stats.oldestLineageAgeDays !== null &&
      stats.oldestLineageAgeDays > alertThresholdDays &&
      lineageDeleted === 0
    ) {
      console.error(
        "[retention:alert]",
        JSON.stringify({
          reason: "lineage_not_pruning",
          oldestLineageAgeDays: stats.oldestLineageAgeDays,
          lineageRetentionDays,
          alertThresholdDays,
          lineageDeleted,
          lineageRows: stats.lineageRows,
          dbBytes: stats.dbBytes,
        }),
      );
    }

    // (3) Budget-exhaustion signals: a pruner hit its time budget with rows
    // still eligible (completed === false). Early warning that a backlog is
    // outpacing the per-cycle budget — raise the budget/batch env or
    // investigate before it becomes a regrowth.
    for (const [field, reason, outcome] of [
      ["lineagePruning", "lineage_budget_exhausted", lineagePruning],
      ["metricValuePruning", "metric_value_budget_exhausted", metricValuePruning],
      ["outboxPruning", "outbox_budget_exhausted", outboxPruning],
    ] as const) {
      if (!isPruneError(outcome) && outcome.completed === false) {
        console.error(
          "[retention:alert]",
          JSON.stringify({
            reason,
            field,
            durationMs: outcome.durationMs,
            batches: outcome.batches,
          }),
        );
      }
    }
  } catch (error) {
    // Telemetry is strictly best-effort: never let it abort the sync.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[retention:alert]", JSON.stringify({ reason: "telemetry_failed", error: message }));
  }
}

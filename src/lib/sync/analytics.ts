/**
 * Shared analytics sync logic.
 *
 * Called by BOTH:
 *   1. The orchestrator (worker process) via runSync()
 *   2. The legacy cron endpoint (/api/cron/sync)
 *
 * Replaces the inline `runAnalyticsRefresh` + `pruneAnalyticsSnapshots` calls
 * that previously lived in the cron route. Returns both the refresh and
 * pruning results so callers can preserve their existing response-body
 * shape (the cron route exposes `analytics` and `pruning` as separate
 * top-level fields).
 *
 * USER DISCOVERY:
 *   - Accepts an optional `userIds` array. If provided, uses it directly.
 *   - If omitted, discovers users with at least one recoverable integration
 *     connection. CONNECTED and ERROR rows are included so scheduled recovery
 *     jobs can clear stale error states; DISCONNECTED rows stay excluded.
 *
 * Shared user discovery now lives in `src/lib/sync/users.ts` so the
 * healthChecks (and future) modules can reuse the same filter.
 */

import type { PrismaClientType } from '@/lib/prisma';
import { runAnalyticsRefresh } from '@/lib/analytics/refresh-runner';
import { pruneAnalyticsSnapshots } from '@/lib/analytics/snapshots';
import {
  pruneOutboxEvents,
  type PruneOutboxEventsResult,
} from '@/lib/events/outbox-retention';
import {
  pruneImladrisMetricLineage,
  type PruneImladrisMetricLineageResult,
} from '@/lib/imladris/lineage-retention';
import {
  pruneImladrisMetricValues,
  type PruneImladrisMetricValuesResult,
} from '@/lib/imladris/metric-value-retention';
import {
  IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS,
  materializeImladrisCanonicalMetrics,
  type ImladrisMaterializationDepartment,
  type MaterializedImladrisMetricResult,
} from '@/lib/imladris/materialization';
import { emitRetentionTelemetry } from './retention-telemetry';
import { discoverConnectedUserIds } from './users';

type RollingRangePreset = '7d' | '30d' | '90d';

export interface AnalyticsSyncInput {
  prisma: PrismaClientType;
  /** Pre-discovered user IDs. If omitted, discovers users with recoverable integrations. */
  userIds?: string[];
  /** Range presets to refresh. Defaults to the cron route's prior behaviour: ["7d", "30d"]. */
  rangePresets?: RollingRangePreset[];
  /** Whether to refresh monthly financial history. Defaults to true (matches cron route). */
  includeMonthlyFinancialHistory?: boolean;
  /** Snapshot retention cutoff in days for pruning. Defaults to the cron route's parser (env or 30). */
  pruneOlderThanDays?: number;
  /** Test seam for deterministic materialization windows. Defaults to now. */
  now?: Date;
}

/**
 * Outcome of a growth-control pruning pass. A failed pass is captured as
 * `{ error }` instead of throwing so retention hiccups cannot abort the
 * analytics sync — but callers (orchestrator + cron route) surface the error
 * as a partial failure so a silently regrowing table stays visible.
 */
export type GrowthPruneOutcome<T> = T | { error: string };

export interface AnalyticsSyncResult {
  refresh: Awaited<ReturnType<typeof runAnalyticsRefresh>>;
  pruning: Awaited<ReturnType<typeof pruneAnalyticsSnapshots>>;
  // Lightweight summary (full metric values stripped) so the cron route's
  // after() closure no longer retains hundreds of MB of metric values across
  // cycles — they are already persisted to the DB. Salvaged from #595 after
  // the broader OOM fix landed in #594.
  imladris: ImladrisMaterializationSyncSummary[];
  /**
   * Growth controls for the two unbounded tables behind the 2026-06-10
   * disk-full outage. Named *Pruning (not *Retention) because the cron sync
   * response already has a `retention` field for the customer-retention
   * domain.
   */
  lineagePruning: GrowthPruneOutcome<PruneImladrisMetricLineageResult>;
  metricValuePruning: GrowthPruneOutcome<PruneImladrisMetricValuesResult>;
  outboxPruning: GrowthPruneOutcome<PruneOutboxEventsResult>;
}

const DEFAULT_RANGE_PRESETS: RollingRangePreset[] = ['7d', '30d'];
const IMLADRIS_MATERIALIZATION_WINDOW_DAYS = 30;
const IMLADRIS_MATERIALIZATION_DEPARTMENT_BUCKET_MS = 10 * 60 * 1000;
const IMLADRIS_MATERIALIZATION_DISABLED_WARNING =
  "Imladris materialization skipped by IMLADRIS_MATERIALIZATION_ENABLED=false.";

interface UserOrganizationRow {
  id: string;
  organizationId: string | null;
}

interface ConnectionOrganizationRow {
  userId: string;
  organizationId: string | null;
}

interface ImladrisMaterializationSyncResult {
  userId: string;
  organizationId: string | null;
  periodStart: string;
  periodEnd: string;
  metrics: MaterializedImladrisMetricResult[];
  error?: string;
  warning?: string;
}

/**
 * What callers actually need from materialization: identity, period, and which
 * metrics were produced. The full metric values are deliberately omitted —
 * they are already persisted, and retaining them in the cron route's after()
 * closure leaked hundreds of MB across sync cycles.
 */
interface ImladrisMaterializationSyncSummary {
  userId: string;
  organizationId: string | null;
  periodStart: string;
  periodEnd: string;
  metricsCount: number;
  metricKeys: string[];
  error?: string;
  warning?: string;
}

function parseDefaultRetentionDays(): number {
  const raw = process.env.ANALYTICS_SNAPSHOT_RETENTION_DAYS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return 30;
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

function imladrisMaterializationEnabled(): boolean {
  const raw = process.env.IMLADRIS_MATERIALIZATION_ENABLED?.trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function imladrisMaterializationRawBoundsConfigured(): boolean {
  return Boolean(
    process.env.IMLADRIS_MATERIALIZATION_RAW_BATCH_SIZE?.trim() ||
      process.env.IMLADRIS_MATERIALIZATION_MAX_RAW_RECORDS_PER_SOURCE?.trim(),
  );
}

function parseImladrisMaterializationDepartmentLimit(): number {
  const raw = process.env.IMLADRIS_MATERIALIZATION_DEPARTMENT_LIMIT?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(
      Math.floor(parsed),
      IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS.length,
    );
  }

  return imladrisMaterializationRawBoundsConfigured()
    ? 1
    : IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS.length;
}

function selectImladrisMaterializationDepartments(
  now: Date,
): readonly ImladrisMaterializationDepartment[] {
  const departmentLimit = parseImladrisMaterializationDepartmentLimit();
  const departments = IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS;
  if (departmentLimit >= departments.length) return departments;

  const startIndex =
    Math.floor(now.getTime() / IMLADRIS_MATERIALIZATION_DEPARTMENT_BUCKET_MS) %
    departments.length;
  return Array.from({ length: departmentLimit }, (_, offset) => (
    departments[(startIndex + offset) % departments.length]
  ));
}

function imladrisMaterializationDepartmentWarning(
  departments: readonly ImladrisMaterializationDepartment[],
): string | undefined {
  const totalDepartments = IMLADRIS_CANONICAL_MATERIALIZATION_DEPARTMENTS.length;
  if (departments.length >= totalDepartments) return undefined;

  return `Imladris materialization limited to ${departments.length} of ${totalDepartments} department families for this cron run (${departments.join(", ")}); remaining families rotate through later runs.`;
}

function joinWarnings(...warnings: Array<string | undefined>): string | undefined {
  const presentWarnings = warnings.filter((warning): warning is string => Boolean(warning));
  return presentWarnings.length > 0 ? presentWarnings.join(" ") : undefined;
}

async function loadImladrisMaterializationContexts(
  prisma: PrismaClientType,
  userIds: string[],
): Promise<Array<{ userId: string; organizationId: string | null }>> {
  if (userIds.length === 0) return [];
  const users = (await prisma.user.findMany({
    where: {
      id: {
        in: userIds,
      },
    },
    select: {
      id: true,
      organizationId: true,
    },
  })) as UserOrganizationRow[];
  const userById = new Map(users.map((user) => [user.id, user]));
  const scopedConnections = (await prisma.integrationConnection.findMany({
    where: {
      userId: {
        in: userIds,
      },
      organizationId: {
        not: null,
      },
      status: {
        in: ['CONNECTED', 'ERROR'],
      },
    },
    select: {
      userId: true,
      organizationId: true,
    },
    orderBy: [
      { lastSyncedAt: 'desc' },
      { updatedAt: 'desc' },
    ],
  })) as ConnectionOrganizationRow[];
  const connectionOrganizationByUserId = new Map<string, string>();
  for (const connection of scopedConnections) {
    if (connection.organizationId && !connectionOrganizationByUserId.has(connection.userId)) {
      connectionOrganizationByUserId.set(connection.userId, connection.organizationId);
    }
  }

  return userIds.map((userId) => ({
    userId,
    organizationId:
      userById.get(userId)?.organizationId ??
      connectionOrganizationByUserId.get(userId) ??
      null,
  }));
}

async function runImladrisMaterializationSync(input: {
  prisma: PrismaClientType;
  userIds: string[];
  now: Date;
  warning?: string;
}): Promise<ImladrisMaterializationSyncResult[]> {
  const contexts = await loadImladrisMaterializationContexts(
    input.prisma,
    input.userIds,
  );
  const periodEnd = input.now;
  const periodStart = daysBefore(periodEnd, IMLADRIS_MATERIALIZATION_WINDOW_DAYS);
  const departments = selectImladrisMaterializationDepartments(input.now);
  const departmentWarning = imladrisMaterializationDepartmentWarning(departments);
  const warning = joinWarnings(input.warning, departmentWarning);

  // Materialize users SEQUENTIALLY, not via Promise.all. Each user's
  // materialization loads large raw-record windows (see materialization.ts);
  // running every user concurrently multiplied peak heap by the user count and
  // contributed to the OOM crash loop. Sequencing bounds peak memory to a
  // single user at a time.
  const results: ImladrisMaterializationSyncResult[] = [];
  for (const context of contexts) {
    const baseResult = {
      userId: context.userId,
      organizationId: context.organizationId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      ...(warning ? { warning } : {}),
    };

    try {
      const materializationInput = {
        prisma: input.prisma,
        context,
        periodStart,
        periodEnd,
        now: input.now,
        ...(departmentWarning ? { departments } : {}),
      };
      results.push({
        ...baseResult,
        metrics: await materializeImladrisCanonicalMetrics(materializationInput),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("analytics_sync.imladris_materialization_failed", {
        userId: context.userId,
        organizationId: context.organizationId,
        error: message,
      });
      results.push({
        ...baseResult,
        metrics: [],
        error: message,
      });
    }
  }
  return results;
}

async function skipImladrisMaterializationSync(input: {
  prisma: PrismaClientType;
  userIds: string[];
  now: Date;
}): Promise<ImladrisMaterializationSyncResult[]> {
  const contexts = await loadImladrisMaterializationContexts(
    input.prisma,
    input.userIds,
  );
  const periodEnd = input.now;
  const periodStart = daysBefore(periodEnd, IMLADRIS_MATERIALIZATION_WINDOW_DAYS);

  return contexts.map((context) => ({
    userId: context.userId,
    organizationId: context.organizationId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    metrics: [],
    warning: IMLADRIS_MATERIALIZATION_DISABLED_WARNING,
  }));
}

/**
 * Run the analytics sync (refresh + retention pruning).
 *
 * Returns both results so callers can surface them as separate
 * response-body fields (the cron route depends on this shape).
 */
export async function runAnalyticsSync(
  input: AnalyticsSyncInput
): Promise<AnalyticsSyncResult> {
  const userIds =
    input.userIds && input.userIds.length > 0
      ? input.userIds
      : await discoverConnectedUserIds(input.prisma);

  const rangePresets =
    input.rangePresets && input.rangePresets.length > 0
      ? input.rangePresets
      : DEFAULT_RANGE_PRESETS;

  const includeMonthlyFinancialHistory =
    input.includeMonthlyFinancialHistory ?? true;

  const olderThanDays = input.pruneOlderThanDays ?? parseDefaultRetentionDays();
  const now = input.now ?? new Date();

  const refresh = await runAnalyticsRefresh({
    userIds,
    rangePresets,
    includeMonthlyFinancialHistory,
  });
  const failureCount =
    typeof refresh.failureCount === 'number' && Number.isFinite(refresh.failureCount)
      ? refresh.failureCount
      : 0;
  const materializationWarning =
    failureCount > 0
      ? `Analytics refresh reported ${failureCount} provider failure${failureCount === 1 ? '' : 's'}; canonical materialization used available raw records.`
      : undefined;
  // Prune analytics snapshots before Imladris materialization instead of
  // overlapping both phases. Materialization loads raw-record windows into
  // memory, and pruning can also hold large query buffers; sequencing keeps
  // peak cron-sync heap bounded to one phase at a time.
  const pruning = await pruneAnalyticsSnapshots({ olderThanDays });
  const imladris = imladrisMaterializationEnabled()
    ? await runImladrisMaterializationSync({
        prisma: input.prisma,
        userIds,
        now,
        warning: materializationWarning,
      })
    : await skipImladrisMaterializationSync({
        prisma: input.prisma,
        userIds,
        now,
      });

  // Growth-control retention for the two unbounded tables (lineage detail of
  // superseded metric values; terminal outbox events). Runs after
  // materialization so pruning never contends with this cycle's lineage
  // writes. Both passes are time-budgeted and resume next cycle, so the
  // initial multi-million-row backlog drains incrementally.
  const lineagePruning = await pruneImladrisMetricLineage({
    prisma: input.prisma,
    now,
  }).catch((error: unknown): GrowthPruneOutcome<PruneImladrisMetricLineageResult> => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('analytics_sync.lineage_pruning_failed', { error: message });
    return { error: message };
  });
  // Runs after lineage pruning by design: it only deletes lineage-free rows,
  // so the lineage pass clears the way and this pass can never cascade.
  const metricValuePruning = await pruneImladrisMetricValues({
    prisma: input.prisma,
    now,
  }).catch((error: unknown): GrowthPruneOutcome<PruneImladrisMetricValuesResult> => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('analytics_sync.metric_value_pruning_failed', { error: message });
    return { error: message };
  });
  const outboxPruning = await pruneOutboxEvents({
    prisma: input.prisma,
    now,
  }).catch((error: unknown): GrowthPruneOutcome<PruneOutboxEventsResult> => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('analytics_sync.outbox_pruning_failed', { error: message });
    return { error: message };
  });

  // Structured retention telemetry + early-warning alerts for the tables
  // behind the 2026-06-10 disk-full outage (see ./retention-telemetry.ts).
  // Runs for BOTH callers (cron route + worker orchestrator) since both go
  // through runAnalyticsSync. Wholly non-throwing — observability must never
  // abort the sync.
  await emitRetentionTelemetry(
    { prisma: input.prisma, lineagePruning, metricValuePruning, outboxPruning },
    now,
  );

  // Strip full metric values from the result — they're already persisted to
  // the DB. Keeping them in the response body retains hundreds of MB across
  // cron cycles (held by the route's after() closure). Salvaged from #595.
  const imladrisSummary: ImladrisMaterializationSyncSummary[] = imladris.map((entry) => ({
    userId: entry.userId,
    organizationId: entry.organizationId,
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
    metricsCount: entry.metrics.length,
    metricKeys: entry.metrics.map((metric) => metric.metricKey),
    ...(entry.warning ? { warning: entry.warning } : {}),
    ...(entry.error ? { error: entry.error } : {}),
  }));

  return {
    refresh,
    pruning,
    imladris: imladrisSummary,
    lineagePruning,
    metricValuePruning,
    outboxPruning,
  };
}

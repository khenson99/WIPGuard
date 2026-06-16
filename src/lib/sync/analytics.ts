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
  materializeImladrisCanonicalMetrics,
  type MaterializedImladrisMetricResult,
} from '@/lib/imladris/materialization';
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

export interface AnalyticsSyncResult {
  refresh: Awaited<ReturnType<typeof runAnalyticsRefresh>>;
  pruning: Awaited<ReturnType<typeof pruneAnalyticsSnapshots>>;
  imladris: ImladrisMaterializationSyncResult[];
}

const DEFAULT_RANGE_PRESETS: RollingRangePreset[] = ['7d', '30d'];
const IMLADRIS_MATERIALIZATION_WINDOW_DAYS = 30;

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

function parseDefaultRetentionDays(): number {
  const raw = process.env.ANALYTICS_SNAPSHOT_RETENTION_DAYS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return 30;
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
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
      ...(input.warning ? { warning: input.warning } : {}),
    };

    try {
      results.push({
        ...baseResult,
        metrics: await materializeImladrisCanonicalMetrics({
          prisma: input.prisma,
          context,
          periodStart,
          periodEnd,
          now: input.now,
        }),
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
  const [pruning, imladris] = await Promise.all([
    pruneAnalyticsSnapshots({ olderThanDays }),
    runImladrisMaterializationSync({
      prisma: input.prisma,
      userIds,
      now,
      warning: materializationWarning,
    }),
  ]);

  return { refresh, pruning, imladris };
}

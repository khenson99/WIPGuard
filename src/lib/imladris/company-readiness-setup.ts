import { GoalMetric, GoalStatus } from "@/generated/prisma/client";
import { buildImladrisRawRecordsFromPayload } from "@/lib/imladris/raw-records";
import { ingestImladrisRawRecords } from "@/lib/imladris/ingestion";
import { materializeImladrisCanonicalMetrics, type MaterializedImladrisMetricResult } from "@/lib/imladris/materialization";
import { buildCompanyTrackerDashboard, type CompanyTrackerDashboardData } from "@/lib/imladris/company-tracker";
import { getImladrisDashboardDefinition, REQUIRED_IMLADRIS_PROVIDERS } from "@/lib/imladris/catalog";
import {
  providerForSnapshotKey,
  snapshotKeyQueryVariants,
} from "@/lib/integrations/provider-registry";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import type { PrismaClientType } from "@/lib/prisma";

interface UserContext {
  userId: string | null;
  organizationId: string | null;
}

interface AnalyticsSnapshotRow {
  providerKey: string;
  payload: unknown;
  status: string;
  capturedAt: Date | string;
  expiresAt: Date | string;
  fromDate?: Date | string | null;
  toDate?: Date | string | null;
  lastError: string | null;
}

export interface CompanyReadinessSnapshotSetupResult {
  providerKey: string;
  capturedAt: string | null;
  rawRecordCount: number;
  acceptedRawRecordCount: number;
  status: string;
}

export interface CompanyReadinessGoalSetupResult {
  id: string;
  metric: GoalMetric;
  targetValue: number;
  deadline: string;
}

export interface CompanyReadinessSetupSummary {
  snapshotsUsed: CompanyReadinessSnapshotSetupResult[];
  metricsMaterialized: MaterializedImladrisMetricResult[];
  goalsCreated: CompanyReadinessGoalSetupResult[];
  unresolvedActions: string[];
  unresolvedBlockers: string[];
}

export interface CompanyReadinessSetupResult {
  setup: CompanyReadinessSetupSummary;
  dashboard: CompanyTrackerDashboardData;
}

const IMLADRIS_MATERIALIZATION_WINDOW_DAYS = 30;
const BOARD_READINESS_GOAL_METRICS = [GoalMetric.ARR, GoalMetric.RUNWAY, GoalMetric.BURN_RATE] as const;
const BOARD_READINESS_GOAL_METRIC_SET = new Set<GoalMetric>(BOARD_READINESS_GOAL_METRICS);
const FINANCIAL_GOAL_METRICS = new Set<string>(Object.values(GoalMetric));

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value: Date | string | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function toGoalMetric(metric: string): GoalMetric | null {
  return FINANCIAL_GOAL_METRICS.has(metric) ? (metric as GoalMetric) : null;
}

function boardReadinessGoalAction(metric: string): string {
  return `Configure ${metric} FinancialGoal target.`;
}

function analyticsSnapshotScopeWhere(context: UserContext) {
  const userScopes: Array<Record<string, unknown>> = [];

  if (context.userId) {
    const ownerUserId = resolveIntegrationOwnerUserId(context.userId);
    userScopes.push({ userId: ownerUserId }, { userId: context.userId });
  }

  if (context.organizationId) {
    userScopes.push({ user: { organizationId: context.organizationId } });
  }

  return { OR: userScopes };
}

function companySnapshotKeys(): string[] {
  const dashboard = getImladrisDashboardDefinition("company");
  if (!dashboard) return [];
  const providerByKey = new Map(REQUIRED_IMLADRIS_PROVIDERS.map((provider) => [provider.key, provider]));
  return snapshotKeyQueryVariants(
    dashboard.sourceKeys.flatMap((sourceKey) => providerByKey.get(sourceKey)?.snapshotKeys ?? [sourceKey]),
  );
}

function canonicalSnapshotGroupKey(providerKey: string): string {
  return snapshotKeyQueryVariants([providerKey])[0] ?? providerKey;
}

function latestSnapshotsByProvider(rows: AnalyticsSnapshotRow[]): AnalyticsSnapshotRow[] {
  const latest = new Map<string, AnalyticsSnapshotRow>();
  for (const row of rows) {
    if (row.payload === null || row.payload === undefined) continue;
    const groupKey = canonicalSnapshotGroupKey(row.providerKey);
    const existing = latest.get(groupKey);
    const rowTime = toDate(row.capturedAt)?.getTime() ?? 0;
    const existingTime = toDate(existing?.capturedAt)?.getTime() ?? 0;
    if (!existing || rowTime > existingTime) {
      latest.set(groupKey, row);
    }
  }
  return [...latest.values()];
}

async function loadLatestCompanySnapshots(input: {
  prisma: PrismaClientType;
  context: UserContext;
  now: Date;
}): Promise<AnalyticsSnapshotRow[]> {
  if (!input.context.userId) return [];

  const loadedRows = (await input.prisma.analyticsSnapshot.findMany({
    where: {
      ...analyticsSnapshotScopeWhere(input.context),
      providerKey: {
        in: companySnapshotKeys(),
      },
      status: "SUCCESS",
      capturedAt: {
        lte: input.now,
      },
    },
    select: {
      providerKey: true,
      payload: true,
      status: true,
      capturedAt: true,
      expiresAt: true,
      fromDate: true,
      toDate: true,
      lastError: true,
    },
    orderBy: [{ capturedAt: "desc" }],
  })) as AnalyticsSnapshotRow[];
  const rows = loadedRows.filter((row) => {
    const capturedAt = toDate(row.capturedAt);
    return capturedAt !== null && capturedAt.getTime() <= input.now.getTime();
  });

  return latestSnapshotsByProvider(rows);
}

async function backfillSnapshots(input: {
  prisma: PrismaClientType;
  context: UserContext;
  snapshots: AnalyticsSnapshotRow[];
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): Promise<CompanyReadinessSnapshotSetupResult[]> {
  const results: CompanyReadinessSnapshotSetupResult[] = [];

  for (const snapshot of input.snapshots) {
    const provider = providerForSnapshotKey(snapshot.providerKey);
    if (!provider) continue;

    const capturedAt = toDate(snapshot.capturedAt) ?? input.now;
    const from = toIso(snapshot.fromDate) ?? input.periodStart.toISOString();
    const to = toIso(snapshot.toDate) ?? input.periodEnd.toISOString();
    const records = buildImladrisRawRecordsFromPayload({
      provider,
      snapshotKey: snapshot.providerKey,
      payload: snapshot.payload,
      from,
      to,
      capturedAt,
    });
    const result = await ingestImladrisRawRecords({
      prisma: input.prisma,
      provider,
      context: input.context,
      records,
      mode: "company-readiness-backfill",
      windowStart: input.periodStart,
      windowEnd: input.periodEnd,
      checkpoint: {
        providerKey: snapshot.providerKey,
        source: "company-readiness-setup",
        from,
        to,
      },
      now: input.now,
    });

    results.push({
      providerKey: snapshot.providerKey,
      capturedAt: toIso(snapshot.capturedAt),
      rawRecordCount: result.recordCount,
      acceptedRawRecordCount: result.acceptedCount,
      status: result.status,
    });
  }

  return results;
}

async function createMissingBoardGoals(input: {
  prisma: PrismaClientType;
  context: UserContext;
  dashboard: CompanyTrackerDashboardData;
}): Promise<{
  created: CompanyReadinessGoalSetupResult[];
  unresolvedActions: string[];
}> {
  if (!input.context.userId) {
    return {
      created: [],
      unresolvedActions: input.dashboard.goalRecommendations.map(
        (recommendation) => boardReadinessGoalAction(recommendation.metric),
      ),
    };
  }

  const created: CompanyReadinessGoalSetupResult[] = [];
  const unresolvedActions: string[] = [];
  const existingGoals = (await input.prisma.financialGoal.findMany({
    where: {
      userId: input.context.userId,
      status: GoalStatus.ACTIVE,
      metric: {
        in: [...BOARD_READINESS_GOAL_METRICS],
      },
    },
    select: {
      metric: true,
    },
  })) as Array<{ metric: GoalMetric | string }>;
  const existingActiveGoalMetrics = new Set(existingGoals.map((goal) => goal.metric));

  for (const recommendation of input.dashboard.goalRecommendations) {
    const metric = toGoalMetric(recommendation.metric);
    if (!metric || !BOARD_READINESS_GOAL_METRIC_SET.has(metric)) {
      continue;
    }

    if (recommendation.targetValue === null) {
      unresolvedActions.push(boardReadinessGoalAction(recommendation.metric));
      continue;
    }

    if (existingActiveGoalMetrics.has(metric)) {
      continue;
    }

    const deadline = toDate(recommendation.deadline);
    if (!deadline) {
      unresolvedActions.push(boardReadinessGoalAction(recommendation.metric));
      continue;
    }

    const goal = await input.prisma.financialGoal.create({
      data: {
        userId: input.context.userId,
        metric,
        targetValue: recommendation.targetValue,
        deadline,
      },
    }) as { id: string; metric: GoalMetric; targetValue: number; deadline: Date | string };

    created.push({
      id: goal.id,
      metric: goal.metric,
      targetValue: goal.targetValue,
      deadline: toIso(goal.deadline) ?? deadline.toISOString(),
    });
    existingActiveGoalMetrics.add(metric);
  }

  return { created, unresolvedActions };
}

export async function runCompanyReadinessSetup(input: {
  prisma: PrismaClientType;
  context: UserContext;
  now?: Date;
}): Promise<CompanyReadinessSetupResult> {
  const now = input.now ?? new Date();
  const periodEnd = now;
  const periodStart = daysBefore(periodEnd, IMLADRIS_MATERIALIZATION_WINDOW_DAYS);
  const snapshots = await loadLatestCompanySnapshots({
    prisma: input.prisma,
    context: input.context,
    now,
  });
  const snapshotsUsed = await backfillSnapshots({
    prisma: input.prisma,
    context: input.context,
    snapshots,
    periodStart,
    periodEnd,
    now,
  });
  const metricsMaterialized = await materializeImladrisCanonicalMetrics({
    prisma: input.prisma,
    context: input.context,
    periodStart,
    periodEnd,
    now,
  });
  const dashboardAfterMaterialization = await buildCompanyTrackerDashboard({
    prisma: input.prisma,
    context: input.context,
    now,
  });
  const goals = await createMissingBoardGoals({
    prisma: input.prisma,
    context: input.context,
    dashboard: dashboardAfterMaterialization,
  });
  const dashboard = await buildCompanyTrackerDashboard({
    prisma: input.prisma,
    context: input.context,
    now,
  });

  return {
    setup: {
      snapshotsUsed,
      metricsMaterialized,
      goalsCreated: goals.created,
      unresolvedActions: goals.unresolvedActions,
      unresolvedBlockers: dashboard.boardReadiness.blockers,
    },
    dashboard,
  };
}

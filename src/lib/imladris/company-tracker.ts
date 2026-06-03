import {
  getImladrisDashboardDefinition,
  getImladrisMetricDefinition,
} from "@/lib/imladris/catalog";
import type { ImladrisDashboardDefinition } from "@/lib/imladris/catalog";
import { normalizeMetricConfidence, normalizeMetricStatus, normalizeMetricWarnings } from "@/lib/imladris/confidence";
import type { PrismaClientType } from "@/lib/prisma";

type MetricStatus = "ready" | "missing" | "partial" | "stale" | "error";
type GoalDirection = "higher" | "lower";
type GoalProgressStatus = "active" | "achieved" | "missed";
type HealthBandStatus = "strong" | "watch" | "risk" | "missing";

interface UserContext {
  userId: string | null;
  organizationId: string | null;
}

interface MetricLineageRow {
  sourceKey: string;
  sourceType: string;
  sourceId: string | null;
  rawRecordId: string | null;
  capturedAt: Date | string | null;
  metadata: unknown;
}

interface CanonicalMetricRow {
  id: string;
  metricKey: string;
  value: unknown;
  status: string;
  confidence: number;
  warnings: string[];
  calculationVersion: string;
  computedAt: Date | string;
  periodEnd: Date | string;
  userId?: string | null;
  organizationId?: string | null;
  lineage: MetricLineageRow[];
}

interface FinancialGoalRow {
  id: string;
  userId?: string;
  metric: string;
  targetValue: unknown;
  deadline: Date | string;
  status: string;
}

export interface CompanyTrackerMetric {
  key: string;
  label: string;
  value: unknown;
  status: MetricStatus;
  confidence: number;
  warnings: string[];
  calculationVersion: string | null;
  computedAt: string | null;
  periodEnd: string | null;
  sourceLineageCount: number;
}

export interface CompanyTrackerSummary {
  arr: number | null;
  mrr: number | null;
  runwayMonths: number | null;
  cashBalance: number | null;
  netBurn: number | null;
  qualifiedPipeline: number | null;
  activeSubscriptions: number | null;
  currency: string;
}

export interface CompanyGoalProgress {
  id: string;
  metric: string;
  targetValue: number;
  currentValue: number | null;
  direction: GoalDirection;
  progressPct: number;
  deadline: string;
  status: GoalProgressStatus;
  sourceMetricKey: string | null;
}

export interface CompanyHealthBand {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  status: HealthBandStatus;
  formula: string;
  detail: string;
  sourceMetricKeys: string[];
}

export interface CompanyTrackerTrustSummary {
  ready: number;
  missing: number;
  stale: number;
  error: number;
  warnings: number;
  partial?: number;
}

export interface CompanyTrackerTrust {
  summary: CompanyTrackerTrustSummary;
  warnings: string[];
}

export interface CompanyTrackerDashboardData {
  dashboard: ImladrisDashboardDefinition;
  summary: CompanyTrackerSummary;
  goalProgress: CompanyGoalProgress[];
  healthBands: CompanyHealthBand[];
  metrics: CompanyTrackerMetric[];
  trust: CompanyTrackerTrust;
}

export type CompanyTrackerGoalProgress = CompanyGoalProgress;
export type CompanyTrackerHealthBand = CompanyHealthBand;

export type CompanyTrackerPrisma = Pick<
  PrismaClientType,
  "imladrisCanonicalMetricValue" | "financialGoal"
>;

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const timestampMs = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const timestamp = Number(normalized);
      if (Number.isFinite(timestamp) && timestamp > 0) {
        const timestampMs = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
        const date = new Date(timestampMs);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIso(value: Date | string | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function normalizeTenantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeContext(context: UserContext): UserContext {
  return {
    userId: normalizeTenantId(context.userId),
    organizationId: normalizeTenantId(context.organizationId),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const withoutCurrency = value.trim().replace(/[$,\s]/g, "");
    const normalized = /^\(.+\)$/.test(withoutCurrency)
      ? `-${withoutCurrency.slice(1, -1)}`
      : withoutCurrency;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function currencyFrom(...values: Array<Record<string, unknown>>): string {
  for (const value of values) {
    const currency = value.currency;
    if (typeof currency !== "string") continue;
    const normalized = currency.trim();
    if (normalized) return normalized.toUpperCase();
  }
  return "USD";
}

function metricStatus(status: unknown): MetricStatus {
  return normalizeMetricStatus(status);
}

function usableMetricRow(row: CanonicalMetricRow | undefined): CanonicalMetricRow | null {
  if (!row) return null;
  const status = metricStatus(row.status);
  return status === "missing" || status === "error" ? null : row;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function metricTimestamp(row: CanonicalMetricRow): number {
  return (
    toDate(row.periodEnd)?.getTime() ??
    toDate(row.computedAt)?.getTime() ??
    0
  );
}

function scopeSpecificity(row: CanonicalMetricRow, context: UserContext): number {
  if (row.userId === undefined && row.organizationId === undefined) return 1;

  const rowUserId = row.userId ?? null;
  const rowOrganizationId = row.organizationId ?? null;

  if (context.organizationId) {
    if (rowUserId === context.userId && rowOrganizationId === context.organizationId) return 4;
    if (context.userId && rowUserId === context.userId && rowOrganizationId === null) return 3;
    if (rowUserId === null && rowOrganizationId === context.organizationId) return 2;
    if (rowUserId === null && rowOrganizationId === null) return 1;
    return 0;
  }

  if (context.userId) {
    if (rowUserId === context.userId && rowOrganizationId === null) return 3;
    if (rowUserId === null && rowOrganizationId === null) return 1;
    return 0;
  }

  return rowUserId === null && rowOrganizationId === null ? 1 : 0;
}

function rowComputedAt(row: CanonicalMetricRow): number {
  return toDate(row.computedAt)?.getTime() ?? 0;
}

function sameMetricScope(left: CanonicalMetricRow, right: CanonicalMetricRow): boolean {
  return (left.userId ?? null) === (right.userId ?? null) &&
    (left.organizationId ?? null) === (right.organizationId ?? null);
}

function latestRowsByMetric(
  rows: CanonicalMetricRow[],
  context: UserContext,
): Map<string, CanonicalMetricRow> {
  const sortedRows = [...rows].sort((left, right) => {
    const periodDelta = metricTimestamp(right) - metricTimestamp(left);
    if (periodDelta !== 0) return periodDelta;
    const scopeDelta = scopeSpecificity(right, context) - scopeSpecificity(left, context);
    if (scopeDelta !== 0) return scopeDelta;
    return rowComputedAt(right) - rowComputedAt(left);
  });
  const latest = new Map<string, CanonicalMetricRow>();
  for (const row of sortedRows) {
    if (!latest.has(row.metricKey)) latest.set(row.metricKey, row);
  }
  return latest;
}

function canonicalMetricAvailableAt(row: CanonicalMetricRow, now: Date): boolean {
  const periodEnd = toDate(row.periodEnd);
  const computedAt = toDate(row.computedAt);
  return (
    periodEnd !== null &&
    periodEnd.getTime() <= now.getTime() &&
    computedAt !== null &&
    computedAt.getTime() <= now.getTime()
  );
}

function rowMatchesContext(row: CanonicalMetricRow, context: UserContext): boolean {
  if (row.userId === undefined && row.organizationId === undefined) return true;

  const rowUserId = row.userId ?? null;
  const rowOrganizationId = row.organizationId ?? null;

  if (context.organizationId) {
    if (rowOrganizationId === context.organizationId) {
      return rowUserId === null || rowUserId === context.userId;
    }
    if (rowOrganizationId === null) {
      return rowUserId === null || Boolean(context.userId && rowUserId === context.userId);
    }
    return false;
  }

  if (context.userId) {
    return rowOrganizationId === null && (rowUserId === null || rowUserId === context.userId);
  }

  return rowUserId === null && rowOrganizationId === null;
}

function canonicalMetricScopeWhere(context: UserContext) {
  if (context.organizationId) {
    const scopedRows = context.userId ? [{ userId: context.userId, organizationId: context.organizationId }] : [];
    const legacyUserRows = context.userId ? [{ userId: context.userId, organizationId: null }] : [];
    return {
      OR: [
        ...scopedRows,
        { userId: null, organizationId: context.organizationId },
        ...legacyUserRows,
        { userId: null, organizationId: null },
      ],
    };
  }

  if (!context.userId) {
    return {
      OR: [{ userId: null, organizationId: null }],
    };
  }

  return {
    OR: [
      { userId: context.userId, organizationId: null },
      { userId: null, organizationId: null },
    ],
  };
}

function previousMetricRow(
  rows: CanonicalMetricRow[],
  metricKey: string,
  current: CanonicalMetricRow | null,
  context: UserContext,
): CanonicalMetricRow | null {
  const currentTime = current ? metricTimestamp(current) : Number.POSITIVE_INFINITY;
  return [...rows]
    .filter((row) => row.metricKey === metricKey && metricTimestamp(row) < currentTime)
    .filter((row) => usableMetricRow(row) !== null)
    .sort((left, right) => {
      if (current) {
        const scopeDelta =
          Number(sameMetricScope(right, current)) - Number(sameMetricScope(left, current));
        if (scopeDelta !== 0) return scopeDelta;
      }
      const periodDelta = metricTimestamp(right) - metricTimestamp(left);
      if (periodDelta !== 0) return periodDelta;
      const scopeDelta = scopeSpecificity(right, context) - scopeSpecificity(left, context);
      if (scopeDelta !== 0) return scopeDelta;
      return rowComputedAt(right) - rowComputedAt(left);
    })[0] ?? null;
}

function companyMetric(row: CanonicalMetricRow | null, key: string): CompanyTrackerMetric {
  const definition = getImladrisMetricDefinition(key);
  if (!row) {
    return {
      key,
      label: definition?.label ?? key,
      value: null,
      status: "missing",
      confidence: 0,
      warnings: ["Canonical company metric is missing."],
      calculationVersion: null,
      computedAt: null,
      periodEnd: null,
      sourceLineageCount: 0,
    };
  }
  return {
    key,
    label: definition?.label ?? key,
    value: row.value,
    status: metricStatus(row.status),
    confidence: normalizeMetricConfidence(row.confidence),
    warnings: normalizeMetricWarnings(row.warnings),
    calculationVersion: row.calculationVersion,
    computedAt: toIso(row.computedAt),
    periodEnd: toIso(row.periodEnd),
    sourceLineageCount: row.lineage?.length ?? 0,
  };
}

function buildSummary(metrics: Map<string, CanonicalMetricRow>): CompanyTrackerSummary {
  const mrr = asRecord(usableMetricRow(metrics.get("revenue.mrr"))?.value);
  const runway = asRecord(usableMetricRow(metrics.get("finance.cash_runway_months"))?.value);
  const netBurn = asRecord(usableMetricRow(metrics.get("finance.net_burn"))?.value);
  const pipeline = asRecord(usableMetricRow(metrics.get("sales.qualified_pipeline"))?.value);
  const mrrAmount = numberValue(mrr.amount);

  return {
    arr: numberValue(mrr.arr) ?? (mrrAmount === null ? null : mrrAmount * 12),
    mrr: mrrAmount,
    runwayMonths: numberValue(runway.months),
    cashBalance: numberValue(runway.cashBalance),
    netBurn: numberValue(netBurn.amount),
    qualifiedPipeline: numberValue(pipeline.amount),
    activeSubscriptions:
      numberValue(mrr.activeSubscriptions) ??
      numberValue(mrr.mergedActiveSubscriptions) ??
      numberValue(mrr.subscriptionCount),
    currency: currencyFrom(mrr, runway, netBurn, pipeline),
  };
}

function currentValueForGoal(
  metric: string,
  summary: CompanyTrackerSummary,
): { value: number | null; direction: GoalDirection; sourceMetricKey: string | null } {
  switch (metric) {
    case "ARR":
      return { value: summary.arr, direction: "higher", sourceMetricKey: "revenue.mrr" };
    case "MRR":
      return { value: summary.mrr, direction: "higher", sourceMetricKey: "revenue.mrr" };
    case "RUNWAY":
      return {
        value: summary.runwayMonths,
        direction: "higher",
        sourceMetricKey: "finance.cash_runway_months",
      };
    case "BURN_RATE":
      return {
        value: summary.netBurn,
        direction: "lower",
        sourceMetricKey: "finance.net_burn",
      };
    case "REVENUE":
      return {
        value: summary.mrr,
        direction: "higher",
        sourceMetricKey: "revenue.mrr",
      };
    case "CUSTOMER_COUNT":
      return {
        value: summary.activeSubscriptions,
        direction: "higher",
        sourceMetricKey: "revenue.mrr",
      };
    default:
      return { value: null, direction: "higher", sourceMetricKey: null };
  }
}

function goalStatus(input: {
  storedStatus: string;
  currentValue: number | null;
  targetValue: number | null;
  direction: GoalDirection;
  deadline: Date | null;
  now: Date;
}): GoalProgressStatus {
  if (input.storedStatus === "ACHIEVED") return "achieved";
  if (input.storedStatus === "MISSED") return "missed";
  const achieved =
    input.currentValue !== null &&
    input.targetValue !== null &&
    (input.direction === "higher"
      ? input.currentValue >= input.targetValue
      : input.currentValue <= input.targetValue);
  if (achieved) return "achieved";
  if (input.deadline && input.deadline.getTime() < input.now.getTime()) return "missed";
  return "active";
}

function goalProgress(goal: FinancialGoalRow, summary: CompanyTrackerSummary, now: Date): CompanyGoalProgress {
  const current = currentValueForGoal(goal.metric, summary);
  const targetValue = numberValue(goal.targetValue);
  const progressPct =
    current.value === null || targetValue === null
      ? 0
      : targetValue <= 0
        ? current.direction === "lower" && current.value <= targetValue
          ? 100
          : 0
      : current.direction === "higher"
        ? round(Math.min(Math.max((current.value / targetValue) * 100, 0), 100))
        : current.value <= targetValue
          ? 100
          : round(Math.min(Math.max((targetValue / current.value) * 100, 0), 100));
  const deadline = toDate(goal.deadline);

  return {
    id: goal.id,
    metric: goal.metric,
    targetValue: targetValue ?? 0,
    currentValue: current.value,
    direction: current.direction,
    progressPct,
    deadline: toIso(goal.deadline) ?? "",
    status: goalStatus({
      storedStatus: goal.status,
      currentValue: current.value,
      targetValue,
      direction: current.direction,
      deadline,
      now,
    }),
    sourceMetricKey: current.sourceMetricKey,
  };
}

function activeGoalsForContext(goals: FinancialGoalRow[], context: UserContext): FinancialGoalRow[] {
  return goals.filter((goal) => {
    const status = typeof goal.status === "string" ? goal.status.trim().toUpperCase() : "";
    const userMatches = !goal.userId || goal.userId === context.userId;
    const hasValidDeadline = toDate(goal.deadline) !== null;
    return status === "ACTIVE" && userMatches && hasValidDeadline;
  });
}

function statusForRunway(value: number | null): HealthBandStatus {
  if (value === null) return "missing";
  if (value >= 12) return "strong";
  if (value >= 6) return "watch";
  return "risk";
}

function buildHealthBands(input: {
  summary: CompanyTrackerSummary;
  currentMrr: CanonicalMetricRow | null;
  previousMrr: CanonicalMetricRow | null;
  goalProgress: CompanyGoalProgress[];
}): CompanyHealthBand[] {
  const currentArr = input.summary.arr;
  const previousArr = numberValue(asRecord(input.previousMrr?.value).arr);
  const netNewArr =
    currentArr !== null && previousArr !== null ? Math.max(0, currentArr - previousArr) : null;
  const burnMultiple =
    input.summary.netBurn !== null && netNewArr && netNewArr > 0
      ? round(input.summary.netBurn / netNewArr)
      : null;
  const pipelineCoverage =
    input.summary.qualifiedPipeline !== null && currentArr && currentArr > 0
      ? round(input.summary.qualifiedPipeline / currentArr, 1)
      : null;
  const arrGoal = input.goalProgress.find((goal) => goal.metric === "ARR");

  return [
    {
      id: "runway",
      label: "Runway",
      value: input.summary.runwayMonths,
      unit: "months",
      status: statusForRunway(input.summary.runwayMonths),
      formula: "finance.cash_runway_months.value.months",
      detail: "6-12 months is watch; 12+ months is strong.",
      sourceMetricKeys: ["finance.cash_runway_months"],
    },
    {
      id: "burn_multiple",
      label: "Burn Multiple",
      value: burnMultiple,
      unit: "ratio",
      status:
        burnMultiple === null
          ? "missing"
          : burnMultiple <= 1
            ? "strong"
            : burnMultiple <= 2
              ? "watch"
              : "risk",
      formula: "finance.net_burn.value.amount / net new ARR",
      detail: "Lower is better; <=1 is strong and <=2 is watch.",
      sourceMetricKeys: ["finance.net_burn", "revenue.mrr"],
    },
    {
      id: "arr_goal_pacing",
      label: "ARR Goal Pacing",
      value: arrGoal?.progressPct ?? null,
      unit: "percent",
      status:
        !arrGoal || arrGoal.currentValue === null
          ? "missing"
          : arrGoal.status === "achieved" || arrGoal.progressPct >= 90
            ? "strong"
            : arrGoal.status === "missed" || arrGoal.progressPct < 50
              ? "risk"
              : "watch",
      formula: "revenue.mrr.value.arr / active ARR goal target",
      detail: "Uses FinancialGoal targets and Imladris canonical ARR.",
      sourceMetricKeys: ["revenue.mrr"],
    },
    {
      id: "pipeline_coverage",
      label: "Pipeline Coverage",
      value: pipelineCoverage,
      unit: "ratio",
      status:
        pipelineCoverage === null
          ? "missing"
          : pipelineCoverage >= 3
            ? "strong"
            : pipelineCoverage >= 1
              ? "watch"
              : "risk",
      formula: "sales.qualified_pipeline.value.amount / revenue.mrr.value.arr",
      detail: "3x+ ARR coverage is strong; below 1x is risk.",
      sourceMetricKeys: ["sales.qualified_pipeline", "revenue.mrr"],
    },
  ];
}

function buildTrust(metrics: CompanyTrackerMetric[]): CompanyTrackerTrust {
  const summary = {
    ready: 0,
    missing: 0,
    partial: 0,
    stale: 0,
    error: 0,
    warnings: 0,
  };
  const warningSet = new Set<string>();
  for (const metric of metrics) {
    summary[metric.status] += 1;
    summary.warnings += metric.warnings.length;
    for (const warning of metric.warnings) warningSet.add(warning);
  }
  return {
    summary,
    warnings: [...warningSet],
  };
}

export async function buildCompanyTrackerDashboard(input: {
  prisma: CompanyTrackerPrisma;
  context: UserContext;
  now?: Date;
}): Promise<CompanyTrackerDashboardData> {
  const now = input.now ?? new Date();
  const context = normalizeContext(input.context);
  const dashboard = getImladrisDashboardDefinition("company");
  if (!dashboard) {
    throw new Error("Company tracker dashboard is not defined.");
  }

  const goalsQuery = context.userId
    ? input.prisma.financialGoal.findMany({
        where: {
          userId: context.userId,
          status: "ACTIVE",
        },
        orderBy: [{ deadline: "asc" }],
      })
    : Promise.resolve([]);
  const [canonicalRows, goals] = await Promise.all([
    input.prisma.imladrisCanonicalMetricValue.findMany({
      where: {
        metricKey: { in: dashboard.metricKeys },
        periodEnd: { lte: now },
        computedAt: { lte: now },
        ...canonicalMetricScopeWhere(context),
      },
      include: {
        lineage: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
      orderBy: [{ periodEnd: "desc" }, { computedAt: "desc" }],
    }),
    goalsQuery,
  ]);

  const typedCanonicalRows = (canonicalRows as CanonicalMetricRow[]).filter((row) => {
    return (
      canonicalMetricAvailableAt(row, now) &&
      rowMatchesContext(row, context)
    );
  });
  const typedGoals = activeGoalsForContext(goals as FinancialGoalRow[], context);
  const latestMetrics = latestRowsByMetric(typedCanonicalRows, context);
  const metrics = dashboard.metricKeys.map((metricKey) =>
    companyMetric(latestMetrics.get(metricKey) ?? null, metricKey),
  );
  const summary = buildSummary(latestMetrics);
  const currentMrr = latestMetrics.get("revenue.mrr") ?? null;
  const previousMrr = previousMetricRow(typedCanonicalRows, "revenue.mrr", currentMrr, context);
  const goalProgressRows = typedGoals.map((goal) => goalProgress(goal, summary, now));

  return {
    dashboard,
    summary,
    goalProgress: goalProgressRows,
    healthBands: buildHealthBands({
      summary,
      currentMrr,
      previousMrr,
      goalProgress: goalProgressRows,
    }),
    metrics,
    trust: buildTrust(metrics),
  };
}

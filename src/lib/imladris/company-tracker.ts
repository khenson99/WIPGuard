import {
  getImladrisDashboardDefinition,
  getImladrisMetricDefinition,
} from "@/lib/imladris/catalog";
import type { ImladrisDashboardDefinition } from "@/lib/imladris/catalog";
import type { PrismaClientType } from "@/lib/prisma";

type MetricStatus = "ready" | "missing" | "partial" | "stale" | "error";
type GoalDirection = "higher" | "lower";
type GoalProgressStatus = "active" | "achieved" | "missed";
type HealthBandStatus = "strong" | "watch" | "risk" | "missing";

interface UserContext {
  userId: string;
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
  targetValue: number;
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

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value: Date | string | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metricStatus(status: string | null | undefined): MetricStatus {
  switch (status) {
    case "READY":
    case "ready":
      return "ready";
    case "PARTIAL":
    case "partial":
      return "partial";
    case "STALE":
    case "stale":
      return "stale";
    case "ERROR":
    case "error":
      return "error";
    default:
      return "missing";
  }
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

function latestRowsByMetric(rows: CanonicalMetricRow[]): Map<string, CanonicalMetricRow> {
  const sortedRows = [...rows].sort((left, right) => {
    const periodDelta = metricTimestamp(right) - metricTimestamp(left);
    if (periodDelta !== 0) return periodDelta;
    return (toDate(right.computedAt)?.getTime() ?? 0) - (toDate(left.computedAt)?.getTime() ?? 0);
  });
  const latest = new Map<string, CanonicalMetricRow>();
  for (const row of sortedRows) {
    if (!latest.has(row.metricKey)) latest.set(row.metricKey, row);
  }
  return latest;
}

function rowMatchesContext(row: CanonicalMetricRow, context: UserContext): boolean {
  const userMatches = row.userId === undefined || row.userId === null || row.userId === context.userId;
  const organizationMatches =
    row.organizationId === undefined ||
    row.organizationId === context.organizationId;
  return userMatches && organizationMatches;
}

function canonicalMetricScopeWhere(context: UserContext) {
  if (context.organizationId) {
    return {
      OR: [
        { userId: context.userId, organizationId: context.organizationId },
        { userId: null, organizationId: context.organizationId },
      ],
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
): CanonicalMetricRow | null {
  const currentTime = current ? metricTimestamp(current) : Number.POSITIVE_INFINITY;
  return [...rows]
    .filter((row) => row.metricKey === metricKey && metricTimestamp(row) < currentTime)
    .sort((left, right) => metricTimestamp(right) - metricTimestamp(left))[0] ?? null;
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
    confidence: row.confidence,
    warnings: row.warnings ?? [],
    calculationVersion: row.calculationVersion,
    computedAt: toIso(row.computedAt),
    periodEnd: toIso(row.periodEnd),
    sourceLineageCount: row.lineage?.length ?? 0,
  };
}

function buildSummary(metrics: Map<string, CanonicalMetricRow>): CompanyTrackerSummary {
  const mrr = asRecord(metrics.get("revenue.mrr")?.value);
  const runway = asRecord(metrics.get("finance.cash_runway_months")?.value);
  const netBurn = asRecord(metrics.get("finance.net_burn")?.value);
  const pipeline = asRecord(metrics.get("sales.qualified_pipeline")?.value);
  const currency =
    typeof mrr.currency === "string"
      ? mrr.currency
      : typeof runway.currency === "string"
        ? runway.currency
        : typeof netBurn.currency === "string"
          ? netBurn.currency
          : typeof pipeline.currency === "string"
            ? pipeline.currency
            : "USD";
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
    currency: currency.toUpperCase(),
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
  targetValue: number;
  direction: GoalDirection;
  deadline: Date | null;
  now: Date;
}): GoalProgressStatus {
  if (input.storedStatus === "ACHIEVED") return "achieved";
  if (input.storedStatus === "MISSED") return "missed";
  const achieved =
    input.currentValue !== null &&
    (input.direction === "higher"
      ? input.currentValue >= input.targetValue
      : input.currentValue <= input.targetValue);
  if (achieved) return "achieved";
  if (input.deadline && input.deadline.getTime() < input.now.getTime()) return "missed";
  return "active";
}

function goalProgress(goal: FinancialGoalRow, summary: CompanyTrackerSummary, now: Date): CompanyGoalProgress {
  const current = currentValueForGoal(goal.metric, summary);
  const progressPct =
    current.value === null || goal.targetValue <= 0
      ? 0
      : current.direction === "higher"
        ? round(Math.min(Math.max((current.value / goal.targetValue) * 100, 0), 100))
        : current.value <= goal.targetValue
          ? 100
          : round(Math.min(Math.max((goal.targetValue / current.value) * 100, 0), 100));
  const deadline = toDate(goal.deadline);

  return {
    id: goal.id,
    metric: goal.metric,
    targetValue: goal.targetValue,
    currentValue: current.value,
    direction: current.direction,
    progressPct,
    deadline: toIso(goal.deadline) ?? "",
    status: goalStatus({
      storedStatus: goal.status,
      currentValue: current.value,
      targetValue: goal.targetValue,
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
    return status === "ACTIVE" && userMatches;
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
  const dashboard = getImladrisDashboardDefinition("company");
  if (!dashboard) {
    throw new Error("Company tracker dashboard is not defined.");
  }

  const [canonicalRows, goals] = await Promise.all([
    input.prisma.imladrisCanonicalMetricValue.findMany({
      where: {
        metricKey: { in: dashboard.metricKeys },
        periodEnd: { lte: now },
        ...canonicalMetricScopeWhere(input.context),
      },
      include: {
        lineage: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
      orderBy: [{ periodEnd: "desc" }, { computedAt: "desc" }],
    }),
    input.prisma.financialGoal.findMany({
      where: {
        userId: input.context.userId,
        status: "ACTIVE",
      },
      orderBy: [{ deadline: "asc" }],
    }),
  ]);

  const typedCanonicalRows = (canonicalRows as CanonicalMetricRow[]).filter((row) => {
    const periodEnd = toDate(row.periodEnd);
    return (
      periodEnd !== null &&
      periodEnd.getTime() <= now.getTime() &&
      rowMatchesContext(row, input.context)
    );
  });
  const typedGoals = activeGoalsForContext(goals as FinancialGoalRow[], input.context);
  const latestMetrics = latestRowsByMetric(typedCanonicalRows);
  const metrics = dashboard.metricKeys.map((metricKey) =>
    companyMetric(latestMetrics.get(metricKey) ?? null, metricKey),
  );
  const summary = buildSummary(latestMetrics);
  const currentMrr = latestMetrics.get("revenue.mrr") ?? null;
  const previousMrr = previousMetricRow(typedCanonicalRows, "revenue.mrr", currentMrr);
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

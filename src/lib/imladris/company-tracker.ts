import {
  REQUIRED_IMLADRIS_PROVIDERS,
  getImladrisDashboardDefinition,
  getImladrisMetricDefinition,
} from "@/lib/imladris/catalog";
import { buildAnalyticsMetricsLayer } from "@/lib/analytics/kpis";
import { buildRevenueDashboardData } from "@/lib/analytics/revenue-dashboard";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import type { ImladrisDashboardDefinition } from "@/lib/imladris/catalog";
import { normalizeMetricConfidence, normalizeMetricStatus, normalizeMetricWarnings } from "@/lib/imladris/confidence";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";
import type {
  AnalyticsDashboardData,
  AnalyticsMetricsLayer,
  HubSpotData,
  MercuryData,
  RevenueDashboardData,
  SalesPerformancePack,
  StripeData,
} from "@/lib/analytics/types";
import type { PrismaClientType } from "@/lib/prisma";

type MetricStatus = "ready" | "missing" | "partial" | "stale" | "error";
type GoalDirection = "higher" | "lower";
type GoalProgressStatus = "active" | "achieved" | "missed";
type HealthBandStatus = "strong" | "watch" | "risk" | "missing";
type SourceCoverageStatus = "available" | "missing" | "stale" | "error";
type BoardReadinessStatus = "ready" | "watch" | "blocked";

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
  periodStart: Date | string;
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

interface AnalyticsSnapshotRow {
  providerKey: string;
  payload: unknown;
  status: string;
  capturedAt: Date | string;
  expiresAt: Date | string;
  lastError: string | null;
}

interface CompanyAnalyticsStats {
  metricsLayer: AnalyticsMetricsLayer;
  revenueDashboard: RevenueDashboardData;
  snapshotCount: number;
  latestCapturedAt: string | null;
  availableProviders: Set<string>;
  staleProviders: Set<string>;
  errorProviders: Map<string, string>;
  warnings: string[];
}

export interface CompanyTrackerMetric {
  key: string;
  label: string;
  value: unknown;
  status: MetricStatus;
  confidence: number;
  warnings: string[];
  caveats?: string[];
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

export interface CompanyGoalRecommendation {
  metric: string;
  targetValue: number | null;
  currentValue: number | null;
  direction: GoalDirection;
  deadline: string;
  sourceMetricKey: string | null;
  formula: string;
  rationale: string;
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

export interface CompanySourceCoverage {
  key: string;
  label: string;
  status: SourceCoverageStatus;
  lastCapturedAt: string | null;
  detail: string;
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
  caveats: string[];
}

export interface CompanyBoardReadiness {
  status: BoardReadinessStatus;
  score: number;
  blockers: string[];
  caveats: string[];
  requiredActions: string[];
  requiredActionCount: number;
}

export interface CompanyTrackerDashboardData {
  dashboard: ImladrisDashboardDefinition;
  summary: CompanyTrackerSummary;
  goalProgress: CompanyGoalProgress[];
  goalRecommendations: CompanyGoalRecommendation[];
  healthBands: CompanyHealthBand[];
  sourceCoverage: CompanySourceCoverage[];
  boardReadiness: CompanyBoardReadiness;
  metrics: CompanyTrackerMetric[];
  trust: CompanyTrackerTrust;
}

export type CompanyTrackerGoalProgress = CompanyGoalProgress;
export type CompanyTrackerHealthBand = CompanyHealthBand;

export type CompanyTrackerPrisma = Pick<
  PrismaClientType,
  "imladrisCanonicalMetricValue" | "financialGoal" | "analyticsSnapshot"
>;

const ANALYTICS_SNAPSHOT_PROVIDER_KEYS = [
  "stripe",
  "mercury",
  "hubspot",
  "salesPerformance",
  "googleWorkspace",
  "slack",
  "googleAnalytics",
  "googleSearchConsole",
  "searchConsole",
  "googleAds",
  "metaAds",
  "metaPage",
  "instagram",
  "redditAds",
  "redditOps",
  "semrush",
  "coda",
  "codaOps",
  "webflow",
  "unify",
  "visitorFunnel",
  "posthog",
  "pylon",
  "product",
] as const;

const SOURCE_SNAPSHOT_KEYS = new Map<string, string[]>(
  REQUIRED_IMLADRIS_PROVIDERS.map((provider) => [
    provider.key,
    provider.snapshotKeys,
  ]),
);

const BOARD_TARGET_METRICS = ["ARR", "RUNWAY", "BURN_RATE"] as const;

function toDate(value: unknown): Date | null {
  const normalizedValue = scalarValue(value) ?? value;
  if (normalizedValue === null || normalizedValue === undefined) return null;
  if (normalizedValue instanceof Date) {
    return Number.isNaN(normalizedValue.getTime()) ? null : normalizedValue;
  }
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue) && normalizedValue > 0) {
    const timestampMs = normalizedValue < 10_000_000_000 ? normalizedValue * 1000 : normalizedValue;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof normalizedValue === "string") {
    const normalized = normalizedValue.trim();
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

function directMetricFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !["properties", "values", "fields", "attributes", "data"].includes(key)),
  );
}

function directDataMetricFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !["id", "type", "properties", "values", "fields", "attributes", "data"].includes(key),
    ),
  );
}

function wrapperSources(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = asRecord(payload.data);
  return [
    directMetricFields(payload),
    asRecord(payload.properties),
    asRecord(payload.values),
    asRecord(payload.fields),
    asRecord(payload.attributes),
    directDataMetricFields(data),
    asRecord(data.properties),
    asRecord(data.values),
    asRecord(data.fields),
    asRecord(data.attributes),
  ].filter((source) => Object.keys(source).length > 0);
}

function mergedMetricValue(value: unknown): Record<string, unknown> {
  const sources = wrapperSources(asRecord(value));
  return Object.assign({}, ...sources.reverse());
}

function unwrapSingleMetricValueField(value: Record<string, unknown>): unknown {
  const entries = Object.entries(value);
  if (entries.length !== 1) return value;

  const [key, nestedValue] = entries[0];
  if (!["value", "metricValue", "metric_value"].includes(key)) return value;

  return nestedValue;
}

function flattenedMetricValue(value: unknown): unknown {
  const merged = mergedMetricValue(value);
  if (Object.keys(merged).length === 0) return value ?? null;
  return unwrapSingleMetricValueField(merged);
}

function metricValueView(value: unknown): Record<string, unknown> {
  return asRecord(flattenedMetricValue(value));
}

function displayMetricValue(value: unknown): unknown {
  return flattenedMetricValue(value);
}

function scalarValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.length === 1 ? scalarValue(value[0], seen) : null;
    seen.delete(value);
    return normalized;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.value,
    record.metricValue,
    record.metric_value,
    record.number,
    record.amount,
    record.count,
    record.name,
    record.label,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];
  for (const candidate of candidates) {
    const normalized = scalarValue(candidate, seen);
    if (
      typeof normalized === "string" ||
      typeof normalized === "number" ||
      typeof normalized === "boolean"
    ) {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function numberValue(value: unknown): number | null {
  return parseImladrisNumber(scalarValue(value) ?? value);
}

function countValue(value: unknown): number | null {
  const valueAsNumber = numberValue(value);
  return valueAsNumber === null ? null : Math.floor(Math.max(0, valueAsNumber));
}

function currencyFrom(...values: Array<Record<string, unknown>>): string {
  for (const value of values) {
    const currency = scalarValue(value.currency);
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

function roundTo(value: number, increment: number): number {
  if (!Number.isFinite(value) || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

function nextRoundRevenueTarget(value: number | null): number | null {
  if (value === null || value <= 0) return null;
  const growthTarget = value * 1.25;
  if (growthTarget < 100_000) return Math.ceil(growthTarget / 25_000) * 25_000;
  if (growthTarget < 1_000_000) return Math.ceil(growthTarget / 100_000) * 100_000;
  return Math.ceil(growthTarget / 500_000) * 500_000;
}

function addYears(value: Date, years: number): Date {
  const date = new Date(value);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date;
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
    const scopeDelta = scopeSpecificity(right, context) - scopeSpecificity(left, context);
    if (scopeDelta !== 0) return scopeDelta;
    const periodDelta = metricTimestamp(right) - metricTimestamp(left);
    if (periodDelta !== 0) return periodDelta;
    return rowComputedAt(right) - rowComputedAt(left);
  });
  const latest = new Map<string, CanonicalMetricRow>();
  for (const row of sortedRows) {
    if (!latest.has(row.metricKey)) latest.set(row.metricKey, row);
  }
  return latest;
}

function snapshotKeysForSource(sourceKey: string): string[] {
  return SOURCE_SNAPSHOT_KEYS.get(sourceKey) ?? [sourceKey];
}

function latestSnapshotsByProvider(rows: AnalyticsSnapshotRow[]): Map<string, AnalyticsSnapshotRow> {
  const latest = new Map<string, AnalyticsSnapshotRow>();
  for (const row of rows) {
    const existing = latest.get(row.providerKey);
    if (!existing || (toDate(row.capturedAt)?.getTime() ?? 0) > (toDate(existing.capturedAt)?.getTime() ?? 0)) {
      latest.set(row.providerKey, row);
    }
  }
  return latest;
}

function analyticsDataFromSnapshots(
  snapshots: Map<string, AnalyticsSnapshotRow>,
  now: Date,
): AnalyticsDashboardData {
  return {
    stripe: (snapshots.get("stripe")?.payload as StripeData | undefined) ?? null,
    mercury: (snapshots.get("mercury")?.payload as MercuryData | undefined) ?? null,
    hubspot: (snapshots.get("hubspot")?.payload as HubSpotData | undefined) ?? null,
    salesPerformance:
      (snapshots.get("salesPerformance")?.payload as SalesPerformancePack | undefined) ?? null,
    freshness: Object.fromEntries(
      [...snapshots.entries()].map(([providerKey, snapshot]) => [
        providerKey,
        {
          provider: providerKey,
          source: "snapshot",
          status: "CONNECTED",
          connectedAt: null,
          lastSyncedAt: toIso(snapshot.capturedAt),
          lastError: snapshot.lastError,
          stale:
            (toDate(snapshot.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY) <
            now.getTime(),
          lastSnapshotAt: toIso(snapshot.capturedAt),
        },
      ]),
    ),
  } as unknown as AnalyticsDashboardData;
}

async function buildCompanyAnalyticsStats(input: {
  prisma: CompanyTrackerPrisma;
  context: UserContext;
  now: Date;
}): Promise<CompanyAnalyticsStats | null> {
  if (!input.context.userId) return null;

  const snapshotRows = (await input.prisma.analyticsSnapshot.findMany({
    where: {
      userId: resolveIntegrationOwnerUserId(input.context.userId),
      providerKey: {
        in: [...ANALYTICS_SNAPSHOT_PROVIDER_KEYS],
      },
      status: "SUCCESS",
    },
    select: {
      providerKey: true,
      payload: true,
      status: true,
      capturedAt: true,
      expiresAt: true,
      lastError: true,
    },
    orderBy: [{ capturedAt: "desc" }],
  })) as AnalyticsSnapshotRow[];
  const snapshots = latestSnapshotsByProvider(snapshotRows);
  if (snapshots.size === 0) return null;

  const analyticsData = analyticsDataFromSnapshots(snapshots, input.now);
  const latestCapturedAt =
    [...snapshots.values()]
      .map((snapshot) => toDate(snapshot.capturedAt))
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString() ?? null;
  const staleProviders = new Set(
    [...snapshots.values()]
      .filter(
        (snapshot) =>
          (toDate(snapshot.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY) <
          input.now.getTime(),
      )
      .map((snapshot) => snapshot.providerKey),
  );
  const errorProviders = new Map(
    [...snapshots.values()]
      .filter((snapshot) => snapshot.lastError)
      .map((snapshot) => [snapshot.providerKey, snapshot.lastError ?? "Snapshot reported an error."]),
  );

  return {
    metricsLayer: buildAnalyticsMetricsLayer(analyticsData),
    revenueDashboard: buildRevenueDashboardData(analyticsData),
    snapshotCount: snapshots.size,
    latestCapturedAt,
    availableProviders: new Set(snapshots.keys()),
    staleProviders,
    errorProviders,
    warnings: [...snapshots.values()]
      .filter((snapshot) => snapshot.lastError)
      .map((snapshot) => `${snapshot.providerKey}: ${snapshot.lastError}`),
  };
}

function hasAnalyticsProvider(
  analyticsStats: CompanyAnalyticsStats | null,
  ...providerKeys: string[]
): boolean {
  return providerKeys.some((providerKey) =>
    analyticsStats?.availableProviders.has(providerKey),
  );
}

function canonicalMetricAvailableAt(row: CanonicalMetricRow, now: Date): boolean {
  const periodStart = toDate(row.periodStart);
  const periodEnd = toDate(row.periodEnd);
  const computedAt = toDate(row.computedAt);
  return (
    periodStart !== null &&
    periodEnd !== null &&
    periodStart.getTime() <= periodEnd.getTime() &&
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

function analyticsFallbackForMetric(
  key: string,
  analyticsStats: CompanyAnalyticsStats | null,
): unknown {
  if (!analyticsStats) return null;
  const finance = analyticsStats.metricsLayer.finance.summary;
  const revenue = analyticsStats.revenueDashboard.summary;
  const pipeline = analyticsStats.revenueDashboard.pipeline;

  switch (key) {
    case "revenue.mrr":
      if (!hasAnalyticsProvider(analyticsStats, "stripe", "hubspot")) return null;
      return {
        amount: finance.mrr,
        arr: finance.mrr * 12,
        activeSubscriptions: finance.activeSubscriptions,
        stripeActiveSubscriptions: finance.stripeActiveSubscriptions,
        hubspotActiveSubscriptions: finance.hubspotActiveSubscriptions,
        currency: "USD",
        source: "analytics.metrics_layer",
      };
    case "finance.cash_runway_months":
      if (!hasAnalyticsProvider(analyticsStats, "mercury")) return null;
      return {
        months: finance.runwayMonths,
        cashBalance: finance.cashBalance || revenue.cashBalance,
        bankCash: finance.bankCash,
        treasuryCash: finance.treasuryCash,
        currency: "USD",
        source: "analytics.metrics_layer",
      };
    case "finance.net_burn":
      if (!hasAnalyticsProvider(analyticsStats, "mercury")) return null;
      return {
        amount: finance.burnRate,
        netCashFlow: finance.netCashFlow30d,
        cashInflow: finance.inflows30d,
        cashOutflow: finance.outflows30d,
        currency: "USD",
        source: "analytics.metrics_layer",
      };
    case "sales.qualified_pipeline":
      if (!hasAnalyticsProvider(analyticsStats, "hubspot")) return null;
      return {
        amount: pipeline.qualifiedPipelineValue,
        qualifiedDealCount: pipeline.qualifiedPipelineCount,
        openPipelineValue: pipeline.openPipelineValue,
        openPipelineCount: pipeline.openPipelineCount,
        source: "analytics.revenue_dashboard",
      };
    default:
      return null;
  }
}

function companyMetric(
  row: CanonicalMetricRow | null,
  key: string,
  analyticsStats: CompanyAnalyticsStats | null,
): CompanyTrackerMetric {
  const definition = getImladrisMetricDefinition(key);
  if (!row) {
    const fallbackValue = analyticsFallbackForMetric(key, analyticsStats);
    if (fallbackValue !== null) {
      return {
        key,
        label: definition?.label ?? key,
        value: fallbackValue,
        status: "partial",
        confidence: 0.72,
        warnings: [],
        caveats: [`Canonical ${key} is missing; using latest analytics snapshot stats.`],
        calculationVersion: "analytics-snapshot-company-fallback-v1",
        computedAt: analyticsStats?.latestCapturedAt ?? null,
        periodEnd: analyticsStats?.latestCapturedAt ?? null,
        sourceLineageCount: analyticsStats?.snapshotCount ?? 0,
      };
    }

    return {
      key,
      label: definition?.label ?? key,
      value: null,
      status: "missing",
      confidence: 0,
      warnings: ["Canonical company metric is missing."],
      caveats: [],
      calculationVersion: null,
      computedAt: null,
      periodEnd: null,
      sourceLineageCount: 0,
    };
  }
  return {
    key,
    label: definition?.label ?? key,
    value: displayMetricValue(row.value),
    status: metricStatus(row.status),
    confidence: normalizeMetricConfidence(row.confidence),
    warnings: normalizeMetricWarnings(row.warnings),
    caveats: [],
    calculationVersion: row.calculationVersion,
    computedAt: toIso(row.computedAt),
    periodEnd: toIso(row.periodEnd),
    sourceLineageCount: row.lineage?.length ?? 0,
  };
}

function buildSummary(
  metrics: Map<string, CanonicalMetricRow>,
  analyticsStats: CompanyAnalyticsStats | null,
): CompanyTrackerSummary {
  const mrr = metricValueView(usableMetricRow(metrics.get("revenue.mrr"))?.value);
  const runway = metricValueView(usableMetricRow(metrics.get("finance.cash_runway_months"))?.value);
  const netBurn = metricValueView(usableMetricRow(metrics.get("finance.net_burn"))?.value);
  const pipeline = metricValueView(usableMetricRow(metrics.get("sales.qualified_pipeline"))?.value);
  const financeSummary = analyticsStats?.metricsLayer.finance.summary ?? null;
  const revenueSummary = analyticsStats?.revenueDashboard.summary ?? null;
  const revenuePipeline = analyticsStats?.revenueDashboard.pipeline ?? null;
  const hasRevenueFallback = hasAnalyticsProvider(analyticsStats, "stripe", "hubspot");
  const hasFinanceFallback = hasAnalyticsProvider(analyticsStats, "mercury");
  const hasPipelineFallback = hasAnalyticsProvider(analyticsStats, "hubspot");
  const mrrAmount = numberValue(mrr.amount);
  const fallbackMrr = hasRevenueFallback
    ? financeSummary?.mrr ?? revenueSummary?.mrr ?? null
    : null;
  const fallbackArr = hasRevenueFallback
    ? revenueSummary?.arr ?? (fallbackMrr === null ? null : fallbackMrr * 12)
    : null;
  const numberFromFields = (record: Record<string, unknown>, ...fields: string[]): number | null => {
    for (const field of fields) {
      const value = numberValue(record[field]);
      if (value !== null) return value;
    }
    return null;
  };

  return {
    arr:
      numberValue(mrr.arr) ??
      (mrrAmount === null ? null : mrrAmount * 12) ??
      fallbackArr,
    mrr: mrrAmount ?? fallbackMrr,
    runwayMonths:
      numberValue(runway.months) ??
      (hasFinanceFallback
        ? financeSummary?.runwayMonths ?? revenueSummary?.runwayMonths ?? null
        : null),
    cashBalance:
      numberFromFields(runway, "cashBalance", "cash_balance") ??
      (hasFinanceFallback
        ? financeSummary?.cashBalance ?? revenueSummary?.cashBalance ?? null
        : null),
    netBurn:
      numberFromFields(netBurn, "amount", "netBurn", "net_burn") ??
      numberFromFields(runway, "netBurn", "net_burn") ??
      (hasFinanceFallback
        ? financeSummary?.burnRate ?? revenueSummary?.burnRate ?? null
        : null),
    qualifiedPipeline:
      numberValue(pipeline.amount) ??
      (hasPipelineFallback ? revenuePipeline?.qualifiedPipelineValue ?? null : null),
    activeSubscriptions:
      countValue(mrr.activeSubscriptions) ??
      countValue(mrr.active_subscriptions) ??
      countValue(mrr.mergedActiveSubscriptions) ??
      countValue(mrr.merged_active_subscriptions) ??
      countValue(mrr.subscriptionCount) ??
      countValue(mrr.subscription_count) ??
      (hasRevenueFallback
        ? financeSummary?.activeSubscriptions ??
          revenueSummary?.activeSubscriptions ??
          null
        : null),
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

function goalRecommendation(
  metric: (typeof BOARD_TARGET_METRICS)[number],
  summary: CompanyTrackerSummary,
  now: Date,
): CompanyGoalRecommendation | null {
  const current = currentValueForGoal(metric, summary);
  const deadline = toIso(addYears(now, 1)) ?? "";

  switch (metric) {
    case "ARR": {
      const targetValue = nextRoundRevenueTarget(summary.arr);
      return {
        metric,
        targetValue,
        currentValue: current.value,
        direction: current.direction,
        deadline,
        sourceMetricKey: current.sourceMetricKey,
        formula: "next board-scale ARR milestone above current ARR",
        rationale: "Board decks need an explicit ARR milestone even before FinancialGoal rows are configured.",
      };
    }
    case "RUNWAY":
      return {
        metric,
        targetValue: 18,
        currentValue: current.value,
        direction: current.direction,
        deadline,
        sourceMetricKey: current.sourceMetricKey,
        formula: "target 18 months of runway",
        rationale: "18 months is a common operating target for fundraise and burn planning conversations.",
      };
    case "BURN_RATE": {
      const runwayBurnTarget =
        summary.cashBalance !== null && summary.cashBalance > 0
          ? summary.cashBalance / 18
          : null;
      const improvementTarget =
        summary.netBurn !== null && summary.netBurn > 0
          ? summary.netBurn * 0.85
          : summary.netBurn;
      const rawTarget =
        runwayBurnTarget !== null && improvementTarget !== null
          ? Math.min(runwayBurnTarget, improvementTarget)
          : runwayBurnTarget ?? improvementTarget;
      return {
        metric,
        targetValue: rawTarget === null ? null : roundTo(rawTarget, 100),
        currentValue: current.value,
        direction: current.direction,
        deadline,
        sourceMetricKey: current.sourceMetricKey,
        formula: "min(current burn * 85%, cash balance / 18)",
        rationale: "Burn targets should tie directly to runway math and capital efficiency.",
      };
    }
  }
}

function buildGoalRecommendations(
  goalProgressRows: CompanyGoalProgress[],
  summary: CompanyTrackerSummary,
  now: Date,
): CompanyGoalRecommendation[] {
  const configuredMetrics = new Set(goalProgressRows.map((goal) => goal.metric));
  return BOARD_TARGET_METRICS
    .filter((metric) => !configuredMetrics.has(metric))
    .map((metric) => goalRecommendation(metric, summary, now))
    .filter((recommendation): recommendation is CompanyGoalRecommendation =>
      Boolean(recommendation),
    );
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
  const previousArr = numberValue(metricValueView(input.previousMrr?.value).arr);
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

function canonicalSourceKeys(rows: CanonicalMetricRow[]): Set<string> {
  const sourceKeys = new Set<string>();
  for (const row of rows) {
    for (const lineage of row.lineage ?? []) {
      if (lineage.sourceKey) sourceKeys.add(lineage.sourceKey);
    }
  }
  return sourceKeys;
}

function sourceHasSnapshot(
  analyticsStats: CompanyAnalyticsStats | null,
  sourceKey: string,
): boolean {
  return snapshotKeysForSource(sourceKey).some((snapshotKey) =>
    analyticsStats?.availableProviders.has(snapshotKey),
  );
}

function sourceSnapshotStatus(
  analyticsStats: CompanyAnalyticsStats | null,
  sourceKey: string,
): SourceCoverageStatus | null {
  const snapshotKeys = snapshotKeysForSource(sourceKey);
  if (snapshotKeys.some((snapshotKey) => analyticsStats?.errorProviders.has(snapshotKey))) {
    return "error";
  }
  if (snapshotKeys.some((snapshotKey) => analyticsStats?.staleProviders.has(snapshotKey))) {
    return "stale";
  }
  if (snapshotKeys.some((snapshotKey) => analyticsStats?.availableProviders.has(snapshotKey))) {
    return "available";
  }
  return null;
}

function buildSourceCoverage(input: {
  dashboard: ImladrisDashboardDefinition;
  canonicalRows: CanonicalMetricRow[];
  analyticsStats: CompanyAnalyticsStats | null;
}): CompanySourceCoverage[] {
  const canonicalSources = canonicalSourceKeys(input.canonicalRows);

  return input.dashboard.sourceKeys.map((sourceKey) => {
    const definition = REQUIRED_IMLADRIS_PROVIDERS.find((provider) => provider.key === sourceKey);
    const snapshotStatus = sourceSnapshotStatus(input.analyticsStats, sourceKey);
    const canonicalAvailable = canonicalSources.has(sourceKey);
    const status: SourceCoverageStatus =
      snapshotStatus ??
      (canonicalAvailable ? "available" : "missing");
    const lastCapturedAt = sourceHasSnapshot(input.analyticsStats, sourceKey)
      ? input.analyticsStats?.latestCapturedAt ?? null
      : null;
    const detail =
      status === "available"
        ? canonicalAvailable
          ? "Canonical lineage or analytics snapshot is available."
          : "Latest analytics snapshot is available."
        : status === "stale"
          ? "Latest analytics snapshot is stale."
          : status === "error"
            ? "Latest analytics snapshot reported an error."
            : "No canonical lineage or analytics snapshot is available.";

    return {
      key: sourceKey,
      label: definition?.label ?? sourceKey,
      status,
      lastCapturedAt,
      detail,
    };
  });
}

function buildTrust(
  metrics: CompanyTrackerMetric[],
  analyticsStats: CompanyAnalyticsStats | null,
): CompanyTrackerTrust {
  const summary = {
    ready: 0,
    missing: 0,
    partial: 0,
    stale: 0,
    error: 0,
    warnings: 0,
  };
  const warningSet = new Set<string>();
  const caveatSet = new Set<string>();
  for (const metric of metrics) {
    summary[metric.status] += 1;
    summary.warnings += metric.warnings.length;
    for (const warning of metric.warnings) warningSet.add(warning);
    for (const caveat of metric.caveats ?? []) caveatSet.add(caveat);
  }
  for (const warning of analyticsStats?.warnings ?? []) {
    summary.warnings += 1;
    warningSet.add(warning);
  }
  return {
    summary,
    warnings: [...warningSet],
    caveats: [...caveatSet],
  };
}

function buildBoardReadiness(input: {
  summary: CompanyTrackerSummary;
  metrics: CompanyTrackerMetric[];
  goalProgress: CompanyGoalProgress[];
  goalRecommendations: CompanyGoalRecommendation[];
  sourceCoverage: CompanySourceCoverage[];
  trust: CompanyTrackerTrust;
}): CompanyBoardReadiness {
  const blockers: string[] = [];
  const caveats = new Set<string>(input.trust.caveats);
  const requiredActions: string[] = [];
  const metricByKey = new Map(input.metrics.map((metric) => [metric.key, metric]));
  const coreMetricKeys = [
    "revenue.mrr",
    "finance.cash_runway_months",
    "finance.net_burn",
  ];
  const missingCore = coreMetricKeys.filter((metricKey) => {
    const metric = metricByKey.get(metricKey);
    return !metric || metric.status === "missing" || metric.status === "error";
  });

  if (input.summary.arr === null || input.summary.mrr === null) {
    blockers.push("ARR/MRR is missing.");
  }
  if (input.summary.runwayMonths === null) {
    blockers.push("Cash runway is missing.");
  }
  if (input.summary.netBurn === null) {
    blockers.push("Net burn is missing.");
  }
  if (missingCore.length > 0) {
    blockers.push(`Core metric rows need attention: ${missingCore.join(", ")}.`);
  }

  for (const metric of input.metrics) {
    if (metric.status === "partial") {
      caveats.add(`Using analytics snapshots for ${metric.key} until canonical materialization catches up.`);
    }
    if (metric.status === "stale") {
      caveats.add(`${metric.label} is stale.`);
    }
  }

  if (input.goalProgress.length === 0) {
    for (const recommendation of input.goalRecommendations) {
      requiredActions.push(`Configure ${recommendation.metric} FinancialGoal target.`);
    }
  }

  const criticalSources = new Set(["stripe", "hubspot", "mercury"]);
  const missingCriticalSources = input.sourceCoverage.filter(
    (source) => criticalSources.has(source.key) && source.status !== "available",
  );
  for (const source of missingCriticalSources) {
    blockers.push(`${source.label} source is not available.`);
  }

  const warningPenalty = Math.min(input.trust.summary.warnings * 8, 32);
  const caveatPenalty = Math.min(caveats.size * 4, 24);
  const missingSourcePenalty = Math.min(
    input.sourceCoverage.filter((source) => source.status === "missing").length * 2,
    20,
  );
  const actionPenalty = Math.min(requiredActions.length * 6, 18);
  const blockerPenalty = Math.min(blockers.length * 24, 72);
  const score = Math.max(
    0,
    Math.round(100 - warningPenalty - caveatPenalty - missingSourcePenalty - actionPenalty - blockerPenalty),
  );
  const status: BoardReadinessStatus =
    blockers.length > 0
      ? "blocked"
      : caveats.size > 0 || requiredActions.length > 0 || input.trust.summary.warnings > 0
        ? "watch"
        : "ready";

  return {
    status,
    score,
    blockers,
    caveats: [...caveats],
    requiredActions,
    requiredActionCount: requiredActions.length,
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
  const [canonicalRows, goals, analyticsStats] = await Promise.all([
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
    buildCompanyAnalyticsStats({
      prisma: input.prisma,
      context,
      now,
    }),
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
    companyMetric(latestMetrics.get(metricKey) ?? null, metricKey, analyticsStats),
  );
  const summary = buildSummary(latestMetrics, analyticsStats);
  const currentMrr = latestMetrics.get("revenue.mrr") ?? null;
  const previousMrr = previousMetricRow(typedCanonicalRows, "revenue.mrr", currentMrr, context);
  const goalProgressRows = typedGoals.map((goal) => goalProgress(goal, summary, now));
  const goalRecommendations = buildGoalRecommendations(goalProgressRows, summary, now);
  const sourceCoverage = buildSourceCoverage({
    dashboard,
    canonicalRows: typedCanonicalRows,
    analyticsStats,
  });
  const trust = buildTrust(metrics, analyticsStats);
  const boardReadiness = buildBoardReadiness({
    summary,
    metrics,
    goalProgress: goalProgressRows,
    goalRecommendations,
    sourceCoverage,
    trust,
  });

  return {
    dashboard,
    summary,
    goalProgress: goalProgressRows,
    goalRecommendations,
    healthBands: buildHealthBands({
      summary,
      currentMrr,
      previousMrr,
      goalProgress: goalProgressRows,
    }),
    sourceCoverage,
    boardReadiness,
    metrics,
    trust,
  };
}

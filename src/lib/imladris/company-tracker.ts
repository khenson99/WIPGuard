import {
  REQUIRED_IMLADRIS_PROVIDERS,
  getImladrisDashboardDefinition,
  getImladrisMetricDefinition,
} from "@/lib/imladris/catalog";
import { buildAnalyticsMetricsLayer } from "@/lib/analytics/kpis";
import { buildRevenueDashboardData } from "@/lib/analytics/revenue-dashboard";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { snapshotKeyQueryVariants } from "@/lib/integrations/provider-registry";
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
  snapshots: Map<string, AnalyticsSnapshotRow>;
  statusSnapshotsBySource: Map<string, AnalyticsSnapshotRow>;
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
  sourceLineageKeys?: string[];
  latestSourceCapturedAt?: string;
}

export interface CompanyTrackerSummary {
  arr: number | null;
  mrr: number | null;
  totalRevenue: number | null;
  subscriptionRevenue: number | null;
  servicesRevenue: number | null;
  runwayMonths: number | null;
  cashBalance: number | null;
  netBurn: number | null;
  cashOutflow: number | null;
  cashInflow: number | null;
  expenses: number | null;
  grossMargin: number | null;
  grossMarginRevenue: number | null;
  costOfGoodsSold: number | null;
  stripeProcessingFees: number | null;
  qualifiedPipeline: number | null;
  qualifiedPipelineCount: number | null;
  collaborationTouchCount: number | null;
  collaborationCoverage: number | null;
  demos: number | null;
  scheduledDemos: number | null;
  requestedDemos: number | null;
  hubspotDemoDeals: number | null;
  hubspotDemoMeetings: number | null;
  calendarDemoEvents: number | null;
  webflowDemoRequests: number | null;
  activeSubscriptions: number | null;
  stripeSubscriptions: number | null;
  hubspotOnlySubscriptions: number | null;
  customers: number | null;
  stripeCustomers: number | null;
  hubspotOnlyCustomers: number | null;
  websiteTraffic: number | null;
  websiteSessions: number | null;
  posthogPageviews: number | null;
  organicTraffic: number | null;
  searchClicks: number | null;
  searchImpressions: number | null;
  conversionRate: number | null;
  conversions: number | null;
  webflowFormSubmissions: number | null;
  hubspotLeadConversions: number | null;
  posthogConversions: number | null;
  identifiedVisitors: number | null;
  pipelineEfficiency: number | null;
  acquisitionSpend: number | null;
  activationRate: number | null;
  activatedAccounts: number | null;
  eligibleAccounts: number | null;
  customerHealth: number | null;
  atRiskAccounts: number | null;
  openSupportIssues: number | null;
  customerActivity: number | null;
  supportInteractions: number | null;
  productUsageRecords: number | null;
  collaborationSignals: number | null;
  customerActivityActiveAccounts: number | null;
  churnRate: number | null;
  retentionRate: number | null;
  churnedCustomers: number | null;
  retainedCustomers: number | null;
  retentionCustomerBase: number | null;
  retentionRiskScore: number | null;
  retentionRiskAccounts: number | null;
  retentionRiskEscalations: number | null;
  retentionRiskBillingRiskAccounts: number | null;
  retentionRiskLowUsageAccounts: number | null;
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

export interface CompanyNorthStarDriver {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  status: HealthBandStatus;
  detail: string;
  sourceLineageCount?: number;
  sourceLineageKeys?: string[];
  latestSourceCapturedAt?: string;
}

export interface CompanyNorthStar {
  id: "healthy_arr_growth";
  label: "Healthy ARR Growth";
  status: HealthBandStatus;
  currentArr: number | null;
  currentMrr: number | null;
  netNewArr: number | null;
  formula: string;
  sourceMetricKeys: string[];
  drivers: CompanyNorthStarDriver[];
}

export interface CompanyBenchmarkItem {
  id: string;
  label: string;
  value: number | null;
  unit: "currency" | "months" | "percent" | "ratio" | "score";
  status: HealthBandStatus;
  benchmark: string;
  formula: string;
  assumption: string;
  sourceMetricKeys: string[];
}

export interface CompanyCohortItem {
  id: string;
  label: string;
  value: number | null;
  unit: "count" | "currency" | "percent" | "ratio" | "score";
  status: HealthBandStatus;
  detail: string;
  formula: string;
  sourceMetricKeys: string[];
}

export interface CompanyBenchmarkContext {
  items: CompanyBenchmarkItem[];
  cohorts: CompanyCohortItem[];
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
  northStar: CompanyNorthStar;
  benchmarkContext: CompanyBenchmarkContext;
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

const ANALYTICS_SNAPSHOT_BASE_PROVIDER_KEYS = [
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

const ANALYTICS_SNAPSHOT_PROVIDER_KEYS = snapshotKeyQueryVariants([
  ...ANALYTICS_SNAPSHOT_BASE_PROVIDER_KEYS,
]);

const SOURCE_SNAPSHOT_KEYS = new Map<string, string[]>(
  REQUIRED_IMLADRIS_PROVIDERS.map((provider) => [
    provider.key,
    snapshotKeyQueryVariants(provider.snapshotKeys),
  ]),
);

const COMPATIBLE_PAYLOAD_SNAPSHOT_KEYS = new Map<string, string[]>([
  ["posthog", ["posthog", "product"]],
  ["product", ["posthog", "product"]],
]);

const EMPTY_ANALYTICS_SNAPSHOT_MAP = new Map<string, AnalyticsSnapshotRow>();

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

function valueAtPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function firstNumberAtPath(value: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const number = numberValue(valueAtPath(value, path));
    if (number !== null) return number;
  }
  return null;
}

function arrayAtPath(value: unknown, path: string[]): unknown[] {
  const target = valueAtPath(value, path);
  return Array.isArray(target) ? target : [];
}

function firstArrayAtPath(value: unknown, paths: string[][]): unknown[] {
  for (const path of paths) {
    const entries = arrayAtPath(value, path);
    if (entries.length > 0) return entries;
  }
  return [];
}

function countValue(value: unknown): number | null {
  const valueAsNumber = numberValue(value);
  return valueAsNumber === null ? null : Math.floor(Math.max(0, valueAsNumber));
}

function normalizedCustomerRefLookup(value: unknown): string | null {
  const scalar = scalarValue(value);
  if (typeof scalar === "number" && Number.isFinite(scalar)) return String(scalar).toLowerCase();
  if (typeof scalar !== "string") return null;
  const normalized = scalar.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "unknown customer" ? normalized : null;
}

function normalizedCustomerRefLookups(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(normalizedCustomerRefLookups);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizedCustomerRefLookup(entry))
      .filter((entry): entry is string => Boolean(entry));
  }
  const normalized = normalizedCustomerRefLookup(value);
  return normalized ? [normalized] : [];
}

function hubspotCompanyRefIdentities(record: Record<string, unknown>): string[] {
  const metadata = asRecord(record.metadata);
  return [
    record.hubspotCompanyIds,
    record.hubspot_company_ids,
    record.hubspotCompanyId,
    record.hubspot_company_id,
    metadata.hubspotCompanyIds,
    metadata.hubspot_company_ids,
    metadata.hubspotCompanyId,
    metadata.hubspot_company_id,
  ].flatMap((value) => normalizedCustomerRefLookups(value).map((id) => `hubspot-company:${id}`));
}

function activeCustomerRefIdentities(ref: unknown): string[] {
  const record = asRecord(ref);
  const customer = asRecord(record.customer);
  const companyIdentities = [
    ...hubspotCompanyRefIdentities(record),
    ...hubspotCompanyRefIdentities(customer),
  ];
  if (companyIdentities.length > 0) return companyIdentities;

  const identity =
    normalizedCustomerRefLookup(record.customerId) ??
    normalizedCustomerRefLookup(record.customer_id) ??
    normalizedCustomerRefLookup(record.stripeCustomerId) ??
    normalizedCustomerRefLookup(record.stripe_customer_id) ??
    normalizedCustomerRefLookup(record.id) ??
    normalizedCustomerRefLookup(customer.id) ??
    normalizedCustomerRefLookup(record.email) ??
    normalizedCustomerRefLookup(record.customerEmail) ??
    normalizedCustomerRefLookup(record.customer_email) ??
    normalizedCustomerRefLookup(customer.email);
  return identity ? [identity] : [];
}

function uniqueActiveCustomerRefCount(refs: unknown[]): number {
  let anonymousRefs = 0;
  const identities = new Set<string>();
  for (const ref of refs) {
    const refIdentities = activeCustomerRefIdentities(ref);
    if (refIdentities.length > 0) {
      refIdentities.forEach((identity) => identities.add(identity));
    } else {
      anonymousRefs += 1;
    }
  }
  return identities.size + anonymousRefs;
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

function sourceKeyForSnapshotKey(snapshotKey: string): string | null {
  for (const [sourceKey, snapshotKeys] of SOURCE_SNAPSHOT_KEYS.entries()) {
    if (snapshotKeys.includes(snapshotKey)) return sourceKey;
  }
  return null;
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

function latestSnapshotsBySource(rows: AnalyticsSnapshotRow[]): Map<string, AnalyticsSnapshotRow> {
  const latest = new Map<string, AnalyticsSnapshotRow>();
  for (const row of rows) {
    const sourceKey = sourceKeyForSnapshotKey(row.providerKey) ?? row.providerKey;
    const existing = latest.get(sourceKey);
    if (!existing || (toDate(row.capturedAt)?.getTime() ?? 0) > (toDate(existing.capturedAt)?.getTime() ?? 0)) {
      latest.set(sourceKey, row);
    }
  }
  return latest;
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

function latestSnapshotForProviderKey(
  snapshots: Map<string, AnalyticsSnapshotRow>,
  providerKey: string,
): AnalyticsSnapshotRow | null {
  return latestSnapshotForProviderKeys(snapshots, [providerKey]);
}

function latestSnapshotForProviderKeys(
  snapshots: Map<string, AnalyticsSnapshotRow>,
  providerKeys: string[],
): AnalyticsSnapshotRow | null {
  const variants = snapshotKeyQueryVariants(providerKeys);
  const candidates = variants
    .map((snapshotKey) => snapshots.get(snapshotKey) ?? null)
    .filter((snapshot): snapshot is AnalyticsSnapshotRow => Boolean(snapshot));
  if (candidates.length === 0) return null;

  return [...candidates].sort(
    (left, right) =>
      (toDate(right.capturedAt)?.getTime() ?? 0) -
      (toDate(left.capturedAt)?.getTime() ?? 0),
  )[0] ?? null;
}

function analyticsDataFromSnapshots(
  snapshots: Map<string, AnalyticsSnapshotRow>,
  now: Date,
): AnalyticsDashboardData {
  const payload = (providerKey: string) =>
    latestSnapshotForProviderKey(snapshots, providerKey)?.payload ?? null;

  return {
    stripe: (payload("stripe") as StripeData | undefined) ?? null,
    mercury: (payload("mercury") as MercuryData | undefined) ?? null,
    hubspot: (payload("hubspot") as HubSpotData | undefined) ?? null,
    salesPerformance:
      (payload("salesPerformance") as SalesPerformancePack | undefined) ?? null,
    googleAnalytics: payload("googleAnalytics"),
    googleSearchConsole: payload("googleSearchConsole") ?? payload("searchConsole"),
    googleAds: payload("googleAds"),
    metaAds: payload("metaAds"),
    metaPage: payload("metaPage"),
    instagram: payload("instagram"),
    redditAds: payload("redditAds"),
    semrush: payload("semrush"),
    coda: payload("coda") ?? payload("codaOps"),
    webflow: payload("webflow"),
    pylon: payload("pylon"),
    posthog: payload("posthog"),
    product: payload("product"),
    googleWorkspace: payload("googleWorkspace"),
    slack: payload("slack"),
    linear: payload("linear"),
    github: payload("github"),
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

  const loadedSnapshotRows = (await input.prisma.analyticsSnapshot.findMany({
    where: {
      ...analyticsSnapshotScopeWhere(input.context),
      providerKey: {
        in: [...ANALYTICS_SNAPSHOT_PROVIDER_KEYS],
      },
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
      lastError: true,
    },
    orderBy: [{ capturedAt: "desc" }],
  })) as AnalyticsSnapshotRow[];
  const snapshotRows = loadedSnapshotRows.filter((snapshot) => {
    const capturedAt = toDate(snapshot.capturedAt);
    return capturedAt !== null && capturedAt.getTime() <= input.now.getTime();
  });
  const latestStatusSnapshots = latestSnapshotsByProvider(snapshotRows);
  if (latestStatusSnapshots.size === 0) return null;
  const statusSnapshotsBySource = latestSnapshotsBySource([...latestStatusSnapshots.values()]);

  const snapshots = latestSnapshotsByProvider(
    snapshotRows.filter(
      (snapshot) =>
        snapshot.status === "SUCCESS" &&
        snapshot.payload !== null &&
        snapshot.payload !== undefined,
    ),
  );

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
    [...latestStatusSnapshots.values()]
      .filter((snapshot) => snapshot.status === "ERROR" || snapshot.lastError)
      .map((snapshot) => [
        snapshot.providerKey,
        snapshot.lastError ?? "Snapshot reported an error.",
      ]),
  );

  return {
    snapshots,
    statusSnapshotsBySource,
    metricsLayer: buildAnalyticsMetricsLayer(analyticsData),
    revenueDashboard: buildRevenueDashboardData(analyticsData),
    snapshotCount: snapshots.size,
    latestCapturedAt,
    availableProviders: new Set(snapshots.keys()),
    staleProviders,
    errorProviders,
    warnings: [...statusSnapshotsBySource.values()]
      .filter((snapshot) => snapshot.status === "ERROR" || snapshot.lastError)
      .map(
        (snapshot) =>
          `${snapshot.providerKey}: ${snapshot.lastError ?? "Snapshot reported an error."}`,
      ),
  };
}

function hasAnalyticsProvider(
  analyticsStats: CompanyAnalyticsStats | null,
  ...providerKeys: string[]
): boolean {
  return providerKeys.some((providerKey) =>
    snapshotKeysForSource(providerKey).some((snapshotKey) =>
      analyticsStats?.availableProviders.has(snapshotKey),
    ),
  );
}

function snapshotPayload(
  analyticsStats: CompanyAnalyticsStats | null,
  providerKey: string,
): unknown {
  const compatiblePayloadKeys = COMPATIBLE_PAYLOAD_SNAPSHOT_KEYS.get(providerKey);
  if (compatiblePayloadKeys) {
    return latestSnapshotForProviderKeys(
      analyticsStats?.snapshots ?? EMPTY_ANALYTICS_SNAPSHOT_MAP,
      compatiblePayloadKeys,
    )?.payload ?? null;
  }

  for (const snapshotKey of snapshotKeysForSource(providerKey)) {
    const payload = latestSnapshotForProviderKey(
      analyticsStats?.snapshots ?? EMPTY_ANALYTICS_SNAPSHOT_MAP,
      snapshotKey,
    )?.payload;
    if (payload !== null && payload !== undefined) return payload;
  }
  return null;
}

function paidAcquisitionSummary(analyticsStats: CompanyAnalyticsStats): {
  amount: number;
  paidSourceCount: number;
  clicks: number;
  conversions: number;
  impressions: number;
} | null {
  const paidProviderKeys = ["googleAds", "metaAds", "redditAds"] as const;
  let amount = 0;
  let paidSourceCount = 0;
  let clicks = 0;
  let conversions = 0;
  let impressions = 0;

  for (const providerKey of paidProviderKeys) {
    const payload = snapshotPayload(analyticsStats, providerKey);
    const spend = firstNumberAtPath(payload, [
      ["totalSpend30d"],
      ["spend"],
      ["cost"],
      ["summary", "spend"],
    ]);
    if (spend === null) continue;

    amount += Math.max(spend, 0);
    if (spend > 0) paidSourceCount += 1;
    clicks +=
      firstNumberAtPath(payload, [["totalClicks"], ["clicks"], ["summary", "clicks"]]) ??
      0;
    conversions +=
      firstNumberAtPath(payload, [
        ["totalConversions"],
        ["conversions"],
        ["summary", "conversions"],
      ]) ?? 0;
    impressions +=
      firstNumberAtPath(payload, [
        ["totalImpressions"],
        ["impressions"],
        ["summary", "impressions"],
      ]) ?? 0;
  }

  if (amount <= 0 || paidSourceCount === 0) return null;
  return { amount, paidSourceCount, clicks, conversions, impressions };
}

function marketingPipelineEfficiencyFallback(
  analyticsStats: CompanyAnalyticsStats,
): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "hubspot")) return null;

  const qualifiedPipeline =
    analyticsStats.revenueDashboard.pipeline.qualifiedPipelineValue;
  const acquisitionSpend = paidAcquisitionSummary(analyticsStats);
  if (qualifiedPipeline <= 0 || !acquisitionSpend) return null;

  return {
    ratio: round(qualifiedPipeline / acquisitionSpend.amount, 2),
    qualifiedPipeline,
    acquisitionSpend: acquisitionSpend.amount,
    paidSourceCount: acquisitionSpend.paidSourceCount,
    clicks: acquisitionSpend.clicks,
    conversions: acquisitionSpend.conversions,
    impressions: acquisitionSpend.impressions,
    currency: "USD",
    formula: "qualified pipeline / paid acquisition spend",
    source: "analytics.snapshot_pipeline_efficiency",
  };
}

function activationEventName(event: unknown): string {
  const record = asRecord(event);
  const rawName =
    record.event ??
    record.name ??
    record.eventName ??
    valueAtPath(record, ["properties", "event"]);
  return typeof rawName === "string"
    ? rawName.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

function activationEventIdentity(event: unknown): string | null {
  const record = asRecord(event);
  const candidates = [
    record.distinct_id,
    record.user_id,
    record.userId,
    record.accountId,
    record.companyId,
    valueAtPath(record, ["properties", "accountId"]),
    valueAtPath(record, ["properties", "companyId"]),
    valueAtPath(record, ["properties", "hubspotCompanyId"]),
    valueAtPath(record, ["properties", "distinct_id"]),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function activatedAccountCount(posthogPayload: unknown): {
  activatedAccounts: number;
  eventCount: number | null;
} | null {
  const directCount = firstNumberAtPath(posthogPayload, [
    ["activatedAccounts30d"],
    ["activatedAccounts"],
    ["activationCount"],
    ["summary", "activatedAccounts"],
    ["summary", "activationCount"],
  ]);
  const eventCount = firstNumberAtPath(posthogPayload, [
    ["eventCount"],
    ["totalEvents"],
    ["summary", "eventCount"],
  ]);
  if (directCount !== null) {
    return {
      activatedAccounts: directCount,
      eventCount: eventCount ?? directCount,
    };
  }

  const events = arrayAtPath(posthogPayload, ["events"]).length > 0
    ? arrayAtPath(posthogPayload, ["events"])
    : arrayAtPath(posthogPayload, ["results"]);
  if (events.length === 0) return null;

  const activationNames = new Set([
    "activation_completed",
    "account_activated",
    "activated",
    "user_activated",
    "workspace_activated",
  ]);
  const identities = new Set<string>();
  let anonymousActivationEvents = 0;

  for (const event of events) {
    if (!activationNames.has(activationEventName(event))) continue;
    const identity = activationEventIdentity(event);
    if (identity) {
      identities.add(identity);
    } else {
      anonymousActivationEvents += 1;
    }
  }

  return {
    activatedAccounts: identities.size + anonymousActivationEvents,
    eventCount: eventCount ?? events.length,
  };
}

function productActivationFallback(
  analyticsStats: CompanyAnalyticsStats,
): Record<string, unknown> | null {
  if (
    !hasAnalyticsProvider(analyticsStats, "posthog") ||
    !hasAnalyticsProvider(analyticsStats, "hubspot")
  ) {
    return null;
  }

  const posthogPayload = snapshotPayload(analyticsStats, "posthog");
  const hubspotPayload = snapshotPayload(analyticsStats, "hubspot");
  const activation = activatedAccountCount(posthogPayload);
  const eligibleAccounts =
    firstNumberAtPath(hubspotPayload, [
      ["funnel", "activeSubscriptions"],
      ["funnel", "totalDeals"],
      ["activeSubscriptions"],
      ["totalDeals"],
    ]) ?? null;

  if (!activation || eligibleAccounts === null || eligibleAccounts <= 0) {
    return null;
  }

  return {
    rate: round((activation.activatedAccounts / eligibleAccounts) * 100, 2),
    activatedAccounts: activation.activatedAccounts,
    eligibleAccounts,
    eventCount: activation.eventCount,
    formula: "activated accounts / eligible accounts",
    source: "analytics.snapshot_activation",
  };
}

function normalizedCsat(value: number | null): number | null {
  if (value === null) return null;
  if (value > 1) return Math.min(value / 100, 1);
  return Math.max(Math.min(value, 1), 0);
}

function retentionRiskFallback(
  analyticsStats: CompanyAnalyticsStats,
): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "pylon")) return null;

  const pylonPayload = snapshotPayload(analyticsStats, "pylon");
  const openConversations = firstNumberAtPath(pylonPayload, [
    ["openConversations"],
    ["openIssues"],
    ["summary", "openConversations"],
    ["summary", "openIssues"],
  ]);
  const urgentConversations = firstNumberAtPath(pylonPayload, [
    ["urgentConversations"],
    ["urgentIssues"],
    ["summary", "urgentConversations"],
    ["summary", "urgentIssues"],
  ]);
  const waitingOnTeam = firstNumberAtPath(pylonPayload, [
    ["waitingOnTeam"],
    ["summary", "waitingOnTeam"],
  ]);
  const resolvedInRange = firstNumberAtPath(pylonPayload, [
    ["resolvedInRange"],
    ["resolvedConversations"],
    ["summary", "resolvedInRange"],
  ]);
  const avgFirstResponseMinutes = firstNumberAtPath(pylonPayload, [
    ["avgFirstResponseMinutes"],
    ["averageFirstResponseMinutes"],
    ["summary", "avgFirstResponseMinutes"],
  ]);
  const csat = normalizedCsat(
    firstNumberAtPath(pylonPayload, [["csat"], ["summary", "csat"]]),
  );
  const hasAnySignal = [
    openConversations,
    urgentConversations,
    waitingOnTeam,
    resolvedInRange,
    avgFirstResponseMinutes,
    csat,
  ].some((value) => value !== null);
  if (!hasAnySignal) return null;

  const responseRisk =
    avgFirstResponseMinutes === null
      ? 0
      : Math.min(Math.max((avgFirstResponseMinutes - 30) / 15, 0), 12);
  const csatRisk = csat === null ? 0 : Math.max(0, (1 - csat) * 20);
  const score = round(
    Math.min(
      100,
      (urgentConversations ?? 0) * 18 +
        (waitingOnTeam ?? 0) * 8 +
        (openConversations ?? 0) * 2 +
        responseRisk +
        csatRisk,
    ),
    1,
  );

  return {
    score,
    riskScore: score,
    openConversations: openConversations ?? 0,
    urgentConversations: urgentConversations ?? 0,
    waitingOnTeam: waitingOnTeam ?? 0,
    resolvedInRange: resolvedInRange ?? null,
    avgFirstResponseMinutes: avgFirstResponseMinutes ?? null,
    csat,
    formula: "urgent support load + team-waiting load + open load + response lag + CSAT risk",
    source: "analytics.snapshot_retention_risk",
  };
}

function revenueAmountFallback(
  analyticsStats: CompanyAnalyticsStats,
  key: "arr" | "subscription_revenue" | "total_revenue",
): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "stripe", "hubspot")) return null;
  const amount = analyticsStats.revenueDashboard.summary.arr;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    ...(key === "total_revenue"
      ? {
          subscriptionRevenue: amount,
          servicesRevenue: 0,
        }
      : {}),
    currency: "USD",
    formula: "subscription MRR x 12 from Stripe and HubSpot subscription evidence",
    source:
      key === "arr"
        ? "analytics.revenue_dashboard"
        : key === "total_revenue"
          ? "analytics.snapshot_total_revenue"
          : "analytics.snapshot_subscription_revenue",
  };
}

function activeSubscriptionFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "stripe", "hubspot")) return null;
  const count = analyticsStats.metricsLayer.finance.summary.activeSubscriptions;
  return {
    count,
    stripeActiveSubscriptions: analyticsStats.metricsLayer.finance.summary.stripeActiveSubscriptions,
    hubspotActiveSubscriptions: analyticsStats.metricsLayer.finance.summary.hubspotActiveSubscriptions,
    source: "analytics.metrics_layer",
  };
}

function customerCountFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "stripe", "hubspot")) return null;
  const stripePayload = snapshotPayload(analyticsStats, "stripe");
  const activeCustomerRefs = firstArrayAtPath(stripePayload, [
    ["subscriptions", "activeCustomerRefs"],
    ["subscriptions", "active_customer_refs"],
  ]);
  const count = activeCustomerRefs.length > 0
    ? uniqueActiveCustomerRefCount(activeCustomerRefs)
    : analyticsStats.metricsLayer.finance.summary.activeSubscriptions;
  return {
    count,
    activeCustomerRefs: activeCustomerRefs.length,
    source: "analytics.snapshot_customer_count",
  };
}

function salesDemosFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "hubspot")) return null;

  const hubspotPayload = snapshotPayload(analyticsStats, "hubspot");
  const scheduledDemos = countValue(
    firstNumberAtPath(hubspotPayload, [
      ["funnel", "demoScheduled"],
      ["funnel", "scheduledDemos"],
      ["demos", "scheduled"],
      ["summary", "demoScheduled"],
      ["summary", "scheduledDemos"],
      ["demoScheduled"],
      ["scheduledDemos"],
    ]),
  );
  const requestedDemos = countValue(
    firstNumberAtPath(hubspotPayload, [
      ["funnel", "requestedDemos"],
      ["demos", "requested"],
      ["summary", "requestedDemos"],
      ["requestedDemos"],
    ]),
  );
  const demoDeals = arrayAtPath(hubspotPayload, ["deals"]).filter((deal) => {
    const record = asRecord(deal);
    const stage = [
      scalarValue(record.stageLabel),
      scalarValue(record.stageName),
      scalarValue(record.stageId),
      scalarValue(record.dealstage),
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return stage.includes("demo") || stage.includes("presentation");
  }).length;
  const count = scheduledDemos ?? (demoDeals > 0 ? demoDeals : null);
  if (count === null && requestedDemos === null) return null;

  return {
    count: count ?? requestedDemos ?? 0,
    scheduledDemos: scheduledDemos ?? count ?? 0,
    requestedDemos: requestedDemos ?? null,
    demoDealCount: demoDeals,
    source: "analytics.snapshot_demos",
  };
}

function cashBalanceFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "mercury")) return null;
  const amount =
    analyticsStats.metricsLayer.finance.summary.cashBalance ||
    analyticsStats.revenueDashboard.summary.cashBalance;
  return {
    amount,
    bankCash: analyticsStats.metricsLayer.finance.summary.bankCash,
    treasuryCash: analyticsStats.metricsLayer.finance.summary.treasuryCash,
    currency: "USD",
    source: "analytics.metrics_layer",
  };
}

function expensesFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "mercury")) return null;
  const amount = analyticsStats.metricsLayer.finance.summary.outflows30d;
  if (!Number.isFinite(amount) || amount < 0) return null;
  return {
    amount,
    cashOutflow: amount,
    currency: "USD",
    source: "analytics.snapshot_expenses",
  };
}

function websiteTrafficFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "googleAnalytics", "googleSearchConsole", "semrush", "webflow", "posthog")) {
    return null;
  }
  const gaPayload = snapshotPayload(analyticsStats, "googleAnalytics");
  const gscPayload = snapshotPayload(analyticsStats, "googleSearchConsole");
  const searchClicks = firstNumberAtPath(gscPayload, [["clicks"], ["totalClicks"], ["summary", "clicks"]]);
  const count =
    firstNumberAtPath(gaPayload, [["sessions30d"], ["sessions"], ["summary", "sessions"]]) ??
    searchClicks;
  if (count === null) return null;
  return {
    count,
    websiteSessions: count,
    searchClicks,
    source: "analytics.snapshot_website_traffic",
  };
}

function webflowFormSubmissionFallbackCount(payload: unknown): number | null {
  const directCount = firstNumberAtPath(payload, [
    ["totalFormSubmissions"],
    ["total_form_submissions"],
    ["formSubmissions"],
    ["form_submissions"],
    ["summary", "totalFormSubmissions"],
    ["summary", "total_form_submissions"],
    ["summary", "formSubmissions"],
    ["summary", "form_submissions"],
  ]);
  if (directCount !== null) return Math.floor(Math.max(0, directCount));

  const formSubmissions = firstArrayAtPath(payload, [
    ["formSubmissions"],
    ["form_submissions"],
    ["forms"],
    ["summary", "formSubmissions"],
    ["summary", "form_submissions"],
  ]);
  if (formSubmissions.length === 0) return null;

  return formSubmissions.reduce<number>((sum, submission) => {
    const count =
      firstNumberAtPath(submission, [["count"], ["submissions"], ["totalSubmissions"], ["total_submissions"]]) ??
      1;
    return sum + Math.floor(Math.max(0, count));
  }, 0);
}

function conversionRateFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "googleAnalytics", "googleSearchConsole")) return null;
  const hubspotPayload = snapshotPayload(analyticsStats, "hubspot");
  const gaPayload = snapshotPayload(analyticsStats, "googleAnalytics");
  const gscPayload = snapshotPayload(analyticsStats, "googleSearchConsole");
  const webflowPayload = snapshotPayload(analyticsStats, "webflow");
  const searchClicks = firstNumberAtPath(gscPayload, [["clicks"], ["totalClicks"], ["summary", "clicks"]]);
  const websiteSessions =
    firstNumberAtPath(gaPayload, [["sessions30d"], ["sessions"], ["summary", "sessions"]]) ??
    searchClicks;
  const hubspotLeadConversions = firstNumberAtPath(hubspotPayload, [
    ["collectedForms", "totalFormSubmissions"],
    ["funnel", "collectedFormSubmissions"],
    ["totalFormSubmissions"],
    ["summary", "conversions"],
  ]);
  const webflowFormSubmissions = webflowFormSubmissionFallbackCount(webflowPayload);
  const conversions =
    hubspotLeadConversions !== null || webflowFormSubmissions !== null
      ? (hubspotLeadConversions ?? 0) + (webflowFormSubmissions ?? 0)
      : paidAcquisitionSummary(analyticsStats)?.conversions ?? null;
  if (websiteSessions === null || websiteSessions <= 0 || conversions === null) return null;
  return {
    rate: round((conversions / websiteSessions) * 100, 2),
    conversions,
    websiteSessions,
    hubspotLeadConversions: hubspotLeadConversions ?? 0,
    webflowFormSubmissions: webflowFormSubmissions ?? 0,
    searchClicks,
    source: "analytics.snapshot_conversion",
  };
}

function customerHealthFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "pylon")) return null;
  const pylonPayload = snapshotPayload(analyticsStats, "pylon");
  const csat = normalizedCsat(firstNumberAtPath(pylonPayload, [["csat"], ["summary", "csat"]]));
  if (csat !== null) {
    return {
      score: round(csat * 100, 1),
      csat,
      source: "analytics.snapshot_customer_health",
    };
  }
  const retentionRisk = retentionRiskFallback(analyticsStats);
  const riskScore = numberValue(asRecord(retentionRisk).riskScore);
  if (riskScore === null) return null;
  return {
    score: round(Math.max(0, 100 - riskScore), 1),
    riskScore,
    source: "analytics.snapshot_customer_health",
  };
}

function customerActivityFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "pylon")) return null;
  const pylonPayload = snapshotPayload(analyticsStats, "pylon");
  const openConversations = firstNumberAtPath(pylonPayload, [["openConversations"], ["openIssues"], ["summary", "openConversations"]]) ?? 0;
  const waitingOnTeam = firstNumberAtPath(pylonPayload, [["waitingOnTeam"], ["summary", "waitingOnTeam"]]) ?? 0;
  const resolvedInRange = firstNumberAtPath(pylonPayload, [["resolvedInRange"], ["resolvedConversations"], ["summary", "resolvedInRange"]]) ?? 0;
  const count = openConversations + waitingOnTeam + resolvedInRange;
  return {
    count,
    openConversations,
    waitingOnTeam,
    resolvedInRange,
    source: "analytics.snapshot_customer_activity",
  };
}

function churnRateFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  if (!hasAnalyticsProvider(analyticsStats, "stripe")) return null;
  const rate = analyticsStats.revenueDashboard.summary.churnRatePct;
  return {
    rate,
    source: "analytics.revenue_dashboard",
  };
}

function retentionRateFallback(analyticsStats: CompanyAnalyticsStats): Record<string, unknown> | null {
  const churn = churnRateFallback(analyticsStats);
  const churnRate = numberValue(asRecord(churn).rate);
  if (churnRate === null) return null;
  return {
    rate: round(Math.max(0, 100 - churnRate), 2),
    churnRate,
    source: "analytics.revenue_dashboard",
  };
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
    case "revenue.arr":
      return revenueAmountFallback(analyticsStats, "arr");
    case "revenue.total_revenue":
      return revenueAmountFallback(analyticsStats, "total_revenue");
    case "revenue.subscription_revenue":
      return revenueAmountFallback(analyticsStats, "subscription_revenue");
    case "revenue.active_subscriptions":
      return activeSubscriptionFallback(analyticsStats);
    case "revenue.customer_count":
      return customerCountFallback(analyticsStats);
    case "finance.cash_balance":
      return cashBalanceFallback(analyticsStats);
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
    case "finance.expenses":
      return expensesFallback(analyticsStats);
    case "sales.qualified_pipeline":
      if (!hasAnalyticsProvider(analyticsStats, "hubspot")) return null;
      return {
        amount: pipeline.qualifiedPipelineValue,
        qualifiedDealCount: pipeline.qualifiedPipelineCount,
        openPipelineValue: pipeline.openPipelineValue,
        openPipelineCount: pipeline.openPipelineCount,
        bookedValue: pipeline.bookedValue,
        realizedValue30d: pipeline.realizedValue30d,
        bookedToRealizedRatio30d: pipeline.bookedToRealizedRatio30d,
        source: "analytics.revenue_dashboard",
      };
    case "sales.demos":
      return salesDemosFallback(analyticsStats);
    case "marketing.website_traffic":
      return websiteTrafficFallback(analyticsStats);
    case "marketing.conversion_rate":
      return conversionRateFallback(analyticsStats);
    case "marketing.pipeline_efficiency":
      return marketingPipelineEfficiencyFallback(analyticsStats);
    case "product.activation_rate":
      return productActivationFallback(analyticsStats);
    case "customer_success.customer_health":
      return customerHealthFallback(analyticsStats);
    case "customer_success.customer_activity":
      return customerActivityFallback(analyticsStats);
    case "customer_success.churn_rate":
      return churnRateFallback(analyticsStats);
    case "customer_success.retention_rate":
      return retentionRateFallback(analyticsStats);
    case "customer_success.retention_risk":
      return retentionRiskFallback(analyticsStats);
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
        sourceLineageKeys: analyticsStats ? [...analyticsStats.availableProviders].sort() : [],
        ...(analyticsStats?.latestCapturedAt ? { latestSourceCapturedAt: analyticsStats.latestCapturedAt } : {}),
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
      sourceLineageKeys: [],
    };
  }
  const latestSourceCapturedAt = latestLineageCapturedAt(row.lineage);
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
    sourceLineageKeys: lineageSourceKeys(row.lineage),
    ...(latestSourceCapturedAt ? { latestSourceCapturedAt } : {}),
  };
}

function latestLineageCapturedAt(lineage: MetricLineageRow[] | undefined): string | null {
  const timestamps = (lineage ?? [])
    .map((entry) => toIso(entry.capturedAt))
    .filter((timestamp): timestamp is string => Boolean(timestamp));
  return timestamps.sort().at(-1) ?? null;
}

function lineageSourceKeys(lineage: MetricLineageRow[] | undefined): string[] {
  const sourceKeys = new Set<string>();
  for (const entry of lineage ?? []) {
    const sourceKey = entry.sourceKey.trim();
    if (sourceKey.length > 0) sourceKeys.add(sourceKey);
  }
  return [...sourceKeys];
}

function buildSummary(
  metrics: Map<string, CanonicalMetricRow>,
  analyticsStats: CompanyAnalyticsStats | null,
): CompanyTrackerSummary {
  const metricPayload = (key: string) =>
    metricValueView(
      usableMetricRow(metrics.get(key))?.value ??
        analyticsFallbackForMetric(key, analyticsStats),
    );
  const mrr = metricPayload("revenue.mrr");
  const arr = metricPayload("revenue.arr");
  const totalRevenue = metricPayload("revenue.total_revenue");
  const subscriptionRevenue = metricPayload("revenue.subscription_revenue");
  const servicesRevenue = metricPayload("revenue.services_revenue");
  const activeSubscriptions = metricPayload("revenue.active_subscriptions");
  const customerCount = metricPayload("revenue.customer_count");
  const cashBalance = metricPayload("finance.cash_balance");
  const runway = metricPayload("finance.cash_runway_months");
  const netBurn = metricPayload("finance.net_burn");
  const expenses = metricPayload("finance.expenses");
  const grossMargin = metricPayload("finance.gross_margin");
  const pipeline = metricPayload("sales.qualified_pipeline");
  const demos = metricPayload("sales.demos");
  const websiteTraffic = metricPayload("marketing.website_traffic");
  const conversionRate = metricPayload("marketing.conversion_rate");
  const pipelineEfficiency = metricPayload("marketing.pipeline_efficiency");
  const activationRate = metricPayload("product.activation_rate");
  const customerHealth = metricPayload("customer_success.customer_health");
  const customerActivity = metricPayload("customer_success.customer_activity");
  const churnRate = metricPayload("customer_success.churn_rate");
  const retentionRate = metricPayload("customer_success.retention_rate");
  const retentionRisk = metricPayload("customer_success.retention_risk");
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
  const countFromFields = (record: Record<string, unknown>, ...fields: string[]): number | null => {
    for (const field of fields) {
      const value = countValue(record[field]);
      if (value !== null) return value;
    }
    return null;
  };
  const subscriptionRevenueAmount =
    numberFromFields(subscriptionRevenue, "amount", "arr", "subscriptionRevenue", "subscription_revenue") ??
    null;
  const servicesRevenueAmount =
    numberFromFields(servicesRevenue, "amount", "servicesRevenue", "services_revenue") ??
    null;
  const derivedTotalRevenue =
    subscriptionRevenueAmount !== null || servicesRevenueAmount !== null
      ? (subscriptionRevenueAmount ?? 0) + (servicesRevenueAmount ?? 0)
      : null;

  return {
    arr:
      numberFromFields(arr, "amount", "arr") ??
      numberValue(mrr.arr) ??
      (mrrAmount === null ? null : mrrAmount * 12) ??
      fallbackArr,
    mrr: mrrAmount ?? fallbackMrr,
    totalRevenue:
      numberFromFields(totalRevenue, "amount", "totalRevenue", "total_revenue") ??
      derivedTotalRevenue ??
      null,
    subscriptionRevenue: subscriptionRevenueAmount,
    servicesRevenue: servicesRevenueAmount,
    runwayMonths:
      numberValue(runway.months) ??
      (hasFinanceFallback
        ? financeSummary?.runwayMonths ?? revenueSummary?.runwayMonths ?? null
        : null),
    cashBalance:
      numberFromFields(cashBalance, "amount", "cashBalance", "cash_balance") ??
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
    cashOutflow:
      numberFromFields(netBurn, "cashOutflow", "cash_outflow") ??
      null,
    cashInflow:
      numberFromFields(netBurn, "cashInflow", "cash_inflow") ??
      null,
    expenses:
      numberFromFields(expenses, "amount", "expenses", "expenseAmount", "expense_amount") ??
      null,
    grossMargin:
      numberFromFields(grossMargin, "rate", "grossMargin", "gross_margin") ??
      null,
    grossMarginRevenue:
      numberFromFields(grossMargin, "revenue", "grossMarginRevenue", "gross_margin_revenue") ??
      null,
    costOfGoodsSold:
      numberFromFields(grossMargin, "costOfGoodsSold", "cost_of_goods_sold", "cogs") ??
      null,
    stripeProcessingFees:
      numberFromFields(grossMargin, "stripeProcessingFees", "stripe_processing_fees", "stripeFees", "stripe_fees") ??
      null,
    qualifiedPipeline:
      numberValue(pipeline.amount) ??
      (hasPipelineFallback ? revenuePipeline?.qualifiedPipelineValue ?? null : null),
    qualifiedPipelineCount:
      countFromFields(pipeline, "qualifiedDealCount", "qualified_deal_count") ??
      (hasPipelineFallback ? revenuePipeline?.qualifiedPipelineCount ?? null : null),
    collaborationTouchCount:
      countFromFields(pipeline, "collaborationTouchCount", "collaboration_touch_count") ??
      null,
    collaborationCoverage:
      numberFromFields(pipeline, "collaborationCoverage", "collaboration_coverage") ??
      null,
    demos:
      countFromFields(demos, "count", "demos", "scheduledDemos", "scheduled_demos") ??
      null,
    scheduledDemos:
      countFromFields(demos, "scheduledDemos", "scheduled_demos") ??
      null,
    requestedDemos:
      countFromFields(demos, "requestedDemos", "requested_demos") ??
      null,
    hubspotDemoDeals:
      countFromFields(demos, "hubspotDemoDeals", "hubspot_demo_deals") ??
      null,
    hubspotDemoMeetings:
      countFromFields(demos, "hubspotDemoMeetings", "hubspot_demo_meetings") ??
      null,
    calendarDemoEvents:
      countFromFields(demos, "calendarDemoEvents", "calendar_demo_events") ??
      null,
    webflowDemoRequests:
      countFromFields(demos, "webflowDemoRequests", "webflow_demo_requests") ??
      null,
    activeSubscriptions:
      countFromFields(activeSubscriptions, "count", "activeSubscriptions", "active_subscriptions") ??
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
    stripeSubscriptions:
      countFromFields(activeSubscriptions, "stripeSubscriptions", "stripe_subscriptions") ??
      countValue(mrr.stripeSubscriptions) ??
      countValue(mrr.stripe_subscriptions) ??
      null,
    hubspotOnlySubscriptions:
      countFromFields(activeSubscriptions, "hubspotOnlySubscriptions", "hubspot_only_subscriptions") ??
      countValue(mrr.hubspotOnlySubscriptions) ??
      countValue(mrr.hubspot_only_subscriptions) ??
      null,
    customers:
      countFromFields(customerCount, "count", "activeCustomers", "active_customers", "customers") ??
      null,
    stripeCustomers:
      countFromFields(customerCount, "stripeCustomers", "stripe_customers") ??
      null,
    hubspotOnlyCustomers:
      countFromFields(customerCount, "hubspotOnlyCustomers", "hubspot_only_customers") ??
      null,
    websiteTraffic:
      countFromFields(websiteTraffic, "count", "websiteSessions", "website_sessions", "sessions") ??
      null,
    websiteSessions:
      countFromFields(websiteTraffic, "websiteSessions", "website_sessions", "sessions") ??
      null,
    posthogPageviews:
      countFromFields(websiteTraffic, "posthogPageviews", "posthog_pageviews") ??
      null,
    organicTraffic:
      countFromFields(websiteTraffic, "organicTraffic", "organic_traffic") ??
      null,
    searchClicks:
      countFromFields(websiteTraffic, "searchClicks", "search_clicks") ??
      null,
    searchImpressions:
      countFromFields(websiteTraffic, "searchImpressions", "search_impressions") ??
      null,
    conversionRate:
      numberFromFields(conversionRate, "rate", "conversionRate", "conversion_rate") ??
      null,
    conversions:
      countFromFields(conversionRate, "conversions", "conversionCount", "conversion_count") ??
      null,
    webflowFormSubmissions:
      countFromFields(
        conversionRate,
        "webflowFormSubmissions",
        "webflow_form_submissions",
        "formSubmissions",
        "form_submissions",
      ) ??
      null,
    hubspotLeadConversions:
      countFromFields(
        conversionRate,
        "hubspotLeadConversions",
        "hubspot_lead_conversions",
        "hubspotConversions",
        "hubspot_conversions",
      ) ??
      null,
    posthogConversions:
      countFromFields(conversionRate, "posthogConversions", "posthog_conversions") ??
      null,
    identifiedVisitors:
      countFromFields(conversionRate, "identifiedVisitors", "identified_visitors") ??
      null,
    pipelineEfficiency:
      numberFromFields(pipelineEfficiency, "ratio", "rate", "pipelineEfficiency", "pipeline_efficiency") ??
      null,
    acquisitionSpend:
      numberFromFields(pipelineEfficiency, "acquisitionSpend", "acquisition_spend") ??
      null,
    activationRate:
      numberFromFields(activationRate, "rate", "activationRate", "activation_rate") ??
      null,
    activatedAccounts:
      countFromFields(activationRate, "activatedAccounts", "activated_accounts") ??
      null,
    eligibleAccounts:
      countFromFields(activationRate, "eligibleAccounts", "eligible_accounts") ??
      null,
    customerHealth:
      numberFromFields(customerHealth, "score", "customerHealth", "customer_health") ??
      null,
    atRiskAccounts:
      countFromFields(customerHealth, "atRiskAccounts", "at_risk_accounts") ??
      null,
    openSupportIssues:
      countFromFields(customerHealth, "openSupportIssues", "open_support_issues") ??
      null,
    customerActivity:
      countFromFields(customerActivity, "count", "customerActivity", "customer_activity") ??
      null,
    supportInteractions:
      countFromFields(customerActivity, "supportInteractions", "support_interactions") ??
      null,
    productUsageRecords:
      countFromFields(customerActivity, "productUsageRecords", "product_usage_records") ??
      null,
    collaborationSignals:
      countFromFields(customerActivity, "collaborationSignals", "collaboration_signals") ??
      null,
    customerActivityActiveAccounts:
      countFromFields(customerActivity, "activeAccounts", "active_accounts") ??
      null,
    churnRate:
      numberFromFields(churnRate, "rate", "churnRate", "churn_rate") ??
      null,
    retentionRate:
      numberFromFields(retentionRate, "rate", "retentionRate", "retention_rate") ??
      null,
    churnedCustomers:
      countFromFields(churnRate, "churnedCustomers", "churned_customers") ??
      countFromFields(retentionRate, "churnedCustomers", "churned_customers") ??
      null,
    retainedCustomers:
      countFromFields(retentionRate, "retainedCustomers", "retained_customers") ??
      countFromFields(churnRate, "retainedCustomers", "retained_customers") ??
      null,
    retentionCustomerBase:
      countFromFields(retentionRate, "customerBase", "customer_base") ??
      countFromFields(churnRate, "customerBase", "customer_base") ??
      null,
    retentionRiskScore:
      numberFromFields(retentionRisk, "score", "riskScore", "risk_score") ??
      null,
    retentionRiskAccounts:
      countFromFields(retentionRisk, "atRiskAccounts", "at_risk_accounts") ??
      null,
    retentionRiskEscalations:
      countFromFields(retentionRisk, "escalations", "escalationCount", "escalation_count") ??
      countFromFields(customerHealth, "escalations", "escalationCount", "escalation_count") ??
      null,
    retentionRiskBillingRiskAccounts:
      countFromFields(
        retentionRisk,
        "accountsWithBillingRisk",
        "accounts_with_billing_risk",
        "billingRiskAccounts",
        "billing_risk_accounts",
      ) ??
      countFromFields(
        customerHealth,
        "accountsWithBillingRisk",
        "accounts_with_billing_risk",
        "billingRiskAccounts",
        "billing_risk_accounts",
      ) ??
      null,
    retentionRiskLowUsageAccounts:
      countFromFields(retentionRisk, "lowUsageAccounts", "low_usage_accounts") ??
      countFromFields(customerHealth, "lowUsageAccounts", "low_usage_accounts") ??
      null,
    currency: currencyFrom(mrr, arr, totalRevenue, subscriptionRevenue, servicesRevenue, cashBalance, runway, netBurn, expenses, pipeline),
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
        value: summary.customers ?? summary.activeSubscriptions,
        direction: "higher",
        sourceMetricKey: summary.customers === null ? "revenue.active_subscriptions" : "revenue.customer_count",
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

function statusForNorthStar(
  summary: CompanyTrackerSummary,
  drivers: CompanyNorthStarDriver[],
): HealthBandStatus {
  if (summary.arr === null || summary.mrr === null) return "missing";
  if (drivers.some((driver) => driver.status === "risk")) return "risk";
  if (drivers.some((driver) => driver.status === "watch" || driver.status === "missing")) {
    return "watch";
  }
  return "strong";
}

function buildNorthStar(input: {
  summary: CompanyTrackerSummary;
  previousMrr: CanonicalMetricRow | null;
  healthBands: CompanyHealthBand[];
  metrics: CompanyTrackerMetric[];
}): CompanyNorthStar {
  const previousArr = numberValue(metricValueView(input.previousMrr?.value).arr);
  const netNewArr =
    input.summary.arr !== null && previousArr !== null
      ? input.summary.arr - previousArr
      : null;
  const metricsByKey = new Map(input.metrics.map((metric) => [metric.key, metric]));
  const drivers = input.healthBands.map((band) => ({
    id: band.id,
    label: band.label,
    value: band.value,
    unit: band.unit,
    status: band.status,
    detail: band.detail,
    ...northStarDriverEvidence(metricsByKey, band.sourceMetricKeys),
  }));

  return {
    id: "healthy_arr_growth",
    label: "Healthy ARR Growth",
    status: statusForNorthStar(input.summary, drivers),
    currentArr: input.summary.arr,
    currentMrr: input.summary.mrr,
    netNewArr,
    formula:
      "ARR growth interpreted through runway, burn multiple, pipeline coverage, activation, retention risk, goals, and source trust.",
    sourceMetricKeys: [
      "revenue.mrr",
      "finance.cash_runway_months",
      "finance.net_burn",
      "sales.qualified_pipeline",
    ],
    drivers,
  };
}

function northStarDriverEvidence(
  metricsByKey: Map<string, CompanyTrackerMetric>,
  sourceMetricKeys: string[],
): Pick<CompanyNorthStarDriver, "sourceLineageCount" | "sourceLineageKeys" | "latestSourceCapturedAt"> {
  const sourceKeys: string[] = [];
  const seenSourceKeys = new Set<string>();
  let sourceLineageCount = 0;
  let latestSourceCapturedAt: string | null = null;

  for (const metricKey of sourceMetricKeys) {
    const metric = metricsByKey.get(metricKey);
    if (!metric) continue;
    if (Number.isFinite(metric.sourceLineageCount) && metric.sourceLineageCount > 0) {
      sourceLineageCount += metric.sourceLineageCount;
    }
    for (const sourceKey of metric.sourceLineageKeys ?? []) {
      const trimmed = sourceKey.trim();
      if (!trimmed || seenSourceKeys.has(trimmed)) continue;
      seenSourceKeys.add(trimmed);
      sourceKeys.push(trimmed);
    }
    if (metric.latestSourceCapturedAt) {
      const timestamp = toDate(metric.latestSourceCapturedAt);
      const currentLatest = latestSourceCapturedAt ? toDate(latestSourceCapturedAt) : null;
      if (timestamp && (!currentLatest || timestamp.getTime() > currentLatest.getTime())) {
        latestSourceCapturedAt = timestamp.toISOString();
      }
    }
  }

  return {
    ...(sourceLineageCount > 0 ? { sourceLineageCount } : {}),
    ...(sourceKeys.length > 0 ? { sourceLineageKeys: sourceKeys } : {}),
    ...(latestSourceCapturedAt ? { latestSourceCapturedAt } : {}),
  };
}

function ratioStatus(value: number | null, strong: number, watch: number, direction: GoalDirection): HealthBandStatus {
  if (value === null) return "missing";
  if (direction === "higher") {
    if (value >= strong) return "strong";
    if (value >= watch) return "watch";
    return "risk";
  }
  if (value <= strong) return "strong";
  if (value <= watch) return "watch";
  return "risk";
}

function percentStatus(value: number | null, strong: number, watch: number): HealthBandStatus {
  return ratioStatus(value, strong, watch, "higher");
}

function roundDecimal(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function buildBenchmarkContext(input: {
  summary: CompanyTrackerSummary;
  northStar: CompanyNorthStar;
}): CompanyBenchmarkContext {
  const monthlyNetNewArr =
    input.northStar.netNewArr !== null && input.northStar.netNewArr > 0
      ? input.northStar.netNewArr / 12
      : null;
  const burnMultiple =
    input.summary.netBurn !== null && monthlyNetNewArr !== null && monthlyNetNewArr > 0
      ? roundDecimal(input.summary.netBurn / monthlyNetNewArr)
      : null;
  const pipelineCoverage =
    input.summary.qualifiedPipeline !== null && input.summary.mrr !== null && input.summary.mrr > 0
      ? roundDecimal(input.summary.qualifiedPipeline / (input.summary.mrr * 3))
      : null;
  const arpa =
    input.summary.mrr !== null && input.summary.activeSubscriptions !== null && input.summary.activeSubscriptions > 0
      ? input.summary.mrr / input.summary.activeSubscriptions
      : null;
  const conversionCac =
    input.summary.acquisitionSpend !== null && input.summary.conversions !== null && input.summary.conversions > 0
      ? input.summary.acquisitionSpend / input.summary.conversions
      : null;
  const grossMarginRate =
    input.summary.grossMargin !== null
      ? input.summary.grossMargin > 1
        ? input.summary.grossMargin / 100
        : input.summary.grossMargin
      : null;
  const cacPayback =
    conversionCac !== null && arpa !== null && grossMarginRate !== null && arpa * grossMarginRate > 0
      ? roundDecimal(conversionCac / (arpa * grossMarginRate))
      : null;
  const retentionRiskRate =
    input.summary.retentionRiskAccounts !== null && input.summary.customers !== null && input.summary.customers > 0
      ? roundDecimal((input.summary.retentionRiskAccounts / input.summary.customers) * 100, 1)
      : null;
  const demoScheduledRate =
    input.summary.scheduledDemos !== null && input.summary.requestedDemos !== null && input.summary.requestedDemos > 0
      ? roundDecimal((input.summary.scheduledDemos / input.summary.requestedDemos) * 100, 1)
      : null;

  return {
    items: [
      {
        id: "burn-multiple",
        label: "Burn Multiple",
        value: burnMultiple,
        unit: "ratio",
        status: ratioStatus(burnMultiple, 1, 2, "lower"),
        benchmark: "Strong <=1.0x; watch <=2.0x.",
        formula: "net burn / monthly net-new ARR",
        assumption: "Uses the current ARR delta as the monthly net-new ARR proxy when prior MRR is available.",
        sourceMetricKeys: ["finance.net_burn", "revenue.mrr"],
      },
      {
        id: "pipeline-coverage",
        label: "Pipeline Coverage",
        value: pipelineCoverage,
        unit: "ratio",
        status: ratioStatus(pipelineCoverage, 3, 1.5, "higher"),
        benchmark: "Strong >=3.0x next-quarter revenue run-rate; watch >=1.5x.",
        formula: "qualified pipeline / (MRR * 3)",
        assumption: "Uses current MRR as next-quarter revenue run-rate until explicit ARR target coverage is configured.",
        sourceMetricKeys: ["sales.qualified_pipeline", "revenue.mrr"],
      },
      {
        id: "cac-payback-proxy",
        label: "CAC Payback Proxy",
        value: cacPayback,
        unit: "months",
        status: ratioStatus(cacPayback, 12, 18, "lower"),
        benchmark: "Strong <=12 months; watch <=18 months.",
        formula: "(acquisition spend / conversions) / (ARPA * gross margin)",
        assumption: "Uses conversion count as a CAC proxy until closed-won cohort CAC is materialized.",
        sourceMetricKeys: ["marketing.pipeline_efficiency", "revenue.mrr", "finance.gross_margin"],
      },
      {
        id: "retention-rate",
        label: "Retention Rate",
        value: input.summary.retentionRate,
        unit: "percent",
        status: percentStatus(input.summary.retentionRate, 95, 90),
        benchmark: "Strong >=95%; watch >=90%.",
        formula: "retained customers / eligible customers",
        assumption: "Uses the canonical customer-success retention metric for the current reporting window.",
        sourceMetricKeys: ["customer_success.retention_rate"],
      },
    ],
    cohorts: [
      {
        id: "activation-cohort",
        label: "Activation Cohort",
        value: input.summary.activationRate,
        unit: "percent",
        status: percentStatus(input.summary.activationRate, 60, 40),
        detail: `${input.summary.activatedAccounts ?? 0} activated / ${input.summary.eligibleAccounts ?? 0} eligible`,
        formula: "activated accounts / eligible accounts",
        sourceMetricKeys: ["product.activation_rate"],
      },
      {
        id: "retention-risk-cohort",
        label: "Retention-Risk Cohort",
        value: retentionRiskRate,
        unit: "percent",
        status: ratioStatus(retentionRiskRate, 5, 15, "lower"),
        detail: `${input.summary.retentionRiskAccounts ?? 0} at-risk accounts / ${input.summary.customers ?? 0} customers`,
        formula: "at-risk accounts / active customers",
        sourceMetricKeys: ["customer_success.retention_risk", "revenue.customer_count"],
      },
      {
        id: "demo-scheduling-segment",
        label: "Demo Scheduling Segment",
        value: demoScheduledRate,
        unit: "percent",
        status: percentStatus(demoScheduledRate, 80, 50),
        detail: `${input.summary.scheduledDemos ?? 0} scheduled / ${input.summary.requestedDemos ?? 0} requested`,
        formula: "scheduled demos / requested demos",
        sourceMetricKeys: ["sales.demos"],
      },
      {
        id: "channel-efficiency-segment",
        label: "Channel Efficiency Segment",
        value: input.summary.pipelineEfficiency,
        unit: "ratio",
        status: ratioStatus(input.summary.pipelineEfficiency, 3, 1, "higher"),
        detail: `${input.summary.conversions ?? 0} conversions / ${input.summary.acquisitionSpend ?? 0} acquisition spend`,
        formula: "qualified pipeline / acquisition spend",
        sourceMetricKeys: ["marketing.pipeline_efficiency"],
      },
    ],
  };
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

function sourceLatestCapturedAt(
  analyticsStats: CompanyAnalyticsStats | null,
  sourceKey: string,
): string | null {
  const latest = snapshotKeysForSource(sourceKey)
    .map((snapshotKey) => analyticsStats?.snapshots.get(snapshotKey)?.capturedAt)
    .map(toDate)
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return latest ? latest.toISOString() : null;
}

function sourceSnapshotStatus(
  analyticsStats: CompanyAnalyticsStats | null,
  sourceKey: string,
  now: Date,
): SourceCoverageStatus | null {
  const latestSnapshot = analyticsStats?.statusSnapshotsBySource.get(sourceKey);
  if (!latestSnapshot) return null;
  if (latestSnapshot.status === "ERROR" || latestSnapshot.lastError) {
    return "error";
  }
  if ((toDate(latestSnapshot.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY) <
    now.getTime()) {
    return "stale";
  }
  if (
    latestSnapshot.status === "SUCCESS" &&
    latestSnapshot.payload !== null &&
    latestSnapshot.payload !== undefined
  ) {
    return "available";
  }
  return null;
}

function buildSourceCoverage(input: {
  dashboard: ImladrisDashboardDefinition;
  canonicalRows: CanonicalMetricRow[];
  analyticsStats: CompanyAnalyticsStats | null;
  now: Date;
}): CompanySourceCoverage[] {
  const canonicalSources = canonicalSourceKeys(input.canonicalRows);

  return input.dashboard.sourceKeys.map((sourceKey) => {
    const definition = REQUIRED_IMLADRIS_PROVIDERS.find((provider) => provider.key === sourceKey);
    const snapshotStatus = sourceSnapshotStatus(input.analyticsStats, sourceKey, input.now);
    const canonicalAvailable = canonicalSources.has(sourceKey);
    const status: SourceCoverageStatus =
      snapshotStatus ??
      (canonicalAvailable ? "available" : "missing");
    const lastCapturedAt = sourceHasSnapshot(input.analyticsStats, sourceKey)
      ? sourceLatestCapturedAt(input.analyticsStats, sourceKey)
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
  const healthBands = buildHealthBands({
    summary,
    currentMrr,
    previousMrr,
    goalProgress: goalProgressRows,
  });
  const northStar = buildNorthStar({
    summary,
    previousMrr,
    healthBands,
    metrics,
  });
  const benchmarkContext = buildBenchmarkContext({
    summary,
    northStar,
  });
  const sourceCoverage = buildSourceCoverage({
    dashboard,
    canonicalRows: typedCanonicalRows,
    analyticsStats,
    now,
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
    northStar,
    benchmarkContext,
    goalProgress: goalProgressRows,
    goalRecommendations,
    healthBands,
    sourceCoverage,
    boardReadiness,
    metrics,
    trust,
  };
}

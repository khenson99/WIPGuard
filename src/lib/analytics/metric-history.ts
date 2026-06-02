import { prisma } from "@/lib/prisma";
import type {
  AnalyticsDashboardData,
  AnalyticsMetricsLayer,
  AnalyticsSectionId,
} from "@/lib/analytics/types";
import { buildAnalyticsMetricsLayer } from "@/lib/analytics/kpis";
import { normalizePercentValue } from "@/lib/analytics/percentage-utils";

// ── Metric Definition Registry ──

interface MetricDefinition {
  key: string;
  section: AnalyticsSectionId;
  label: string;
  extract: (data: AnalyticsDashboardData) => number | null;
}

const computedMetricsCache = new WeakMap<AnalyticsDashboardData, AnalyticsMetricsLayer>();

function getCanonicalMetrics(data: AnalyticsDashboardData): AnalyticsMetricsLayer {
  if (data.metrics) return data.metrics;
  const cached = computedMetricsCache.get(data);
  if (cached) return cached;
  const metrics = buildAnalyticsMetricsLayer(data);
  computedMetricsCache.set(data, metrics);
  return metrics;
}

const METRIC_REGISTRY: MetricDefinition[] = [
  // Website traffic + social media
  { key: "ga.sessions30d", section: "website-traffic", label: "Sessions (30d)", extract: (d) => d.googleAnalytics?.sessions30d ?? null },
  { key: "ga.bounceRate", section: "website-traffic", label: "Bounce Rate", extract: (d) => d.googleAnalytics ? normalizePercentValue(d.googleAnalytics.bounceRate) : null },
  { key: "ga.users30d", section: "website-traffic", label: "Users (30d)", extract: (d) => d.googleAnalytics?.users30d ?? null },
  { key: "ga.pageviews30d", section: "website-traffic", label: "Pageviews (30d)", extract: (d) => d.googleAnalytics?.pageviews30d ?? null },
  { key: "ga.avgSessionDuration", section: "website-traffic", label: "Avg Session Duration", extract: (d) => d.googleAnalytics?.avgSessionDuration ?? null },
  { key: "googleAds.spend", section: "social-media", label: "Google Ads Spend", extract: (d) => d.googleAds?.totalSpend30d ?? null },
  { key: "googleAds.clicks", section: "social-media", label: "Google Ads Clicks", extract: (d) => d.googleAds?.totalClicks ?? null },
  { key: "googleAds.conversions", section: "social-media", label: "Google Ads Conversions", extract: (d) => d.googleAds?.totalConversions ?? null },
  { key: "googleAds.roas", section: "social-media", label: "Google Ads ROAS", extract: (d) => d.googleAds?.roas ?? null },
  { key: "metaAds.spend", section: "social-media", label: "Meta Ads Spend", extract: (d) => d.metaAds?.totalSpend30d ?? null },
  { key: "metaAds.clicks", section: "social-media", label: "Meta Ads Clicks", extract: (d) => d.metaAds?.totalClicks ?? null },

  // Finance
  { key: "stripe.mrr", section: "finance", label: "MRR", extract: (d) => getCanonicalMetrics(d).finance.summary.mrr },
  { key: "stripe.revenue30d", section: "finance", label: "Revenue (30d)", extract: (d) => getCanonicalMetrics(d).finance.summary.totalRevenue30d },
  { key: "stripe.revenueGrowth", section: "finance", label: "Revenue Growth %", extract: (d) => getCanonicalMetrics(d).finance.summary.revenueGrowth },
  { key: "stripe.churnRate", section: "finance", label: "Churn Rate", extract: (d) => getCanonicalMetrics(d).finance.summary.churnRatePct },
  { key: "stripe.activeSubscriptions", section: "finance", label: "Active Subscriptions", extract: (d) => getCanonicalMetrics(d).finance.summary.activeSubscriptions },
  { key: "mercury.runway", section: "finance", label: "Runway (months)", extract: (d) => getCanonicalMetrics(d).finance.summary.runwayMonths },
  { key: "mercury.burnRate", section: "finance", label: "Burn Rate", extract: (d) => getCanonicalMetrics(d).finance.summary.burnRate },
  { key: "mercury.totalBalance", section: "finance", label: "Total Balance", extract: (d) => getCanonicalMetrics(d).finance.summary.cashBalance },
  { key: "mercury.netCashFlow", section: "finance", label: "Net Cash Flow", extract: (d) => getCanonicalMetrics(d).finance.summary.netCashFlow30d },

  // Sales & Pipeline
  { key: "hubspot.totalDeals", section: "sales-pipeline", label: "Total Deals", extract: (d) => d.hubspot?.funnel?.totalDeals ?? null },
  { key: "hubspot.closedWon", section: "sales-pipeline", label: "Closed Won", extract: (d) => d.hubspot?.funnel?.closedWon ?? null },
  { key: "hubspot.winRate", section: "sales-pipeline", label: "Win Rate", extract: (d) => d.hubspot?.funnel?.winRate ?? null },
  { key: "hubspot.noShowRate", section: "sales-pipeline", label: "No-Show Rate", extract: (d) => d.hubspot?.funnel?.noShowRate ?? null },
  { key: "hubspot.avgDealSize", section: "sales-pipeline", label: "Avg Deal Size", extract: (d) => d.hubspot?.funnel?.avgDealSize ?? null },
  { key: "hubspot.demoScheduled", section: "sales-pipeline", label: "Demos Scheduled", extract: (d) => d.hubspot?.funnel?.demoScheduled ?? null },

  // Customer Success
  { key: "pylon.urgentConversations", section: "customer-success", label: "Urgent Conversations", extract: (d) => d.pylon?.urgentConversations ?? null },
  { key: "pylon.openConversations", section: "customer-success", label: "Open Conversations", extract: (d) => d.pylon?.openConversations ?? null },
  { key: "pylon.resolvedInRange", section: "customer-success", label: "Resolved In Range", extract: (d) => d.pylon?.resolvedInRange ?? null },
  { key: "product.deliveryBalance", section: "customer-success", label: "Delivery Balance", extract: (d) => d.product?.deliveryBalance ?? null },
  { key: "product.deliveryRate", section: "customer-success", label: "Delivery Rate", extract: (d) => d.product?.deliveryRate == null ? null : normalizePercentValue(d.product.deliveryRate) },
  { key: "product.cycleTimeRiskSignals", section: "customer-success", label: "Cycle-time Risk Signals", extract: (d) => d.product?.cycleTimeRiskSignals ?? null },
];

export function getMetricRegistry(): MetricDefinition[] {
  return METRIC_REGISTRY;
}

export function getMetricsBySection(section: AnalyticsSectionId): MetricDefinition[] {
  return METRIC_REGISTRY.filter((m) => m.section === section);
}

export function getMetricLabel(metricKey: string): string {
  return METRIC_REGISTRY.find((m) => m.key === metricKey)?.label ?? metricKey;
}

// ── Storage ──

type MetricHistoryDelegate = {
  createMany: (args: {
    data: Array<{
      userId: string;
      metricKey: string;
      section: string;
      value: number;
      periodStart: Date;
      periodEnd: Date;
      rangePreset: string;
    }>;
  }) => Promise<unknown>;
  findMany: (args: {
    where: Record<string, unknown>;
    orderBy: Record<string, "desc" | "asc">;
    take: number;
    select: { metricKey: true; value: true; periodEnd: true };
  }) => Promise<MetricHistoryRow[]>;
};

function getMetricHistoryDelegate(): MetricHistoryDelegate | null {
  const delegate = (prisma as unknown as { metricHistory?: MetricHistoryDelegate })
    .metricHistory;
  if (!delegate) {
    console.warn("[metric-history] Prisma client missing MetricHistory delegate");
    return null;
  }
  return delegate;
}

export async function extractAndStoreMetrics(
  userId: string,
  data: AnalyticsDashboardData,
  range: { preset: string; from: string; to: string },
): Promise<void> {
  const metricHistory = getMetricHistoryDelegate();
  if (!metricHistory) return;

  const rows: Array<{
    userId: string;
    metricKey: string;
    section: string;
    value: number;
    periodStart: Date;
    periodEnd: Date;
    rangePreset: string;
  }> = [];

  for (const def of METRIC_REGISTRY) {
    const value = def.extract(data);
    if (value !== null && Number.isFinite(value)) {
      rows.push({
        userId,
        metricKey: def.key,
        section: def.section,
        value,
        periodStart: new Date(range.from),
        periodEnd: new Date(range.to),
        rangePreset: range.preset,
      });
    }
  }

  if (rows.length === 0) return;

  await metricHistory.createMany({ data: rows });
}

// ── Query ──

export interface MetricHistoryRow {
  metricKey: string;
  value: number;
  periodEnd: Date;
}

export async function queryMetricHistory(
  userId: string,
  metricKey: string,
  opts?: { limit?: number; rangePreset?: string },
): Promise<MetricHistoryRow[]> {
  const metricHistory = getMetricHistoryDelegate();
  if (!metricHistory) return [];

  const limit = opts?.limit ?? 12;
  const rows = await metricHistory.findMany({
    where: {
      userId,
      metricKey,
      ...(opts?.rangePreset ? { rangePreset: opts.rangePreset } : {}),
    },
    orderBy: { periodEnd: "desc" },
    take: limit,
    select: { metricKey: true, value: true, periodEnd: true },
  });
  return rows.reverse();
}

export async function queryMetricHistoryBatch(
  userId: string,
  metricKeys: string[],
  opts?: { limit?: number; rangePreset?: string },
): Promise<Map<string, MetricHistoryRow[]>> {
  const metricHistory = getMetricHistoryDelegate();
  if (!metricHistory) {
    const empty = new Map<string, MetricHistoryRow[]>();
    for (const key of metricKeys) empty.set(key, []);
    return empty;
  }

  const limit = opts?.limit ?? 12;
  const rows = await metricHistory.findMany({
    where: {
      userId,
      metricKey: { in: metricKeys },
      ...(opts?.rangePreset ? { rangePreset: opts.rangePreset } : {}),
    },
    orderBy: { periodEnd: "desc" },
    take: limit * metricKeys.length,
    select: { metricKey: true, value: true, periodEnd: true },
  });

  const grouped = new Map<string, MetricHistoryRow[]>();
  for (const key of metricKeys) {
    grouped.set(key, []);
  }
  for (const row of rows) {
    grouped.get(row.metricKey)?.push(row);
  }
  // Reverse each group so oldest-first
  for (const [key, group] of grouped) {
    grouped.set(key, group.reverse().slice(-limit));
  }
  return grouped;
}

import { prisma } from "@/lib/prisma";
import type { AnalyticsDashboardData, AnalyticsSectionId } from "@/lib/analytics/types";

// ── Metric Definition Registry ──

interface MetricDefinition {
  key: string;
  section: AnalyticsSectionId;
  label: string;
  extract: (data: AnalyticsDashboardData) => number | null;
}

const METRIC_REGISTRY: MetricDefinition[] = [
  // Ads & Traffic
  { key: "ga.sessions30d", section: "ads-traffic", label: "Sessions (30d)", extract: (d) => d.googleAnalytics?.sessions30d ?? null },
  { key: "ga.bounceRate", section: "ads-traffic", label: "Bounce Rate", extract: (d) => d.googleAnalytics?.bounceRate ?? null },
  { key: "ga.users30d", section: "ads-traffic", label: "Users (30d)", extract: (d) => d.googleAnalytics?.users30d ?? null },
  { key: "ga.pageviews30d", section: "ads-traffic", label: "Pageviews (30d)", extract: (d) => d.googleAnalytics?.pageviews30d ?? null },
  { key: "ga.avgSessionDuration", section: "ads-traffic", label: "Avg Session Duration", extract: (d) => d.googleAnalytics?.avgSessionDuration ?? null },
  { key: "googleAds.spend", section: "ads-traffic", label: "Google Ads Spend", extract: (d) => d.googleAds?.totalSpend30d ?? null },
  { key: "googleAds.clicks", section: "ads-traffic", label: "Google Ads Clicks", extract: (d) => d.googleAds?.totalClicks ?? null },
  { key: "googleAds.conversions", section: "ads-traffic", label: "Google Ads Conversions", extract: (d) => d.googleAds?.totalConversions ?? null },
  { key: "googleAds.roas", section: "ads-traffic", label: "Google Ads ROAS", extract: (d) => d.googleAds?.roas ?? null },
  { key: "metaAds.spend", section: "ads-traffic", label: "Meta Ads Spend", extract: (d) => d.metaAds?.totalSpend30d ?? null },
  { key: "metaAds.clicks", section: "ads-traffic", label: "Meta Ads Clicks", extract: (d) => d.metaAds?.totalClicks ?? null },

  // Finance
  { key: "stripe.mrr", section: "finance", label: "MRR", extract: (d) => d.stripe?.revenue?.mrr ?? null },
  { key: "stripe.revenue30d", section: "finance", label: "Revenue (30d)", extract: (d) => d.stripe?.revenue?.totalRevenue30d ?? null },
  { key: "stripe.revenueGrowth", section: "finance", label: "Revenue Growth %", extract: (d) => d.stripe?.revenue?.revenueGrowth ?? null },
  { key: "stripe.churnRate", section: "finance", label: "Churn Rate", extract: (d) => d.stripe?.subscriptions?.churnRate ?? null },
  { key: "stripe.activeSubscriptions", section: "finance", label: "Active Subscriptions", extract: (d) => d.stripe?.subscriptions?.active ?? null },
  { key: "mercury.runway", section: "finance", label: "Runway (months)", extract: (d) => d.mercury?.cashFlow?.runway ?? null },
  { key: "mercury.burnRate", section: "finance", label: "Burn Rate", extract: (d) => d.mercury?.cashFlow?.burnRate ?? null },
  { key: "mercury.totalBalance", section: "finance", label: "Total Balance", extract: (d) => d.mercury?.cashFlow?.totalBalance ?? null },
  { key: "mercury.netCashFlow", section: "finance", label: "Net Cash Flow", extract: (d) => d.mercury?.cashFlow?.netCashFlow ?? null },

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
  { key: "product.backlogGrowth", section: "customer-success", label: "Backlog Growth", extract: (d) => d.product?.backlogGrowth ?? null },
  { key: "product.throughputRate", section: "customer-success", label: "Throughput Rate", extract: (d) => d.product?.throughputRate ?? null },
  { key: "product.overdueOpenTasks", section: "customer-success", label: "Overdue Tasks", extract: (d) => d.product?.overdueOpenTasks ?? null },
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

export async function extractAndStoreMetrics(
  userId: string,
  data: AnalyticsDashboardData,
  range: { preset: string; from: string; to: string },
): Promise<void> {
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

  await prisma.metricHistory.createMany({ data: rows });
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
  const limit = opts?.limit ?? 12;
  const rows = await prisma.metricHistory.findMany({
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
  const limit = opts?.limit ?? 12;
  const rows = await prisma.metricHistory.findMany({
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

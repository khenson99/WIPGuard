import { buildSubscriptionMrrBreakdown } from "@/lib/analytics/subscription-mrr";
import type {
  AnalyticsDashboardData,
  DealStage,
  DealsBySource,
  HubSpotData,
  HubSpotRepScoreboardRow,
  MercuryTransactionData,
  ProviderFreshness,
  RevenueDashboardData,
  RevenueDashboardTrustSource,
  RevenueDashboardWeeklyPoint,
  SalesPerformancePack,
} from "@/lib/analytics/types";

type HubSpotDeal = NonNullable<HubSpotData["deals"]>[number];

const TERMINAL_STAGE_LABELS = new Set(["Closed Won", "Closed Lost", "Unlikely", "Churn"]);
const QUALIFIED_STAGE_LABELS = new Set([
  "Demo Scheduled",
  "No-Show/Reschedule",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Free Trial",
  "Freemium",
  "Interested in a pilot",
]);

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function weekStartUtc(value: Date): string {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function emptyWeeklyPoint(week: string): RevenueDashboardWeeklyPoint {
  return {
    week,
    demosScheduled: 0,
    demosCompleted: 0,
    demoNoShows: 0,
    customersWon: 0,
    stripeRevenueCollected: 0,
    hubspotBookedRevenue: 0,
    mercuryInflows: 0,
    mercuryOutflows: 0,
    mercuryNetCashFlow: 0,
  };
}

function weeklyEntry(
  byWeek: Map<string, RevenueDashboardWeeklyPoint>,
  week: string,
): RevenueDashboardWeeklyPoint {
  const existing = byWeek.get(week);
  if (existing) return existing;
  const entry = emptyWeeklyPoint(week);
  byWeek.set(week, entry);
  return entry;
}

function closedWonDate(deal: HubSpotDeal): Date | null {
  const explicitClose = parseDate(deal.closedAt ?? null);
  if (explicitClose) return explicitClose;

  const stageHistoryClose = deal.stageHistory
    ?.filter((stage) => stage.stageLabel === "Closed Won")
    .map((stage) => parseDate(stage.occurredAt))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (stageHistoryClose) return stageHistoryClose;

  return deal.stageLabel === "Closed Won" ? parseDate(deal.updatedAt ?? deal.createdAt ?? null) : null;
}

function addDemoWeeklyTrend(
  byWeek: Map<string, RevenueDashboardWeeklyPoint>,
  data: AnalyticsDashboardData,
): void {
  for (const point of data.demoAnalytics?.weeklyTrend ?? []) {
    const date = parseDate(point.week);
    if (!date) continue;
    const entry = weeklyEntry(byWeek, weekStartUtc(date));
    entry.demosScheduled += point.scheduled;
    entry.demosCompleted += point.completed;
    entry.demoNoShows += point.noShows;
  }
}

function addHubSpotWeeklyRevenue(
  byWeek: Map<string, RevenueDashboardWeeklyPoint>,
  data: AnalyticsDashboardData,
): void {
  for (const deal of data.hubspot?.deals ?? []) {
    const closeDate = closedWonDate(deal);
    if (!closeDate) continue;
    const entry = weeklyEntry(byWeek, weekStartUtc(closeDate));
    entry.customersWon += 1;
    entry.hubspotBookedRevenue += deal.amount || 0;
  }
}

function addStripeWeeklyRevenue(
  byWeek: Map<string, RevenueDashboardWeeklyPoint>,
  data: AnalyticsDashboardData,
): void {
  for (const point of data.stripe?.revenueTrend ?? []) {
    const date = parseDate(point.month);
    if (!date) continue;
    const entry = weeklyEntry(byWeek, weekStartUtc(date));
    entry.stripeRevenueCollected += point.revenue || 0;
  }
}

function addMercuryWeeklyCashFlow(
  byWeek: Map<string, RevenueDashboardWeeklyPoint>,
  transactions: MercuryTransactionData[] | undefined,
): void {
  for (const transaction of transactions ?? []) {
    const postedAt = parseDate(transaction.postedAt);
    if (!postedAt || !Number.isFinite(transaction.amount)) continue;
    const amount = Math.abs(transaction.amount);
    const entry = weeklyEntry(byWeek, weekStartUtc(postedAt));
    if (transaction.amount >= 0) {
      entry.mercuryInflows += amount;
      entry.mercuryNetCashFlow += amount;
    } else {
      entry.mercuryOutflows += amount;
      entry.mercuryNetCashFlow -= amount;
    }
  }
}

function buildWeekly(data: AnalyticsDashboardData): RevenueDashboardWeeklyPoint[] {
  const byWeek = new Map<string, RevenueDashboardWeeklyPoint>();
  addDemoWeeklyTrend(byWeek, data);
  addHubSpotWeeklyRevenue(byWeek, data);
  addStripeWeeklyRevenue(byWeek, data);
  addMercuryWeeklyCashFlow(byWeek, data.mercury?.transactions);

  return Array.from(byWeek.values())
    .map((point) => ({
      ...point,
      stripeRevenueCollected: roundMoney(point.stripeRevenueCollected),
      hubspotBookedRevenue: roundMoney(point.hubspotBookedRevenue),
      mercuryInflows: roundMoney(point.mercuryInflows),
      mercuryOutflows: roundMoney(point.mercuryOutflows),
      mercuryNetCashFlow: roundMoney(point.mercuryNetCashFlow),
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function isOpenPipelineDeal(deal: HubSpotDeal): boolean {
  return !TERMINAL_STAGE_LABELS.has(deal.stageLabel);
}

function isQualifiedPipelineDeal(deal: HubSpotDeal): boolean {
  return isOpenPipelineDeal(deal) && QUALIFIED_STAGE_LABELS.has(deal.stageLabel);
}

function buildSalesPerformanceTotals(pack: SalesPerformancePack | null): {
  bookedValue: number;
  realizedValue30d: number;
  bookedToRealizedRatio30d: number | null;
} {
  const rows = pack?.repMonthRows ?? [];
  const bookedValue = rows.reduce((sum, row) => sum + row.signedDealsBookedValue, 0);
  const realizedValue30d = rows.reduce((sum, row) => sum + row.signedDealsRealizedValue30d, 0);
  return {
    bookedValue: roundMoney(bookedValue),
    realizedValue30d: roundMoney(realizedValue30d),
    bookedToRealizedRatio30d: bookedValue > 0 ? realizedValue30d / bookedValue : null,
  };
}

function buildPipeline(data: AnalyticsDashboardData): RevenueDashboardData["pipeline"] {
  const deals = data.hubspot?.deals ?? [];
  const openDeals = deals.filter(isOpenPipelineDeal);
  const qualifiedDeals = deals.filter(isQualifiedPipelineDeal);
  const salesTotals = buildSalesPerformanceTotals(data.salesPerformance);

  return {
    openPipelineValue: roundMoney(openDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0)),
    openPipelineCount: openDeals.length,
    qualifiedPipelineValue: roundMoney(qualifiedDeals.reduce((sum, deal) => sum + (deal.amount || 0), 0)),
    qualifiedPipelineCount: qualifiedDeals.length,
    stageBreakdown: ([...(data.hubspot?.funnel.stages ?? [])] as DealStage[]).map((stage) => ({ ...stage })),
    sourceBreakdown: ([...(data.hubspot?.funnel.dealsBySource ?? [])] as DealsBySource[]).map((source) => ({
      ...source,
    })),
    repScoreboard: ([...(data.hubspot?.repScoreboard ?? [])] as HubSpotRepScoreboardRow[]).map((row) => ({
      ...row,
    })),
    winRate: data.hubspot?.funnel.winRate ?? 0,
    effectiveWinRate: data.hubspot?.funnel.effectiveWinRate ?? 0,
    noShowRate: data.hubspot?.funnel.noShowRate ?? 0,
    avgDealSize: data.hubspot?.funnel.avgDealSize ?? 0,
    demoFollowUpCount: data.hubspot?.funnel.demoFollowUp ?? 0,
    ...salesTotals,
  };
}

function providerTrustSource(
  data: AnalyticsDashboardData,
  input: { key: RevenueDashboardTrustSource["key"]; label: string; present: boolean; meta?: { fetchedAt?: string; truncated?: boolean; truncatedResources?: string[] } | null },
): RevenueDashboardTrustSource {
  const freshness = data.freshness[input.key] as ProviderFreshness | undefined;
  return {
    key: input.key,
    label: input.label,
    status: freshness?.status ?? null,
    stale: Boolean(freshness?.stale),
    source: freshness?.source ?? "none",
    lastSyncedAt: freshness?.lastSyncedAt ?? null,
    lastSnapshotAt: freshness?.lastSnapshotAt ?? null,
    lastError: freshness?.lastError ?? null,
    fetchedAt: input.meta?.fetchedAt ?? null,
    truncated: Boolean(input.meta?.truncated),
    truncatedResources: input.meta?.truncatedResources ?? [],
  };
}

function buildTrust(data: AnalyticsDashboardData): RevenueDashboardData["trust"] {
  const sources = [
    providerTrustSource(data, {
      key: "hubspot",
      label: "HubSpot",
      present: Boolean(data.hubspot),
      meta: data.hubspot?._meta,
    }),
    providerTrustSource(data, {
      key: "stripe",
      label: "Stripe",
      present: Boolean(data.stripe),
      meta: data.stripe?._meta,
    }),
    providerTrustSource(data, {
      key: "mercury",
      label: "Mercury",
      present: Boolean(data.mercury),
      meta: data.mercury?._meta,
    }),
  ];
  const warnings: string[] = [];
  if (!data.hubspot) warnings.push("HubSpot data is unavailable.");
  if (!data.stripe) warnings.push("Stripe data is unavailable.");
  if (!data.mercury) warnings.push("Mercury data is unavailable.");
  for (const source of sources) {
    if (source.stale) warnings.push(`${source.label} data is stale.`);
    if (source.lastError) warnings.push(`${source.label}: ${source.lastError}`);
    if (source.truncated) {
      warnings.push(
        `${source.label} payload is truncated${
          source.truncatedResources.length ? ` (${source.truncatedResources.join(", ")})` : ""
        }.`,
      );
    }
  }

  return { sources, warnings };
}

export function buildRevenueDashboardData(data: AnalyticsDashboardData): RevenueDashboardData {
  const breakdown = buildSubscriptionMrrBreakdown({
    stripe: data.stripe,
    hubspot: data.hubspot,
  });
  const mercury = data.mercury?.cashFlow ?? null;

  return {
    summary: {
      activeSubscriptions: breakdown.mergedActiveSubscriptions,
      stripeActiveSubscriptions: breakdown.stripeActiveSubscriptions,
      hubspotActiveSubscriptions: breakdown.hubspotActiveSubscriptions,
      hubspotOnlyActiveSubscriptions: breakdown.hubspotOnlyActiveSubscriptions,
      mrr: breakdown.totalMrr,
      arr: breakdown.totalArr,
      stripeMrr: breakdown.stripeMrr,
      hubspotSubscriptionMrr: breakdown.hubspotSubscriptionMrr,
      hubspotOnlySubscriptionMrr: breakdown.hubspotOnlySubscriptionMrr,
      excludedLinkedHubspotSubscriptionMrr: breakdown.excludedLinkedHubspotSubscriptionMrr,
      cashBalance: mercury?.totalCash ?? mercury?.totalBalance ?? 0,
      bankCash: mercury?.bankCash ?? null,
      treasuryCash: mercury?.treasuryCash ?? null,
      runwayMonths: mercury?.runway ?? 0,
      burnRate: mercury?.burnRate ?? 0,
      netCashFlow30d: mercury?.netCashFlow ?? 0,
      inflows30d: mercury?.inflows30d ?? 0,
      outflows30d: mercury?.outflows30d ?? 0,
      paymentSuccessPct: data.stripe?.payments.successRate ?? 0,
      churnRatePct: data.stripe?.subscriptions.churnRate ?? 0,
    },
    weekly: buildWeekly(data),
    pipeline: buildPipeline(data),
    trust: buildTrust(data),
  };
}

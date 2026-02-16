import type {
  AnalyticsDashboardData,
  CrossFunnelAttribution,
  CrossFunnelData,
  FunnelDropoffRecord,
  FunnelInsight,
  FunnelTouchpoint,
} from "@/lib/analytics/types";

const STAGE_ORDER = [
  "Prospect",
  "Lead",
  "Demo Scheduled",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Subscription",
  "Closed Won",
] as const;

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function buildHighLevelStages(data: AnalyticsDashboardData): FunnelTouchpoint[] {
  const marketingCount =
    data.googleAnalytics?.users30d ??
    ((data.googleAds?.totalClicks ?? 0) + (data.metaAds?.totalClicks ?? 0) + (data.redditAds?.totalClicks ?? 0));
  const salesCount = data.hubspot?.funnel?.totalDeals ?? 0;
  const customerSuccessCount = data.stripe?.subscriptions?.active ?? 0;

  return [
    {
      stageId: "marketing",
      stageLabel: "Marketing",
      count: marketingCount,
      conversionFromPrevious: null,
    },
    {
      stageId: "sales",
      stageLabel: "Sales",
      count: salesCount,
      conversionFromPrevious: marketingCount > 0 ? toPct(salesCount, marketingCount) : null,
    },
    {
      stageId: "customer-success",
      stageLabel: "Customer Success",
      count: customerSuccessCount,
      conversionFromPrevious: salesCount > 0 ? toPct(customerSuccessCount, salesCount) : null,
    },
  ];
}

function buildDropoffRecords(data: AnalyticsDashboardData): FunnelDropoffRecord[] {
  const stages = data.hubspot?.funnel?.stages ?? [];
  const deals = data.hubspot?.deals ?? [];
  const byLabel = new Map(stages.map((stage) => [stage.label, stage]));
  const dropoffs: FunnelDropoffRecord[] = [];

  for (let idx = 0; idx < STAGE_ORDER.length - 1; idx += 1) {
    const fromLabel = STAGE_ORDER[idx];
    const toLabel = STAGE_ORDER[idx + 1];
    const from = byLabel.get(fromLabel);
    const to = byLabel.get(toLabel);
    if (!from || !to) continue;

    const dropped = Math.max(0, from.count - to.count);
    if (dropped <= 0) continue;

    const dropoffRate = toPct(dropped, from.count);
    const stageDeals = deals
      .filter((deal) => deal.stageLabel === fromLabel)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, Math.min(10, dropped));

    if (stageDeals.length === 0) {
      dropoffs.push({
        id: `${from.stageId}->${to.stageId}:aggregate`,
        fromStageId: from.stageId,
        fromStageLabel: from.label,
        toStageId: to.stageId,
        toStageLabel: to.label,
        droppedCount: dropped,
        dropoffRate,
        entityType: "deal",
        entityId: `${from.stageId}:aggregate`,
        entityName: `${from.label} aggregate drop-off`,
        owner: null,
        value: from.value,
        reason: `Stage conversion gap from ${from.label} to ${to.label}.`,
        source: "inferred",
        lastActivityAt: null,
      });
      continue;
    }

    for (const deal of stageDeals) {
      dropoffs.push({
        id: `${from.stageId}->${to.stageId}:${deal.dealId}`,
        fromStageId: from.stageId,
        fromStageLabel: from.label,
        toStageId: to.stageId,
        toStageLabel: to.label,
        droppedCount: 1,
        dropoffRate,
        entityType: "deal",
        entityId: deal.dealId,
        entityName: deal.dealName,
        owner: deal.ownerId,
        value: deal.amount,
        reason: `Deal has not progressed from ${from.label} to ${to.label}.`,
        source: "hubspot",
        lastActivityAt: deal.updatedAt,
      });
    }
  }

  return dropoffs.sort((a, b) => b.value - a.value);
}

function buildAttribution(data: AnalyticsDashboardData): CrossFunnelAttribution {
  const dealsBySource = data.hubspot?.funnel?.dealsBySource ?? [];
  const totalDeals = data.hubspot?.funnel?.totalDeals ?? 0;

  return {
    marketingSources: dealsBySource.map((source) => ({
      source: source.source,
      leads: source.count,
      deals: source.count,
      revenue: source.value,
      conversionRate: totalDeals > 0 ? toPct(source.count, totalDeals) : null,
    })),
  };
}

function buildInsights(data: AnalyticsDashboardData, dropoffs: FunnelDropoffRecord[]): FunnelInsight[] {
  const insights: FunnelInsight[] = [];

  const largestDrop = dropoffs[0];
  if (largestDrop) {
    insights.push({
      id: "dropoff-largest",
      severity: largestDrop.dropoffRate >= 35 ? "critical" : largestDrop.dropoffRate >= 20 ? "warning" : "info",
      headline: `Largest drop-off is ${largestDrop.fromStageLabel} → ${largestDrop.toStageLabel}`,
      detail: `Drop-off rate is ${largestDrop.dropoffRate.toFixed(1)}% with ${largestDrop.droppedCount} account(s) affected in this transition.`,
    });
  }

  const salesWinRate = data.hubspot?.funnel?.winRate ?? 0;
  if (salesWinRate < 25) {
    insights.push({
      id: "winrate-low",
      severity: "warning",
      headline: "Sales win rate is below target",
      detail: `Current win rate is ${salesWinRate.toFixed(1)}%; prioritize stage-specific qualification and follow-up automation.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "funnel-stable",
      severity: "info",
      headline: "Funnel is stable across current range",
      detail: "No severe drop-off concentration was detected in the selected period.",
    });
  }

  return insights;
}

export function buildCrossFunnelData(data: AnalyticsDashboardData): CrossFunnelData {
  const stages = buildHighLevelStages(data);
  const dropoffs = buildDropoffRecords(data);
  const attribution = buildAttribution(data);
  const insights = buildInsights(data, dropoffs);

  const narrative = [
    `Marketing volume: ${stages[0]?.count.toLocaleString() ?? 0}`,
    `Sales pipeline volume: ${stages[1]?.count.toLocaleString() ?? 0}`,
    `Customer-success active base: ${stages[2]?.count.toLocaleString() ?? 0}`,
    ...insights.map((insight) => insight.detail),
  ];

  return {
    stages,
    dropoffs,
    attribution,
    insights,
    narrative,
  };
}

import type { AnalyticsSectionId, CrossDomainCorrelation } from "@/lib/analytics/types";
import { type MetricHistoryRow, queryMetricHistoryBatch } from "@/lib/analytics/metric-history";
import { pearsonCorrelation } from "@/lib/analytics/stats";

interface CorrelationPair {
  metricA: string;
  metricB: string;
  sectionA: AnalyticsSectionId;
  sectionB: AnalyticsSectionId;
  interpretation: string;
}

const CORRELATION_PAIRS: CorrelationPair[] = [
  { metricA: "ga.sessions30d", metricB: "hubspot.totalDeals", sectionA: "ads-traffic", sectionB: "sales-pipeline", interpretation: "Traffic volume drives top-of-funnel deal creation" },
  { metricA: "googleAds.spend", metricB: "stripe.mrr", sectionA: "ads-traffic", sectionB: "finance", interpretation: "Ad spend effectiveness on recurring revenue" },
  { metricA: "ga.bounceRate", metricB: "hubspot.noShowRate", sectionA: "ads-traffic", sectionB: "sales-pipeline", interpretation: "Traffic quality correlates with demo attendance" },
  { metricA: "hubspot.winRate", metricB: "stripe.revenueGrowth", sectionA: "sales-pipeline", sectionB: "finance", interpretation: "Sales efficiency drives revenue growth" },
  { metricA: "hubspot.closedWon", metricB: "pylon.urgentConversations", sectionA: "sales-pipeline", sectionB: "customer-success", interpretation: "Rapid deal growth may increase support pressure" },
  { metricA: "stripe.churnRate", metricB: "pylon.urgentConversations", sectionA: "finance", sectionB: "customer-success", interpretation: "Support escalations may precede churn" },
  { metricA: "mercury.burnRate", metricB: "googleAds.spend", sectionA: "finance", sectionB: "ads-traffic", interpretation: "Burn rate influenced by marketing spend levels" },
  { metricA: "product.backlogGrowth", metricB: "stripe.churnRate", sectionA: "customer-success", sectionB: "finance", interpretation: "Growing backlog may drive customer churn" },
  { metricA: "metaAds.clicks", metricB: "hubspot.demoScheduled", sectionA: "ads-traffic", sectionB: "sales-pipeline", interpretation: "Meta ad engagement converts to demo bookings" },
  { metricA: "product.throughputRate", metricB: "pylon.resolvedInRange", sectionA: "customer-success", sectionB: "customer-success", interpretation: "Engineering throughput enables support resolution" },
];

export async function computeCorrelations(
  userId: string,
  opts?: { rangePreset?: string },
): Promise<CrossDomainCorrelation[]> {
  const allKeys = [...new Set(CORRELATION_PAIRS.flatMap((p) => [p.metricA, p.metricB]))];
  const historyMap = await queryMetricHistoryBatch(userId, allKeys, {
    limit: 12,
    rangePreset: opts?.rangePreset,
  });

  const results: CrossDomainCorrelation[] = [];

  for (const pair of CORRELATION_PAIRS) {
    const rowsA: MetricHistoryRow[] = historyMap.get(pair.metricA) ?? [];
    const rowsB: MetricHistoryRow[] = historyMap.get(pair.metricB) ?? [];

    if (rowsA.length < 4 || rowsB.length < 4) continue;

    // Align by taking the shorter series length
    const len = Math.min(rowsA.length, rowsB.length);
    const valuesA = rowsA.slice(-len).map((r) => r.value);
    const valuesB = rowsB.slice(-len).map((r) => r.value);

    const r = pearsonCorrelation(valuesA, valuesB);
    const significant = Math.abs(r) >= 0.5;

    results.push({
      metricA: pair.metricA,
      metricB: pair.metricB,
      sectionA: pair.sectionA,
      sectionB: pair.sectionB,
      correlation: Math.round(r * 100) / 100,
      interpretation: pair.interpretation,
      significant,
    });
  }

  return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

export function getSignificantCorrelations(correlations: CrossDomainCorrelation[]): CrossDomainCorrelation[] {
  return correlations.filter((c) => c.significant);
}

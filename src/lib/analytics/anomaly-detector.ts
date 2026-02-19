import type { AnalyticsDashboardData, AnalyticsSectionId, MetricAnomaly } from "@/lib/analytics/types";
import { type MetricHistoryRow, getMetricsBySection, getMetricLabel, queryMetricHistoryBatch } from "@/lib/analytics/metric-history";
import { mean, stdDev, zScore } from "@/lib/analytics/stats";

// ── Possible cause maps per metric key ──

const CAUSE_MAP: Record<string, string[]> = {
  "ga.bounceRate": ["Landing page mismatch with ad creative", "Slow page load times", "Traffic quality from new campaigns"],
  "ga.sessions30d": ["Campaign budget changes", "SEO ranking shifts", "Seasonal traffic patterns"],
  "googleAds.spend": ["Budget reallocation", "Bidding strategy changes", "New campaign launches"],
  "googleAds.roas": ["Audience targeting drift", "Creative fatigue", "Conversion tracking issues"],
  "stripe.mrr": ["Large account churn/upgrade", "Pricing changes", "Expansion revenue shifts"],
  "stripe.churnRate": ["Product issues", "Competitor pressure", "Onboarding degradation"],
  "mercury.runway": ["Burn rate acceleration", "Revenue decline", "Large one-time expense"],
  "mercury.burnRate": ["Hiring wave", "Infrastructure cost increase", "Marketing spend surge"],
  "hubspot.winRate": ["Sales process changes", "Lead quality shifts", "Competitive landscape"],
  "hubspot.noShowRate": ["Calendar invite issues", "Lead engagement decay", "Qualification standards"],
  "pylon.urgentConversations": ["Product bugs or outages", "Onboarding issues", "Feature gaps"],
  "product.backlogGrowth": ["Reduced engineering throughput", "Scope creep", "Dependency bottlenecks"],
};

function getCauses(metricKey: string): string[] {
  return CAUSE_MAP[metricKey] ?? ["Investigate underlying data sources for recent changes"];
}

// ── Anomaly detection per section ──

export async function detectSectionAnomalies(
  userId: string,
  section: AnalyticsSectionId,
  data: AnalyticsDashboardData,
  opts?: { rangePreset?: string },
): Promise<MetricAnomaly[]> {
  const metrics = getMetricsBySection(section);
  const metricKeys = metrics.map((m) => m.key);

  const historyMap = await queryMetricHistoryBatch(userId, metricKeys, {
    limit: 12,
    rangePreset: opts?.rangePreset,
  });

  const anomalies: MetricAnomaly[] = [];

  for (const def of metrics) {
    const rows: MetricHistoryRow[] = historyMap.get(def.key) ?? [];
    if (rows.length < 4) continue;

    const values = rows.map((r) => r.value);
    const currentValue = def.extract(data);
    if (currentValue === null || !Number.isFinite(currentValue)) continue;

    const m = mean(values);
    const sd = stdDev(values);
    if (sd === 0) continue;

    const z = zScore(currentValue, m, sd);
    const absZ = Math.abs(z);
    if (absZ < 2.0) continue;

    anomalies.push({
      metricKey: def.key,
      section,
      label: getMetricLabel(def.key),
      currentValue,
      expectedValue: m,
      zScore: Math.round(z * 100) / 100,
      direction: z > 0 ? "above" : "below",
      severity: absZ >= 3.0 ? "critical" : "warning",
      possibleCauses: getCauses(def.key),
      history: values,
    });
  }

  return anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

export async function detectAllAnomalies(
  userId: string,
  data: AnalyticsDashboardData,
  opts?: { rangePreset?: string },
): Promise<Record<AnalyticsSectionId, MetricAnomaly[]>> {
  const sections: AnalyticsSectionId[] = ["ads-traffic", "finance", "sales-pipeline", "customer-success", "customer-journey", "demo-analytics", "process-analytics"];
  const results = await Promise.all(sections.map((s) => detectSectionAnomalies(userId, s, data, opts)));

  return {
    "ads-traffic": results[0],
    finance: results[1],
    "sales-pipeline": results[2],
    "customer-success": results[3],
    "customer-journey": results[4],
    "demo-analytics": results[5],
    "process-analytics": results[6],
  };
}

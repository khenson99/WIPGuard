import type { AnalyticsDashboardData, AnalyticsSectionId, MetricForecast } from "@/lib/analytics/types";
import { type MetricHistoryRow, getMetricsBySection, getMetricLabel, queryMetricHistoryBatch } from "@/lib/analytics/metric-history";
import { exponentialSmoothing, linearRegression, computeConfidence } from "@/lib/analytics/stats";

function determineTrend(slope: number, rSquared: number): { direction: MetricForecast["trendDirection"]; strength: number } {
  if (rSquared < 0.15 || Math.abs(slope) < 0.001) return { direction: "flat", strength: 0 };
  const strength = Math.min(1, Math.abs(slope) * rSquared * 10);
  return { direction: slope > 0 ? "up" : "down", strength: Math.round(strength * 100) / 100 };
}

export async function forecastSectionMetrics(
  userId: string,
  section: AnalyticsSectionId,
  data: AnalyticsDashboardData,
  opts?: { rangePreset?: string },
): Promise<MetricForecast[]> {
  const metrics = getMetricsBySection(section);
  const metricKeys = metrics.map((m) => m.key);

  const historyMap = await queryMetricHistoryBatch(userId, metricKeys, {
    limit: 12,
    rangePreset: opts?.rangePreset,
  });

  const forecasts: MetricForecast[] = [];

  for (const def of metrics) {
    const rows: MetricHistoryRow[] = historyMap.get(def.key) ?? [];
    if (rows.length < 3) continue;

    const values = rows.map((r) => r.value);
    const currentValue = def.extract(data);
    if (currentValue === null || !Number.isFinite(currentValue)) continue;

    const holt = exponentialSmoothing(values, 0.3, 0.1, 30);
    const points = values.map((v, i) => ({ x: i, y: v }));
    const regression = linearRegression(points);
    const { direction, strength } = determineTrend(regression.slope, regression.rSquared);

    const confidence = computeConfidence({
      dataCompleteness: 1.0,
      dataFreshness: data.staleDomains.length === 0 ? 1.0 : 0.6,
      historicalDepth: Math.min(values.length / 12, 1),
      crossDomainAgreement: 0.7,
    });

    forecasts.push({
      metricKey: def.key,
      section,
      label: getMetricLabel(def.key),
      currentValue,
      trendDirection: direction,
      trendStrength: strength,
      forecast7d: holt.forecast.slice(0, 7),
      forecast30d: holt.forecast,
      history: values,
      confidence,
    });
  }

  return forecasts;
}

export async function forecastAllMetrics(
  userId: string,
  data: AnalyticsDashboardData,
  opts?: { rangePreset?: string },
): Promise<Record<AnalyticsSectionId, MetricForecast[]>> {
  const sections: AnalyticsSectionId[] = ["ads-traffic", "finance", "sales-pipeline", "customer-success", "customer-journey", "demo-analytics", "process-analytics"];
  const results = await Promise.all(sections.map((s) => forecastSectionMetrics(userId, s, data, opts)));

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

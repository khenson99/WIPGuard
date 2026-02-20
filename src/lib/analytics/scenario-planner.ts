import type { AnalyticsSectionId, MetricForecast, ScenarioPlan, ScenarioOutcome } from "@/lib/analytics/types";
import { stdDev } from "@/lib/analytics/stats";

interface ScenarioTemplate {
  id: string;
  section: AnalyticsSectionId;
  title: string;
  metrics: string[];
}

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  { id: "ads-efficiency", section: "ads-traffic", title: "Ad Channel Efficiency", metrics: ["ga.sessions30d", "googleAds.roas", "ga.bounceRate"] },
  { id: "revenue-trajectory", section: "finance", title: "Revenue Trajectory", metrics: ["stripe.mrr", "stripe.revenueGrowth", "mercury.runway"] },
  { id: "pipeline-conversion", section: "sales-pipeline", title: "Pipeline Conversion", metrics: ["hubspot.winRate", "hubspot.noShowRate", "hubspot.closedWon"] },
  { id: "cs-pressure", section: "customer-success", title: "Customer Success Pressure", metrics: ["pylon.urgentConversations", "product.backlogGrowth", "product.throughputRate"] },
];

function buildOutcome(forecast: MetricForecast, sigma: number): ScenarioOutcome {
  const sd = stdDev(forecast.history);
  const projected = forecast.forecast30d.length > 0
    ? forecast.forecast30d[forecast.forecast30d.length - 1].value + sigma * sd
    : forecast.currentValue + sigma * sd;

  const delta = forecast.currentValue !== 0
    ? `${((projected - forecast.currentValue) / Math.abs(forecast.currentValue) * 100).toFixed(1)}%`
    : "n/a";

  return {
    label: forecast.label,
    metricKey: forecast.metricKey,
    current: Math.round(forecast.currentValue * 100) / 100,
    projected: Math.round(projected * 100) / 100,
    delta,
  };
}

export function buildSectionScenarios(
  section: AnalyticsSectionId,
  forecasts: MetricForecast[],
): ScenarioPlan[] {
  const templates = SCENARIO_TEMPLATES.filter((t) => t.section === section);
  const forecastMap = new Map(forecasts.map((f) => [f.metricKey, f]));

  return templates
    .map((template) => {
      const relevant = template.metrics
        .map((key) => forecastMap.get(key))
        .filter((f): f is MetricForecast => f !== undefined && f.history.length >= 3);

      if (relevant.length === 0) return null;

      return {
        id: template.id,
        section: template.section,
        title: template.title,
        best: relevant.map((f) => buildOutcome(f, 1.0)),
        expected: relevant.map((f) => buildOutcome(f, 0)),
        worst: relevant.map((f) => buildOutcome(f, -1.0)),
      };
    })
    .filter((s): s is ScenarioPlan => s !== null);
}

export function buildAllScenarios(
  forecastsBySection: Record<AnalyticsSectionId, MetricForecast[]>,
): Record<AnalyticsSectionId, ScenarioPlan[]> {
  return {
    "ads-traffic": buildSectionScenarios("ads-traffic", forecastsBySection["ads-traffic"]),
    finance: buildSectionScenarios("finance", forecastsBySection.finance),
    "sales-pipeline": buildSectionScenarios("sales-pipeline", forecastsBySection["sales-pipeline"]),
    "customer-success": buildSectionScenarios("customer-success", forecastsBySection["customer-success"]),
    "customer-journey": buildSectionScenarios("customer-journey", forecastsBySection["customer-journey"]),
    "demo-analytics": buildSectionScenarios("demo-analytics", forecastsBySection["demo-analytics"]),
    "process-analytics": buildSectionScenarios("process-analytics", forecastsBySection["process-analytics"]),
  };
}

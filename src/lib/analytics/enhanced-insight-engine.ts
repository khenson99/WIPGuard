import type {
  AnalyticsDashboardData,
  AnalyticsSectionId,
  CrossDomainInsights,
  DiscussionQuestion,
  EnhancedInsightsBundle,
  EnhancedRecommendation,
  EnhancedSectionInsights,
  HealthCheck,
  MetricAnomaly,
  MetricForecast,
  RootCauseAnalysis,
  SectionNarrative,
} from "@/lib/analytics/types";
import { buildAiInsightsBundle } from "@/lib/analytics/insight-engine";
import { detectAllAnomalies } from "@/lib/analytics/anomaly-detector";
import { forecastAllMetrics } from "@/lib/analytics/forecaster";
import { buildAllScenarios } from "@/lib/analytics/scenario-planner";
import { computeCorrelations, getSignificantCorrelations } from "@/lib/analytics/correlation-engine";
import { getFlowSignals } from "@/lib/analytics/flow-intelligence-bridge";
import { getMetricLabel } from "@/lib/analytics/metric-history";

const ALL_SECTIONS: AnalyticsSectionId[] = ["ads-traffic", "finance", "sales-pipeline", "customer-success"];

// ── Health Checks ──

interface ThresholdDef {
  metricKey: string;
  section: AnalyticsSectionId;
  warning: number;
  critical: number;
  direction: "above" | "below";
}

const HEALTH_THRESHOLDS: ThresholdDef[] = [
  { metricKey: "ga.bounceRate", section: "ads-traffic", warning: 0.55, critical: 0.70, direction: "above" },
  { metricKey: "googleAds.roas", section: "ads-traffic", warning: 2.0, critical: 1.0, direction: "below" },
  { metricKey: "mercury.runway", section: "finance", warning: 6, critical: 4, direction: "below" },
  { metricKey: "stripe.churnRate", section: "finance", warning: 5, critical: 10, direction: "above" },
  { metricKey: "hubspot.noShowRate", section: "sales-pipeline", warning: 15, critical: 25, direction: "above" },
  { metricKey: "hubspot.winRate", section: "sales-pipeline", warning: 20, critical: 10, direction: "below" },
  { metricKey: "pylon.urgentConversations", section: "customer-success", warning: 10, critical: 20, direction: "above" },
  { metricKey: "product.backlogGrowth", section: "customer-success", warning: 5, critical: 15, direction: "above" },
];

function buildHealthChecks(
  section: AnalyticsSectionId,
  forecasts: MetricForecast[],
  data: AnalyticsDashboardData,
): HealthCheck[] {
  const defs = HEALTH_THRESHOLDS.filter((t) => t.section === section);
  const forecastMap = new Map(forecasts.map((f) => [f.metricKey, f]));

  return defs.map((def) => {
    const fc = forecastMap.get(def.metricKey);
    const current = fc?.currentValue ?? 0;
    const forecast7d = fc?.forecast7d?.[6]?.value ?? current;

    let status: HealthCheck["status"] = "green";
    if (def.direction === "above") {
      if (current >= def.critical) status = "red";
      else if (current >= def.warning) status = "yellow";
    } else {
      if (current <= def.critical) status = "red";
      else if (current <= def.warning) status = "yellow";
    }

    let forecastWarning = false;
    if (status === "green" && fc) {
      if (def.direction === "above" && forecast7d >= def.warning) forecastWarning = true;
      if (def.direction === "below" && forecast7d <= def.warning) forecastWarning = true;
    }

    const note = forecastWarning
      ? `Currently ${status} but forecast suggests approaching ${def.direction === "above" ? "warning" : "warning"} threshold within 7d`
      : status === "red"
        ? `${getMetricLabel(def.metricKey)} has breached the critical threshold`
        : status === "yellow"
          ? `${getMetricLabel(def.metricKey)} is nearing the critical threshold`
          : `${getMetricLabel(def.metricKey)} is within healthy range`;

    return {
      metricKey: def.metricKey,
      section,
      label: getMetricLabel(def.metricKey),
      status,
      currentValue: Math.round(current * 100) / 100,
      threshold: { warning: def.warning, critical: def.critical },
      forecastWarning,
      note,
    };
  });
}

// ── Discussion Questions ──

function buildQuestions(
  section: AnalyticsSectionId,
  anomalies: MetricAnomaly[],
  forecasts: MetricForecast[],
): DiscussionQuestion[] {
  const questions: DiscussionQuestion[] = [];
  let idx = 0;

  for (const anomaly of anomalies.slice(0, 2)) {
    questions.push({
      id: `q-${section}-anom-${idx++}`,
      section,
      question: `${anomaly.label} is ${anomaly.direction === "above" ? "significantly above" : "significantly below"} its expected range (z=${anomaly.zScore.toFixed(1)}). What changed recently that could explain this?`,
      context: `Current: ${anomaly.currentValue.toFixed(2)}, Expected: ${anomaly.expectedValue.toFixed(2)}`,
      triggeringMetrics: [anomaly.metricKey],
    });
  }

  const decliningForecasts = forecasts.filter((f) => f.trendDirection === "down" && f.trendStrength > 0.3);
  for (const fc of decliningForecasts.slice(0, 1)) {
    questions.push({
      id: `q-${section}-trend-${idx++}`,
      section,
      question: `${fc.label} is trending downward. Should we proactively adjust strategy or is this expected seasonality?`,
      context: `Trend strength: ${(fc.trendStrength * 100).toFixed(0)}%, 30d forecast: ${fc.forecast30d[fc.forecast30d.length - 1]?.value.toFixed(1) ?? "n/a"}`,
      triggeringMetrics: [fc.metricKey],
    });
  }

  return questions;
}

// ── Enhanced Recommendations ──

function buildRecommendations(
  section: AnalyticsSectionId,
  anomalies: MetricAnomaly[],
  forecasts: MetricForecast[],
  healthChecks: HealthCheck[],
): EnhancedRecommendation[] {
  const recs: EnhancedRecommendation[] = [];
  let idx = 0;

  const redChecks = healthChecks.filter((h) => h.status === "red");
  for (const check of redChecks.slice(0, 2)) {
    const fc = forecasts.find((f) => f.metricKey === check.metricKey);
    const projected = fc?.forecast30d?.[fc.forecast30d.length - 1]?.value;
    const delta = projected && check.currentValue !== 0
      ? `${(((projected - check.currentValue) / Math.abs(check.currentValue)) * 100).toFixed(1)}% projected change in 30d`
      : "Insufficient data for projection";

    recs.push({
      id: `rec-${section}-health-${idx++}`,
      section,
      title: `Address ${check.label} critical breach`,
      description: check.note,
      expectedImpact: `Restoring ${check.label} to healthy range would reduce cross-functional risk.`,
      projectedDelta: delta,
      priority: "P0",
      effort: "medium",
      actions: [{
        type: "create_task",
        label: `Create remediation plan for ${check.label}`,
        payload: { title: `${check.label} remediation`, priority: "P0", status: "WORKING_ON_TODAY" },
      }],
    });
  }

  for (const anomaly of anomalies.filter((a) => a.severity === "critical").slice(0, 1)) {
    recs.push({
      id: `rec-${section}-anom-${idx++}`,
      section,
      title: `Investigate ${anomaly.label} anomaly`,
      description: `${anomaly.label} is ${anomaly.direction === "above" ? "above" : "below"} expected range (z=${anomaly.zScore.toFixed(1)}). ${anomaly.possibleCauses[0] ?? ""}`,
      expectedImpact: "Early investigation prevents cascading effects across connected metrics.",
      projectedDelta: `Current deviation: ${((anomaly.currentValue - anomaly.expectedValue) / Math.abs(anomaly.expectedValue) * 100).toFixed(1)}% from expected`,
      priority: "P1",
      effort: "low",
      actions: [{
        type: "create_task",
        label: `Root cause analysis: ${anomaly.label}`,
        payload: { title: `Investigate ${anomaly.label} deviation`, priority: "P1", status: "QUEUED" },
      }],
    });
  }

  const forecastWarnings = healthChecks.filter((h) => h.forecastWarning);
  for (const warning of forecastWarnings.slice(0, 1)) {
    recs.push({
      id: `rec-${section}-forecast-${idx++}`,
      section,
      title: `Preempt ${warning.label} threshold breach`,
      description: `${warning.label} is currently healthy but forecast suggests it will cross the warning threshold within 7 days.`,
      expectedImpact: "Proactive intervention is cheaper than reactive recovery.",
      projectedDelta: "Approaching warning threshold in ~7d",
      priority: "P1",
      effort: "low",
      actions: [{
        type: "create_task",
        label: `Preventive action for ${warning.label}`,
        payload: { title: `Prevent ${warning.label} degradation`, priority: "P1", status: "QUEUED" },
      }],
    });
  }

  return recs;
}

// ── Root Cause Analysis ──

function buildRootCauses(
  section: AnalyticsSectionId,
  anomalies: MetricAnomaly[],
  correlations: { metricA: string; metricB: string; correlation: number; interpretation: string }[],
): RootCauseAnalysis[] {
  if (anomalies.length === 0) return [];

  return anomalies.slice(0, 2).map((anomaly) => {
    const related = correlations.filter(
      (c) => (c.metricA === anomaly.metricKey || c.metricB === anomaly.metricKey) && Math.abs(c.correlation) >= 0.5,
    );

    return {
      insightId: `rca-${anomaly.metricKey}`,
      section,
      summary: `${anomaly.label} deviation (z=${anomaly.zScore.toFixed(1)}) may be driven by: ${anomaly.possibleCauses.slice(0, 2).join("; ")}`,
      contributingFactors: anomaly.possibleCauses.map((cause) => ({
        source: anomaly.metricKey.split(".")[0],
        metric: anomaly.label,
        contribution: cause,
      })),
      correlatedAnomalies: related.map((r) =>
        r.metricA === anomaly.metricKey ? r.metricB : r.metricA,
      ),
    };
  });
}

// ── Section Narrative ──

function buildNarrative(
  section: AnalyticsSectionId,
  anomalies: MetricAnomaly[],
  healthChecks: HealthCheck[],
  forecasts: MetricForecast[],
): SectionNarrative {
  const SECTION_LABELS: Record<AnalyticsSectionId, string> = {
    "ads-traffic": "Ads & Traffic",
    finance: "Finance",
    "sales-pipeline": "Sales & Pipeline",
    "customer-success": "Customer Success",
    "customer-journey": "Customer Journey",
    "demo-analytics": "Demo Analytics",
    "process-analytics": "Process Analytics",
  };

  const redCount = healthChecks.filter((h) => h.status === "red").length;
  const yellowCount = healthChecks.filter((h) => h.status === "yellow").length;
  const criticalAnomalies = anomalies.filter((a) => a.severity === "critical").length;
  const decliningCount = forecasts.filter((f) => f.trendDirection === "down" && f.trendStrength > 0.3).length;

  let headline: string;
  if (redCount > 0 || criticalAnomalies > 0) {
    headline = `${SECTION_LABELS[section]}: Immediate attention needed`;
  } else if (yellowCount > 0 || decliningCount > 0) {
    headline = `${SECTION_LABELS[section]}: Trending toward risk`;
  } else {
    headline = `${SECTION_LABELS[section]}: Operating within guardrails`;
  }

  const parts: string[] = [];
  if (redCount > 0) parts.push(`${redCount} metric${redCount > 1 ? "s" : ""} in critical range`);
  if (criticalAnomalies > 0) parts.push(`${criticalAnomalies} statistical anomal${criticalAnomalies > 1 ? "ies" : "y"} detected`);
  if (yellowCount > 0) parts.push(`${yellowCount} approaching warning thresholds`);
  if (decliningCount > 0) parts.push(`${decliningCount} metric${decliningCount > 1 ? "s" : ""} showing downward trend`);
  if (parts.length === 0) parts.push("All monitored metrics are within expected ranges");

  return { section, headline, body: parts.join(". ") + "." };
}

// ── Cross-Domain Overview ──

function buildCrossDomainInsights(
  sectionInsights: Record<AnalyticsSectionId, EnhancedSectionInsights>,
  correlations: Awaited<ReturnType<typeof computeCorrelations>>,
  flowSignals: Awaited<ReturnType<typeof getFlowSignals>>,
): CrossDomainInsights {
  const overallHealth: Record<AnalyticsSectionId, "green" | "yellow" | "red"> = {} as Record<AnalyticsSectionId, "green" | "yellow" | "red">;

  const topRisks: CrossDomainInsights["topRisks"] = [];

  for (const section of ALL_SECTIONS) {
    const si = sectionInsights[section];
    const hasRed = si.healthChecks.some((h) => h.status === "red");
    const hasCriticalAnomaly = si.anomalies.some((a) => a.severity === "critical");
    const hasYellow = si.healthChecks.some((h) => h.status === "yellow");

    if (hasRed || hasCriticalAnomaly) {
      overallHealth[section] = "red";
    } else if (hasYellow || si.anomalies.length > 0) {
      overallHealth[section] = "yellow";
    } else {
      overallHealth[section] = "green";
    }
  }

  // Cross-section risks from significant correlations between red/yellow sections
  const significant = getSignificantCorrelations(correlations);
  for (const corr of significant.slice(0, 3)) {
    const healthA = overallHealth[corr.sectionA];
    const healthB = overallHealth[corr.sectionB];
    if (healthA !== "green" || healthB !== "green") {
      topRisks.push({
        title: corr.interpretation,
        severity: healthA === "red" || healthB === "red" ? "critical" : "warning",
        sections: [corr.sectionA, corr.sectionB],
      });
    }
  }

  // Flow intelligence risks
  if (flowSignals && flowSignals.chronicBlockerCount > 2) {
    topRisks.push({
      title: `${flowSignals.chronicBlockerCount} chronic blockers detected in execution flow`,
      severity: flowSignals.chronicBlockerCount > 5 ? "critical" : "warning",
      sections: ["customer-success", "sales-pipeline"],
    });
  }

  const redSections = ALL_SECTIONS.filter((s) => overallHealth[s] === "red");
  const yellowSections = ALL_SECTIONS.filter((s) => overallHealth[s] === "yellow");

  let narrative: string;
  if (redSections.length > 0) {
    narrative = `Critical issues in ${redSections.length} section${redSections.length > 1 ? "s" : ""} require immediate attention. ${topRisks.length > 0 ? `${topRisks.length} cross-domain risk${topRisks.length > 1 ? "s" : ""} identified.` : ""}`;
  } else if (yellowSections.length > 0) {
    narrative = `${yellowSections.length} section${yellowSections.length > 1 ? "s" : ""} trending toward risk. Monitor closely and consider preemptive action.`;
  } else {
    narrative = "All sections operating within healthy parameters. Consider using this window for growth experiments.";
  }

  return { topRisks, correlations: significant, overallHealth, narrative };
}

// ── Main Orchestrator ──

export async function buildEnhancedInsightsBundle(
  userId: string,
  data: AnalyticsDashboardData,
  range: { preset: string; from: string; to: string },
): Promise<EnhancedInsightsBundle> {
  // Build legacy bundle for backward compatibility
  const legacyBundle = buildAiInsightsBundle(data);

  // Run all async modules in parallel
  const [anomaliesBySection, forecastsBySection, correlations, flowSignals] = await Promise.all([
    detectAllAnomalies(userId, data, { rangePreset: range.preset }),
    forecastAllMetrics(userId, data, { rangePreset: range.preset }),
    computeCorrelations(userId, { rangePreset: range.preset }),
    getFlowSignals(),
  ]);

  // Build scenarios from forecasts (pure CPU, no async)
  const scenariosBySection = buildAllScenarios(forecastsBySection);

  // Build per-section enhanced insights
  const sections: Record<AnalyticsSectionId, EnhancedSectionInsights> = {} as Record<AnalyticsSectionId, EnhancedSectionInsights>;

  for (const section of ALL_SECTIONS) {
    const anomalies = anomaliesBySection[section];
    const forecasts = forecastsBySection[section];
    const healthChecks = buildHealthChecks(section, forecasts, data);
    const recommendations = buildRecommendations(section, anomalies, forecasts, healthChecks);
    const questions = buildQuestions(section, anomalies, forecasts);
    const rootCauses = buildRootCauses(section, anomalies, correlations);
    const narrative = buildNarrative(section, anomalies, healthChecks, forecasts);

    sections[section] = {
      section,
      narrative,
      anomalies,
      forecasts,
      healthChecks,
      recommendations,
      questions,
      scenarios: scenariosBySection[section],
      rootCauses,
    };
  }

  const crossDomain = buildCrossDomainInsights(sections, correlations, flowSignals);

  return {
    ...legacyBundle,
    sections,
    crossDomain,
  };
}

import { computeDecisionDashboard } from "@/lib/analytics/decision-dashboard";
import { computeFlowRiskIntelligence } from "@/lib/flow/risk-intelligence";

export interface FlowSignals {
  flowReliabilityScore: number;
  throughputTrend: "improving" | "declining" | "stable";
  wipBreaches: number;
  overloadedPeople: number;
  chronicBlockerCount: number;
  fixedDateRisks: number;
  topRecommendations: Array<{ title: string; severity: string }>;
}

export async function getFlowSignals(): Promise<FlowSignals | null> {
  try {
    const [dashboardReport, riskReport] = await Promise.all([
      computeDecisionDashboard(),
      computeFlowRiskIntelligence({}),
    ]);

    const north = dashboardReport.northStar;
    const flowReliabilityScore = north.flowReliabilityScore ?? 0;

    // Determine throughput trend from monthly export
    const months = dashboardReport.monthlyExport?.rows ?? [];
    let throughputTrend: FlowSignals["throughputTrend"] = "stable";
    if (months.length >= 2) {
      const recent = months[months.length - 1].completed;
      const previous = months[months.length - 2].completed;
      if (recent > previous * 1.1) throughputTrend = "improving";
      else if (recent < previous * 0.9) throughputTrend = "declining";
    }

    const wipBreaches =
      riskReport.wipPressure.people.filter((p) => p.overloaded).length +
      riskReport.wipPressure.columns.filter((c) => c.overloaded).length;

    return {
      flowReliabilityScore,
      throughputTrend,
      wipBreaches,
      overloadedPeople: riskReport.wipPressure.people.filter((p) => p.overloaded).length,
      chronicBlockerCount: riskReport.chronicBlockers.length,
      fixedDateRisks: riskReport.fixedDateAlerts.filter((a) => a.severity === "high" || a.severity === "critical").length,
      topRecommendations: riskReport.recommendations.slice(0, 3).map((r) => ({
        title: r.title,
        severity: r.severity,
      })),
    };
  } catch {
    return null;
  }
}

"use client";

import { useMemo } from "react";
import type { AnalyticsDashboardData, ForecastScenarioData } from "@/lib/analytics/types";
import {
  fmt$,
  fmtPct,
  SectionCard,
  InsightCard,
  AlertBanner,
} from "@/components/analytics/dashboard-primitives";
import { StatCard } from "@/components/analytics/stat-card";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import {
  ForecastChart,
  type ForecastChartSeries,
} from "./forecast-chart";
import {
  buildDefaultScenarios,
} from "@/lib/analytics/forecast-engine";
import { fmtMonths, runwayColor } from "@/lib/analytics/finance-utils";

// ── Helpers ──────────────────────────────────────────────

const SCENARIO_COLORS = ["#10b981", "#3b82f6", "#f59e0b"];

function runwayChangeType(
  runway: number,
): "positive" | "neutral" | "negative" {
  if (runway > 18) return "positive";
  if (runway > 12) return "neutral";
  return "negative";
}

function cashZeroDate(scenario: ForecastScenarioData): string | null {
  for (let i = 1; i < scenario.months.length; i++) {
    if ((scenario.months[i]?.projectedCashBalance ?? 0) <= 0) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      return d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    }
  }
  return null;
}

function monthlyBurn(scenario: ForecastScenarioData, baseBurn: number): number {
  return (
    baseBurn +
    scenario.assumptions.burnRateDelta +
    scenario.assumptions.additionalMonthlyExpense -
    scenario.assumptions.additionalMonthlyRevenue
  );
}

function scenarioValueAtMonth(scenario: ForecastScenarioData, month: number): number {
  if (scenario.months.length === 0) return 0;
  const idx = Math.min(month, scenario.months.length - 1);
  return scenario.months[idx]?.projectedRevenue ?? 0;
}

function pickWorstScenario(scenarios: ForecastScenarioData[]): ForecastScenarioData | null {
  if (scenarios.length === 0) return null;
  return scenarios.reduce((worst, candidate) => {
    if (!worst) return candidate;
    const candidateRunway = candidate.runwayMonths ?? Number.POSITIVE_INFINITY;
    const worstRunway = worst.runwayMonths ?? Number.POSITIVE_INFINITY;
    if (candidateRunway < worstRunway) return candidate;
    if (candidateRunway > worstRunway) return worst;
    const candidateMrr = scenarioValueAtMonth(candidate, 12);
    const worstMrr = scenarioValueAtMonth(worst, 12);
    if (candidateMrr < worstMrr) return candidate;
    return worst;
  }, null as ForecastScenarioData | null);
}

// ── Component ────────────────────────────────────────────

export function FinanceForecastTab({
  data,
}: {
  data: AnalyticsDashboardData | null;
}) {
  const hasFinanceData = Boolean(data?.stripe || data?.mercury);
  const financeSummary = data?.metrics?.finance.summary ?? null;

  const scenarios = useMemo(
    () => (data ? buildDefaultScenarios(data.stripe ?? null, data.mercury ?? null) : []),
    [data],
  );

  const revenueSeries: ForecastChartSeries[] = useMemo(
    () =>
      scenarios.map((s, i) => ({
        name: s.name,
        data: s.months.map((m, idx) => ({
          month: idx,
          label: m.month,
          value: m.projectedRevenue,
        })),
        color: SCENARIO_COLORS[i] ?? "#6b7280",
        dashed: i !== 1, // only base case is solid
      })),
    [scenarios],
  );

  const cashSeries: ForecastChartSeries[] = useMemo(
    () =>
      scenarios.map((s, i) => ({
        name: s.name,
        data: s.months.map((m, idx) => ({
          month: idx,
          label: m.month,
          value: m.projectedCashBalance,
        })),
        color: SCENARIO_COLORS[i] ?? "#6b7280",
        dashed: i !== 1,
      })),
    [scenarios],
  );

  // Empty-state guard (after hooks to keep hook order stable)
  if (!hasFinanceData) {
    return <FinanceDataEmptyState />;
  }

  if (!financeSummary) {
    return (
      <FinanceDataEmptyState
        title="Finance metrics are unavailable"
        message="The canonical finance metrics layer was not included in this analytics payload."
      />
    );
  }

  if (scenarios.length === 0) return null;

  // Derive current MRR for insight comparison
  const currentMrr = financeSummary.mrr;

  // Worst and base scenarios
  const baseScenario = scenarios.find((s) => s.id === "default-base") ?? scenarios[0];
  const optimisticScenario = scenarios.find((s) => s.id === "default-optimistic") ?? scenarios[0];
  const worstScenario = pickWorstScenario(scenarios);

  const baseGrowthRate = financeSummary.revenueGrowth / 100;
  const baseChurnRate = financeSummary.churnRatePct / 100;

  // ── Alerts ──────────────────────────────────────────
  const alerts: {
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
  }[] = [];

  if (worstScenario && (worstScenario.runwayMonths ?? 0) < 12) {
    alerts.push({
      severity: "critical",
      title: `Conservative runway is only ${fmtMonths(worstScenario.runwayMonths ?? 0)}`,
      description:
        "Under conservative assumptions your cash could run out within a year. Consider cutting burn or accelerating fundraising.",
    });
  }

  if (
    baseScenario &&
    (baseScenario.runwayMonths ?? 0) < 18 &&
    !(worstScenario && (worstScenario.runwayMonths ?? 0) < 12)
  ) {
    alerts.push({
      severity: "warning",
      title: `Base-case runway at ${fmtMonths(baseScenario.runwayMonths ?? 0)}`,
      description:
        "Current trajectory leaves less than 18 months of runway. Review burn rate and revenue growth to extend buffer.",
    });
  }

  // ── Insights ────────────────────────────────────────
  const insights: {
    title: string;
    insight: string;
    action?: string;
    severity: "critical" | "warning" | "info" | "success";
  }[] = [];

  // Optimistic >2x current MRR
  if (optimisticScenario && optimisticScenario.months.length > 0 && currentMrr > 0) {
    const projected12 = scenarioValueAtMonth(optimisticScenario, 12);
    if (projected12 > currentMrr * 2) {
      insights.push({
        title: "Strong growth potential",
        insight: `Optimistic scenario projects ${fmt$(projected12)} MRR in 12 months — over 2x your current ${fmt$(currentMrr)}.`,
        action:
          "Focus on the levers that drive the optimistic case: lower churn and accelerated acquisition.",
        severity: "success",
      });
    }
  }

  // Conservative runway <6 months
  if (worstScenario && (worstScenario.runwayMonths ?? 0) < 6) {
    insights.push({
      title: "Cash position at risk",
      insight: `Under conservative assumptions, runway is only ${fmtMonths(worstScenario.runwayMonths ?? 0)}. Immediate action recommended.`,
      action:
        "Prioritize cutting discretionary spend and exploring bridge financing or revenue acceleration.",
      severity: "critical",
    });
  }

  // Base churn >5%
  if (baseScenario) {
    const baseChurn =
      Math.max(
        baseChurnRate + baseScenario.assumptions.churnRateDelta / 100,
        0,
      );
    if (baseChurn > 0.05) {
    insights.push({
      title: "Churn dragging projections",
      insight: `Base-case monthly churn of ${fmtPct(baseChurn * 100)} significantly erodes MRR growth over 12 months.`,
      action:
        "Invest in retention: onboarding improvements, health scoring, and proactive outreach to at-risk accounts.",
      severity: "warning",
    });
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Alerts ─────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertBanner
              key={i}
              severity={a.severity}
              title={a.title}
              description={a.description}
            />
          ))}
        </div>
      )}

      {/* ── Scenario Comparison StatCards ──────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {scenarios.map((s) => {
          const last12 =
            s.months[Math.min(12, s.months.length - 1)]?.projectedRevenue ?? 0;
          const growthRate =
            baseGrowthRate + s.assumptions.revenueGrowthRate / 100;
          const churnRate = Math.max(
            baseChurnRate + s.assumptions.churnRateDelta / 100,
            0,
          );
          return (
            <StatCard
              key={s.id}
              label={s.name}
              value={fmt$(last12)}
              change={fmtMonths(s.runwayMonths ?? 0)}
              changeType={runwayChangeType(s.runwayMonths ?? 0)}
              subtitle={`Growth ${fmtPct(growthRate * 100)} / Churn ${fmtPct(churnRate * 100)}`}
            />
          );
        })}
      </div>

      {/* ── Revenue Projection Chart ──────────────────── */}
      <SectionCard
        title="Revenue Projection"
        subtitle="12-month MRR forecast across scenarios"
      >
        <ForecastChart
          series={revenueSeries}
          height={260}
          formatValue={(v) => fmt$(v)}
        />
      </SectionCard>

      {/* ── Cash Projection Chart ─────────────────────── */}
      <SectionCard
        title="Cash Projection"
        subtitle="Cash balance forecast over 24 months"
      >
        <ForecastChart
          series={cashSeries}
          height={260}
          formatValue={(v) => fmt$(v)}
        />
      </SectionCard>

      {/* ── Scenario Details ──────────────────────────── */}
      <SectionCard title="Scenario Details" subtitle="Assumptions and outcomes per scenario">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {scenarios.map((s, i) => {
            const burn = monthlyBurn(s, financeSummary.burnRate);
            const zeroDate = cashZeroDate(s);
            const rwColor = runwayColor(s.runwayMonths ?? 0);

            return (
              <div
                key={s.id}
                className="rounded-lg border border-border bg-secondary/20 p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: SCENARIO_COLORS[i] }}
                  />
                  <span className="text-sm font-semibold text-foreground">
                    {s.name}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Growth rate</span>
                    <span className="font-medium text-foreground">
                      {fmtPct(
                        (baseGrowthRate + s.assumptions.revenueGrowthRate / 100) * 100,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Churn rate</span>
                    <span className="font-medium text-foreground">
                      {fmtPct(
                        Math.max(
                          baseChurnRate + s.assumptions.churnRateDelta / 100,
                          0,
                        ) * 100,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monthly burn</span>
                    <span className="font-medium text-foreground">
                      {fmt$(burn)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Runway</span>
                    <span
                      className="font-bold"
                      style={{ color: rwColor }}
                    >
                      {fmtMonths(s.runwayMonths ?? 0)}
                    </span>
                  </div>
                  {zeroDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cash zero</span>
                      <span className="font-medium text-red-500">
                        {zeroDate}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Insights & Recommendations ────────────────── */}
      {insights.length > 0 && (
        <SectionCard title="Forecast Insights">
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <InsightCard
                key={i}
                title={ins.title}
                insight={ins.insight}
                action={ins.action}
                severity={ins.severity}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

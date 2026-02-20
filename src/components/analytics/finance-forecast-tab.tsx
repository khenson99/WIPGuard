"use client";

import { useMemo } from "react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
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
  type ForecastScenarioData,
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
  for (let i = 1; i < scenario.cash.length; i++) {
    if (scenario.cash[i].value <= 0) {
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

function monthlyBurn(scenario: ForecastScenarioData, data: AnalyticsDashboardData): number {
  const baseBurn = data.mercury?.cashFlow?.burnRate ?? 0;
  return baseBurn + scenario.additionalBurn;
}

function scenarioValueAtMonth(scenario: ForecastScenarioData, month: number): number {
  if (scenario.revenue.length === 0) return 0;
  const idx = Math.min(month, scenario.revenue.length - 1);
  return scenario.revenue[idx]?.value ?? 0;
}

function pickWorstScenario(scenarios: ForecastScenarioData[]): ForecastScenarioData | null {
  if (scenarios.length === 0) return null;
  return scenarios.reduce((worst, candidate) => {
    if (!worst) return candidate;
    if (candidate.runway < worst.runway) return candidate;
    if (candidate.runway > worst.runway) return worst;
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
  // Empty-state guard
  if (!data?.stripe && !data?.mercury) {
    return <FinanceDataEmptyState />;
  }

  const scenarios = useMemo(
    () => (data ? buildDefaultScenarios(data) : []),
    [data],
  );

  const revenueSeries: ForecastChartSeries[] = useMemo(
    () =>
      scenarios.map((s, i) => ({
        name: s.name,
        data: s.revenue,
        color: SCENARIO_COLORS[i] ?? "#6b7280",
        dashed: i !== 1, // only base case is solid
      })),
    [scenarios],
  );

  const cashSeries: ForecastChartSeries[] = useMemo(
    () =>
      scenarios.map((s, i) => ({
        name: s.name,
        data: s.cash,
        color: SCENARIO_COLORS[i] ?? "#6b7280",
        dashed: i !== 1,
      })),
    [scenarios],
  );

  if (scenarios.length === 0) return null;

  // Derive current MRR for insight comparison
  const currentMrr = data?.stripe?.revenue?.mrr ?? 0;

  // Worst and base scenarios
  const baseScenario = scenarios.find((s) => s.id === "base") ?? scenarios[0];
  const optimisticScenario = scenarios.find((s) => s.id === "optimistic") ?? scenarios[0];
  const worstScenario = pickWorstScenario(scenarios);

  // ── Alerts ──────────────────────────────────────────
  const alerts: {
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
  }[] = [];

  if (worstScenario && worstScenario.runway < 12) {
    alerts.push({
      severity: "critical",
      title: `Conservative runway is only ${fmtMonths(worstScenario.runway)}`,
      description:
        "Under conservative assumptions your cash could run out within a year. Consider cutting burn or accelerating fundraising.",
    });
  }

  if (baseScenario && baseScenario.runway < 18 && !(worstScenario && worstScenario.runway < 12)) {
    alerts.push({
      severity: "warning",
      title: `Base-case runway at ${fmtMonths(baseScenario.runway)}`,
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
  if (optimisticScenario && optimisticScenario.revenue.length > 0 && currentMrr > 0) {
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
  if (worstScenario && worstScenario.runway < 6) {
    insights.push({
      title: "Cash position at risk",
      insight: `Under conservative assumptions, runway is only ${fmtMonths(worstScenario.runway)}. Immediate action recommended.`,
      action:
        "Prioritize cutting discretionary spend and exploring bridge financing or revenue acceleration.",
      severity: "critical",
    });
  }

  // Base churn >5%
  if (baseScenario && baseScenario.monthlyChurnRate > 0.05) {
    insights.push({
      title: "Churn dragging projections",
      insight: `Base-case monthly churn of ${fmtPct(baseScenario.monthlyChurnRate * 100)} significantly erodes MRR growth over 12 months.`,
      action:
        "Invest in retention: onboarding improvements, health scoring, and proactive outreach to at-risk accounts.",
      severity: "warning",
    });
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
        {scenarios.map((s, i) => {
          const last12 =
            s.revenue[Math.min(12, s.revenue.length - 1)]?.value ?? 0;
          return (
            <StatCard
              key={s.id}
              label={s.name}
              value={fmt$(last12)}
              change={fmtMonths(s.runway)}
              changeType={runwayChangeType(s.runway)}
              subtitle={`Growth ${fmtPct(s.monthlyGrowthRate * 100)} / Churn ${fmtPct(s.monthlyChurnRate * 100)}`}
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
            const burn = data ? monthlyBurn(s, data) : 0;
            const zeroDate = cashZeroDate(s);
            const rwColor = runwayColor(s.runway);

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
                      {fmtPct(s.monthlyGrowthRate * 100)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Churn rate</span>
                    <span className="font-medium text-foreground">
                      {fmtPct(s.monthlyChurnRate * 100)}
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
                      {fmtMonths(s.runway)}
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

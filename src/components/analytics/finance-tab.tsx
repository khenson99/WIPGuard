"use client";

import React from "react";
import {
  DollarSign,
  CreditCard,
  Wallet,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  BarChart3,
  Receipt,
  Calculator,
  AlertTriangle,
} from "lucide-react";
import type { AnalyticsDashboardData, PnLRow, ForecastScenarioData } from "@/lib/analytics/types";
import {
  fmtDelta,
  fmtMonths,
  fmtRatio,
  gradeColor,
  healthScoreColor,
  runwayColor,
  runwayBgColor,
  ltvCacSeverity,
} from "@/lib/analytics/finance-utils";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";
import { FinanceDataEmptyState } from "./finance-empty-state";

interface FinanceTabProps {
  data: AnalyticsDashboardData | null;
}

/**
 * Format number as currency with short notation
 * @example fmt$(1234) => "$1.2K"
 * @example fmt$(1500000) => "$1.5M"
 */
function fmt$(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Format number as percentage
 * @example fmtPct(0.856) => "85.6%"
 * @example fmtPct(0.05) => "5.0%"
 */
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function isGenericMissingCredentialError(message: string): boolean {
  return /\bMissing\s+[A-Z0-9_]+(?:_KEY|_SECRET|_TOKEN)\b/.test(message);
}

function safeMonthLabel(offset: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toLocaleString(undefined, { month: "short" });
}

function addDaysIso(dateLike: string, days: number): string {
  const baseMs = /^\d{4}-\d{2}-\d{2}$/.test(dateLike)
    ? new Date(`${dateLike}T00:00:00.000Z`).getTime()
    : new Date(dateLike).getTime();
  return new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
}

function computeFinancialHealthScore(input: {
  runwayMonths: number;
  mrrGrowthRate: number;
  churnRate: number;
  netCashFlow30d: number;
}): { score: number; grade: "A" | "B" | "C" | "D" | "F"; components: Record<string, number> } {
  const runwayScore = Math.min((input.runwayMonths / 18) * 100, 100);
  const growthScore = Math.min(Math.max(input.mrrGrowthRate * 700, 0), 100);
  const churnScore = Math.min(Math.max(100 - input.churnRate * 1000, 0), 100);
  const cashFlowScore =
    input.netCashFlow30d >= 0
      ? 100
      : Math.min(Math.max(100 + (input.netCashFlow30d / 30_000) * 100, 0), 100);

  const score = Math.round(runwayScore * 0.35 + growthScore * 0.25 + churnScore * 0.25 + cashFlowScore * 0.15);
  const grade: "A" | "B" | "C" | "D" | "F" =
    score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  return {
    score,
    grade,
    components: {
      "Runway (score)": Math.round(runwayScore),
      "Growth (score)": Math.round(growthScore),
      "Churn (score)": Math.round(churnScore),
      "Cash Flow (score)": Math.round(cashFlowScore),
    },
  };
}

function buildDefaultForecastScenarios(input: {
  mrr: number;
  cashBalance: number;
  burnRate: number;
  mrrGrowthRate: number;
}): ForecastScenarioData[] {
  const base = {
    mrr: input.mrr,
    cash: input.cashBalance,
    burn: Math.max(input.burnRate, 0),
    growth: Math.max(input.mrrGrowthRate, 0),
  };

  const scenarios = [
    { id: "best", name: "Best Case", burnMult: 0.85, growthMult: 1.25 },
    { id: "expected", name: "Expected", burnMult: 1, growthMult: 1 },
    { id: "worst", name: "Worst Case", burnMult: 1.15, growthMult: 0.75 },
  ];

  return scenarios.map((s) => {
    const burn = base.burn * s.burnMult;
    const growth = base.growth * s.growthMult;
    const months = Array.from({ length: 12 }).map((_, i) => {
      const projectedMrr = base.mrr * Math.pow(1 + growth, i);
      const projectedExpenses = burn;
      const projectedRevenue = projectedMrr;
      const projectedCashBalance = base.cash + (projectedRevenue - projectedExpenses) * i;
      const projectedRunway = burn > 0 ? projectedCashBalance / burn : null;
      return {
        month: safeMonthLabel(i),
        projectedRevenue,
        projectedExpenses,
        projectedCashBalance,
        projectedMrr,
        projectedRunway,
      };
    });
    const runwayMonths = burn > 0 ? base.cash / burn : null;
    return {
      id: s.id,
      name: s.name,
      assumptions: {
        revenueGrowthRate: growth,
        churnRateDelta: 0,
        burnRateDelta: (s.burnMult - 1) * 100,
        additionalMonthlyExpense: 0,
        additionalMonthlyRevenue: 0,
      },
      months,
      runwayMonths,
    };
  });
}

// ---------------------------------------------------------------------------
// P&L Row component
// ---------------------------------------------------------------------------
function PnLRowDisplay({ row, bold = false }: { row: PnLRow; bold?: boolean }) {
  const changeColor =
    row.change > 0 ? "text-emerald-500" : row.change < 0 ? "text-red-500" : "text-muted-foreground";

  return (
    <div className={`grid grid-cols-4 gap-4 py-2.5 ${bold ? "font-semibold border-t border-border" : ""}`}>
      <span className={`text-sm ${bold ? "text-foreground" : "text-muted-foreground"}`}>
        {row.label}
      </span>
      <span className="text-sm text-foreground text-right tabular-nums">
        {fmt$(row.currentPeriod)}
      </span>
      <span className="text-sm text-muted-foreground text-right tabular-nums">
        {fmt$(row.previousPeriod)}
      </span>
      <span className={`text-sm text-right tabular-nums ${changeColor}`}>
        {row.changePct > 0 ? "+" : ""}{row.changePct.toFixed(1)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity badge for LTV:CAC
// ---------------------------------------------------------------------------
function SeverityBadge({ severity }: { severity: "positive" | "neutral" | "negative" }) {
  const styles = {
    positive: "bg-emerald-500/10 text-emerald-500",
    neutral: "bg-yellow-500/10 text-yellow-500",
    negative: "bg-red-500/10 text-red-500",
  };
  const labels = { positive: "Healthy", neutral: "Moderate", negative: "Low" };
  return (
    <span className={`inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Forecast scenario mini-chart
// ---------------------------------------------------------------------------
function ForecastMiniChart({ scenario }: { scenario: ForecastScenarioData }) {
  const months = scenario.months;
  if (months.length === 0) return null;

  const maxCash = Math.max(...months.map((m) => m.projectedCashBalance), 1);
  const minCash = Math.min(...months.map((m) => m.projectedCashBalance), 0);
  const range = maxCash - minCash || 1;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{scenario.name}</h4>
          {scenario.runwayMonths !== null && (
            <p className={`text-xs mt-0.5 ${runwayColor(scenario.runwayMonths)}`}>
              Runway: {fmtMonths(scenario.runwayMonths)}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">End MRR</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {fmt$(months[months.length - 1].projectedMrr)}
          </p>
        </div>
      </div>

      {/* Sparkline-style cash balance trend */}
      <div className="flex items-end gap-px h-16">
        {months.map((m, i) => {
          const h = ((m.projectedCashBalance - minCash) / range) * 100;
          const isNegative = m.projectedCashBalance < 0;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm transition-all duration-200 ${isNegative ? "bg-red-500/60" : "bg-primary/50"}`}
              style={{ height: `${Math.max(h, 2)}%` }}
              title={`${m.month}: ${fmt$(m.projectedCashBalance)}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{months[0].month}</span>
        <span className="text-[10px] text-muted-foreground">{months[months.length - 1].month}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main FinanceTab
// ---------------------------------------------------------------------------
export function FinanceTab({ data }: FinanceTabProps) {
  const [sensitivity, setSensitivity] = React.useState({ churn: 0, growth: 0, burn: 0 });

  if (!data) {
    return <FinanceDataEmptyState title="No financial data available" message="Finance analytics payload is missing." />;
  }

  const stripe = data.stripe;
  const mercury = data.mercury;
  const fp = data.financialPlanning;
  const financeErrors = data.errors
    .filter((entry) => entry.source === "stripe" || entry.source === "mercury")
    .filter((entry) => !isGenericMissingCredentialError(entry.message))
    .map((entry) => `${entry.source}: ${entry.message}`);
  const freshnessErrors = [
    data.freshness.stripe?.lastError ? `stripe: ${data.freshness.stripe.lastError}` : null,
    data.freshness.mercury?.lastError ? `mercury: ${data.freshness.mercury.lastError}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  if (!stripe && !mercury) {
    const stripeConn = data.freshness.stripe?.source === "connection" ? data.freshness.stripe : null;
    const mercuryConn = data.freshness.mercury?.source === "connection" ? data.freshness.mercury : null;
    const stripeDisconnected = stripeConn?.status === "DISCONNECTED";
    const mercuryDisconnected = mercuryConn?.status === "DISCONNECTED";

    if (stripeDisconnected && mercuryDisconnected) {
      return (
        <FinanceDataEmptyState
          title="Connect your finance integrations"
          message="Stripe and Mercury are disconnected. Connect them to populate the finance dashboard."
          primaryActionLabel="Go to Settings"
          primaryActionHref="/settings?tab=integrations"
        />
      );
    }

    const connectionBanners: string[] = [];
    if (stripeDisconnected) connectionBanners.push("Stripe is not connected");
    if (mercuryDisconnected) connectionBanners.push("Mercury is not connected");
    if (stripeConn?.status === "ERROR" && stripeConn.lastError) {
      connectionBanners.push(`Stripe connection error: ${stripeConn.lastError}`);
    }
    if (mercuryConn?.status === "ERROR" && mercuryConn.lastError) {
      connectionBanners.push(`Mercury connection error: ${mercuryConn.lastError}`);
    }

    return (
      <FinanceDataEmptyState
        title="Finance dashboard data is unavailable"
        message="Stripe and Mercury data could not be loaded for this range."
        reasons={[...connectionBanners, ...financeErrors, ...freshnessErrors]}
      />
    );
  }

  // Extract metrics with fallbacks
  const mrr = data.kpis?.finance.mrr ?? stripe?.revenue?.mrr ?? 0;
  const mrrChange = stripe?.revenue?.mrrChange ?? 0;
  const cashBalance = mercury?.cashFlow?.totalBalance ?? 0;
  const runway = mercury?.cashFlow?.runway ?? 0;
  const netCashFlow = mercury?.cashFlow?.netCashFlow ?? 0;
  const burnRate = mercury?.cashFlow?.burnRate ?? 0;
  const growthRate = stripe?.revenue?.revenueGrowth ?? 0;
  const churnRate = stripe?.subscriptions?.churnRate ?? 0;
  const projectedMrr6mo = mrr * Math.pow(1 + Math.max(growthRate, 0), 6);
  const projectedCash6mo = cashBalance + netCashFlow * 6;

  const health = computeFinancialHealthScore({
    runwayMonths: runway,
    mrrGrowthRate: growthRate,
    churnRate,
    netCashFlow30d: netCashFlow,
  });

  const scenarios =
    fp?.forecasts && fp.forecasts.length > 0
      ? fp.forecasts
      : buildDefaultForecastScenarios({ mrr, cashBalance, burnRate, mrrGrowthRate: growthRate });
  const expectedScenario = scenarios.find((s) => s.name === "Expected") ?? scenarios[0];

  const successRate = stripe?.payments?.successRate ?? 0;
  const recentChurns = stripe?.subscriptions?.recentChurnEvents ?? [];

  const sensitivityImpact = (() => {
    const growthAdj = sensitivity.growth / 100;
    const burnAdj = sensitivity.burn / 100;
    const adjustedGrowth = Math.max(growthRate + growthAdj, 0);
    const adjustedBurn = Math.max(burnRate * (1 + burnAdj), 0);
    const mrrAt12 = mrr * Math.pow(1 + adjustedGrowth, 12);
    const runwayAdj = adjustedBurn > 0 ? cashBalance / adjustedBurn : 999;
    return { mrrAt12, runwayAdj };
  })();

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TOP KPI ROW                                               */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Monthly Recurring Revenue"
          value={fmt$(mrr)}
          change={fmtPct(Math.abs(mrrChange))}
          changeType={mrrChange >= 0 ? "positive" : "negative"}
          icon={DollarSign}
          subtitle={`→ ${fmt$(projectedMrr6mo)} (6mo)`}
        />
        <StatCard
          label="Runway"
          value={runway > 0 ? fmtMonths(runway) : "—"}
          subtitle={burnRate > 0 ? `Monthly burn ${fmt$(burnRate)}/mo` : undefined}
          icon={Activity}
        />
        <StatCard
          label="Cash Balance"
          value={fmt$(cashBalance)}
          subtitle={`→ ${fmt$(projectedCash6mo)} (6mo)`}
          icon={Wallet}
        />
        <StatCard
          label="Monthly Burn"
          value={burnRate > 0 ? `${fmt$(burnRate)}/mo` : "—"}
          changeType="negative"
          icon={TrendingDown}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FINANCIAL HEALTH                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold">Financial Health</h3>
          <span className={`text-sm font-semibold ${gradeColor(health.grade)}`}>Grade {health.grade}</span>
        </div>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex items-center justify-center">
            <RingStat
              value={health.score}
              max={100}
              label="Health Score"
              color={healthScoreColor(health.score)}
              size={120}
            />
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(health.components).map(([name, score]) => (
              <div key={name} className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">{name}</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{score}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MRR PROJECTION                                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold">MRR Projection</h3>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/60" />
              Historical
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-sm bg-primary" />
              Projected
            </span>
          </div>
        </div>
        <div className="grid grid-cols-12 gap-1 items-end h-24">
          {Array.from({ length: 6 }).map((_, i) => {
            const historical = stripe?.revenueTrend?.length
              ? stripe.revenueTrend[Math.max(0, stripe.revenueTrend.length - 6 + i)]?.revenue ?? 0
              : 0;
            const projected = mrr * Math.pow(1 + Math.max(growthRate, 0), i);
            const max = Math.max(mrr, projectedMrr6mo, 1);
            const h1 = (historical / max) * 100;
            const h2 = (projected / max) * 100;
            return (
              <div key={i} className="col-span-2 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-1 h-20">
                  <div className="flex-1 rounded-t bg-muted-foreground/40" style={{ height: `${Math.max(h1, 2)}%` }} />
                  <div className="flex-1 rounded-t bg-primary" style={{ height: `${Math.max(h2, 2)}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{safeMonthLabel(i)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* RUNWAY SCENARIOS                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <h3 className="text-foreground font-semibold">Runway Scenarios</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {scenarios.slice(0, 3).map((scenario) => {
            const scenarioBurn =
              scenario.name === "Best Case" ? burnRate * 0.85 : scenario.name === "Worst Case" ? burnRate * 1.15 : burnRate;
            return (
              <div key={scenario.id} className="space-y-2">
                <ForecastMiniChart scenario={scenario} />
                <p className="text-xs text-muted-foreground">Burn: {fmt$(scenarioBurn)}/mo</p>
              </div>
            );
          })}
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h4 className="text-foreground font-semibold mb-4">Expected Cash Trajectory</h4>
          <div className="flex items-end gap-2 h-24">
            {expectedScenario?.months?.slice(0, 6).map((m, idx) => {
              const maxCash = Math.max(...expectedScenario.months.slice(0, 6).map((x) => x.projectedCashBalance), 1);
              const pct = (m.projectedCashBalance / maxCash) * 100;
              const negative = m.projectedCashBalance < 0;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${negative ? "bg-red-500/60" : runwayBgColor(runway)}`}
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{m.month}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* WHAT-IF SENSITIVITY                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-foreground font-semibold mb-4">What-If Sensitivity</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Churn Rate</p>
            <input
              aria-label="Churn Rate adjustment"
              type="range"
              min={-10}
              max={10}
              step={1}
              value={sensitivity.churn}
              onChange={(e) => setSensitivity((s) => ({ ...s, churn: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Growth Rate</p>
            <input
              aria-label="Growth Rate adjustment"
              type="range"
              min={-10}
              max={10}
              step={1}
              value={sensitivity.growth}
              onChange={(e) => setSensitivity((s) => ({ ...s, growth: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Burn Rate</p>
            <input
              aria-label="Burn Rate adjustment"
              type="range"
              min={-10}
              max={10}
              step={1}
              value={sensitivity.burn}
              onChange={(e) => setSensitivity((s) => ({ ...s, burn: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
        </div>

        {sensitivity.churn === 0 && sensitivity.growth === 0 && sensitivity.burn === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Adjust the sliders above to see the projected impact.</p>
        ) : (
          <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-4 text-sm text-foreground">
            <div className="flex flex-wrap gap-6">
              <span>
                <span className="text-muted-foreground">Runway:</span>{" "}
                <span className="font-semibold tabular-nums">{fmtMonths(sensitivityImpact.runwayAdj)}</span>
              </span>
              <span>
                <span className="text-muted-foreground">MRR@12mo:</span>{" "}
                <span className="font-semibold tabular-nums">{fmt$(sensitivityImpact.mrrAt12)}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* UNIT ECONOMICS                                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {fp?.unitEconomics && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <Calculator className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-foreground font-semibold">Unit Economics</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">LTV</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{fmt$(fp.unitEconomics.ltv)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">CAC</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{fmt$(fp.unitEconomics.cac)}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">LTV:CAC</p>
                <SeverityBadge severity={ltvCacSeverity(fp.unitEconomics.ltvCacRatio)} />
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">{fmtRatio(fp.unitEconomics.ltvCacRatio)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">ARPA</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{fmt$(fp.unitEconomics.avgRevenuePerAccount)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Payback</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{fmtMonths(fp.unitEconomics.paybackMonths)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Gross Margin</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{fmtPct(fp.unitEconomics.grossMarginPct)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* REVENUE TREND                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {stripe?.revenueTrend && stripe.revenueTrend.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-foreground font-semibold mb-6">Revenue Trend</h3>
          <div className="flex items-end gap-2 h-48">
            {stripe.revenueTrend.slice(-6).map((point, idx) => {
              const maxRevenue = Math.max(
                ...stripe.revenueTrend!.map((p) => p.revenue)
              );
              const heightPercent = (point.revenue / maxRevenue) * 100;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full bg-gradient-to-t from-primary/40 to-primary rounded-t-md transition-all duration-300 hover:from-primary/60 hover:to-primary/80"
                    style={{ height: `${heightPercent}%`, minHeight: "4px" }}
                  />
                  <span className="text-xs text-muted-foreground text-center">
                    {point.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* P&L STATEMENT                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {fp?.pnl && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <Receipt className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-foreground font-semibold">Profit & Loss Statement</h3>
            <span className="text-xs text-muted-foreground ml-auto">{fp.pnl.periodLabel}</span>
          </div>

          {/* Header */}
          <div className="grid grid-cols-4 gap-4 pb-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Line Item</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase text-right">Current</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase text-right">Previous</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase text-right">Change</span>
          </div>

          <PnLRowDisplay row={fp.pnl.revenue} />
          <PnLRowDisplay row={fp.pnl.cogs} />
          <PnLRowDisplay row={fp.pnl.grossProfit} bold />

          {fp.pnl.operatingExpenses.map((row, i) => (
            <PnLRowDisplay key={i} row={row} />
          ))}
          <PnLRowDisplay row={fp.pnl.totalOpex} bold />
          <PnLRowDisplay row={fp.pnl.operatingIncome} bold />
          <PnLRowDisplay row={fp.pnl.netIncome} bold />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FORECAST SCENARIOS                                        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {fp?.forecasts && fp.forecasts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-foreground font-semibold">Forecast Scenarios</h3>
            <span className="text-xs text-muted-foreground ml-auto">18-month projections</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fp.forecasts.map((scenario) => (
              <ForecastMiniChart key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TWO COLUMN: SUBSCRIPTION HEALTH + BANK ACCOUNTS           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Health */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-foreground font-semibold">Subscription Health</h3>
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className="flex items-center justify-center mb-8">
              <RingStat
                value={successRate}
                max={100}
                label="Payment Success Rate"
                color="hsl(var(--primary))"
                size={120}
              />
            </div>

            <div className="bg-secondary/40 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Subscription Churn</span>
                <span className="text-foreground font-semibold">
                  {fmtPct(churnRate)}
                </span>
              </div>
            </div>

            {recentChurns && recentChurns.length > 0 && (
              <div>
                <h4 className="text-muted-foreground text-xs font-semibold uppercase mb-3">
                  Recent Churn
                </h4>
                <div className="space-y-3">
                  {recentChurns.slice(0, 5).map((event, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-b-0"
                    >
                      <div className="flex-1">
                        <p className="text-sm text-foreground truncate">
                          {event.customer}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {event.canceledAt}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {fmt$(event.amount)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bank Accounts */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-foreground font-semibold mb-6">Bank Accounts</h3>

          {mercury?.accounts && mercury.accounts.length > 0 ? (
            <div className="space-y-4">
              {mercury.accounts.map((account, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 bg-secondary/40 rounded-lg border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {account.accountName}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {account.type}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {fmt$(account.balance)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.accountId}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No bank accounts connected
            </p>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BUDGET VARIANCE                                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {fp?.activeBudget && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-foreground font-semibold">Budget vs Actual</h3>
            <span className="text-xs text-muted-foreground ml-auto">{fp.activeBudget.name}</span>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-secondary/40 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase mb-1">Planned</p>
              <p className="text-lg font-bold text-foreground tabular-nums">{fmt$(fp.activeBudget.totalPlanned)}</p>
            </div>
            <div className="bg-secondary/40 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase mb-1">Actual</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {fp.activeBudget.totalActual != null ? fmt$(fp.activeBudget.totalActual) : "—"}
              </p>
            </div>
            <div className="bg-secondary/40 rounded-lg p-4">
              <p className="text-xs text-muted-foreground uppercase mb-1">Variance</p>
              <p className={`text-lg font-bold tabular-nums ${
                fp.activeBudget.totalVariance != null
                  ? fp.activeBudget.totalVariance > 0
                    ? "text-red-500"
                    : fp.activeBudget.totalVariance < 0
                    ? "text-emerald-500"
                    : "text-foreground"
                  : "text-muted-foreground"
              }`}>
                {fp.activeBudget.totalVariance != null ? fmtDelta(fp.activeBudget.totalVariance) : "—"}
              </p>
            </div>
          </div>

          {/* Line items table */}
          <div className="grid grid-cols-5 gap-4 pb-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Category</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase text-right">Planned</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase text-right">Actual</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase text-right">Variance</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase text-right">Var %</span>
          </div>
          {fp.activeBudget.lineItems.map((item) => {
            const overBudget = (item.variancePct ?? 0) > 15;
            return (
              <div key={item.id} className={`grid grid-cols-5 gap-4 py-2.5 ${overBudget ? "bg-red-500/5 -mx-2 px-2 rounded" : ""}`}>
                <span className="text-sm text-muted-foreground capitalize">{item.category}</span>
                <span className="text-sm text-foreground text-right tabular-nums">{fmt$(item.plannedAmount)}</span>
                <span className="text-sm text-foreground text-right tabular-nums">
                  {item.actualAmount != null ? fmt$(item.actualAmount) : "—"}
                </span>
                <span className={`text-sm text-right tabular-nums ${
                  item.variance != null
                    ? item.variance > 0 ? "text-red-500" : item.variance < 0 ? "text-emerald-500" : "text-muted-foreground"
                    : "text-muted-foreground"
                }`}>
                  {item.variance != null ? fmtDelta(item.variance) : "—"}
                </span>
                <span className={`text-sm text-right tabular-nums ${
                  overBudget ? "text-red-500 font-medium" : "text-muted-foreground"
                }`}>
                  {item.variancePct != null ? `${item.variancePct > 0 ? "+" : ""}${item.variancePct.toFixed(1)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* GOALS & MILESTONES                                        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {(() => {
        const baseDeadlineDate = data.timeRange?.to ?? data.lastFullRefresh;
        const deadline = (days: number) => addDaysIso(baseDeadlineDate, days);
        const goals =
          fp?.goals && fp.goals.length > 0
            ? fp.goals
            : [
                {
                  id: "goal-mrr",
                  metric: "mrr" as const,
                  targetValue: Math.max(mrr * 1.25, mrr + 5_000),
                  currentValue: mrr,
                  progressPct: Math.min((mrr / Math.max(mrr * 1.25, mrr + 5_000)) * 100, 100),
                  deadline: deadline(90),
                  status: "active" as const,
                },
                {
                  id: "goal-runway",
                  metric: "runway" as const,
                  targetValue: 12,
                  currentValue: runway,
                  progressPct: Math.min((runway / 12) * 100, 100),
                  deadline: deadline(120),
                  status: "active" as const,
                },
                {
                  id: "goal-burn",
                  metric: "burn_rate" as const,
                  targetValue: Math.max(burnRate * 0.9, burnRate - 5_000),
                  currentValue: burnRate,
                  progressPct: burnRate === 0 ? 100 : Math.min((Math.max(burnRate - burnRate * 0.9, 0) / Math.max(burnRate - Math.max(burnRate * 0.9, burnRate - 5_000), 1)) * 100, 100),
                  deadline: deadline(60),
                  status: "active" as const,
                },
              ];

        return (
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Target className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-foreground font-semibold">Goals & Milestones</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {goals.map((goal) => {
                const isOnTrack = goal.progressPct >= 60;
                const statusStyles = {
                  active: "border-primary/30",
                  achieved: "border-emerald-500/30 bg-emerald-500/5",
                  missed: "border-red-500/30 bg-red-500/5",
                };
                const statusLabels = {
                  active: "In Progress",
                  achieved: "Achieved",
                  missed: "Missed",
                };
                const statusColors = {
                  active: "text-primary",
                  achieved: "text-emerald-500",
                  missed: "text-red-500",
                };
                const progressColor =
                  goal.status === "achieved"
                    ? "hsl(142, 71%, 45%)"
                    : goal.status === "missed"
                      ? "hsl(0, 84%, 60%)"
                      : "hsl(var(--primary))";

                return (
                  <div key={goal.id} className={`border rounded-xl p-5 ${statusStyles[goal.status]}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">
                        {goal.metric.replace("_", " ")}
                      </span>
                      <span className={`text-[10px] font-semibold uppercase ${statusColors[goal.status]}`}>
                        {statusLabels[goal.status]}
                      </span>
                    </div>
                    <div className="flex items-center justify-center mb-3">
                      <RingStat value={goal.progressPct} max={100} label="Progress" color={progressColor} size={90} />
                    </div>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-muted-foreground">{Math.round(goal.progressPct)}% complete</span>
                      <span className={isOnTrack ? "text-emerald-500" : "text-yellow-500"}>
                        {isOnTrack ? "On track" : "Needs attention"}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Current: <span className="text-foreground font-medium">{fmt$(goal.currentValue)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Target: <span className="text-foreground font-medium">{fmt$(goal.targetValue)}</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Deadline: {new Date(goal.deadline).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SUGGESTED ACTIONS                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-foreground font-semibold">Suggested Actions</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(health.components).map(([name, score]) => (
            <span
              key={name}
              className="inline-flex items-center rounded-full border border-border bg-secondary/30 px-3 py-1 text-xs text-foreground"
            >
              {name}: {score}
            </span>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CASH FLOW MINI STATS                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {mercury?.cashFlow && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm font-medium">
                Inflows (30d)
              </span>
              <ArrowDownRight className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {fmt$(mercury.cashFlow.inflows30d)}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm font-medium">
                Outflows (30d)
              </span>
              <ArrowUpRight className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {fmt$(mercury.cashFlow.outflows30d)}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm font-medium">
                Burn
              </span>
              <TrendingDown className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {fmt$(mercury.cashFlow.burnRate)}
              <span className="text-xs text-muted-foreground ml-2">/month</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

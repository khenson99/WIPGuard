"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  Wallet,
  TrendingDown,
  Flame,
  ShieldCheck,
  Target,
  Lightbulb,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { AnalyticsDashboardData, ProviderFreshness } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";
import { FinanceDataEmptyState } from "./finance-empty-state";
import { SectionCard, InsightCard, fmt$, fmtPct } from "./dashboard-primitives";
import {
  projectMrr,
  buildRunwayScenarios,
  computeFinancialGoals,
  runSensitivityAnalysis,
  scoreFinancialHealth,
  type MrrProjection,
  type RunwayScenario,
  type FinancialGoal,
  type SensitivityResult,
  type FinanceHealthScore,
} from "@/lib/analytics/finance-modeling";

/* ── Helpers ─────────────────────────────────────────── */

function fmtMonths(n: number): string {
  if (n >= 999) return "∞";
  return `${n.toFixed(1)}mo`;
}

function runwayColor(months: number): string {
  if (months >= 999) return "text-emerald-500";
  if (months >= 12) return "text-emerald-500";
  if (months >= 6) return "text-yellow-500";
  return "text-red-500";
}

function runwayBgColor(months: number): string {
  if (months >= 999) return "bg-emerald-500";
  if (months >= 12) return "bg-emerald-500";
  if (months >= 6) return "bg-yellow-500";
  return "bg-red-500";
}

function healthColor(score: number): string {
  if (score >= 80) return "hsl(142, 71%, 45%)"; // green
  if (score >= 60) return "hsl(48, 96%, 53%)";  // yellow
  if (score >= 40) return "hsl(25, 95%, 53%)";  // orange
  return "hsl(0, 84%, 60%)";                     // red
}

function gradeColor(grade: string): string {
  if (grade === "A") return "text-emerald-500";
  if (grade === "B") return "text-emerald-400";
  if (grade === "C") return "text-yellow-500";
  if (grade === "D") return "text-orange-500";
  return "text-red-500";
}

/* ── Props ───────────────────────────────────────────── */

interface FinanceTabProps {
  data: AnalyticsDashboardData | null;
}

/* ── Component ───────────────────────────────────────── */

export function FinanceTab({ data }: FinanceTabProps) {
  // --- All hooks must be called unconditionally (before any early returns) ---
  const [churnDelta, setChurnDelta] = useState(0);
  const [growthDelta, setGrowthDelta] = useState(0);
  const [burnDelta, setBurnDelta] = useState(0);

  // Computed models — safe with null data (functions handle missing providers gracefully)
  const mrrProjections = useMemo(() => (data ? projectMrr(data, 12) : []), [data]);
  const scenarios = useMemo(() => (data ? buildRunwayScenarios(data, 24) : []), [data]);
  const goals = useMemo(() => (data ? computeFinancialGoals(data) : []), [data]);
  const health = useMemo(() => (data ? scoreFinancialHealth(data) : null), [data]);
  const sensitivityResults = useMemo(
    () => (data ? runSensitivityAnalysis(data, {
      churnDelta: churnDelta / 100,
      growthDelta: growthDelta / 100,
      burnDelta: burnDelta / 100,
    }) : []),
    [data, churnDelta, growthDelta, burnDelta]
  );

  // --- Empty state: no data at all ---
  if (!data) {
    return (
      <FinanceDataEmptyState
        title="No financial data available"
        message="Finance analytics payload is missing."
      />
    );
  }

  const stripe = data.stripe;
  const mercury = data.mercury;
  const financeErrors = data.errors
    .filter((entry) => entry.source === "stripe" || entry.source === "mercury")
    .map((entry) => `${entry.source}: ${entry.message}`);
  const freshnessErrors = [
    data.freshness.stripe?.lastError ? `stripe: ${data.freshness.stripe.lastError}` : null,
    data.freshness.mercury?.lastError ? `mercury: ${data.freshness.mercury.lastError}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  const stripeFreshness: ProviderFreshness | undefined = data.freshness?.stripe;
  const mercuryFreshness: ProviderFreshness | undefined = data.freshness?.mercury;

  const stripeHasStatus = Boolean(stripeFreshness && stripeFreshness.source !== "none");
  const mercuryHasStatus = Boolean(mercuryFreshness && mercuryFreshness.source !== "none");

  const stripeDisconnected = stripeHasStatus && stripeFreshness?.status === "DISCONNECTED";
  const mercuryDisconnected = mercuryHasStatus && mercuryFreshness?.status === "DISCONNECTED";

  const stripeConnected = stripeHasStatus && stripeFreshness?.status !== "DISCONNECTED";
  const mercuryConnected = mercuryHasStatus && mercuryFreshness?.status !== "DISCONNECTED";

  const shouldFilterMissingCredentialReason = (reason: string): boolean => {
    const trimmed = reason.trim();
    return (
      trimmed.includes("Missing STRIPE_SECRET_KEY") ||
      trimmed.includes("Missing MERCURY_API_TOKEN")
    );
  };

  const emptyStateReasons = [...financeErrors, ...freshnessErrors].filter(
    (reason) => !shouldFilterMissingCredentialReason(reason)
  );

  const shouldShowConnectPrompt =
    !stripe &&
    !mercury &&
    stripeDisconnected &&
    mercuryDisconnected &&
    emptyStateReasons.length === 0;

  // If neither integration is connected (explicitly disconnected), show a full empty state
  if (shouldShowConnectPrompt) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <DollarSign className="w-7 h-7 text-primary" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-foreground font-semibold">Connect your finance integrations</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Link Stripe and Mercury to see revenue, subscriptions, cash flow, and runway metrics here.
          </p>
        </div>
        <Link
          href="/settings?tab=integrations"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go to Settings
        </Link>
      </div>
    );
  }

  // Connection status banners
  const connectionBanners: { label: string; status: "warning" | "error" }[] = [];
  if (stripeDisconnected) {
    connectionBanners.push({ label: "Stripe is not connected", status: "warning" });
  } else if (stripeConnected && stripeFreshness?.status === "ERROR") {
    connectionBanners.push({ label: `Stripe connection error: ${stripeFreshness.lastError ?? "unknown"}`, status: "error" });
  }
  if (mercuryDisconnected) {
    connectionBanners.push({ label: "Mercury is not connected", status: "warning" });
  } else if (mercuryConnected && mercuryFreshness?.status === "ERROR") {
    connectionBanners.push({ label: `Mercury connection error: ${mercuryFreshness.lastError ?? "unknown"}`, status: "error" });
  }

  if (!stripe && !mercury) {
    return (
      <div className="space-y-6">
        {/* Connection Banners */}
        {connectionBanners.length > 0 && (
          <div className="space-y-2">
            {connectionBanners.map((banner) => (
	              <div
	                key={banner.label}
	                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
	                  banner.status === "error"
	                    ? "border-red-500/40 bg-red-500/10 text-red-600"
	                    : "border-amber-500/40 bg-amber-500/10 text-amber-600"
	                }`}
	              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{banner.label}</span>
                <Link href="/settings?tab=integrations" className="font-medium underline underline-offset-2 hover:no-underline">
                  Settings
                </Link>
              </div>
            ))}
          </div>
        )}

        <FinanceDataEmptyState
          title="Finance dashboard data is unavailable"
          message="Stripe and Mercury data could not be loaded for this range."
          reasons={emptyStateReasons}
        />
      </div>
    );
  }

  // --- Extract current metrics ---
  const mrr = stripe?.revenue?.mrr ?? 0;
  const mrrChange = stripe?.revenue?.mrrChange ?? 0;
  const cashBalance = mercury?.cashFlow?.totalBalance ?? 0;
  const burnRate = mercury?.cashFlow?.burnRate ?? 0;
  const runway = mercury?.cashFlow?.runway ?? 0;

  // Projected 6-month values from MRR model
  const mrr6m = mrrProjections[6]?.mrr ?? mrr;
  const expectedScenario = scenarios.find((s) => s.label === "Expected");
  const cashBalance6m = expectedScenario?.projectedCash?.[6]?.cash ?? cashBalance;

  return (
    <div className="space-y-6">
      {/* Connection Banners */}
      {connectionBanners.length > 0 && (
        <div className="space-y-2">
          {connectionBanners.map((banner) => (
            <div
              key={banner.label}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
                banner.status === "error"
                  ? "border-red-500/40 bg-red-500/10 text-red-600"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-600"
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{banner.label}</span>
              <Link href="/settings?tab=integrations" className="font-medium underline underline-offset-2 hover:no-underline">
                Settings
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ═══ A — COMMAND STRIP ═══════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Health Score Gauge */}
        {health && (
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center justify-center">
            <RingStat
              value={health.overall}
              max={100}
              label="Financial Health"
              color={healthColor(health.overall)}
              size={100}
            />
            <p className={`mt-2 text-lg font-bold ${gradeColor(health.grade)}`}>
              Grade {health.grade}
            </p>
          </div>
        )}

        {/* MRR */}
        <StatCard
          label="Monthly Recurring Revenue"
          value={fmt$(mrr)}
          change={fmtPct(Math.abs(mrrChange))}
          changeType={mrrChange >= 0 ? "positive" : "negative"}
          subtitle={`→ ${fmt$(mrr6m)} in 6mo`}
          icon={DollarSign}
        />

        {/* Runway */}
        <StatCard
          label="Runway"
          value={fmtMonths(runway)}
          changeType={runway >= 12 ? "positive" : runway >= 6 ? "neutral" : "negative"}
          subtitle={runway < 999 ? `Zero-cash ~${expectedScenario?.zeroDate ?? "N/A"}` : "Sustainable cash flow"}
          icon={Clock}
        />

        {/* Burn Rate */}
        <StatCard
          label="Monthly Burn"
          value={fmt$(burnRate)}
          subtitle="Net outflows / month"
          icon={Flame}
        />

        {/* Cash Balance */}
        <StatCard
          label="Cash Balance"
          value={fmt$(cashBalance)}
          subtitle={`→ ${fmt$(cashBalance6m)} in 6mo`}
          icon={Wallet}
        />
      </div>

      {/* ═══ B — MRR PROJECTION CHART ════════════════════════ */}
      <SectionCard title="MRR Projection" subtitle="12-month forward model based on current growth and churn rates">
        <MrrProjectionChart
          projections={mrrProjections}
          historicalTrend={stripe?.revenueTrend ?? []}
        />
      </SectionCard>

      {/* ═══ C — RUNWAY SCENARIO PANEL ═══════════════════════ */}
      <SectionCard title="Runway Scenarios" subtitle="Cash runway under best, expected, and worst-case burn assumptions">
        <RunwayScenarioPanel scenarios={scenarios} cashBalance={cashBalance} />
      </SectionCard>

      {/* ═══ D — SENSITIVITY ANALYSIS ════════════════════════ */}
      <SectionCard title="What-If Sensitivity" subtitle="Drag sliders to explore how changes affect runway and MRR">
        <SensitivityPanel
          results={sensitivityResults}
          churnDelta={churnDelta}
          growthDelta={growthDelta}
          burnDelta={burnDelta}
          onChurnChange={setChurnDelta}
          onGrowthChange={setGrowthDelta}
          onBurnChange={setBurnDelta}
        />
      </SectionCard>

      {/* ═══ E — GOALS & MILESTONES ══════════════════════════ */}
      {goals.length > 0 && (
        <SectionCard title="Goals & Milestones" subtitle="Auto-generated targets based on your current metrics">
          <GoalsPanel goals={goals} />
        </SectionCard>
      )}

      {/* ═══ F — SUGGESTIONS & NEXT ACTIONS ══════════════════ */}
      {health && health.topSuggestions.length > 0 && (
        <SectionCard title="Suggested Actions" subtitle="Prioritized recommendations to improve financial health">
          <SuggestionsPanel health={health} />
        </SectionCard>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SUB-COMPONENTS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ── B: MRR Projection Chart ─────────────────────────── */

function MrrProjectionChart({
  projections,
  historicalTrend,
}: {
  projections: MrrProjection[];
  historicalTrend: { month: string; revenue: number }[];
}) {
  // Combine historical (last 6) + projected (months 1–12)
  const historical = historicalTrend.slice(-6).map((p) => ({
    label: p.month,
    mrr: p.revenue,
    type: "historical" as const,
  }));
  const projected = projections.slice(1).map((p) => ({
    label: p.label,
    mrr: p.mrr,
    type: "projected" as const,
  }));
  const allPoints = [...historical, ...projected];

  if (allPoints.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No MRR data available for projections.</p>;
  }

  const maxMrr = Math.max(...allPoints.map((p) => p.mrr), 1);
  const chartHeight = 200;
  const chartWidth = allPoints.length * 50;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Y-axis labels */}
        <div className="flex items-end gap-0.5" style={{ height: chartHeight + 40 }}>
          {allPoints.map((point, idx) => {
            const heightPct = (point.mrr / maxMrr) * 100;
            const isProjected = point.type === "projected";

            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1" style={{ minWidth: 36 }}>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {fmt$(point.mrr)}
                </span>
                <div
                  className={`w-full rounded-t-md transition-all duration-300 ${
                    isProjected
                      ? "bg-gradient-to-t from-primary/20 to-primary/50 border border-dashed border-primary/40"
                      : "bg-gradient-to-t from-primary/40 to-primary"
                  }`}
                  style={{ height: `${(heightPct / 100) * chartHeight}px`, minHeight: 4 }}
                />
                <span className={`text-[10px] text-center ${isProjected ? "text-primary/70" : "text-muted-foreground"}`}>
                  {point.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary" />
            Historical
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary/30 border border-dashed border-primary/40" />
            Projected
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── C: Runway Scenario Panel ────────────────────────── */

function RunwayScenarioPanel({
  scenarios,
  cashBalance,
}: {
  scenarios: RunwayScenario[];
  cashBalance: number;
}) {
  if (scenarios.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No cash data available for runway modeling.</p>;
  }

  const maxRunway = Math.max(...scenarios.map((s) => Math.min(s.runway, 36)), 1);

  return (
    <div className="space-y-6">
      {/* Scenario bars */}
      <div className="space-y-4">
        {scenarios.map((scenario) => {
          const cappedRunway = Math.min(scenario.runway, 36);
          const pct = (cappedRunway / maxRunway) * 100;
          const color = runwayBgColor(scenario.runway);

          return (
            <div key={scenario.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{scenario.label}</span>
                  <span className="text-xs text-muted-foreground">
                    Burn: {fmt$(scenario.monthlyBurn)}/mo
                  </span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${runwayColor(scenario.runway)}`}>
                  {fmtMonths(scenario.runway)}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${color}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              {scenario.zeroDate && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Zero-cash date: {scenario.zeroDate}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Cash waterfall mini chart */}
      {scenarios.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">
            Expected Cash Trajectory
          </h4>
          <CashWaterfallChart
            points={scenarios.find((s) => s.label === "Expected")?.projectedCash ?? []}
          />
        </div>
      )}
    </div>
  );
}

function CashWaterfallChart({ points }: { points: { month: number; cash: number }[] }) {
  if (points.length === 0) return null;

  const maxCash = Math.max(...points.map((p) => Math.max(p.cash, 0)), 1);
  const displayed = points.slice(0, 18); // Show up to 18 months

  return (
    <div className="flex items-end gap-px h-32">
      {displayed.map((point) => {
        const heightPct = Math.max((Math.max(point.cash, 0) / maxCash) * 100, 2);
        const isNegative = point.cash <= 0;

        return (
          <div key={point.month} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className={`w-full rounded-t-sm transition-all duration-300 ${
                isNegative ? "bg-red-500/60" : "bg-emerald-500/40"
              }`}
              style={{ height: `${heightPct}%`, minHeight: 2 }}
            />
            {point.month % 3 === 0 && (
              <span className="text-[9px] text-muted-foreground">M{point.month}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── D: Sensitivity Panel ────────────────────────────── */

function SensitivityPanel({
  results,
  churnDelta,
  growthDelta,
  burnDelta,
  onChurnChange,
  onGrowthChange,
  onBurnChange,
}: {
  results: SensitivityResult[];
  churnDelta: number;
  growthDelta: number;
  burnDelta: number;
  onChurnChange: (v: number) => void;
  onGrowthChange: (v: number) => void;
  onBurnChange: (v: number) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Sliders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SliderControl
          label="Churn Rate"
          value={churnDelta}
          min={-5}
          max={5}
          step={0.5}
          unit="%"
          onChange={onChurnChange}
          description={churnDelta === 0 ? "No change" : `${churnDelta > 0 ? "+" : ""}${churnDelta}% churn`}
        />
        <SliderControl
          label="Growth Rate"
          value={growthDelta}
          min={-10}
          max={10}
          step={1}
          unit="%"
          onChange={onGrowthChange}
          description={growthDelta === 0 ? "No change" : `${growthDelta > 0 ? "+" : ""}${growthDelta}% growth`}
        />
        <SliderControl
          label="Burn Rate"
          value={burnDelta}
          min={-20}
          max={20}
          step={2}
          unit="%"
          onChange={onBurnChange}
          description={burnDelta === 0 ? "No change" : `${burnDelta > 0 ? "+" : ""}${burnDelta}% burn`}
        />
      </div>

      {/* Impact results */}
      {results.length > 0 && (churnDelta !== 0 || growthDelta !== 0 || burnDelta !== 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {results.map((result) => (
            <div
              key={result.parameter}
              className="rounded-lg border border-border bg-secondary/30 p-4"
            >
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {result.parameter}
              </p>
              <p className="text-sm text-foreground mb-2">{result.description}</p>
              <div className="flex gap-4 text-xs">
                <span>
                  Runway:{" "}
                  <span className={result.impactOnRunway >= 0 ? "text-emerald-500 font-semibold" : "text-red-500 font-semibold"}>
                    {result.impactOnRunway >= 0 ? "+" : ""}{result.impactOnRunway.toFixed(1)}mo
                  </span>
                </span>
                <span>
                  MRR@12mo:{" "}
                  <span className={result.impactOnMrr12m >= 0 ? "text-emerald-500 font-semibold" : "text-red-500 font-semibold"}>
                    {result.impactOnMrr12m >= 0 ? "+" : ""}{fmt$(result.impactOnMrr12m)}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {churnDelta === 0 && growthDelta === 0 && burnDelta === 0 && (
        <p className="text-sm text-muted-foreground text-center py-3">
          Adjust the sliders above to see how changes impact your runway and MRR.
        </p>
      )}
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  description,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="text-sm tabular-nums font-semibold text-primary">
          {value > 0 ? "+" : ""}{value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
        aria-label={`${label} adjustment`}
      />
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/* ── E: Goals Panel ──────────────────────────────────── */

function GoalsPanel({ goals }: { goals: FinancialGoal[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {goals.map((goal) => (
        <div
          key={goal.id}
          className="rounded-lg border border-border bg-secondary/20 p-4"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{goal.label}</span>
            </div>
            {goal.onTrack ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
                <CheckCircle2 className="w-3 h-3" /> On track
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-yellow-500 font-medium">
                <AlertTriangle className="w-3 h-3" /> Needs attention
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>
                {goal.unit === "currency" ? fmt$(goal.current) : goal.unit === "percent" ? fmtPct(goal.current) : goal.current.toFixed(1)}
              </span>
              <span>
                {goal.unit === "currency" ? fmt$(goal.target) : goal.unit === "percent" ? fmtPct(goal.target) : goal.target.toFixed(1)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  goal.onTrack ? "bg-emerald-500" : "bg-yellow-500"
                }`}
                style={{ width: `${Math.min(goal.progress, 100)}%` }}
              />
            </div>
          </div>

          {/* Meta info */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{Math.round(goal.progress)}% complete</span>
            {goal.projectedDate && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Est. {goal.projectedDate}
              </span>
            )}
          </div>

          {/* Suggestion */}
          <div className="mt-3 flex items-start gap-2 rounded-md bg-primary/5 px-3 py-2">
            <Lightbulb className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-[11px] text-foreground">{goal.suggestion}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── F: Suggestions Panel ────────────────────────────── */

function SuggestionsPanel({ health }: { health: FinanceHealthScore }) {
  return (
    <div className="space-y-4">
      {/* Component scores mini row */}
      <div className="flex flex-wrap gap-2 mb-2">
        {health.components.map((comp) => (
          <span
            key={comp.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
              comp.score >= 80
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                : comp.score >= 60
                  ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-600"
                  : "border-red-500/20 bg-red-500/5 text-red-600"
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            {comp.label}: {comp.score}
          </span>
        ))}
      </div>

      {/* Suggestion cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {health.topSuggestions.map((suggestion, idx) => {
          const severity = suggestion.priority <= 1 ? "critical" : suggestion.priority <= 2 ? "warning" : "info";
          return (
            <InsightCard
              key={idx}
              title={suggestion.title}
              insight={suggestion.action}
              action={suggestion.expectedImpact}
              severity={severity}
            />
          );
        })}
      </div>
    </div>
  );
}

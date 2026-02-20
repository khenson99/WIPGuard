// ─── Forecast Engine ─────────────────────────────────────
// Revenue and runway projection engine for financial planning.
// Builds multi-scenario forecasts from Stripe MRR and Mercury
// cash data. All functions are pure — no side effects.

import type { AnalyticsDashboardData } from "./types";

// ── Exported interfaces ──────────────────────────────────

export interface ForecastPoint {
  month: number;
  label: string;
  value: number;
}

export interface ForecastScenarioData {
  id: string;
  name: string;
  monthlyGrowthRate: number;
  monthlyChurnRate: number;
  additionalBurn: number;
  revenue: ForecastPoint[];
  cash: ForecastPoint[];
  runway: number;
}

// ── Helpers ──────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Generate a month label like "Mar '25" offset by `i` months from now. */
function monthLabel(offsetMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  const short = d.toLocaleString("en-US", { month: "short" });
  const yr = String(d.getFullYear()).slice(2);
  return `${short} '${yr}`;
}

// ── Core projection functions ────────────────────────────

/**
 * Project MRR over `months` periods using compound growth minus churn.
 *
 * Formula per month: mrr = mrr * (1 + growthRate) * (1 - churnRate)
 */
export function projectRevenue(
  baseMrr: number,
  growthRate: number,
  churnRate: number,
  months: number,
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  let mrr = baseMrr;

  for (let i = 0; i <= months; i++) {
    points.push({
      month: i,
      label: monthLabel(i),
      value: Math.round(mrr * 100) / 100,
    });
    mrr = mrr * (1 + growthRate) * (1 - churnRate);
  }

  return points;
}

/**
 * Project cash balance forward.
 *
 * Each month: balance = balance + inflows - burn
 * If balance hits zero, remaining months are clamped to 0.
 */
export function projectRunway(
  balance: number,
  burn: number,
  inflows: number,
  months: number,
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  let cash = balance;

  for (let i = 0; i <= months; i++) {
    points.push({
      month: i,
      label: monthLabel(i),
      value: Math.round(Math.max(cash, 0) * 100) / 100,
    });
    cash = cash + inflows - burn;
  }

  return points;
}

/**
 * Calculate the runway in months — the point where cash balance
 * first goes to zero (or the full projection length if it never does).
 */
function computeRunwayMonths(
  balance: number,
  burn: number,
  inflows: number,
  months: number,
): number {
  if (balance <= 0) return 0;

  let cash = balance;
  for (let i = 1; i <= months; i++) {
    const nextCash = cash + inflows - burn;
    if (nextCash <= 0) {
      // Interpolate fractional month using unclamped values.
      const frac = cash / (cash - nextCash);
      return Math.round((i - 1 + frac) * 10) / 10;
    }
    cash = nextCash;
  }

  return months;
}

// ── Scenario builders ────────────────────────────────────

/**
 * Build a single forecast scenario from live dashboard data
 * with optional overrides for growth, churn, and extra burn.
 */
export function buildForecastScenario(
  data: AnalyticsDashboardData,
  overrides: Partial<
    Pick<
      ForecastScenarioData,
      "monthlyGrowthRate" | "monthlyChurnRate" | "additionalBurn"
    >
  >,
  name?: string,
): ForecastScenarioData {
  const stripe = data.stripe;
  const mercury = data.mercury;

  // Base values from live data (fallback to 0 when provider missing)
  const baseMrr = stripe?.revenue.mrr ?? 0;
  const baseGrowth = stripe
    ? stripe.revenue.revenueGrowth / 100
    : 0;
  const baseChurn = stripe
    ? stripe.subscriptions.churnRate / 100
    : 0;
  const balance = mercury?.cashFlow.totalBalance ?? 0;
  const baseBurn = mercury?.cashFlow.burnRate ?? 0;
  const baseInflows = mercury?.cashFlow.inflows30d ?? 0;

  // Apply overrides
  const growthRate = overrides.monthlyGrowthRate ?? baseGrowth;
  const churnRate = overrides.monthlyChurnRate ?? baseChurn;
  const additionalBurn = overrides.additionalBurn ?? 0;
  const totalBurn = baseBurn + additionalBurn;

  const projectionMonths = 24;

  const revenue = projectRevenue(baseMrr, growthRate, churnRate, projectionMonths);
  const cash = projectRunway(balance, totalBurn, baseInflows, projectionMonths);
  const runway = computeRunwayMonths(balance, totalBurn, baseInflows, projectionMonths);

  const id = (name ?? "custom").toLowerCase().replace(/\s+/g, "-");

  return {
    id,
    name: name ?? "Custom",
    monthlyGrowthRate: growthRate,
    monthlyChurnRate: churnRate,
    additionalBurn,
    revenue,
    cash,
    runway,
  };
}

/**
 * Build the three default scenarios: Optimistic, Base, Conservative.
 *
 * - Optimistic: growth +50%, churn -30%
 * - Base: as-is from live data
 * - Conservative: growth -30%, churn +50%
 */
export function buildDefaultScenarios(
  data: AnalyticsDashboardData,
): ForecastScenarioData[] {
  const stripe = data.stripe;
  const baseGrowth = stripe ? stripe.revenue.revenueGrowth / 100 : 0;
  const baseChurn = stripe ? stripe.subscriptions.churnRate / 100 : 0;
  const growthDelta = stripe ? Math.max(Math.abs(baseGrowth) * 0.5, 0.03) : 0;
  const churnDelta = stripe ? Math.max(baseChurn * 0.3, 0.01) : 0;

  const optimisticGrowth = clamp(baseGrowth + growthDelta, -1, 1);
  const conservativeGrowth = clamp(baseGrowth - growthDelta, -1, 1);
  const optimisticChurn = clamp(baseChurn - churnDelta, 0, 1);
  const conservativeChurn = clamp(baseChurn + churnDelta, 0, 1);

  const optimistic = buildForecastScenario(
    data,
    {
      monthlyGrowthRate: optimisticGrowth,
      monthlyChurnRate: optimisticChurn,
    },
    "Optimistic",
  );

  const base = buildForecastScenario(data, {}, "Base");

  const conservative = buildForecastScenario(
    data,
    {
      monthlyGrowthRate: conservativeGrowth,
      monthlyChurnRate: conservativeChurn,
    },
    "Conservative",
  );

  return [optimistic, base, conservative];
}

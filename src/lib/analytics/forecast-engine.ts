// Forecast engine — pure computation functions for financial scenario modeling.
// Complements finance-modeling.ts (which works with AnalyticsDashboardData)
// by accepting raw numeric inputs for flexibility and testability.

import type {
  ForecastAssumptions,
  ForecastMonth,
  ForecastScenarioData,
  StripeData,
  MercuryData,
} from "@/lib/analytics/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthLabel(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7); // YYYY-MM
}

// ---------------------------------------------------------------------------
// Core projections
// ---------------------------------------------------------------------------

/**
 * Project monthly revenue & MRR forward from current values.
 *
 * Each month applies compound growth and churn:
 *   newMrr = prevMrr * (1 + growthRate) * (1 - churnRate)
 *
 * Returns an array of ForecastMonth with revenue, expenses, cash balance,
 * MRR, and per-month runway estimate.
 */
export function projectRevenue(
  currentMrr: number,
  monthlyGrowthRate: number,
  monthlyChurnRate: number,
  cashBalance: number,
  monthlyExpenses: number,
  months: number = 18,
): ForecastMonth[] {
  const result: ForecastMonth[] = [];
  let mrr = currentMrr;
  let cash = cashBalance;

  for (let i = 1; i <= months; i++) {
    // Apply growth and churn to MRR
    const netGrowthFactor = (1 + monthlyGrowthRate) * (1 - monthlyChurnRate);
    mrr = Math.max(mrr * netGrowthFactor, 0);

    const revenue = mrr;
    const expenses = monthlyExpenses;
    cash = cash + revenue - expenses;

    // Per-month forward runway: how many months of cash left at current burn
    const netBurn = expenses - revenue;
    const runway = netBurn <= 0 ? null : cash > 0 ? cash / netBurn : 0;

    result.push({
      month: monthLabel(i),
      projectedRevenue: Math.round(revenue * 100) / 100,
      projectedExpenses: Math.round(expenses * 100) / 100,
      projectedCashBalance: Math.round(cash * 100) / 100,
      projectedMrr: Math.round(mrr * 100) / 100,
      projectedRunway: runway !== null ? Math.round(runway * 10) / 10 : null,
    });
  }

  return result;
}

/**
 * Calculate months of runway from current cash and burn rate.
 * Returns null if burn rate is zero or negative (infinite runway).
 */
export function projectRunway(
  cashBalance: number,
  burnRate: number,
  burnDelta: number = 0,
): number | null {
  const effectiveBurn = burnRate + burnDelta;
  if (effectiveBurn <= 0) return null; // infinite runway
  if (cashBalance <= 0) return 0;
  return Math.round((cashBalance / effectiveBurn) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------

/**
 * Build a complete forecast scenario from Stripe + Mercury data
 * and a set of user-configurable assumptions.
 */
export function buildForecastScenario(
  stripe: StripeData | null,
  mercury: MercuryData | null,
  assumptions: ForecastAssumptions,
  opts: { id?: string; name?: string; months?: number } = {},
): ForecastScenarioData {
  const currentMrr = stripe?.revenue?.mrr ?? 0;
  const baseGrowthRate = (stripe?.revenue?.revenueGrowth ?? 0) / 100;
  const baseChurnRate = (stripe?.subscriptions?.churnRate ?? 0) / 100;
  const cashBalance = mercury?.cashFlow?.totalBalance ?? 0;
  const baseBurnRate = mercury?.cashFlow?.burnRate ?? 0;

  // Apply assumption deltas
  const growthRate = baseGrowthRate + assumptions.revenueGrowthRate / 100;
  const churnRate = Math.max(baseChurnRate + assumptions.churnRateDelta / 100, 0);
  const monthlyExpenses =
    baseBurnRate +
    assumptions.burnRateDelta +
    assumptions.additionalMonthlyExpense -
    assumptions.additionalMonthlyRevenue;

  // Effective starting MRR includes additional recurring revenue
  const effectiveMrr = currentMrr + assumptions.additionalMonthlyRevenue;

  const forecastMonths = opts.months ?? 18;

  const months = projectRevenue(
    effectiveMrr,
    growthRate,
    churnRate,
    cashBalance,
    monthlyExpenses,
    forecastMonths,
  );

  const runwayMonths = projectRunway(
    cashBalance,
    baseBurnRate,
    assumptions.burnRateDelta,
  );

  return {
    id: opts.id ?? crypto.randomUUID(),
    name: opts.name ?? "Custom Scenario",
    assumptions,
    months,
    runwayMonths,
  };
}

/**
 * Generate three default forecast scenarios:
 * - Base case: current rates unchanged
 * - Optimistic: +50% revenue growth, -20% churn
 * - Conservative: -30% revenue growth, +25% churn, +15% burn
 */
export function buildDefaultScenarios(
  stripe: StripeData | null,
  mercury: MercuryData | null,
  months: number = 18,
): ForecastScenarioData[] {
  const baseBurn = mercury?.cashFlow?.burnRate ?? 0;

  const base: ForecastAssumptions = {
    revenueGrowthRate: 0,
    churnRateDelta: 0,
    burnRateDelta: 0,
    additionalMonthlyExpense: 0,
    additionalMonthlyRevenue: 0,
  };

  const optimistic: ForecastAssumptions = {
    revenueGrowthRate: 50, // +50% on top of current growth rate
    churnRateDelta: -20,   // reduce churn by 20 percentage points
    burnRateDelta: 0,
    additionalMonthlyExpense: 0,
    additionalMonthlyRevenue: 0,
  };

  const conservative: ForecastAssumptions = {
    revenueGrowthRate: -30,          // -30% off current growth rate
    churnRateDelta: 25,              // increase churn by 25 pp
    burnRateDelta: baseBurn * 0.15,  // +15% burn increase
    additionalMonthlyExpense: 0,
    additionalMonthlyRevenue: 0,
  };

  return [
    buildForecastScenario(stripe, mercury, base, {
      id: "default-base",
      name: "Base Case",
      months,
    }),
    buildForecastScenario(stripe, mercury, optimistic, {
      id: "default-optimistic",
      name: "Optimistic",
      months,
    }),
    buildForecastScenario(stripe, mercury, conservative, {
      id: "default-conservative",
      name: "Conservative",
      months,
    }),
  ];
}

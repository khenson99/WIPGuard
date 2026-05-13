import { describe, expect, it } from "vitest";
import {
  projectRevenue,
  projectRunway,
  buildForecastScenario,
  buildDefaultScenarios,
} from "@/lib/analytics/forecast-engine";
import type { StripeData, MercuryData, ForecastAssumptions } from "@/lib/analytics/types";

const META = { fetchedAt: "2026-01-15T00:00:00Z", nextRefresh: "2026-01-15T01:00:00Z", source: "live" as const };

function makeStripe(overrides: Partial<StripeData> = {}): StripeData {
  return {
    revenue: {
      mrr: 10_000,
      mrrChange: 1200,
      totalRevenue30d: 12_000,
      totalRevenuePrev30d: 10_800,
      revenueGrowth: 10,
      avgRevenuePerCustomer: 200,
    },
    subscriptions: {
      active: 50,
      pastDue: 2,
      canceled: 3,
      trialing: 5,
      churnRate: 4,
      recentChurnEvents: [],
    },
    payments: {
      succeeded: 48,
      failed: 2,
      successRate: 96,
    },
    revenueTrend: [],
    _meta: META,
    ...overrides,
  };
}

function makeMercury(overrides: Partial<MercuryData> = {}): MercuryData {
  return {
    accounts: [{ accountId: "a1", accountName: "Operating", balance: 500_000, type: "checking" }],
    cashFlow: {
      totalBalance: 500_000,
      inflows30d: 12_000,
      outflows30d: 45_000,
      netCashFlow: -33_000,
      runway: 15,
      burnRate: 45_000,
    },
    _meta: META,
    ...overrides,
  };
}

const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  revenueGrowthRate: 0,
  churnRateDelta: 0,
  burnRateDelta: 0,
  additionalMonthlyExpense: 0,
  additionalMonthlyRevenue: 0,
};

describe("projectRevenue", () => {
  it("returns one entry per month with YYYY-MM labels", () => {
    const result = projectRevenue(10_000, 0.1, 0.04, 50_000, 5_000, 12);
    expect(result).toHaveLength(12);
    expect(result[0].month).toMatch(/\d{4}-\d{2}/);
  });

  it("compounds correctly and updates cash", () => {
    const result = projectRevenue(10_000, 0.1, 0.04, 50_000, 5_000, 2);
    expect(result[0].projectedMrr).toBeCloseTo(10_560, 2);
    expect(result[1].projectedMrr).toBeCloseTo(11_151.36, 2);
    expect(result[0].projectedCashBalance).toBeCloseTo(55_560, 2);
  });

  it("handles negative growth", () => {
    const result = projectRevenue(10_000, -0.05, 0.02, 20_000, 8_000, 2);
    expect(result[0].projectedMrr).toBeLessThan(10_000);
    expect(result[1].projectedMrr).toBeLessThan(result[0].projectedMrr);
  });
});

describe("projectRunway", () => {
  it("returns null when effective burn is non-positive", () => {
    expect(projectRunway(100_000, 0, 0)).toBeNull();
    expect(projectRunway(100_000, -5_000, 0)).toBeNull();
  });

  it("returns 0 when cash is empty and burn is positive", () => {
    expect(projectRunway(0, 10_000, 0)).toBe(0);
  });

  it("returns a positive runway for positive burn", () => {
    const runway = projectRunway(120_000, 20_000, 0);
    expect(runway).toBeCloseTo(6, 1);
  });
});

describe("buildForecastScenario", () => {
  it("builds scenario using assumptions and keeps added revenue out of expenses", () => {
    const stripe = makeStripe();
    const mercury = makeMercury();
    const assumptions: ForecastAssumptions = {
      revenueGrowthRate: 5,
      churnRateDelta: 1,
      burnRateDelta: 2_000,
      additionalMonthlyExpense: 1_000,
      additionalMonthlyRevenue: 3_000,
    };

    const scenario = buildForecastScenario(stripe, mercury, assumptions, { months: 2 });
    expect(scenario.assumptions).toEqual(assumptions);
    expect(scenario.months).toHaveLength(2);

    const monthlyExpenses = 45_000 + 2_000 + 1_000;
    expect(scenario.months[0].projectedExpenses).toBeCloseTo(monthlyExpenses, 2);
    expect(scenario.months[0].projectedRevenue).toBeGreaterThan(10_000);
  });

  it("handles null stripe or mercury", () => {
    const scenario = buildForecastScenario(null, null, DEFAULT_ASSUMPTIONS, { months: 1 });
    expect(scenario.months).toHaveLength(1);
    expect(scenario.months[0].projectedMrr).toBe(0);
  });
});

describe("buildDefaultScenarios", () => {
  it("returns three scenarios with expected names", () => {
    const scenarios = buildDefaultScenarios(makeStripe(), makeMercury());
    expect(scenarios).toHaveLength(3);
    expect(scenarios.map((s) => s.name)).toEqual([
      "Base Case",
      "Optimistic",
      "Conservative",
    ]);
  });

  it("uses different assumption profiles", () => {
    const scenarios = buildDefaultScenarios(makeStripe(), makeMercury());
    const [base, optimistic, conservative] = scenarios;
    expect(base.assumptions.revenueGrowthRate).toBe(0);
    expect(optimistic.assumptions.revenueGrowthRate).toBe(50);
    expect(conservative.assumptions.revenueGrowthRate).toBe(-30);
  });
});

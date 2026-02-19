import { describe, expect, it } from "vitest";
import {
  projectRevenue,
  projectRunway,
  buildForecastScenario,
  buildDefaultScenarios,
} from "@/lib/analytics/forecast-engine";
import type { AnalyticsDashboardData, StripeData, MercuryData } from "@/lib/analytics/types";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

/* ─── Fixtures ────────────────────────────────────────────── */

const META = { fetchedAt: "2026-01-15T00:00:00Z", nextRefresh: "2026-01-15T01:00:00Z", source: "live" as const };
const TIME_RANGE = { preset: "30d" as const, from: "2025-12-16", to: "2026-01-15", days: 30, label: "Last 30 days" };

function makeStripe(overrides: Partial<StripeData> = {}): StripeData {
  return {
    revenue: {
      mrr: 10_000,
      mrrChange: 1200,
      totalRevenue30d: 12_000,
      totalRevenuePrev30d: 10_800,
      revenueGrowth: 10, // 10% monthly
      avgRevenuePerCustomer: 200,
    },
    subscriptions: {
      active: 50,
      pastDue: 2,
      canceled: 3,
      trialing: 5,
      churnRate: 4, // 4% monthly
      recentChurnEvents: [],
    },
    payments: {
      succeeded: 48,
      failed: 2,
      successRate: 96,
    },
    revenueTrend: [
      { month: "Aug 25", revenue: 7000 },
      { month: "Sep 25", revenue: 7800 },
      { month: "Oct 25", revenue: 8500 },
      { month: "Nov 25", revenue: 9200 },
      { month: "Dec 25", revenue: 9800 },
      { month: "Jan 26", revenue: 10000 },
    ],
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

function makeData(opts?: {
  stripe?: Partial<StripeData> | null;
  mercury?: Partial<MercuryData> | null;
}): AnalyticsDashboardData {
  const base = createEmptyAnalyticsDashboardData({ freshness: {}, timeRange: TIME_RANGE });
  return {
    ...base,
    stripe: opts?.stripe === null ? null : makeStripe(opts?.stripe ?? {}),
    mercury: opts?.mercury === null ? null : makeMercury(opts?.mercury ?? {}),
  };
}

/* ═══════════════════════════════════════════════════════════
   1. projectRevenue
   ═══════════════════════════════════════════════════════════ */

describe("projectRevenue", () => {
  it("returns months+1 entries (month 0 through months)", () => {
    const result = projectRevenue(10_000, 0.1, 0.04, 12);
    expect(result).toHaveLength(13);
    expect(result[0].month).toBe(0);
    expect(result[12].month).toBe(12);
  });

  it("month 0 is the base MRR", () => {
    const result = projectRevenue(10_000, 0.1, 0.04, 6);
    expect(result[0].value).toBe(10_000);
  });

  it("compounds correctly: mrr * (1 + growth) * (1 - churn)", () => {
    const result = projectRevenue(10_000, 0.1, 0.04, 2);
    // Month 1: 10000 * 1.10 * 0.96 = 10560
    expect(result[1].value).toBeCloseTo(10_560, 2);
    // Month 2: 10560 * 1.10 * 0.96 = 11151.36
    expect(result[2].value).toBeCloseTo(11_151.36, 2);
  });

  it("each point has month index and label", () => {
    const result = projectRevenue(10_000, 0.1, 0.04, 3);
    for (let i = 0; i <= 3; i++) {
      expect(result[i].month).toBe(i);
      expect(result[i].label).toBeDefined();
      expect(result[i].label.length).toBeGreaterThan(0);
    }
  });

  it("zero growth rate means only churn applies", () => {
    const result = projectRevenue(10_000, 0, 0.05, 3);
    // Month 1: 10000 * 1.0 * 0.95 = 9500
    expect(result[1].value).toBeCloseTo(9_500, 2);
    // Month 2: 9500 * 1.0 * 0.95 = 9025
    expect(result[2].value).toBeCloseTo(9_025, 2);
    // Month 3: 9025 * 1.0 * 0.95 = 8573.75
    expect(result[3].value).toBeCloseTo(8_573.75, 2);
  });

  it("zero churn rate means only growth applies", () => {
    const result = projectRevenue(10_000, 0.1, 0, 3);
    // Month 1: 10000 * 1.10 * 1.0 = 11000
    expect(result[1].value).toBeCloseTo(11_000, 2);
    // Month 2: 11000 * 1.10 * 1.0 = 12100
    expect(result[2].value).toBeCloseTo(12_100, 2);
    // Month 3: 12100 * 1.10 * 1.0 = 13310
    expect(result[3].value).toBeCloseTo(13_310, 2);
  });

  it("zero base MRR returns all zeros", () => {
    const result = projectRevenue(0, 0.1, 0.04, 6);
    for (const point of result) {
      expect(point.value).toBe(0);
    }
  });

  it("handles negative growth (contraction)", () => {
    const result = projectRevenue(10_000, -0.05, 0.02, 3);
    // Month 1: 10000 * 0.95 * 0.98 = 9310
    expect(result[1].value).toBeCloseTo(9_310, 2);
    // Each subsequent month should be smaller
    expect(result[2].value).toBeLessThan(result[1].value);
    expect(result[3].value).toBeLessThan(result[2].value);
  });
});

/* ═══════════════════════════════════════════════════════════
   2. projectRunway
   ═══════════════════════════════════════════════════════════ */

describe("projectRunway", () => {
  it("returns months+1 entries", () => {
    const result = projectRunway(500_000, 45_000, 12_000, 12);
    expect(result).toHaveLength(13);
    expect(result[0].month).toBe(0);
    expect(result[12].month).toBe(12);
  });

  it("month 0 is the initial balance", () => {
    const result = projectRunway(500_000, 45_000, 12_000, 6);
    expect(result[0].value).toBe(500_000);
  });

  it("each month: cash = prev + inflows - burn", () => {
    const result = projectRunway(500_000, 45_000, 12_000, 3);
    // Month 1: 500000 + 12000 - 45000 = 467000
    expect(result[1].value).toBeCloseTo(467_000, 2);
    // Month 2: 467000 + 12000 - 45000 = 434000
    expect(result[2].value).toBeCloseTo(434_000, 2);
    // Month 3: 434000 + 12000 - 45000 = 401000
    expect(result[3].value).toBeCloseTo(401_000, 2);
  });

  it("cash is clamped to zero (never negative)", () => {
    // Small balance, large burn: cash runs out quickly
    const result = projectRunway(50_000, 30_000, 5_000, 12);
    for (const point of result) {
      expect(point.value).toBeGreaterThanOrEqual(0);
    }
    // After enough months, should be zero
    const lastNonZero = result.findIndex((p) => p.value === 0);
    expect(lastNonZero).toBeGreaterThan(0);
  });

  it("when inflows > burn, cash grows", () => {
    const result = projectRunway(100_000, 10_000, 20_000, 6);
    // Net gain of 10000 per month
    expect(result[1].value).toBeCloseTo(110_000, 2);
    expect(result[2].value).toBeCloseTo(120_000, 2);
    // Cash should consistently increase
    for (let i = 1; i < result.length; i++) {
      expect(result[i].value).toBeGreaterThan(result[i - 1].value);
    }
  });

  it("when burn > inflows, cash shrinks", () => {
    const result = projectRunway(500_000, 45_000, 12_000, 6);
    // Net loss of 33000 per month
    for (let i = 1; i < result.length; i++) {
      expect(result[i].value).toBeLessThan(result[i - 1].value);
    }
  });

  it("zero balance with zero burn stays at zero", () => {
    const result = projectRunway(0, 0, 0, 6);
    for (const point of result) {
      expect(point.value).toBe(0);
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   3. buildForecastScenario
   ═══════════════════════════════════════════════════════════ */

describe("buildForecastScenario", () => {
  it("uses Stripe MRR as base revenue", () => {
    const data = makeData();
    const scenario = buildForecastScenario(data, {});
    // First revenue point should be the base MRR
    expect(scenario.revenue[0].value).toBe(10_000);
  });

  it("uses Mercury balance/burn/inflows for cash projection", () => {
    const data = makeData();
    const scenario = buildForecastScenario(data, {});
    // First cash point should be the total balance
    expect(scenario.cash[0].value).toBe(500_000);
  });

  it("revenue array has 25 points (0 through 24)", () => {
    const scenario = buildForecastScenario(makeData(), {});
    expect(scenario.revenue).toHaveLength(25);
    expect(scenario.revenue[0].month).toBe(0);
    expect(scenario.revenue[24].month).toBe(24);
  });

  it("cash array has 25 points (0 through 24)", () => {
    const scenario = buildForecastScenario(makeData(), {});
    expect(scenario.cash).toHaveLength(25);
    expect(scenario.cash[0].month).toBe(0);
    expect(scenario.cash[24].month).toBe(24);
  });

  it("respects override for growth rate", () => {
    const data = makeData();
    const defaultScenario = buildForecastScenario(data, {});
    const boosted = buildForecastScenario(data, { monthlyGrowthRate: 0.20 });

    // The override should produce different revenue projections
    expect(boosted.monthlyGrowthRate).toBe(0.20);
    expect(defaultScenario.monthlyGrowthRate).toBe(0.10); // 10% / 100
    // Higher growth means higher revenue in later months
    expect(boosted.revenue[12].value).toBeGreaterThan(defaultScenario.revenue[12].value);
  });

  it("respects override for churn rate", () => {
    const data = makeData();
    const defaultScenario = buildForecastScenario(data, {});
    const lowChurn = buildForecastScenario(data, { monthlyChurnRate: 0.01 });

    expect(lowChurn.monthlyChurnRate).toBe(0.01);
    expect(defaultScenario.monthlyChurnRate).toBe(0.04); // 4% / 100
    // Lower churn means higher revenue
    expect(lowChurn.revenue[12].value).toBeGreaterThan(defaultScenario.revenue[12].value);
  });

  it("respects override for additional burn", () => {
    const data = makeData();
    const defaultScenario = buildForecastScenario(data, {});
    const extraBurn = buildForecastScenario(data, { additionalBurn: 10_000 });

    expect(extraBurn.additionalBurn).toBe(10_000);
    expect(defaultScenario.additionalBurn).toBe(0);
    // Additional burn should reduce cash faster
    expect(extraBurn.cash[6].value).toBeLessThan(defaultScenario.cash[6].value);
  });

  it("default name is 'Custom'", () => {
    const scenario = buildForecastScenario(makeData(), {});
    expect(scenario.name).toBe("Custom");
  });

  it("ID is lowercase kebab-case of name", () => {
    const custom = buildForecastScenario(makeData(), {});
    expect(custom.id).toBe("custom");

    const named = buildForecastScenario(makeData(), {}, "My Growth Plan");
    expect(named.id).toBe("my-growth-plan");
    expect(named.name).toBe("My Growth Plan");
  });

  it("handles null stripe gracefully", () => {
    const data = makeData({ stripe: null });
    const scenario = buildForecastScenario(data, {});

    expect(scenario.revenue[0].value).toBe(0);
    expect(scenario.monthlyGrowthRate).toBe(0);
    expect(scenario.monthlyChurnRate).toBe(0);
    // Revenue should stay at 0 throughout
    for (const point of scenario.revenue) {
      expect(point.value).toBe(0);
    }
  });

  it("handles null mercury gracefully", () => {
    const data = makeData({ mercury: null });
    const scenario = buildForecastScenario(data, {});

    expect(scenario.cash[0].value).toBe(0);
    // Cash should stay at 0 throughout (zero balance, zero burn, zero inflows)
    for (const point of scenario.cash) {
      expect(point.value).toBe(0);
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   4. buildDefaultScenarios
   ═══════════════════════════════════════════════════════════ */

describe("buildDefaultScenarios", () => {
  it("returns exactly 3 scenarios", () => {
    const scenarios = buildDefaultScenarios(makeData());
    expect(scenarios).toHaveLength(3);
  });

  it("names are Optimistic, Base, Conservative", () => {
    const scenarios = buildDefaultScenarios(makeData());
    expect(scenarios.map((s) => s.name)).toEqual(["Optimistic", "Base", "Conservative"]);
  });

  it("optimistic applies positive deltas to growth and churn", () => {
    const data = makeData();
    const scenarios = buildDefaultScenarios(data);
    const optimistic = scenarios[0];

    const baseGrowth = 10 / 100; // 10% -> 0.10
    const baseChurn = 4 / 100; // 4% -> 0.04

    const growthDelta = Math.max(Math.abs(baseGrowth) * 0.5, 0.03);
    const churnDelta = Math.max(baseChurn * 0.3, 0.01);

    expect(optimistic.monthlyGrowthRate).toBeCloseTo(baseGrowth + growthDelta, 10);
    expect(optimistic.monthlyChurnRate).toBeCloseTo(baseChurn - churnDelta, 10);
  });

  it("base matches live data rates", () => {
    const data = makeData();
    const scenarios = buildDefaultScenarios(data);
    const base = scenarios[1];

    expect(base.monthlyGrowthRate).toBeCloseTo(0.10, 10); // 10%
    expect(base.monthlyChurnRate).toBeCloseTo(0.04, 10); // 4%
  });

  it("conservative applies negative deltas to growth and churn", () => {
    const data = makeData();
    const scenarios = buildDefaultScenarios(data);
    const conservative = scenarios[2];

    const baseGrowth = 10 / 100;
    const baseChurn = 4 / 100;

    const growthDelta = Math.max(Math.abs(baseGrowth) * 0.5, 0.03);
    const churnDelta = Math.max(baseChurn * 0.3, 0.01);

    expect(conservative.monthlyGrowthRate).toBeCloseTo(baseGrowth - growthDelta, 10);
    expect(conservative.monthlyChurnRate).toBeCloseTo(baseChurn + churnDelta, 10);
  });

  it("optimistic runway >= base runway >= conservative runway", () => {
    const scenarios = buildDefaultScenarios(makeData());
    const [optimistic, base, conservative] = scenarios;

    expect(optimistic.runway).toBeGreaterThanOrEqual(base.runway);
    expect(base.runway).toBeGreaterThanOrEqual(conservative.runway);
  });

  it("keeps optimistic >= base >= conservative when growth is negative", () => {
    const data = makeData({
      stripe: {
        revenue: {
          mrr: 10_000,
          mrrChange: -500,
          totalRevenue30d: 9_000,
          totalRevenuePrev30d: 10_000,
          revenueGrowth: -10,
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
        payments: { succeeded: 48, failed: 2, successRate: 96 },
        revenueTrend: [],
        _meta: META,
      },
    });
    const [optimistic, base, conservative] = buildDefaultScenarios(data);

    expect(optimistic.monthlyGrowthRate).toBeGreaterThan(base.monthlyGrowthRate);
    expect(base.monthlyGrowthRate).toBeGreaterThan(conservative.monthlyGrowthRate);
  });

  it("handles all-null providers", () => {
    const data = makeData({ stripe: null, mercury: null });
    const scenarios = buildDefaultScenarios(data);

    expect(scenarios).toHaveLength(3);
    expect(scenarios.map((s) => s.name)).toEqual(["Optimistic", "Base", "Conservative"]);

    // With no data, all growth/churn rates should be 0
    for (const scenario of scenarios) {
      expect(scenario.monthlyGrowthRate).toBe(0);
      expect(scenario.monthlyChurnRate).toBe(0);
      expect(scenario.revenue).toHaveLength(25);
      expect(scenario.cash).toHaveLength(25);
    }
  });
});

import { describe, expect, it } from "vitest";
import { buildForecastScenario } from "@/lib/analytics/forecast-engine";
import { computeBudgetActuals } from "@/lib/analytics/budget-variance";
import { computeProgressPct } from "@/lib/analytics/finance-utils";
import type { BudgetData, MercuryData, StripeData } from "@/lib/analytics/types";

const meta = {
  fetchedAt: "2026-02-01T00:00:00.000Z",
  nextRefresh: "2026-02-01T01:00:00.000Z",
  source: "cached" as const,
};

const stripeFixture: StripeData = {
  revenue: {
    mrr: 5000,
    mrrChange: 0,
    totalRevenue30d: 20000,
    totalRevenuePrev30d: 18000,
    revenueGrowth: 0,
    avgRevenuePerCustomer: 100,
  },
  subscriptions: {
    active: 50,
    pastDue: 0,
    canceled: 0,
    trialing: 0,
    churnRate: 0,
    recentChurnEvents: [],
  },
  payments: {
    succeeded: 0,
    failed: 0,
    successRate: 1,
  },
  revenueTrend: [],
  _meta: meta,
};

const mercuryFixture: MercuryData = {
  accounts: [],
  cashFlow: {
    totalBalance: 6000,
    inflows30d: 0,
    outflows30d: 3000,
    netCashFlow: -1000,
    runway: 6,
    burnRate: 1000,
  },
  _meta: meta,
};

describe("financial planning helpers", () => {
  it("adjusts runway when additional expenses are applied", () => {
    const scenario = buildForecastScenario(stripeFixture, mercuryFixture, {
      revenueGrowthRate: 0,
      churnRateDelta: 0,
      burnRateDelta: 0,
      additionalMonthlyExpense: 1000,
      additionalMonthlyRevenue: 0,
    }, { id: "s", name: "Test" });

    expect(scenario.runwayMonths).toBeCloseTo(3, 1);
  });

  it("computes progress for lower-is-better goals", () => {
    expect(computeProgressPct(200, 100, "lower")).toBeCloseTo(50, 1);
    expect(computeProgressPct(50, 100, "lower")).toBe(100);
  });

  it("scales budget actuals to the budget date range", () => {
    const budget: BudgetData = {
      id: "budget-1",
      name: "Q1 Budget",
      period: "quarterly",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-04-01T00:00:00.000Z",
      lineItems: [
        {
          id: "line-1",
          category: "marketing",
          plannedAmount: 900,
          actualAmount: null,
          variance: null,
          variancePct: null,
        },
      ],
      totalPlanned: 900,
      totalActual: null,
      totalVariance: null,
    };

    const [item] = computeBudgetActuals(budget, mercuryFixture);
    const expected = 3000 * 3 * 0.15;

    expect(item.actualAmount).toBeCloseTo(expected, 2);
  });
});

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

  it("maps Mercury transaction detail to budget categories when available", () => {
    const budget: BudgetData = {
      id: "budget-2",
      name: "Monthly Budget",
      period: "monthly",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-03-01T00:00:00.000Z",
      lineItems: [
        {
          id: "payroll",
          category: "payroll",
          plannedAmount: 1000,
          actualAmount: null,
          variance: null,
          variancePct: null,
        },
        {
          id: "marketing",
          category: "marketing",
          plannedAmount: 1000,
          actualAmount: null,
          variance: null,
          variancePct: null,
        },
        {
          id: "infrastructure",
          category: "infrastructure",
          plannedAmount: 1000,
          actualAmount: null,
          variance: null,
          variancePct: null,
        },
        {
          id: "other",
          category: "other",
          plannedAmount: 1000,
          actualAmount: null,
          variance: null,
          variancePct: null,
        },
      ],
      totalPlanned: 4000,
      totalActual: null,
      totalVariance: null,
    };

    const mercuryWithTransactions: MercuryData = {
      ...mercuryFixture,
      cashFlow: {
        ...mercuryFixture.cashFlow,
        outflows30d: 99_999,
      },
      transactions: [
        {
          id: "gusto",
          postedAt: "2026-02-10T00:00:00.000Z",
          amount: -1200,
          kind: "outgoingPayment",
          mercuryCategory: null,
          description: "Gusto payroll",
          counterpartyName: "Gusto",
        },
        {
          id: "linkedin",
          postedAt: "2026-02-11T00:00:00.000Z",
          amount: -450,
          kind: "debitCardTransaction",
          mercuryCategory: null,
          description: "LinkedIn Ads",
          counterpartyName: "LinkedIn",
        },
        {
          id: "vercel",
          postedAt: "2026-02-12T00:00:00.000Z",
          amount: -125,
          kind: "debitCardTransaction",
          mercuryCategory: null,
          description: "Vercel hosting",
          counterpartyName: "Vercel",
        },
        {
          id: "unknown",
          postedAt: "2026-02-13T00:00:00.000Z",
          amount: -75,
          kind: "outgoingPayment",
          mercuryCategory: null,
          description: "Unmapped vendor",
          counterpartyName: "Vendor",
        },
        {
          id: "old",
          postedAt: "2026-01-13T00:00:00.000Z",
          amount: -999,
          kind: "outgoingPayment",
          mercuryCategory: null,
          description: "Gusto payroll",
          counterpartyName: "Gusto",
        },
      ],
    };

    const items = computeBudgetActuals(budget, mercuryWithTransactions);

    expect(items.find((item) => item.category === "payroll")?.actualAmount).toBe(1200);
    expect(items.find((item) => item.category === "marketing")?.actualAmount).toBe(450);
    expect(items.find((item) => item.category === "infrastructure")?.actualAmount).toBe(125);
    expect(items.find((item) => item.category === "other")?.actualAmount).toBe(75);
  });
});

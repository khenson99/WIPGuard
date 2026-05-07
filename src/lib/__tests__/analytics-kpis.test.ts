import { describe, expect, it } from "vitest";
import type { AnalyticsDashboardData, BudgetData } from "@/lib/analytics/types";
import { buildAnalyticsMetricsLayer, computeAnalyticsKpis } from "@/lib/analytics/kpis";

function makeData(successRate: number): AnalyticsDashboardData {
  return {
    stripe: {
      revenue: { mrr: 0 },
      payments: { succeeded: 0, failed: 0, successRate },
    },
  } as unknown as AnalyticsDashboardData;
}

describe("computeAnalyticsKpis (finance)", () => {
  it("normalises Stripe payment successRate from 0–1 to 0–100", () => {
    expect(computeAnalyticsKpis(makeData(0.95)).finance.paymentSuccessPct).toBe(
      95,
    );
  });

  it("passes through Stripe payment successRate when already 0–100", () => {
    expect(computeAnalyticsKpis(makeData(96)).finance.paymentSuccessPct).toBe(
      96,
    );
  });

  it("treats a 1.0 ratio as 100%", () => {
    expect(computeAnalyticsKpis(makeData(1)).finance.paymentSuccessPct).toBe(100);
  });
});

describe("buildAnalyticsMetricsLayer", () => {
  it("publishes canonical finance summary metrics", () => {
    const metrics = buildAnalyticsMetricsLayer({
      stripe: {
        revenue: {
          mrr: 15000,
          mrrChange: 4.2,
          totalRevenue30d: 18000,
          revenueGrowth: 12.5,
        },
        subscriptions: {
          active: 12,
          pastDue: 2,
          trialing: 3,
          churnRate: 0.04,
        },
        payments: { successRate: 0.975 },
      },
      mercury: {
        cashFlow: {
          totalBalance: 500000,
          bankCash: 320000,
          treasuryCash: 180000,
          runway: 18.5,
          netCashFlow: -27000,
          inflows30d: 18000,
          outflows30d: 45000,
          burnRate: 27000,
        },
      },
      financialPlanning: {
        subscriptionOverview: {
          mergedActiveSubscriptions: 18,
          stripeActiveSubscriptions: 12,
          hubspotActiveSubscriptions: 6,
        },
      },
    } as unknown as AnalyticsDashboardData);

    expect(metrics.finance.summary).toMatchObject({
      mrr: 15000,
      mrrChange: 4.2,
      totalRevenue30d: 18000,
      revenueGrowth: 12.5,
      activeSubscriptions: 18,
      stripeActiveSubscriptions: 12,
      hubspotActiveSubscriptions: 6,
      pastDueSubscriptions: 2,
      trialingSubscriptions: 3,
      paymentSuccessPct: 97.5,
      churnRatePct: 4,
      cashBalance: 500000,
      bankCash: 320000,
      treasuryCash: 180000,
      runwayMonths: 18.5,
      netCashFlow30d: -27000,
      inflows30d: 18000,
      outflows30d: 45000,
      burnRate: 27000,
    });
  });

  it("publishes canonical finance budget planned and actual metrics", () => {
    const activeBudget: BudgetData = {
      id: "budget-1",
      name: "May Budget",
      period: "monthly",
      startDate: "2026-05-01T00:00:00.000Z",
      endDate: "2026-05-31T23:59:59.999Z",
      totalPlanned: 1000,
      totalActual: 1234,
      totalVariance: 234,
      lineItems: [
        {
          id: "line-1",
          category: "cogs",
          plannedAmount: 1000,
          actualAmount: 1234,
          variance: 234,
          variancePct: 23.4,
        },
      ],
    };
    const data = {
      financialPlanning: {
        activeBudget,
        budgets: [activeBudget],
      },
    } as unknown as AnalyticsDashboardData;

    const metrics = buildAnalyticsMetricsLayer(data);

    expect(metrics.finance.budgetActuals).toMatchObject({
      budgetId: "budget-1",
      budgetName: "May Budget",
      totalBudget: 1000,
      totalActual: 1234,
      totalVariance: 234,
      totalVariancePct: 23.4,
      overspendCategories: ["Cost of Goods Sold"],
      items: [
        {
          category: "Cost of Goods Sold",
          budgeted: 1000,
          actual: 1234,
          variance: 234,
          variancePct: 23.4,
          status: "over",
        },
      ],
    });
  });

  it("returns null budget actuals when no active budget exists", () => {
    const metrics = buildAnalyticsMetricsLayer({
      financialPlanning: { activeBudget: null, budgets: [] },
    } as unknown as AnalyticsDashboardData);

    expect(metrics.finance.budgetActuals).toBeNull();
  });
});

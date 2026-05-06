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

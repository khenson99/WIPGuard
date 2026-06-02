import { describe, expect, it } from "vitest";
import { getMetricsBySection } from "@/lib/analytics/metric-history";
import { buildAnalyticsMetricsLayer } from "@/lib/analytics/kpis";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

function financeExtractors() {
  return Object.fromEntries(
    getMetricsBySection("finance").map((metric) => [metric.key, metric.extract]),
  );
}

function websiteTrafficExtractors() {
  return Object.fromEntries(
    getMetricsBySection("website-traffic").map((metric) => [metric.key, metric.extract]),
  );
}

function customerSuccessExtractors() {
  return Object.fromEntries(
    getMetricsBySection("customer-success").map((metric) => [metric.key, metric.extract]),
  );
}

describe("metric history finance extraction", () => {
  it("uses canonical finance summary metrics when they are present", () => {
    const data = {
      metrics: buildAnalyticsMetricsLayer({} as AnalyticsDashboardData),
    } as AnalyticsDashboardData;
    data.metrics!.finance.summary.mrr = 42000;
    data.metrics!.finance.summary.churnRatePct = 3.5;
    data.metrics!.finance.summary.activeSubscriptions = 12;
    data.metrics!.finance.summary.runwayMonths = 9.25;

    const extract = financeExtractors();

    expect(extract["stripe.mrr"]?.(data)).toBe(42000);
    expect(extract["stripe.churnRate"]?.(data)).toBe(3.5);
    expect(extract["stripe.activeSubscriptions"]?.(data)).toBe(12);
    expect(extract["mercury.runway"]?.(data)).toBe(9.25);
  });

  it("builds canonical finance metrics before extracting raw snapshot payloads", () => {
    const data = {
      stripe: {
        revenue: {
          mrr: 10000,
          mrrChange: 500,
          totalRevenue30d: 12000,
          totalRevenuePrev30d: 11000,
          revenueGrowth: 9.1,
          avgRevenuePerCustomer: 250,
        },
        subscriptions: {
          active: 40,
          pastDue: 2,
          canceled: 1,
          trialing: 3,
          churnRate: 0.04,
          recentChurnEvents: [],
        },
        payments: { succeeded: 79, failed: 1, successRate: 0.987 },
        revenueTrend: [],
      },
      mercury: {
        accounts: [],
        cashFlow: {
          totalBalance: 500000,
          inflows30d: 18000,
          outflows30d: 45000,
          netCashFlow: -27000,
          runway: 18.5,
          burnRate: 27000,
        },
      },
    } as unknown as AnalyticsDashboardData;

    const extract = financeExtractors();

    expect(extract["stripe.churnRate"]?.(data)).toBe(4);
    expect(extract["stripe.revenueGrowth"]?.(data)).toBe(9.1);
    expect(extract["stripe.activeSubscriptions"]?.(data)).toBe(40);
    expect(extract["mercury.totalBalance"]?.(data)).toBe(500000);
    expect(extract["mercury.netCashFlow"]?.(data)).toBe(-27000);
  });

  it("normalizes ratio-style revenue growth before extracting history", () => {
    const data = {
      stripe: {
        revenue: {
          mrr: 10000,
          mrrChange: 500,
          totalRevenue30d: 12000,
          totalRevenuePrev30d: 11000,
          revenueGrowth: 0.091,
          avgRevenuePerCustomer: 250,
        },
        subscriptions: {
          active: 40,
          pastDue: 2,
          canceled: 1,
          trialing: 3,
          churnRate: 0.04,
          recentChurnEvents: [],
        },
        payments: { succeeded: 79, failed: 1, successRate: 0.987 },
        revenueTrend: [],
      },
    } as unknown as AnalyticsDashboardData;

    const extract = financeExtractors();

    expect(extract["stripe.revenueGrowth"]?.(data)).toBe(9.1);
  });

  it("normalizes ratio-style GA bounce rate before extracting history", () => {
    const data = {
      googleAnalytics: {
        sessions30d: 1000,
        users30d: 750,
        pageviews30d: 2400,
        bounceRate: 0.42,
        avgSessionDuration: 120,
      },
    } as unknown as AnalyticsDashboardData;

    const extract = websiteTrafficExtractors();

    expect(extract["ga.bounceRate"]?.(data)).toBe(42);
  });

  it("normalizes ratio-style product delivery rate before extracting history", () => {
    const data = {
      product: {
        activeContributors: 5,
        mergedPullRequestsInRange: 10,
        completedLinearIssuesInRange: 8,
        cycleTimeRiskSignals: 2,
        deliveryBalance: 2,
        deliveryRate: 0.8,
      },
    } as unknown as AnalyticsDashboardData;

    const extract = customerSuccessExtractors();

    expect(extract["product.deliveryRate"]?.(data)).toBe(80);
  });
});

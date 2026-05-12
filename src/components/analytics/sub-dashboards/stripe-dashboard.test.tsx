import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StripeDashboard } from "@/components/analytics/sub-dashboards/stripe-dashboard";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { buildAnalyticsMetricsLayer } from "@/lib/analytics/kpis";

describe("StripeDashboard", () => {
  it("uses canonical Stripe finance metrics for KPI cards", () => {
    const data = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: undefined,
    });
    data.stripe = {
      revenue: {
        mrr: 12000,
        mrrChange: 500,
        totalRevenue30d: 15000,
        totalRevenuePrev30d: 14000,
        revenueGrowth: 7.1,
        avgRevenuePerCustomer: 300,
      },
      subscriptions: {
        active: 40,
        pastDue: 2,
        canceled: 1,
        trialing: 3,
        churnRate: 0.04,
        recentChurnEvents: [],
      },
      payments: {
        succeeded: 79,
        failed: 1,
        successRate: 0.987,
      },
      revenueTrend: [],
      _meta: {
        fetchedAt: "2026-02-18T00:00:00.000Z",
        nextRefresh: "2026-02-18T01:00:00.000Z",
        source: "live",
      },
    };
    data.metrics = buildAnalyticsMetricsLayer(data);
    data.metrics.finance.stripe!.mrr = 99000;
    data.metrics.finance.stripe!.activeSubscriptions = 88;
    data.metrics.finance.stripe!.paymentSuccessPct = 91.2;

    render(<StripeDashboard data={data} />);

    expect(screen.getByText("$99.0K")).toBeTruthy();
    expect(screen.getAllByText("88").length).toBeGreaterThan(0);
    expect(screen.getByText("91.2%")).toBeTruthy();
  });
});

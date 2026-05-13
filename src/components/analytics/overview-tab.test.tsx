import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewTab } from "@/components/analytics/overview-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

const timeRange: AnalyticsDashboardData["timeRange"] = {
  preset: "30d",
  from: "2026-02-01",
  to: "2026-03-02",
  days: 30,
  label: "Last 30 days",
};

const meta = {
  fetchedAt: "2026-03-15T00:00:00.000Z",
  nextRefresh: "2026-03-15T01:00:00.000Z",
  source: "live" as const,
};

function makeData(): AnalyticsDashboardData {
  const data = createEmptyAnalyticsDashboardData({
    freshness: {},
    timeRange,
  });

  data.stripe = {
    revenue: {
      mrr: 24000,
      mrrChange: 5,
      totalRevenue30d: 26000,
      totalRevenuePrev30d: 22000,
      revenueGrowth: 18,
      avgRevenuePerCustomer: 200,
    },
    subscriptions: {
      active: 118,
      pastDue: 3,
      canceled: 2,
      trialing: 6,
      churnRate: 1.2,
      recentChurnEvents: [],
    },
    payments: {
      succeeded: 60,
      failed: 1,
      successRate: 98.4,
    },
    revenueTrend: [],
    _meta: meta,
  };

  data.financialPlanning = {
    budgets: [],
    activeBudget: null,
    forecasts: [],
    goals: [],
    pnl: null,
    unitEconomics: null,
    subscriptionOverview: {
      mergedActiveSubscriptions: 124,
      stripeActiveSubscriptions: 118,
      hubspotActiveSubscriptions: 121,
    },
  };

  return data;
}

describe("OverviewTab", () => {
  it("prefers the merged subscription overview for the active subscriptions card", () => {
    render(<OverviewTab data={makeData()} />);

    expect(screen.getByText("Active Subscriptions")).toBeTruthy();
    expect(screen.getByText("124")).toBeTruthy();
    expect(screen.getByText("118 Stripe · 121 HubSpot · 3 past due · 6 trialing")).toBeTruthy();
  });
});

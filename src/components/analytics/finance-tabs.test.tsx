import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { FinanceStripeTab } from "@/components/analytics/finance-stripe-tab";
import { FinanceMercuryTab } from "@/components/analytics/finance-mercury-tab";
import { FinanceHubSpotTab } from "@/components/analytics/finance-hubspot-tab";
import { buildAnalyticsMetricsLayer } from "@/lib/analytics/kpis";

function makeEmptyData() {
  return createEmptyAnalyticsDashboardData({
    freshness: {
      google_workspace: {
        provider: "google_workspace",
        source: "none",
        status: null,
        connectedAt: null,
        lastSyncedAt: null,
        lastError: null,
        stale: false,
        lastSnapshotAt: null,
      },
      hubspot: {
        provider: "hubspot",
        source: "connection",
        status: "CONNECTED",
        connectedAt: "2026-02-16T00:00:00.000Z",
        lastSyncedAt: "2026-02-16T00:00:00.000Z",
        lastError: null,
        stale: false,
        lastSnapshotAt: null,
      },
      slack: {
        provider: "slack",
        source: "none",
        status: null,
        connectedAt: null,
        lastSyncedAt: null,
        lastError: null,
        stale: false,
        lastSnapshotAt: null,
      },
      coda: {
        provider: "coda",
        source: "none",
        status: null,
        connectedAt: null,
        lastSyncedAt: null,
        lastError: null,
        stale: false,
        lastSnapshotAt: null,
      },
      reddit: {
        provider: "reddit",
        source: "none",
        status: null,
        connectedAt: null,
        lastSyncedAt: null,
        lastError: null,
        stale: false,
        lastSnapshotAt: null,
      },
      stripe: {
        provider: "stripe",
        source: "connection",
        status: "CONNECTED",
        connectedAt: "2026-02-16T00:00:00.000Z",
        lastSyncedAt: "2026-02-16T00:00:00.000Z",
        lastError: "Stripe 401",
        stale: true,
        lastSnapshotAt: "2026-02-16T00:00:00.000Z",
      },
      mercury: {
        provider: "mercury",
        source: "connection",
        status: "CONNECTED",
        connectedAt: "2026-02-16T00:00:00.000Z",
        lastSyncedAt: "2026-02-16T00:00:00.000Z",
        lastError: "Mercury timed out",
        stale: true,
        lastSnapshotAt: "2026-02-16T00:00:00.000Z",
      },
    },
    timeRange: {
      preset: "30d",
      from: "2026-01-17",
      to: "2026-02-16",
      days: 30,
      label: "Last 30 days",
    },
  });
}

describe("finance tabs", () => {
  it("shows actionable empty state in main finance tab when stripe and mercury are missing", () => {
    const data = makeEmptyData();
    data.errors.push({ source: "stripe", message: "Stripe credentials rejected" });

    render(<FinanceTab data={data} />);

    expect(screen.getByText("Finance dashboard data is unavailable")).toBeTruthy();
    expect(screen.getByText(/Stripe and Mercury data could not be loaded/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh Dashboard" })).toBeTruthy();
  });

  it("shows stripe-specific actionable empty state", () => {
    const data = makeEmptyData();

    render(<FinanceStripeTab data={data} />);

    expect(screen.getByText("Stripe finance data is unavailable")).toBeTruthy();
    expect(screen.getByText(/subscription and payment analytics/)).toBeTruthy();
  });

  it("normalizes ratio-style Stripe percentages in the stripe finance tab", () => {
    const data = makeEmptyData();
    if (data.freshness.stripe) {
      data.freshness.stripe.lastError = null;
    }
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
        fetchedAt: "2026-02-16T00:00:00.000Z",
        nextRefresh: "2026-02-16T01:00:00.000Z",
        source: "live",
      },
    };
    data.metrics = buildAnalyticsMetricsLayer(data);
    data.kpis = data.metrics.kpis;

    render(<FinanceStripeTab data={data} />);

    expect(screen.getAllByText("4.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("98.7%").length).toBeGreaterThan(0);
  });

  it("uses canonical Mercury metrics in the Mercury finance tab", () => {
    const data = makeEmptyData();
    if (data.freshness.mercury) {
      data.freshness.mercury.lastError = null;
    }
    data.mercury = {
      accounts: [{ accountId: "acc-1", accountName: "Operating", balance: 500000, type: "checking" }],
      cashFlow: {
        totalBalance: 500000,
        inflows30d: 18000,
        outflows30d: 45000,
        netCashFlow: -27000,
        runway: 18.5,
        burnRate: 27000,
      },
      _meta: {
        fetchedAt: "2026-02-16T00:00:00.000Z",
        nextRefresh: "2026-02-16T01:00:00.000Z",
        source: "live",
      },
    };
    data.metrics = buildAnalyticsMetricsLayer(data);
    data.kpis = data.metrics.kpis;
    data.metrics.finance.mercury!.inflows30d = 1234;

    render(<FinanceMercuryTab data={data} />);

    expect(screen.getAllByText("$1.2K").length).toBeGreaterThan(0);
  });

  it("shows finance-stage hubspot empty state when lifecycle stages are missing", () => {
    const data = makeEmptyData();
    data.hubspot = {
      funnel: {
        totalDeals: 3,
        closedWon: 1,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 0,
        demoScheduled: 2,
        demoFollowUp: 1,
        avgDealSize: 1200,
        winRate: 50,
        effectiveWinRate: 50,
        noShowRate: 0,
        stages: [
          {
            stageId: "presentationscheduled",
            label: "Demo Scheduled",
            count: 2,
            value: 2200,
          },
        ],
        dealsBySource: [],
      },
      contacts: {
        totalContacts: 10,
        recentContacts: 3,
        bySource: [],
      },
      _meta: {
        fetchedAt: "2026-02-16T00:00:00.000Z",
        nextRefresh: "2026-02-16T01:00:00.000Z",
        source: "live",
      },
    };

    render(<FinanceHubSpotTab data={data} />);

    expect(screen.getByText("No finance-stage HubSpot deals found")).toBeTruthy();
  });

  it("shows the HubSpot suspicious lead exclusion count", () => {
    const data = makeEmptyData();
    data.hubspot = {
      funnel: {
        totalDeals: 4,
        closedWon: 1,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 0,
        demoScheduled: 1,
        demoFollowUp: 1,
        avgDealSize: 1200,
        winRate: 100,
        effectiveWinRate: 100,
        noShowRate: 0,
        excludedSuspiciousLeads: 3,
        stages: [
          {
            stageId: "1955580622",
            label: "Budgetary Quote Sent",
            count: 1,
            value: 1200,
          },
          {
            stageId: "closedwon",
            label: "Closed Won",
            count: 1,
            value: 1200,
          },
        ],
        dealsBySource: [],
      },
      contacts: {
        totalContacts: 10,
        recentContacts: 3,
        bySource: [],
      },
      _meta: {
        fetchedAt: "2026-02-16T00:00:00.000Z",
        nextRefresh: "2026-02-16T01:00:00.000Z",
        source: "live",
      },
    };

    render(<FinanceHubSpotTab data={data} />);

    expect(screen.getByText("Excluded Leads")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("flagged as suspicious")).toBeTruthy();
  });
});

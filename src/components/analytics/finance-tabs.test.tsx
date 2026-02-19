import { render, screen } from "@testing-library/react";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { FinanceStripeTab } from "@/components/analytics/finance-stripe-tab";
import { FinanceHubSpotTab } from "@/components/analytics/finance-hubspot-tab";

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
});

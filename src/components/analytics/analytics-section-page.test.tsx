import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSectionPage } from "@/components/analytics/analytics-section-page";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { clearDashboardCache } from "@/lib/client/dashboard-cache-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  usePathname: () => "/analytics/ads-google-ads",
  useSearchParams: () => new URLSearchParams(),
}));

describe("AnalyticsSectionPage", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    clearDashboardCache();
  });

  it("shows provider error details for integration-specific child dashboards", async () => {
    const payload = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
    });
    payload.errors.push({
      source: "googleAds",
      message: "Google Ads API quota exceeded",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
      }))
    );

    render(<AnalyticsSectionPage sectionId="ads-google-ads" />);

    await waitFor(() => {
      expect(screen.getByText("Google Ads data is unavailable")).toBeTruthy();
    });

    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(screen.getByText("Google Ads API quota exceeded")).toBeTruthy();
    expect(screen.getByText("Manage integration connection status in Settings")).toBeTruthy();
  });

  it("renders customer journey empty state when no journey data is available", async () => {
    const payload = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
      }))
    );

    render(<AnalyticsSectionPage sectionId="customer-journey" />);

    await waitFor(() => {
      expect(screen.getByText("No customer journey data yet")).toBeTruthy();
    });
  });

  it("renders the revenue dashboard for the revenue section", async () => {
    const payload = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
    });
    payload.revenueDashboard = {
      summary: {
        activeSubscriptions: 3,
        stripeActiveSubscriptions: 2,
        hubspotActiveSubscriptions: 1,
        hubspotOnlyActiveSubscriptions: 1,
        mrr: 13000,
        arr: 156000,
        stripeMrr: 10000,
        hubspotSubscriptionMrr: 3000,
        hubspotOnlySubscriptionMrr: 3000,
        excludedLinkedHubspotSubscriptionMrr: 0,
        cashBalance: 100000,
        bankCash: 75000,
        treasuryCash: 25000,
        runwayMonths: 12.5,
        burnRate: 8000,
        netCashFlow30d: -8000,
        inflows30d: 12000,
        outflows30d: 20000,
        paymentSuccessPct: 75,
        churnRatePct: 2,
      },
      weekly: [
        {
          week: "2026-01-05",
          demosScheduled: 2,
          demosCompleted: 1,
          demoNoShows: 1,
          customersWon: 1,
          stripeRevenueCollected: 2500,
          hubspotBookedRevenue: 4000,
          mercuryInflows: 2000,
          mercuryOutflows: 0,
          mercuryNetCashFlow: 2000,
        },
      ],
      pipeline: {
        openPipelineValue: 12000,
        openPipelineCount: 1,
        qualifiedPipelineValue: 12000,
        qualifiedPipelineCount: 1,
        stageBreakdown: [{ stageId: "demo", label: "Demo Scheduled", count: 1, value: 12000 }],
        sourceBreakdown: [{ source: "Organic", count: 1, value: 12000 }],
        repScoreboard: [],
        winRate: 50,
        effectiveWinRate: 40,
        noShowRate: 25,
        avgDealSize: 4000,
        demoFollowUpCount: 2,
        bookedValue: 4000,
        realizedValue30d: 2500,
        bookedToRealizedRatio30d: 0.625,
      },
      trust: {
        sources: [
          {
            key: "hubspot",
            label: "HubSpot",
            status: "CONNECTED",
            stale: false,
            source: "connection",
            lastSyncedAt: null,
            lastSnapshotAt: null,
            lastError: null,
            fetchedAt: null,
            truncated: false,
            truncatedResources: [],
          },
          {
            key: "stripe",
            label: "Stripe",
            status: "CONNECTED",
            stale: false,
            source: "connection",
            lastSyncedAt: null,
            lastSnapshotAt: null,
            lastError: null,
            fetchedAt: null,
            truncated: false,
            truncatedResources: [],
          },
          {
            key: "mercury",
            label: "Mercury",
            status: "CONNECTED",
            stale: false,
            source: "connection",
            lastSyncedAt: null,
            lastSnapshotAt: null,
            lastError: null,
            fetchedAt: null,
            truncated: false,
            truncatedResources: [],
          },
        ],
        warnings: [],
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
      }))
    );

    render(<AnalyticsSectionPage sectionId="revenue" />);

    await waitFor(() => {
      expect(screen.getByText("Investor Revenue")).toBeTruthy();
    });
    expect(screen.getByText("ARR")).toBeTruthy();
    expect(screen.getByText("Weekly revenue motion")).toBeTruthy();
    expect(screen.getByText("Pipeline metrics")).toBeTruthy();
  });
});

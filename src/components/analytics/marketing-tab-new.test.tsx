import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MarketingTabNew } from "@/components/analytics/marketing-tab-new";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

function makeData() {
  return createEmptyAnalyticsDashboardData({
    freshness: {},
    timeRange: {
      preset: "30d",
      from: "2026-01-01",
      to: "2026-01-30",
      days: 30,
      label: "Last 30 days",
    },
  });
}

describe("MarketingTabNew provider states", () => {
  it("renders configured-but-failing when provider error exists", () => {
    const data = makeData();
    data.errors.push({ source: "googleAds", message: "Google Ads API quota exceeded" });

    render(<MarketingTabNew data={data} />);

    expect(screen.getAllByText("Configured but failing").length).toBeGreaterThan(0);
    expect(screen.getByText("Configured but failing: Google Ads API quota exceeded")).toBeTruthy();
  });

  it("renders not configured when payload is absent and there is no provider error", () => {
    const data = makeData();

    render(<MarketingTabNew data={data} />);

    expect(screen.getAllByText("Not configured").length).toBeGreaterThan(0);
    expect(screen.queryByText("Configured but failing")).toBeNull();
    expect(screen.queryByText("No Google Ads data in selected range")).toBeNull();
  });

  it("renders no-data state for healthy zero-signal payloads", () => {
    const data = makeData();
    data.googleAds = {
      totalSpend30d: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
      campaigns: [],
      _meta: {
        fetchedAt: "2026-01-30T00:00:00.000Z",
        nextRefresh: "2026-01-30T01:00:00.000Z",
        source: "live",
      },
    };

    render(<MarketingTabNew data={data} />);

    expect(screen.getByText("No Google Ads data in selected range")).toBeTruthy();
  });

  it("renders cached Meta Page metrics when payload exists alongside a refresh error", () => {
    const data = makeData();
    data.metaPage = {
      pageLikes: 120,
      pageFollowers: 456,
      postReach30d: 789,
      postEngagement30d: 42,
      traffic: 88,
      bounceRate: 12,
      clicks: 34,
      returningVisitors: 9,
      topPosts: [],
      _meta: {
        fetchedAt: "2026-01-30T00:00:00.000Z",
        nextRefresh: "2026-01-30T01:00:00.000Z",
        source: "cached",
      },
    };
    data.errors.push({ source: "metaPage", message: "Meta Page request failed (500)" });
    data.freshness.metaPage = {
      provider: "metaPage",
      source: "snapshot",
      status: "CONNECTED",
      connectedAt: "2026-01-01T00:00:00.000Z",
      lastSyncedAt: "2026-01-30T00:00:00.000Z",
      lastError: "Meta Page request failed (500)",
      stale: true,
      lastSnapshotAt: "2026-01-30T00:00:00.000Z",
    };

    render(<MarketingTabNew data={data} />);

    const followersLabel = screen.getByText("Page Followers");
    const followersCard = followersLabel.closest("div.rounded-xl");
    expect(followersCard).toBeTruthy();
    if (!followersCard) {
      throw new Error("Page Followers stat card not found");
    }

    expect(within(followersCard).getByText("456")).toBeTruthy();
    expect(screen.getByText("Meta Page")).toBeTruthy();
    expect(screen.queryByText("Configured but failing: Meta Page request failed (500)")).toBeNull();
  });

  it("shows connected Meta Page with no signals as no-data instead of not configured", () => {
    const data = makeData();
    data.freshness.metaPage = {
      provider: "metaPage",
      source: "connection",
      status: "CONNECTED",
      connectedAt: "2026-01-01T00:00:00.000Z",
      lastSyncedAt: "2026-01-30T00:00:00.000Z",
      lastError: null,
      stale: false,
      lastSnapshotAt: null,
    };

    render(<MarketingTabNew data={data} />);

    const followersCard = screen.getByText("Page Followers").closest("div.rounded-xl");
    expect(followersCard).toBeTruthy();
    if (!followersCard) {
      throw new Error("Page Followers card not found");
    }

    expect(screen.getByText("Page Followers")).toBeTruthy();
    expect(within(followersCard).getByText("No data")).toBeTruthy();
    expect(screen.getByText("Configured, but no Meta Page signals were returned in this range")).toBeTruthy();
  });

  it("does not treat Instagram as configured when only Meta Page is connected", () => {
    const data = makeData();
    data.freshness.metaPage = {
      provider: "metaPage",
      source: "connection",
      status: "CONNECTED",
      connectedAt: "2026-01-01T00:00:00.000Z",
      lastSyncedAt: "2026-01-30T00:00:00.000Z",
      lastError: null,
      stale: false,
      lastSnapshotAt: null,
    };

    render(<MarketingTabNew data={data} />);

    const instagramHeading = screen.getByText("Instagram");
    const instagramCard = instagramHeading.closest("div.rounded-xl");
    expect(instagramCard).toBeTruthy();
    if (!instagramCard) {
      throw new Error("Instagram card not found");
    }

    expect(within(instagramCard).getByText("Not configured")).toBeTruthy();
    expect(within(instagramCard).queryByText(/Instagram is connected/)).toBeNull();
  });

  it("shows connected Instagram with no signals as no-data instead of not configured", () => {
    const data = makeData();
    data.freshness.instagram = {
      provider: "instagram",
      source: "connection",
      status: "CONNECTED",
      connectedAt: "2026-01-01T00:00:00.000Z",
      lastSyncedAt: "2026-01-30T00:00:00.000Z",
      lastError: null,
      stale: false,
      lastSnapshotAt: null,
    };

    render(<MarketingTabNew data={data} />);

    const instagramHeading = screen.getByText("Instagram");
    const instagramCard = instagramHeading.closest("div.rounded-xl");
    expect(instagramCard).toBeTruthy();
    if (!instagramCard) {
      throw new Error("Instagram card not found");
    }

    expect(within(instagramCard).getByText("Instagram is connected, but no audience or traffic signals were returned in this range.")).toBeTruthy();
    expect(within(instagramCard).queryByText("Not configured")).toBeNull();
  });

  it("falls back to page likes when Meta omits follower count", () => {
    const data = makeData();
    data.metaPage = {
      pageLikes: 120,
      pageFollowers: 0,
      postReach30d: 0,
      postEngagement30d: 0,
      traffic: 0,
      bounceRate: 0,
      clicks: 0,
      returningVisitors: 0,
      topPosts: [],
      _meta: {
        fetchedAt: "2026-01-30T00:00:00.000Z",
        nextRefresh: "2026-01-30T01:00:00.000Z",
        source: "live",
      },
    };

    render(<MarketingTabNew data={data} />);

    const followersLabel = screen.getByText("Page Followers");
    const followersCard = followersLabel.closest("div.rounded-xl");
    expect(followersCard).toBeTruthy();
    if (!followersCard) {
      throw new Error("Page Followers stat card not found");
    }

    expect(within(followersCard).getByText("120")).toBeTruthy();
    expect(screen.getByText("Meta Page")).toBeTruthy();
  });
});

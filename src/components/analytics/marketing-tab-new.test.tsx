import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
});

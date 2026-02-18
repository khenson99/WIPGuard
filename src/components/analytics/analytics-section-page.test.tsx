import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSectionPage } from "@/components/analytics/analytics-section-page";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  usePathname: () => "/analytics/ads-google-ads",
  useSearchParams: () => new URLSearchParams(),
}));

describe("AnalyticsSectionPage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders child dashboard plus compact AI insights, while preserving stale and settings UX", async () => {
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

    payload.staleDomains = ["googleAds"];
    payload.errors.push({
      source: "googleAds",
      message: "Google Ads API quota exceeded",
    });

    payload.aiInsights = {
      generatedAt: "2026-01-30T00:00:00.000Z",
      global: [
        {
          id: "i1",
          section: "ads-traffic",
          severity: "critical",
          title: "Insight 1",
          why: "why",
          confidence: 0.9,
          expectedImpact: "impact",
          stale: false,
          evidence: [],
          actions: [],
        },
        {
          id: "i2",
          section: "ads-traffic",
          severity: "warning",
          title: "Insight 2",
          why: "why",
          confidence: 0.8,
          expectedImpact: "impact",
          stale: false,
          evidence: [],
          actions: [],
        },
        {
          id: "i3",
          section: "ads-traffic",
          severity: "warning",
          title: "Insight 3",
          why: "why",
          confidence: 0.7,
          expectedImpact: "impact",
          stale: false,
          evidence: [],
          actions: [],
        },
        {
          id: "i4",
          section: "ads-traffic",
          severity: "info",
          title: "Insight 4",
          why: "why",
          confidence: 0.6,
          expectedImpact: "impact",
          stale: false,
          evidence: [],
          actions: [],
        },
      ],
      bySection: {
        "ads-traffic": [],
        finance: [],
        "sales-pipeline": [],
        "customer-success": [],
      },
    };
    payload.aiInsights.bySection["ads-traffic"] = [...payload.aiInsights.global];

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
      }))
    );

    render(<AnalyticsSectionPage sectionId="ads-google-ads" />);

    await waitFor(() => {
      expect(screen.getByText("Total Ad Spend")).toBeTruthy();
    });

    expect(screen.getByText("Showing cached data while latest refresh failed.")).toBeTruthy();
    expect(screen.getAllByText("AI Insights").length).toBeGreaterThan(0);
    expect(screen.getByText("+1 more")).toBeTruthy();
    expect(screen.getByText("Manage integration connection status in Settings")).toBeTruthy();
  });
});

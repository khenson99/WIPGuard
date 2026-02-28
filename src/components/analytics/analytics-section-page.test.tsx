import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      expect(screen.getByText("No customer journey data available")).toBeTruthy();
    });
  });
});

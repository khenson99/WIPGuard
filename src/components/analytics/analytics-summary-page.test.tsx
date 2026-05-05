import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSummaryPage } from "@/components/analytics/analytics-summary-page";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { clearDashboardCache, useDashboardCacheStore } from "@/lib/client/dashboard-cache-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  usePathname: () => "/analytics",
  useSearchParams: () => new URLSearchParams(),
}));

describe("AnalyticsSummaryPage", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("renders stale banner and refresh controls when cached data exists and fetch fails", async () => {
    const overview = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
    });

    const summary = {
      generatedAt: "2026-02-17T00:00:00.000Z",
      highlights: {
        connectedSections: 3,
        degradedSections: 1,
        missingSections: 1,
        connectedIntegrations: 4,
        disciplineCoverage: 75,
      },
      timeRange: {
        preset: "30d",
        from: "2026-01-01",
        to: "2026-01-30",
        days: 30,
        label: "Last 30 days",
      },
      primarySections: [
        {
          id: "website-traffic",
          label: "Website Traffic",
          description: "desc",
          href: "/analytics/website-traffic",
          status: "connected",
          integrationCount: 4,
          connectedCount: 4,
        },
      ],
    };

    useDashboardCacheStore.getState().write("analytics:summary:v1:default", {
      data: { summary, overview },
      lastUpdatedAt: "2026-02-17T00:00:00.000Z",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("summary refresh failed");
      })
    );

    render(<AnalyticsSummaryPage />);

    await waitFor(() => {
      expect(screen.getByText("Analytics Overview")).toBeTruthy();
    });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ cache: "no-store" });

    expect(
      screen.queryByText("Showing cached analytics while background refresh completes or retries.")
    ).toBeNull();
    expect(screen.getByText("Data could not be refreshed.")).toBeTruthy();
    expect(screen.getByText("summary refresh failed")).toBeTruthy();
    expect(screen.getAllByText("Refresh now").length).toBeGreaterThan(0);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiInsightsPage } from "@/components/analytics/ai-insights-page";
import { clearDashboardCache, useDashboardCacheStore } from "@/lib/client/dashboard-cache-store";
import type { AiInsightsBundle, AnalyticsDashboardData } from "@/lib/analytics/types";

function makeInsights(count: number): AiInsightsBundle["global"] {
  const severities = ["critical", "warning", "info"] as const;
  const sections = ["website-traffic", "social-media", "finance", "sales-pipeline"] as const;

  return Array.from({ length: count }, (_, idx) => ({
    id: `insight-${idx + 1}`,
    section: sections[idx % sections.length],
    severity: severities[idx % severities.length],
    title: `Insight ${idx + 1}`,
    why: "Because data said so.",
    confidence: 1 - idx * 0.001,
    expectedImpact: "Improve outcomes.",
    stale: false,
    evidence: [],
    actions: [],
  }));
}

function writeCachedOverviewData(globalCount: number) {
  const bundle: AiInsightsBundle = {
    generatedAt: "2026-03-01T00:00:00.000Z",
    global: makeInsights(globalCount),
    bySection: {
      "website-traffic": [],
      "social-media": [],
      finance: [],
      "sales-pipeline": [],
      retention: [],
      "customer-success": [],
      "customer-journey": [],
      "demo-analytics": [],
      "process-analytics": [],
    },
  };

  useDashboardCacheStore.getState().write("analytics:ai-insights:v1", {
    data: {
      aiInsights: bundle,
      freshness: {},
      recommendations: [],
      distilledInsights: [],
      staleDomains: [],
      lastFullRefresh: "2026-03-01T00:00:00.000Z",
      errors: [],
      hubspot: null,
      salesPerformance: null,
      stripe: null,
      mercury: null,
      googleAnalytics: null,
      googleAds: null,
      metaAds: null,
      metaPage: null,
      redditAds: null,
      webflow: null,
      coda: null,
      semrush: null,
      pylon: null,
      product: null,
      googleWorkspace: null,
      slack: null,
      hubspotOps: null,
      codaOps: null,
      redditOps: null,
      funnelJourney: null,
      lifecycleFunnel: null,
      customerJourney: null,
      demoAnalytics: null,
      processAnalytics: null,
      financialPlanning: null,
    } as unknown as AnalyticsDashboardData,
    lastUpdatedAt: "2026-03-01T00:00:00.000Z",
  });

  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(useDashboardCacheStore.getState().read("analytics:ai-insights:v1")?.data), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("AiInsightsPage", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("paginates large insight lists and sets aria-current on the active page", async () => {
    writeCachedOverviewData(30);

    render(<AiInsightsPage />);

    await waitFor(() => {
      expect(screen.getByText("AI Insights")).toBeTruthy();
    });

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(25);

    const page1 = screen.getByRole("button", { name: "Go to page 1" });
    const page2 = screen.getByRole("button", { name: "Go to page 2" });
    expect(page1.getAttribute("aria-current")).toBe("page");
    expect(page2.getAttribute("aria-current")).toBeNull();

    fireEvent.click(page2);

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
    });
    expect(page2.getAttribute("aria-current")).toBe("page");
  });

  it("clamps the visible page when filters reduce the page count", async () => {
    writeCachedOverviewData(30);

    render(<AiInsightsPage />);

    await waitFor(() => {
      expect(screen.getByText("AI Insights")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Per page"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Go to page 3" }));

    await waitFor(() => {
      expect(screen.getByText(/Page 3 of 3/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Critical" }));

    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 1|Page 2 of 2/)).toBeTruthy();
    });

    // Critical insights are 10 of 30 (every 3rd), so with pageSize=10 this should be a single page.
    expect(screen.getByText(/Page 1 of 1/)).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(10);
  });

  it("reruns AI insights with a forced refresh request", async () => {
    const fetchMock = writeCachedOverviewData(5);

    render(<AiInsightsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rerun AI insights" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Rerun AI insights" }));

    await waitFor(() => {
      const refreshCall = fetchMock.mock.calls.find(
        (call: unknown[]) => call[0] === "/api/analytics?section=ai-insights&refresh=true",
      ) as [string, RequestInit?] | undefined;
      expect(refreshCall).toBeDefined();
      expect(refreshCall?.[1]?.cache).toBe("no-store");
    });
  });

  it("does not render a create-task action in the insight toolbar", async () => {
    writeCachedOverviewData(3);

    render(<AiInsightsPage />);

    await waitFor(() => {
      expect(screen.getByText("AI Insights")).toBeTruthy();
    });

    expect(screen.getByRole("heading", { name: "Recommended moves" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /create task/i })).toBeNull();
    expect(screen.queryByText(/^Task$/)).toBeNull();
    expect(screen.queryByText(/Creating\.\.\./)).toBeNull();
  });
});

/**
 * Integration tests for SalesFunnelTab filter behavior.
 * Verifies that date + rep filters propagate to all sub-sections.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SalesFunnelTab } from "./sales-funnel-tab";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

// ---------- Mock data helpers ----------

const NOW = new Date().toISOString();
const OLD = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return d.toISOString();
})();

function makeDeal(
  id: string,
  ownerId: string,
  repName: string,
  stageLabel: string,
  amount: number,
  createdAt: string = NOW
) {
  return {
    dealId: id,
    dealName: `Deal ${id}`,
    stageId: stageLabel.toLowerCase().replace(/[^a-z]/g, ""),
    stageLabel,
    amount,
    source: "Website",
    ownerId,
    repName,
    updatedAt: null,
    createdAt,
    closedAt: null,
    stripeCustomerId: null,
    pipelineId: null,
    contactIds: [] as string[],
    primaryContactId: null,
    primaryContactEmail: null,
  };
}

const mockData: AnalyticsDashboardData = {
  hubspot: {
    funnel: {
      totalDeals: 4,
      closedWon: 1,
      closedLost: 1,
      unlikely: 0,
      churn: 0,
      activeSubscriptions: 0,
      noShows: 0,
      demoScheduled: 1,
      demoFollowUp: 1,
      avgDealSize: 1250,
      winRate: 50,
      effectiveWinRate: 50,
      noShowRate: 0,
      stages: [
        { stageId: "prospect", label: "Prospect", count: 2, value: 2000 },
        { stageId: "closedwon", label: "Closed Won", count: 1, value: 2000 },
        { stageId: "closedlost", label: "Closed Lost", count: 1, value: 0 },
      ],
      dealsBySource: [{ source: "Website", count: 4, value: 5000 }],
      dealsByRep: [
        { repName: "Alice", count: 2, value: 3000, closedWon: 1, closedWonValue: 2000 },
        { repName: "Bob", count: 2, value: 2000, closedWon: 0, closedWonValue: 0 },
      ],
    },
    contacts: { totalContacts: 0, recentContacts: 0, bySource: [] },
    deals: [
      // Alice: 2 recent deals
      makeDeal("d1", "alice-id", "Alice", "Prospect", 1000),
      makeDeal("d2", "alice-id", "Alice", "Closed Won", 2000),
      // Bob: 1 recent + 1 old
      makeDeal("d3", "bob-id", "Bob", "Prospect", 1000),
      makeDeal("d4", "bob-id", "Bob", "Closed Lost", 0, OLD),
    ],
    _meta: { fetchedAt: NOW, source: "live" as const, nextRefresh: NOW },
  } as unknown as AnalyticsDashboardData["hubspot"],
  stripe: null,
  mercury: null,
  googleAnalytics: null,
  ga: null,
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
  salesPerformance: null,
  recommendations: [],
  distilledInsights: [],
  aiInsights: {} as AnalyticsDashboardData["aiInsights"],
  freshness: {},
  staleDomains: [],
} as unknown as AnalyticsDashboardData;

// ---------- Tests ----------

describe("SalesFunnelTab — filter integration", () => {
  it("renders filter controls", () => {
    render(<SalesFunnelTab data={mockData} />);
    expect(screen.getByLabelText("Date range")).toBeTruthy();
    expect(screen.getByLabelText("Rep")).toBeTruthy();
  });

  it("shows all reps in rep selector", () => {
    render(<SalesFunnelTab data={mockData} />);
    const repSelect = screen.getByLabelText("Rep") as HTMLSelectElement;
    const options = Array.from(repSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("Alice");
    expect(options).toContain("Bob");
  });

  it("default state shows no active-filter indicator (unfiltered)", () => {
    render(<SalesFunnelTab data={mockData} />);
    // No filter active yet — no status indicator rendered
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows deal count indicator when rep filter is applied", () => {
    render(<SalesFunnelTab data={mockData} />);
    const repSelect = screen.getByLabelText("Rep");
    fireEvent.change(repSelect, { target: { value: "alice-id" } });
    // Indicator confirms Alice's 2 deals out of 4 total
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("2 of 4 deals");
  });

  it("filtering to 30d excludes the old Bob deal", () => {
    render(<SalesFunnelTab data={mockData} />);
    const dateSelect = screen.getByLabelText("Date range");
    fireEvent.change(dateSelect, { target: { value: "30d" } });
    // 3 deals within last 30 days (d1, d2, d3) — d4 is 60 days old
    expect(screen.getByRole("status").textContent).toContain("3 of 4 deals");
  });

  it("resetting rep filter to All reps restores full count", () => {
    render(<SalesFunnelTab data={mockData} />);
    const repSelect = screen.getByLabelText("Rep");
    // Filter to Alice
    fireEvent.change(repSelect, { target: { value: "alice-id" } });
    // Reset to all reps
    fireEvent.change(repSelect, { target: { value: "" } });
    // Status indicator should be gone (filteredCount === totalCount)
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders Sales Pipeline Funnel heading", () => {
    render(<SalesFunnelTab data={mockData} />);
    expect(screen.getByText("Sales Pipeline Funnel")).toBeTruthy();
  });

  it("renders Bottleneck Analysis heading", () => {
    render(<SalesFunnelTab data={mockData} />);
    expect(screen.getByText("Bottleneck Analysis")).toBeTruthy();
  });

  it("renders Terminal Stages heading", () => {
    render(<SalesFunnelTab data={mockData} />);
    expect(screen.getByText("Terminal Stages")).toBeTruthy();
  });

  it("renders EmptyState when hubspot data is null", () => {
    render(<SalesFunnelTab data={null} />);
    expect(screen.getByText("No sales funnel data available")).toBeTruthy();
  });

  it("renders EmptyState when hubspot is null inside data", () => {
    const dataWithNoHubspot = { ...mockData, hubspot: null } as unknown as AnalyticsDashboardData;
    render(<SalesFunnelTab data={dataWithNoHubspot} />);
    expect(screen.getByText("No sales funnel data available")).toBeTruthy();
  });
});

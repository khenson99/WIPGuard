import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type {
  AnalyticsDashboardData,
  StripeData,
  MercuryData,
  IntegrationProviderKey,
  ProviderFreshness,
} from "@/lib/analytics/types";

/* ── Helpers ───────────────────────────────────────────── */

const defaultTimeRange: AnalyticsDashboardData["timeRange"] = {
  preset: "30d",
  from: "2026-01-01",
  to: "2026-01-30",
  days: 30,
  label: "Last 30 days",
};

const meta = { fetchedAt: new Date().toISOString(), nextRefresh: new Date().toISOString(), source: "live" as const };

function makeStripe(overrides: Partial<StripeData> = {}): StripeData {
  return {
    revenue: {
      mrr: 15000,
      mrrChange: 0.08,
      totalRevenue30d: 18000,
      totalRevenuePrev30d: 16500,
      revenueGrowth: 0.09,
      avgRevenuePerCustomer: 75,
    },
    subscriptions: {
      active: 200,
      pastDue: 5,
      canceled: 8,
      trialing: 12,
      churnRate: 0.04,
      recentChurnEvents: [],
    },
    payments: { succeeded: 220, failed: 3, successRate: 0.987 },
    revenueTrend: [
      { month: "Aug", revenue: 11000 },
      { month: "Sep", revenue: 12000 },
      { month: "Oct", revenue: 12800 },
      { month: "Nov", revenue: 13500 },
      { month: "Dec", revenue: 14200 },
      { month: "Jan", revenue: 15000 },
    ],
    _meta: meta,
    ...overrides,
  };
}

function makeMercury(overrides: Partial<MercuryData> = {}): MercuryData {
  return {
    accounts: [{ accountId: "acc-1", accountName: "Operating", balance: 500000, type: "checking" }],
    cashFlow: {
      totalBalance: 500000,
      inflows30d: 18000,
      outflows30d: 45000,
      netCashFlow: -27000,
      runway: 18.5,
      burnRate: 27000,
    },
    _meta: meta,
    ...overrides,
  };
}

function makeFreshness(
  provider: IntegrationProviderKey,
  overrides: Partial<ProviderFreshness> = {}
): ProviderFreshness {
  return {
    provider,
    source: "none",
    status: null,
    connectedAt: null,
    lastSyncedAt: null,
    lastError: null,
    stale: false,
    lastSnapshotAt: null,
    ...overrides,
  };
}

function makePayload(
  opts: { stripe?: StripeData | null; mercury?: MercuryData | null } = {}
): AnalyticsDashboardData {
  const data = createEmptyAnalyticsDashboardData({ freshness: {}, timeRange: defaultTimeRange });
  data.stripe = opts.stripe !== undefined ? opts.stripe : makeStripe();
  data.mercury = opts.mercury !== undefined ? opts.mercury : makeMercury();
  return data;
}

/* ── Tests ──────────────────────────────────────────────── */

describe("FinanceTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /* ─── Null / empty data ─────────────────────────────── */

  it("renders empty state when data is null", () => {
    render(<FinanceTab data={null} />);
    expect(screen.getByText("No financial data available")).toBeTruthy();
  });

  it("renders empty state when both stripe and mercury are missing", () => {
    const data = makePayload({ stripe: null, mercury: null });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Finance dashboard data is unavailable")).toBeTruthy();
  });

  /* ─── Connection status ─────────────────────────────── */

  it("shows connect-empty-state when both finance providers are disconnected", () => {
    const data = makePayload({ stripe: null, mercury: null });
    data.freshness.stripe = makeFreshness("stripe", {
      source: "connection",
      status: "DISCONNECTED",
    });
    data.freshness.mercury = makeFreshness("mercury", {
      source: "connection",
      status: "DISCONNECTED",
    });

    render(<FinanceTab data={data} />);

    expect(screen.getByText("Connect your finance integrations")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Settings" })).toBeTruthy();
  });

  it("treats DISCONNECTED connection records as not connected and shows warning banner", () => {
    const data = makePayload({ stripe: null, mercury: null });
    data.freshness.stripe = makeFreshness("stripe", {
      source: "connection",
      status: "DISCONNECTED",
    });
    data.freshness.mercury = makeFreshness("mercury", {
      source: "env",
      status: null,
    });

    render(<FinanceTab data={data} />);

    expect(screen.getByText("Stripe is not connected")).toBeTruthy();
  });

  it("shows provider error banners and filters generic missing-credential API errors", () => {
    const data = makePayload({ stripe: null, mercury: null });
    data.freshness.stripe = makeFreshness("stripe", {
      source: "connection",
      status: "ERROR",
      lastError: "Stripe 401",
    });
    data.freshness.mercury = makeFreshness("mercury", {
      source: "env",
      status: null,
    });
    data.errors.push({ source: "stripe", message: "Missing STRIPE_SECRET_KEY" });
    data.errors.push({ source: "stripe", message: "API timeout" });

    render(<FinanceTab data={data} />);

    expect(screen.getByText("Stripe connection error: Stripe 401")).toBeTruthy();
    expect(screen.getByText("stripe: API timeout")).toBeTruthy();
    expect(screen.queryByText("stripe: Missing STRIPE_SECRET_KEY")).toBeNull();
  });

  /* ─── A: Command Strip ──────────────────────────────── */

  it("renders all command strip stat cards", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Monthly Recurring Revenue")).toBeTruthy();
    expect(screen.getByText("Runway")).toBeTruthy();
    expect(screen.getByText("Monthly Burn")).toBeTruthy();
    expect(screen.getByText("Cash Balance")).toBeTruthy();
  });

  it("renders financial health score gauge with grade", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Financial Health")).toBeTruthy();
    // Grade should be present (A, B, C, D, or F)
    const gradeEl = screen.getByText(/^Grade [ABCDF]$/);
    expect(gradeEl).toBeTruthy();
  });

  it("shows projected 6-month values in stat card subtitles", () => {
    render(<FinanceTab data={makePayload()} />);
    // The MRR stat card and Cash Balance card show projected values with arrow prefix
    const subtitles = screen.getAllByText(/^→ \$/);
    expect(subtitles.length).toBeGreaterThanOrEqual(2);
  });

  /* ─── B: MRR Projection Chart ───────────────────────── */

  it("renders MRR projection section", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("MRR Projection")).toBeTruthy();
    expect(screen.getByText("Historical")).toBeTruthy();
    expect(screen.getByText("Projected")).toBeTruthy();
  });

  it("still renders MRR projection chart when stripe has no revenue trend (projections fill in)", () => {
    const data = makePayload({
      stripe: makeStripe({ revenueTrend: [], revenue: { mrr: 0, mrrChange: 0, totalRevenue30d: 0, totalRevenuePrev30d: 0, revenueGrowth: 0, avgRevenuePerCustomer: 0 } }),
    });
    render(<FinanceTab data={data} />);
    // Even with zero MRR and empty trend, the projection chart still renders (with zero values)
    expect(screen.getByText("MRR Projection")).toBeTruthy();
  });

  /* ─── C: Runway Scenarios ───────────────────────────── */

  it("renders three runway scenarios (Best Case, Expected, Worst Case)", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Runway Scenarios")).toBeTruthy();
    expect(screen.getByText("Best Case")).toBeTruthy();
    expect(screen.getByText("Expected")).toBeTruthy();
    expect(screen.getByText("Worst Case")).toBeTruthy();
  });

  it("shows expected cash trajectory waterfall", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Expected Cash Trajectory")).toBeTruthy();
  });

  it("displays burn rate for each scenario", () => {
    render(<FinanceTab data={makePayload()} />);
    // Each scenario bar shows "Burn: $X/mo"
    const burnLabels = screen.getAllByText(/^Burn: \$/);
    expect(burnLabels.length).toBe(3);
  });

  /* ─── D: Sensitivity Analysis ───────────────────────── */

  it("renders sensitivity sliders with initial zero state", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("What-If Sensitivity")).toBeTruthy();
    expect(screen.getByText("Churn Rate")).toBeTruthy();
    expect(screen.getByText("Growth Rate")).toBeTruthy();
    expect(screen.getByText("Burn Rate")).toBeTruthy();
    // Should show the "adjust sliders" prompt when all at zero
    expect(screen.getByText(/Adjust the sliders above/)).toBeTruthy();
  });

  it("shows impact results when a slider is changed", () => {
    const { container } = render(<FinanceTab data={makePayload()} />);
    // Find the Churn Rate slider input
    const churnSlider = screen.getByLabelText("Churn Rate adjustment");
    fireEvent.change(churnSlider, { target: { value: "-2" } });

    // The "adjust sliders" prompt should be gone
    expect(screen.queryByText(/Adjust the sliders above/)).toBeNull();

    // Impact results should appear — "Runway:" and "MRR@12mo:" are split across child spans
    const html = container.innerHTML;
    expect(html).toContain("Runway:");
    expect(html).toContain("MRR@12mo:");
  });

  /* ─── E: Goals & Milestones ─────────────────────────── */

  it("renders goals section with auto-generated goals", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Goals & Milestones")).toBeTruthy();

    // Goals should have progress percentages
    const progressLabels = screen.getAllByText(/% complete$/);
    expect(progressLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("shows on-track or needs-attention indicators", () => {
    render(<FinanceTab data={makePayload()} />);
    // At least one goal should show either "On track" or "Needs attention"
    const onTrack = screen.queryAllByText("On track");
    const needsAttention = screen.queryAllByText("Needs attention");
    expect(onTrack.length + needsAttention.length).toBeGreaterThanOrEqual(1);
  });

  /* ─── F: Suggestions ────────────────────────────────── */

  it("renders suggestions section with component score badges", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Suggested Actions")).toBeTruthy();

    // Health component badges should appear (e.g., "Runway: 85")
    const badges = screen.getAllByText(/: \d+$/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  /* ─── Graceful degradation ──────────────────────────── */

  it("renders with only Stripe data (no Mercury)", () => {
    const data = makePayload({ mercury: null });
    render(<FinanceTab data={data} />);
    // Should still render core sections
    expect(screen.getByText("Monthly Recurring Revenue")).toBeTruthy();
    expect(screen.getByText("MRR Projection")).toBeTruthy();
    expect(screen.getByText("Financial Health")).toBeTruthy();
  });

  it("renders with only Mercury data (no Stripe)", () => {
    const data = makePayload({ stripe: null });
    render(<FinanceTab data={data} />);
    // Should still render — cash balance and runway from Mercury
    expect(screen.getByText("Cash Balance")).toBeTruthy();
    expect(screen.getByText("Runway")).toBeTruthy();
  });

  it("shows provider errors in empty state when both fail with error details", () => {
    const data = makePayload({ stripe: null, mercury: null });
    data.errors.push({ source: "stripe", message: "Stripe API key expired" });
    data.errors.push({ source: "mercury", message: "Mercury sync failed" });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Finance dashboard data is unavailable")).toBeTruthy();
  });
});

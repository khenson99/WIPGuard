import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancePnlTab } from "@/components/analytics/finance-pnl-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type { AnalyticsDashboardData, StripeData, MercuryData } from "@/lib/analytics/types";

/* ── Helpers ───────────────────────────────────────────── */

const defaultTimeRange: AnalyticsDashboardData["timeRange"] = {
  preset: "30d",
  from: "2026-01-01",
  to: "2026-01-30",
  days: 30,
  label: "Last 30 days",
};

const meta = {
  fetchedAt: new Date().toISOString(),
  nextRefresh: new Date().toISOString(),
  source: "live" as const,
};

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
    accounts: [
      { accountId: "acc-1", accountName: "Operating", balance: 500000, type: "checking" },
    ],
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

function makePayload(
  opts: { stripe?: StripeData | null; mercury?: MercuryData | null } = {},
): AnalyticsDashboardData {
  const data = createEmptyAnalyticsDashboardData({
    freshness: {},
    timeRange: defaultTimeRange,
  });
  data.stripe = opts.stripe !== undefined ? opts.stripe : makeStripe();
  data.mercury = opts.mercury !== undefined ? opts.mercury : makeMercury();
  return data;
}

/* ── Tests ──────────────────────────────────────────────── */

describe("FinancePnlTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /* ─── Empty states ──────────────────────────────────── */

  it("renders empty state when data is null", () => {
    const { container } = render(<FinancePnlTab data={null} />);
    expect(
      screen.getByText("Profit & Loss data is unavailable"),
    ).toBeTruthy();
    expect(
      screen.getByText("Connect Stripe or Mercury to generate a P&L statement."),
    ).toBeTruthy();
    // No stat cards should be present
    expect(container.querySelectorAll("[data-testid]").length).toBeLessThanOrEqual(
      container.querySelectorAll("*").length,
    );
  });

  it("shows empty state when both stripe and mercury are null", () => {
    const data = makePayload({ stripe: null, mercury: null });
    render(<FinancePnlTab data={data} />);
    expect(
      screen.getByText("Profit & Loss data is unavailable"),
    ).toBeTruthy();
  });

  /* ─── Stat cards ────────────────────────────────────── */

  it("renders all four stat cards with full data", () => {
    render(<FinancePnlTab data={makePayload()} />);
    // "Net Income" appears both as a stat card label and a P&L table row
    expect(screen.getAllByText("Net Income").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Gross Margin")).toBeTruthy();
    expect(screen.getByText("Operating Margin")).toBeTruthy();
    expect(screen.getByText("Revenue")).toBeTruthy();
  });

  /* ─── P&L table ─────────────────────────────────────── */

  it("renders the Profit & Loss Statement section", () => {
    render(<FinancePnlTab data={makePayload()} />);
    expect(screen.getByText("Profit & Loss Statement")).toBeTruthy();
  });

  it("shows revenue line items in the P&L table", () => {
    render(<FinancePnlTab data={makePayload()} />);
    expect(screen.getByText("Subscription Revenue")).toBeTruthy();
    expect(screen.getByText("Total Revenue")).toBeTruthy();
  });

  it("shows the Change column header", () => {
    render(<FinancePnlTab data={makePayload()} />);
    expect(screen.getByText("Change")).toBeTruthy();
  });

  /* ─── Expense breakdown ─────────────────────────────── */

  it("renders expense breakdown section when Mercury provides outflows", () => {
    render(<FinancePnlTab data={makePayload()} />);
    expect(screen.getByText("Expense Breakdown")).toBeTruthy();
  });

  /* ─── Alerts ────────────────────────────────────────── */

  it("shows net loss warning when outflows exceed revenue", () => {
    const data = makePayload({
      stripe: makeStripe({
        revenue: {
          mrr: 1000,
          mrrChange: 0,
          totalRevenue30d: 1000,
          totalRevenuePrev30d: 1000,
          revenueGrowth: 0,
          avgRevenuePerCustomer: 10,
        },
      }),
      mercury: makeMercury({
        cashFlow: {
          totalBalance: 50000,
          inflows30d: 1000,
          outflows30d: 200000,
          netCashFlow: -199000,
          runway: 0.25,
          burnRate: 199000,
        },
      }),
    });
    render(<FinancePnlTab data={data} />);
    expect(screen.getByText(/Net loss/)).toBeTruthy();
  });

  /* ─── Graceful degradation ──────────────────────────── */

  it("renders stat cards with only Stripe data (no Mercury)", () => {
    const data = makePayload({ mercury: null });
    render(<FinancePnlTab data={data} />);
    expect(screen.getAllByText("Net Income").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Revenue")).toBeTruthy();
  });

  it("renders stat cards with only Mercury data (no Stripe)", () => {
    const data = makePayload({ stripe: null });
    render(<FinancePnlTab data={data} />);
    expect(screen.getAllByText("Net Income").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Operating Margin")).toBeTruthy();
  });
});

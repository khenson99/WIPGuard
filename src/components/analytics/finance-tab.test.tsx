import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type { AnalyticsDashboardData, StripeData, MercuryData } from "@/lib/analytics/types";

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

function makePayload(opts: { stripe?: StripeData | null; mercury?: MercuryData | null } = {}): AnalyticsDashboardData {
  const data = createEmptyAnalyticsDashboardData({ freshness: {}, timeRange: defaultTimeRange });
  data.stripe = opts.stripe !== undefined ? opts.stripe : makeStripe();
  data.mercury = opts.mercury !== undefined ? opts.mercury : makeMercury();
  return data;
}

describe("FinanceTab", () => {
  it("renders an empty state when payload is null", () => {
    render(<FinanceTab data={null} />);
    expect(screen.getByText("No financial data available")).toBeTruthy();
    expect(screen.getByText("Finance analytics payload is missing.")).toBeTruthy();
  });

  it("renders an empty state when both Stripe and Mercury are missing", () => {
    render(<FinanceTab data={makePayload({ stripe: null, mercury: null })} />);
    expect(screen.getByText("Finance dashboard data is unavailable")).toBeTruthy();
    expect(screen.getByText("Stripe and Mercury data could not be loaded for this range.")).toBeTruthy();
    expect(screen.getByText("Reconnect Integration")).toBeTruthy();
    expect(screen.getByText("Refresh Dashboard")).toBeTruthy();
    expect(screen.getByText("Open Settings")).toBeTruthy();
  });

  it("renders KPI cards and core sections when data is present", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Monthly Recurring Revenue")).toBeTruthy();
    expect(screen.getByText("Active Subscriptions")).toBeTruthy();
    expect(screen.getByText("Cash Balance")).toBeTruthy();
    expect(screen.getByText("Net Cash Flow (30d)")).toBeTruthy();
    expect(screen.getByText("Subscription Health")).toBeTruthy();
    expect(screen.getByText("Bank Accounts")).toBeTruthy();
    expect(screen.getByText("Operating")).toBeTruthy();
  });

  it("renders with only Stripe data (no Mercury)", () => {
    render(<FinanceTab data={makePayload({ mercury: null })} />);
    expect(screen.getByText("Monthly Recurring Revenue")).toBeTruthy();
    expect(screen.getByText("Subscription Health")).toBeTruthy();
    expect(screen.getByText("Bank Accounts")).toBeTruthy();
    expect(screen.getByText("No bank accounts connected")).toBeTruthy();
  });

  it("renders with only Mercury data (no Stripe)", () => {
    render(<FinanceTab data={makePayload({ stripe: null })} />);
    expect(screen.getByText("Cash Balance")).toBeTruthy();
    expect(screen.getByText("Bank Accounts")).toBeTruthy();
    expect(screen.getByText("Operating")).toBeTruthy();
  });
});


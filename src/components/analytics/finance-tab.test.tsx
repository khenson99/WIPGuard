import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { buildProfitAndLossCore } from "@/lib/analytics/pnl-builder";
import { buildDefaultScenarios } from "@/lib/analytics/forecast-engine";
import type {
  AnalyticsDashboardData,
  FinancialPlanningData,
  MercuryData,
  StripeData,
} from "@/lib/analytics/types";

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

function makeFinancialPlanning(
  overrides: Partial<FinancialPlanningData> = {},
): FinancialPlanningData {
  return {
    budgets: [],
    activeBudget: null,
    forecasts: [],
    goals: [],
    pnl: null,
    unitEconomics: null,
    ...overrides,
  };
}

function makePayload(
  opts: {
    stripe?: StripeData | null;
    mercury?: MercuryData | null;
    financialPlanning?: FinancialPlanningData | null;
  } = {},
): AnalyticsDashboardData {
  const data = createEmptyAnalyticsDashboardData({
    freshness: {},
    timeRange: defaultTimeRange,
  });
  data.stripe = opts.stripe !== undefined ? opts.stripe : makeStripe();
  data.mercury = opts.mercury !== undefined ? opts.mercury : makeMercury();
  data.financialPlanning = opts.financialPlanning !== undefined ? opts.financialPlanning : null;
  return data;
}

/* ── Tests ──────────────────────────────────────────────── */

describe("FinanceTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty state when data is null", () => {
    render(<FinanceTab data={null} />);
    expect(screen.getByText("No financial data available")).toBeTruthy();
  });

  it("renders empty state when both stripe and mercury are missing", () => {
    const data = makePayload({ stripe: null, mercury: null });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Finance dashboard data is unavailable")).toBeTruthy();
  });

  it("renders top KPI stat cards when finance data is present", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Monthly Recurring Revenue")).toBeTruthy();
    expect(screen.getByText("Active Subscriptions")).toBeTruthy();
    expect(screen.getByText("Cash Balance")).toBeTruthy();
    expect(screen.getByText("Net Cash Flow (30d)")).toBeTruthy();
  });

  it("renders Revenue Trend section when Stripe provides a trend series", () => {
    render(<FinanceTab data={makePayload()} />);
    expect(screen.getByText("Revenue Trend")).toBeTruthy();
  });

  it("renders Unit Economics section when financial planning includes unit economics", () => {
    const data = makePayload({
      financialPlanning: makeFinancialPlanning({
        unitEconomics: {
          ltv: 10_000,
          cac: 2_000,
          ltvCacRatio: 5,
          avgRevenuePerAccount: 100,
          paybackMonths: 4,
          grossMarginPct: 80,
        },
      }),
    });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Unit Economics")).toBeTruthy();
  });

  it("renders P&L statement when financial planning includes pnl", () => {
    const stripe = makeStripe();
    const mercury = makeMercury();
    const data = makePayload({
      stripe,
      mercury,
      financialPlanning: makeFinancialPlanning({
        pnl: buildProfitAndLossCore(stripe, mercury),
      }),
    });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Profit & Loss Statement")).toBeTruthy();
    expect(screen.getByText("Gross Profit")).toBeTruthy();
  });

  it("renders Forecast Scenarios when financial planning includes forecasts", () => {
    const stripe = makeStripe();
    const mercury = makeMercury();
    const data = makePayload({
      stripe,
      mercury,
      financialPlanning: makeFinancialPlanning({
        forecasts: buildDefaultScenarios(stripe, mercury),
      }),
    });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Forecast Scenarios")).toBeTruthy();
    expect(screen.getByText("Base Case")).toBeTruthy();
  });

  it("renders Financial Goals when financial planning includes goals", () => {
    const data = makePayload({
      financialPlanning: makeFinancialPlanning({
        goals: [
          {
            id: "g1",
            metric: "mrr",
            targetValue: 25_000,
            currentValue: 15_000,
            progressPct: 60,
            deadline: "2026-12-31T00:00:00.000Z",
            status: "active",
          },
        ],
      }),
    });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Financial Goals")).toBeTruthy();
    expect(screen.getByText("In Progress")).toBeTruthy();
  });

  it("renders with only Stripe data (no Mercury)", () => {
    const data = makePayload({ mercury: null });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Monthly Recurring Revenue")).toBeTruthy();
    expect(screen.getByText("Active Subscriptions")).toBeTruthy();
  });

  it("renders with only Mercury data (no Stripe)", () => {
    const data = makePayload({ stripe: null });
    render(<FinanceTab data={data} />);
    expect(screen.getByText("Cash Balance")).toBeTruthy();
    expect(screen.getByText("Net Cash Flow (30d)")).toBeTruthy();
  });
});


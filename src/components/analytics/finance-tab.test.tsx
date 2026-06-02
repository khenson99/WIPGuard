import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceTab } from "@/components/analytics/finance-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { buildProfitAndLossCore } from "@/lib/analytics/pnl-builder";
import { buildDefaultScenarios } from "@/lib/analytics/forecast-engine";
import { buildAnalyticsMetricsLayer } from "@/lib/analytics/kpis";
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
    subscriptionOverview: null,
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
  data.metrics = buildAnalyticsMetricsLayer(data);
  data.kpis = data.metrics.kpis;
  return data;
}

describe("FinanceTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty state when data is null", () => {
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

  it("uses the canonical finance summary for cash-flow mini stats", () => {
    const data = makePayload();
    if (!data.metrics) throw new Error("Expected metrics layer");
    data.metrics.finance.summary.inflows30d = 1234;
    data.metrics.finance.summary.outflows30d = 5678;
    data.metrics.finance.summary.burnRate = 9101;

    render(<FinanceTab data={data} />);

    expect(screen.getByText("$1.2K")).toBeTruthy();
    expect(screen.getByText("$5.7K")).toBeTruthy();
    expect(screen.getByText("$9.1K")).toBeTruthy();
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

  it("labels budget variance as estimated when Mercury-derived actuals are shown", () => {
    const data = makePayload({
      financialPlanning: makeFinancialPlanning({
        activeBudget: {
          id: "budget-1",
          name: "Operating Plan",
          period: "monthly",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-02-01T00:00:00.000Z",
          lineItems: [
            {
              id: "line-1",
              category: "marketing",
              plannedAmount: 6000,
              actualAmount: 900,
              variance: -5100,
              variancePct: -85,
            },
          ],
          totalPlanned: 6000,
          totalActual: 900,
          totalVariance: -5100,
        },
        budgets: [],
      }),
    });

    render(<FinanceTab data={data} />);
    expect(screen.getByText("Budget vs Estimated Actuals")).toBeTruthy();
    expect(
      screen.getByText(
        "Estimated actuals are derived from aggregate Mercury outflows until transaction categories are mapped to budget lines."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Est. Actual").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Est. Variance").length).toBeGreaterThanOrEqual(1);
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

  it("prefers the merged subscription overview for the headline KPI", () => {
    const data = makePayload({
      financialPlanning: makeFinancialPlanning({
        subscriptionOverview: {
          mergedActiveSubscriptions: 148,
          stripeActiveSubscriptions: 155,
          hubspotActiveSubscriptions: 151,
          stripeMrr: 15_000,
          hubspotSubscriptionMrr: 14_500,
          hubspotOnlySubscriptionMrr: 0,
          excludedLinkedHubspotSubscriptionMrr: 0,
          totalMrr: 15_000,
          totalArr: 180_000,
        },
      }),
    });

    render(<FinanceTab data={data} />);

    expect(screen.getByText("148")).toBeTruthy();
    expect(screen.getByText("155 Stripe · 151 HubSpot · 5 past due · 12 trialing")).toBeTruthy();
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

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type {
  AnalyticsDashboardData,
  StripeData,
  MercuryData,
  ForecastScenarioData,
} from "@/lib/analytics/types";

vi.mock("@/lib/analytics/forecast-engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics/forecast-engine")>(
    "@/lib/analytics/forecast-engine",
  );
  return {
    ...actual,
    buildDefaultScenarios: vi.fn(actual.buildDefaultScenarios),
  };
});

import { buildDefaultScenarios } from "@/lib/analytics/forecast-engine";
import { FinanceForecastTab } from "@/components/analytics/finance-forecast-tab";

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
      {
        accountId: "acc-1",
        accountName: "Operating",
        balance: 500000,
        type: "checking",
      },
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

describe("FinanceForecastTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /* ─── Empty states ──────────────────────────────────── */

  it("renders empty state when data is null", () => {
    render(<FinanceForecastTab data={null} />);
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  it("renders empty state when both stripe and mercury are null", () => {
    const data = makePayload({ stripe: null, mercury: null });
    render(<FinanceForecastTab data={data} />);
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
  });

  /* ─── Scenario stat cards ───────────────────────────── */

  it("renders all three scenario stat cards", () => {
    render(<FinanceForecastTab data={makePayload()} />);
    // Each scenario name appears in multiple places (stat card, chart legend, details).
    // Verify at least one element per scenario name is present.
    expect(screen.getAllByText("Optimistic").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Base Case").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Conservative").length).toBeGreaterThanOrEqual(1);
  });

  /* ─── Chart sections ────────────────────────────────── */

  it("renders the Revenue Projection chart section", () => {
    render(<FinanceForecastTab data={makePayload()} />);
    expect(screen.getByText("Revenue Projection")).toBeTruthy();
  });

  it("renders the Cash Projection chart section", () => {
    render(<FinanceForecastTab data={makePayload()} />);
    expect(screen.getByText("Cash Projection")).toBeTruthy();
  });

  /* ─── Scenario details ──────────────────────────────── */

  it("renders the Scenario Details section", () => {
    render(<FinanceForecastTab data={makePayload()} />);
    expect(screen.getByText("Scenario Details")).toBeTruthy();
  });

  it("shows detail labels for each scenario", () => {
    render(<FinanceForecastTab data={makePayload()} />);
    expect(screen.getAllByText("Growth rate").length).toBe(3);
    expect(screen.getAllByText("Churn rate").length).toBe(3);
    expect(screen.getAllByText("Monthly burn").length).toBe(3);
    expect(screen.getAllByText("Runway").length).toBe(3);
  });

  /* ─── Forecast insights ─────────────────────────────── */

  it("renders Forecast Insights section when insights are generated", () => {
    // Use high growth so optimistic 12-month MRR exceeds 2x current MRR,
    // triggering the "Strong growth potential" insight.
    const stripe = makeStripe({
      revenue: {
        mrr: 15000,
        mrrChange: 0.08,
        totalRevenue30d: 18000,
        totalRevenuePrev30d: 16500,
        revenueGrowth: 10,
        avgRevenuePerCustomer: 75,
      },
    });
    const data = makePayload({ stripe });
    render(<FinanceForecastTab data={data} />);
    expect(screen.getByText("Forecast Insights")).toBeTruthy();
  });

  it("selects worst scenario by runway when scenarios are unordered", () => {
    const makeScenario = (
      id: string,
      name: string,
      runwayMonths: number,
      mrr12: number,
    ): ForecastScenarioData => ({
      id,
      name,
      assumptions: {
        revenueGrowthRate: 0,
        churnRateDelta: 0,
        burnRateDelta: 0,
        additionalMonthlyExpense: 0,
        additionalMonthlyRevenue: 0,
      },
      months: Array.from({ length: 13 }, (_, i) => ({
        month: `M${i}`,
        projectedRevenue: mrr12,
        projectedExpenses: 10_000,
        projectedCashBalance: 10_000,
        projectedMrr: mrr12,
        projectedRunway: runwayMonths,
      })),
      runwayMonths,
    });

    const scenarios = [
      makeScenario("default-base", "Base Case", 12, 20_000),
      makeScenario("optimistic", "Optimistic", 5, 30_000),
      makeScenario("conservative", "Conservative", 14, 10_000),
    ];

    (buildDefaultScenarios as unknown as { mockImplementationOnce: (fn: () => ForecastScenarioData[]) => void })
      .mockImplementationOnce(() => scenarios);

    render(<FinanceForecastTab data={makePayload()} />);
    expect(screen.getByText("Conservative runway is only 5.0 mo")).toBeTruthy();
  });

  /* ─── Graceful degradation ──────────────────────────── */

  it("renders without crash when only Stripe data is available", () => {
    const data = makePayload({ mercury: null });
    render(<FinanceForecastTab data={data} />);
    expect(screen.getAllByText("Optimistic").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Scenario Details")).toBeTruthy();
  });

  it("renders without crash when only Mercury data is available", () => {
    const data = makePayload({ stripe: null });
    render(<FinanceForecastTab data={data} />);
    expect(screen.getByText("Scenario Details")).toBeTruthy();
  });
});

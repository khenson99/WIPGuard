import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinancePlanningTab } from "@/components/analytics/finance-planning-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type {
  AnalyticsDashboardData,
  MercuryData,
  StripeData,
} from "@/lib/analytics/types";
import type { AnalyticsMetricsLayer } from "@/lib/analytics/kpis";

/* ── Mock lucide-react icons as plain function components ── */

vi.mock("lucide-react", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("lucide-react");
  function makeIcon(name: string) {
    function Icon(props: Record<string, unknown>) {
      return <svg data-testid={`icon-${name}`} {...props} />;
    }
    Icon.displayName = name;
    return Icon;
  }
  return {
    ...actual,
    Target: makeIcon("Target"),
    Wallet: makeIcon("Wallet"),
    AlertTriangle: makeIcon("AlertTriangle"),
    TrendingDown: makeIcon("TrendingDown"),
  };
});

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

describe("FinancePlanningTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [],
    })) as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* ─── Empty states ───────────────────────────────────── */

  describe("empty states", () => {
    it("renders empty state when data is null", () => {
      render(<FinancePlanningTab data={null} />);
      expect(
        screen.getByText("Finance data is unavailable"),
      ).toBeTruthy();
    });

    it("renders empty state when both providers are null", () => {
      const data = makePayload({ stripe: null, mercury: null });
      render(<FinancePlanningTab data={data} />);
      expect(
        screen.getByText("No Stripe or Mercury data"),
      ).toBeTruthy();
    });
  });

  /* ─── Stat cards ─────────────────────────────────────── */

  describe("stat cards render", () => {
    it("shows all four budget stat cards with full data", () => {
      render(<FinancePlanningTab data={makePayload()} />);
      expect(screen.getByText("Total Budget")).toBeTruthy();
      expect(screen.getByText("Total Actual")).toBeTruthy();
      // "Variance" appears both as a stat card label and a table column header
      expect(screen.getAllByText("Variance").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Overspend Areas")).toBeTruthy();
    });
  });

  /* ─── Budget variance table ──────────────────────────── */

  describe("budget variance table", () => {
    it("renders Budget vs Actual section title", () => {
      render(<FinancePlanningTab data={makePayload()} />);
      expect(screen.getByText("Budget vs Actual")).toBeTruthy();
    });

    it("displays budget category labels", () => {
      render(<FinancePlanningTab data={makePayload()} />);
      expect(screen.getAllByText("Cost of Goods Sold").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Payroll & Benefits").length).toBeGreaterThanOrEqual(1);
    });

    it("renders planned and actual values from the canonical metrics layer", () => {
      const data = makePayload({
        mercury: makeMercury({
          transactions: [
            {
              id: "stripe-fee",
              postedAt: "2026-01-15T00:00:00.000Z",
              amount: -1234,
              kind: "outgoingPayment",
              mercuryCategory: null,
              description: "Stripe fee",
              counterpartyName: "Stripe",
            },
          ],
        }),
      }) as AnalyticsDashboardData & { metrics: AnalyticsMetricsLayer };
      data.metrics = {
        kpis: {
          traffic: {
            bounceRatePct: 0,
            pagesPerSession: 0,
            engagementScore: 100,
            pageDepthScore: 0,
          },
          finance: {
            mrr: 15000,
            paymentSuccessPct: 98.7,
          },
        },
        finance: {
          budgetActuals: {
            budgetId: "budget-1",
            budgetName: "Baseline Budget",
            totalBudget: 1000,
            totalActual: 1234,
            totalVariance: 234,
            totalVariancePct: 23.4,
            overspendCategories: ["Cost of Goods Sold"],
            items: [
              {
                category: "Cost of Goods Sold",
                budgeted: 1000,
                actual: 1234,
                variance: 234,
                variancePct: 23.4,
                status: "over",
              },
            ],
          },
        },
      };
      data.financialPlanning = {
        budgets: [
          {
            id: "budget-1",
            name: "Baseline Budget",
            period: "monthly",
            startDate: "2026-01-01T00:00:00.000Z",
            endDate: "2026-01-31T23:59:59.999Z",
            lineItems: [],
            totalPlanned: 1000,
            totalActual: 1234,
            totalVariance: 234,
          },
        ],
        activeBudget: null,
        forecasts: [],
        goals: [],
        pnl: null,
        unitEconomics: null,
        subscriptionOverview: null,
      };

      render(<FinancePlanningTab data={data} />);

      expect(screen.getAllByText("Cost of Goods Sold").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("$1.2K").length).toBeGreaterThanOrEqual(1);
    });
  });

  /* ─── Category breakdown ─────────────────────────────── */

  describe("category breakdown", () => {
    it("renders Category Breakdown section", () => {
      render(<FinancePlanningTab data={makePayload()} />);
      expect(screen.getByText("Category Breakdown")).toBeTruthy();
    });
  });

  /* ─── Financial goals ────────────────────────────────── */

  describe("financial goals", () => {
    it("renders Financial Goals section", () => {
      render(<FinancePlanningTab data={makePayload()} />);
      expect(screen.getByText("Financial Goals")).toBeTruthy();
    });

    it("shows goal progress percentages", () => {
      render(<FinancePlanningTab data={makePayload()} />);
      const progressLabels = screen.getAllByText(/% complete$/);
      expect(progressLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  /* ─── Insights section ───────────────────────────────── */

  describe("insights section", () => {
    it("renders Insights & Recommendations section", () => {
      const baseMercury = makeMercury();
      const data = makePayload({
        mercury: {
          ...baseMercury,
          cashFlow: {
            ...baseMercury.cashFlow,
            runway: 10,
          },
        },
      });
      render(<FinancePlanningTab data={data} />);
      expect(screen.getByText("Insights & Recommendations")).toBeTruthy();
    });

    it("shows baseline banner and suppresses variance insights when no budget is configured", () => {
      render(<FinancePlanningTab data={makePayload()} />);
      expect(screen.getByText("Budget baseline not configured")).toBeTruthy();
      expect(screen.queryByText("Under Budget Overall")).toBeNull();
      expect(screen.queryByText("Significant Budget Overrun")).toBeNull();
    });
  });

  /* ─── Graceful degradation ───────────────────────────── */

  describe("graceful degradation", () => {
    it("renders without crash when only Stripe is present (no Mercury)", () => {
      const data = makePayload({ mercury: null });
      render(<FinancePlanningTab data={data} />);
      expect(screen.getByText("Total Budget")).toBeTruthy();
      expect(screen.getByText("Total Actual")).toBeTruthy();
      expect(screen.getAllByText("Variance").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Overspend Areas")).toBeTruthy();
    });

    it("renders without crash when only Mercury is present (no Stripe)", () => {
      const data = makePayload({ stripe: null });
      render(<FinancePlanningTab data={data} />);
      expect(screen.getByText("Total Budget")).toBeTruthy();
      expect(screen.getByText("Total Actual")).toBeTruthy();
      expect(screen.getAllByText("Variance").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Overspend Areas")).toBeTruthy();
    });
  });
});

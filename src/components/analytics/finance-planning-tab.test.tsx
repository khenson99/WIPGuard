import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancePlanningTab } from "@/components/analytics/finance-planning-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type { AnalyticsDashboardData, StripeData, MercuryData } from "@/lib/analytics/types";

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
      expect(screen.getByText("Cost of Goods Sold")).toBeTruthy();
      expect(screen.getByText("Payroll & Benefits")).toBeTruthy();
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
      render(<FinancePlanningTab data={makePayload()} />);
      expect(screen.getByText("Insights & Recommendations")).toBeTruthy();
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

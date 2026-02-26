import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceUnitEconomicsTab } from "@/components/analytics/finance-unit-economics-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type { AnalyticsDashboardData, StripeData, MercuryData } from "@/lib/analytics/types";

/* -- Helpers ------------------------------------------------- */

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

/* -- Tests --------------------------------------------------- */

describe("FinanceUnitEconomicsTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /* --- Empty states ----------------------------------------- */

  describe("empty states", () => {
    it("renders empty state when data is null", () => {
      render(<FinanceUnitEconomicsTab data={null} />);
      expect(screen.getByText("Unit economics data is unavailable")).toBeTruthy();
    });

    it("renders empty state when Stripe is null (even if Mercury exists)", () => {
      const data = makePayload({ stripe: null, mercury: makeMercury() });
      render(<FinanceUnitEconomicsTab data={data} />);
      expect(screen.getByText("Unit economics data is unavailable")).toBeTruthy();
    });

    it("renders empty state when both providers are null", () => {
      const data = makePayload({ stripe: null, mercury: null });
      render(<FinanceUnitEconomicsTab data={data} />);
      expect(screen.getByText("Unit economics data is unavailable")).toBeTruthy();
    });
  });

  /* --- Stat cards ------------------------------------------- */

  describe("stat cards render", () => {
    it("shows Lifetime Value, Acquisition Cost, and LTV:CAC cards", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      expect(screen.getByText("Lifetime Value")).toBeTruthy();
      expect(screen.getByText("Acquisition Cost")).toBeTruthy();
      // "LTV:CAC" appears in stat card and RingStat label
      expect(screen.getAllByText("LTV:CAC").length).toBeGreaterThanOrEqual(1);
    });

    it("displays LTV and CAC subtitles", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      expect(screen.getByText("LTV")).toBeTruthy();
      expect(screen.getByText("CAC")).toBeTruthy();
    });
  });

  /* --- LTV:CAC visual section ------------------------------- */

  describe("LTV:CAC visual section", () => {
    it("renders the LTV:CAC Ratio section", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      expect(screen.getByText("LTV:CAC Ratio")).toBeTruthy();
    });

    it("displays the target ratio guidance text", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      expect(
        screen.getByText("Target a ratio of 3x or above for sustainable growth"),
      ).toBeTruthy();
    });
  });

  /* --- Detail metrics --------------------------------------- */

  describe("detail metrics", () => {
    it("renders the Detail Metrics section", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      expect(screen.getByText("Detail Metrics")).toBeTruthy();
    });

    it("shows all four detail metric labels", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      // "Payback Period" and "Gross Margin" also appear in insights section
      expect(screen.getAllByText("Payback Period").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Gross Margin").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("ARPA")).toBeTruthy();
      expect(screen.getByText("Magic Number")).toBeTruthy();
    });
  });

  /* --- Insights section ------------------------------------- */

  describe("insights section", () => {
    it("renders the Unit Economics Insights section", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      expect(screen.getByText("Unit Economics Insights")).toBeTruthy();
    });

    it("shows core insight titles", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      expect(screen.getByText("LTV:CAC Health")).toBeTruthy();
      // "Payback Period" and "Gross Margin" also appear in detail metrics grid
      expect(screen.getAllByText("Payback Period").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Gross Margin").length).toBeGreaterThanOrEqual(2);
    });
  });

  /* --- Graceful degradation --------------------------------- */

  describe("graceful degradation", () => {
    it("renders with only Stripe (no Mercury)", () => {
      const data = makePayload({ mercury: null });
      render(<FinanceUnitEconomicsTab data={data} />);
      expect(screen.getByText("Lifetime Value")).toBeTruthy();
      expect(screen.getByText("Acquisition Cost")).toBeTruthy();
      expect(screen.getAllByText("LTV:CAC").length).toBeGreaterThanOrEqual(1);
    });

    it("renders with Stripe and Mercury together", () => {
      render(<FinanceUnitEconomicsTab data={makePayload()} />);
      expect(screen.getByText("Detail Metrics")).toBeTruthy();
      expect(screen.getAllByText("Payback Period").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Gross Margin").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("ARPA")).toBeTruthy();
      expect(screen.getByText("Magic Number")).toBeTruthy();
    });
  });
});

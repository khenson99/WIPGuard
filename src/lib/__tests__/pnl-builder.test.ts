import { describe, expect, it } from "vitest";
import { buildProfitAndLoss } from "@/lib/analytics/pnl-builder";
import type { ProfitAndLossData } from "@/lib/analytics/pnl-builder";
import type { StripeData, MercuryData } from "@/lib/analytics/types";

/* ─── Fixtures ────────────────────────────────────────────── */

const META = {
  fetchedAt: "2026-01-15T00:00:00Z",
  nextRefresh: "2026-01-15T01:00:00Z",
  source: "live" as const,
};

function makeStripe(overrides: Partial<StripeData> = {}): StripeData {
  return {
    revenue: {
      mrr: 10_000,
      mrrChange: 1200,
      totalRevenue30d: 12_000,
      totalRevenuePrev30d: 10_800,
      revenueGrowth: 10,
      avgRevenuePerCustomer: 200,
    },
    subscriptions: {
      active: 50,
      pastDue: 2,
      canceled: 3,
      trialing: 5,
      churnRate: 4,
      recentChurnEvents: [],
    },
    payments: { succeeded: 48, failed: 2, successRate: 96 },
    revenueTrend: [{ month: "Jan 26", revenue: 10_000 }],
    _meta: META,
    ...overrides,
  };
}

function makeMercury(overrides: Partial<MercuryData> = {}): MercuryData {
  return {
    accounts: [
      { accountId: "a1", accountName: "Operating", balance: 500_000, type: "checking" },
    ],
    cashFlow: {
      totalBalance: 500_000,
      inflows30d: 12_000,
      outflows30d: 45_000,
      netCashFlow: -33_000,
      runway: 15,
      burnRate: 45_000,
    },
    _meta: META,
    ...overrides,
  };
}

/* ─── Helpers ─────────────────────────────────────────────── */

function buildDefault(): ProfitAndLossData {
  return buildProfitAndLoss(makeStripe(), makeMercury());
}

/* ─── Tests ───────────────────────────────────────────────── */

describe("buildProfitAndLoss", () => {
  /* ── Period labels ── */

  it("returns correct period labels", () => {
    const result = buildDefault();
    expect(result.period).toBe("Last 30 days");
    expect(result.previousPeriod).toBe("Prior 30 days");
  });

  /* ── Items array structure ── */

  it("produces exactly 10 line items", () => {
    const result = buildDefault();
    expect(result.items).toHaveLength(10);
  });

  it('first item is "Total Revenue" with category "revenue"', () => {
    const item = buildDefault().items[0];
    expect(item.label).toBe("Total Revenue");
    expect(item.category).toBe("revenue");
  });

  it('second item is "Cost of Goods Sold" with category "expense"', () => {
    const item = buildDefault().items[1];
    expect(item.label).toBe("Cost of Goods Sold");
    expect(item.category).toBe("expense");
  });

  it('third item is "Gross Profit" with category "subtotal"', () => {
    const item = buildDefault().items[2];
    expect(item.label).toBe("Gross Profit");
    expect(item.category).toBe("subtotal");
  });

  it("items 4-7 are the four operating expense categories with correct labels", () => {
    const items = buildDefault().items.slice(3, 7);
    const expectedLabels = [
      "Payroll & Compensation",
      "Marketing & Sales",
      "Infrastructure & Tools",
      "General & Administrative",
    ];

    for (let i = 0; i < items.length; i++) {
      expect(items[i].label).toBe(expectedLabels[i]);
      expect(items[i].category).toBe("expense");
    }
  });

  it('item 8 is "Total Operating Expenses" with category "subtotal"', () => {
    const item = buildDefault().items[7];
    expect(item.label).toBe("Total Operating Expenses");
    expect(item.category).toBe("subtotal");
  });

  it('item 9 is "Operating Income" with category "subtotal"', () => {
    const item = buildDefault().items[8];
    expect(item.label).toBe("Operating Income");
    expect(item.category).toBe("subtotal");
  });

  it('item 10 is "Net Income" with category "total"', () => {
    const item = buildDefault().items[9];
    expect(item.label).toBe("Net Income");
    expect(item.category).toBe("total");
  });

  /* ── Revenue values ── */

  it("revenue current equals stripe.totalRevenue30d", () => {
    const item = buildDefault().items[0];
    expect(item.current).toBe(12_000);
  });

  it("revenue previous equals stripe.totalRevenuePrev30d", () => {
    const item = buildDefault().items[0];
    expect(item.previous).toBe(10_800);
  });

  /* ── Expense calculations ── */

  it("each expense equals outflows multiplied by the ratio", () => {
    const result = buildDefault();
    const cogs = result.items[1];
    const opexItems = result.items.slice(3, 7);
    // outflows30d = 45000
    // cogs=0.25, payroll=0.35, marketing=0.15, infrastructure=0.10, ops=0.15
    expect(cogs.current).toBe(11_250);
    expect(opexItems.map((item) => item.current)).toEqual([15_750, 6_750, 4_500, 6_750]);
  });

  it("previous expense values mirror current (no historical outflow data)", () => {
    const result = buildDefault();
    const expenseItems = [result.items[1], ...result.items.slice(3, 7)];
    for (const item of expenseItems) {
      expect(item.previous).toBe(item.current);
    }
  });

  it("total operating expenses equal the sum of operating expense items", () => {
    const result = buildDefault();
    const totalOpexItem = result.items[7];
    expect(totalOpexItem.current).toBe(33_750);
    expect(totalOpexItem.previous).toBe(33_750);
  });

  /* ── Net income ── */

  it("net income equals revenue minus total expenses", () => {
    const result = buildDefault();
    // 12000 - 45000 = -33000
    expect(result.netIncome).toBe(-33_000);
    expect(result.items[9].current).toBe(-33_000);
  });

  it("previous net income equals previous revenue minus total expenses", () => {
    const result = buildDefault();
    // 10800 - 45000 = -34200
    expect(result.previousNetIncome).toBe(-34_200);
    expect(result.items[9].previous).toBe(-34_200);
  });

  /* ── Margin calculations ── */

  it("grossMargin is (revenue - COGS) / revenue * 100", () => {
    const result = buildDefault();
    // (12000 - 11250) / 12000 * 100 = 6.25
    expect(result.grossMargin).toBe(6.3);
  });

  it("operatingMargin is netIncome / revenue * 100", () => {
    const result = buildDefault();
    // -33000 / 12000 * 100 = -275
    expect(result.operatingMargin).toBe(-275);
  });

  /* ── Null handling ── */

  it("handles null stripe (revenue is 0)", () => {
    const result = buildProfitAndLoss(null, makeMercury());

    expect(result.items[0].current).toBe(0);
    expect(result.items[0].previous).toBe(0);
    expect(result.netIncome).toBe(-45_000);
    expect(result.previousNetIncome).toBe(-45_000);
    expect(result.grossMargin).toBe(0);
    expect(result.operatingMargin).toBe(0);
  });

  it("handles null mercury (expenses are 0)", () => {
    const result = buildProfitAndLoss(makeStripe(), null);

    const expenseItems = [result.items[1], ...result.items.slice(3, 7)];
    for (const item of expenseItems) {
      expect(item.current).toBe(0);
      expect(item.previous).toBe(0);
    }

    expect(result.items[7].current).toBe(0);
    expect(result.netIncome).toBe(12_000);
    expect(result.previousNetIncome).toBe(10_800);
    // grossMargin: (12000 - 0) / 12000 * 100 = 100
    expect(result.grossMargin).toBe(100);
    // operatingMargin: 12000 / 12000 * 100 = 100
    expect(result.operatingMargin).toBe(100);
  });

  it("handles both null (all zeros)", () => {
    const result = buildProfitAndLoss(null, null);

    expect(result.items[0].current).toBe(0);
    expect(result.items[0].previous).toBe(0);
    expect(result.items[7].current).toBe(0);
    expect(result.items[7].previous).toBe(0);
    expect(result.netIncome).toBe(0);
    expect(result.previousNetIncome).toBe(0);
    expect(result.grossMargin).toBe(0);
    expect(result.operatingMargin).toBe(0);
  });

  /* ── Custom ratios ── */

  it("custom ratios are respected via opts.ratios", () => {
    const customRatios = {
      cogs: 0.50,
      payroll: 0.20,
      marketing: 0.10,
      infrastructure: 0.10,
      ops: 0.10,
    };

    const result = buildProfitAndLoss(makeStripe(), makeMercury(), {
      ratios: customRatios,
    });

    const cogs = result.items[1];
    const expenses = result.items.slice(3, 7);
    // outflows = 45000
    expect(cogs.current).toBe(22_500); // cogs: 45000 * 0.50
    expect(expenses[0].current).toBe(9_000);  // payroll: 45000 * 0.20
    expect(expenses[1].current).toBe(4_500);  // marketing: 45000 * 0.10
    expect(expenses[2].current).toBe(4_500);  // infrastructure: 45000 * 0.10
    expect(expenses[3].current).toBe(4_500);  // ops: 45000 * 0.10

    // grossMargin with custom COGS: (12000 - 22500) / 12000 * 100 = -87.5
    expect(result.grossMargin).toBe(-87.5);
  });

  /* ── Rounding ── */

  it("all monetary values are rounded to 2 decimal places", () => {
    // Use outflows that produce fractional expense values
    const mercury = makeMercury({
      cashFlow: {
        totalBalance: 500_000,
        inflows30d: 12_000,
        outflows30d: 33_333,
        netCashFlow: -21_333,
        runway: 15,
        burnRate: 33_333,
      },
    });

    const result = buildProfitAndLoss(makeStripe(), mercury);

    // Verify all expense items are rounded to at most 2 decimal places
    const expenseItems = [result.items[1], ...result.items.slice(3, 7)];
    for (const item of expenseItems) {
      const currentDecimals = countDecimalPlaces(item.current);
      const previousDecimals = countDecimalPlaces(item.previous);
      expect(currentDecimals).toBeLessThanOrEqual(2);
      expect(previousDecimals).toBeLessThanOrEqual(2);
    }

    // Verify totals and net income are rounded
    const totalExpenses = result.items[7];
    expect(countDecimalPlaces(totalExpenses.current)).toBeLessThanOrEqual(2);

    const netIncomeItem = result.items[9];
    expect(countDecimalPlaces(netIncomeItem.current)).toBeLessThanOrEqual(2);

    expect(countDecimalPlaces(result.netIncome)).toBeLessThanOrEqual(2);
    expect(countDecimalPlaces(result.previousNetIncome)).toBeLessThanOrEqual(2);
    expect(countDecimalPlaces(result.grossMargin)).toBeLessThanOrEqual(2);
    expect(countDecimalPlaces(result.operatingMargin)).toBeLessThanOrEqual(2);
  });
});

/* ─── Utility ─────────────────────────────────────────────── */

function countDecimalPlaces(n: number): number {
  const str = String(n);
  const dotIndex = str.indexOf(".");
  if (dotIndex === -1) return 0;
  return str.length - dotIndex - 1;
}

import { describe, expect, it } from "vitest";
import {
  computeBudgetActuals,
  computeBudgetSummary,
  identifyOverspendCategories,
  CATEGORY_RATIOS,
} from "@/lib/analytics/budget-variance";
import type { BudgetActualItem } from "@/lib/analytics/budget-variance";
import { DEFAULT_EXPENSE_RATIOS } from "@/lib/analytics/finance-utils";
import type { MercuryData } from "@/lib/analytics/types";

/* ─── Fixtures ────────────────────────────────────────────── */

const META = { fetchedAt: "2026-01-15T00:00:00Z", nextRefresh: "2026-01-15T01:00:00Z", source: "live" as const };

const EXPECTED_LABELS = [
  "Cost of Goods Sold",
  "Payroll & Benefits",
  "Sales & Marketing",
  "Infrastructure & Hosting",
  "General & Administrative",
];

function makeMercury(overrides: Partial<MercuryData> = {}): MercuryData {
  return {
    accounts: [{ accountId: "a1", accountName: "Operating", balance: 500_000, type: "checking" }],
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

function makeItem(overrides: Partial<BudgetActualItem> = {}): BudgetActualItem {
  return {
    category: "Cost of Goods Sold",
    budgeted: 12_375,
    actual: 11_250,
    variance: -1_125,
    variancePct: -9.09,
    status: "on-track",
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════
   1. computeBudgetActuals
   ═══════════════════════════════════════════════════════════ */

describe("computeBudgetActuals", () => {
  it("returns 5 items (one per expense category)", () => {
    const items = computeBudgetActuals(makeMercury());
    expect(items).toHaveLength(5);
  });

  it("each item has the correct category label", () => {
    const items = computeBudgetActuals(makeMercury());
    const labels = items.map((i) => i.category);
    expect(labels).toEqual(EXPECTED_LABELS);
  });

  it("actual values are outflows * ratio", () => {
    const mercury = makeMercury();
    const items = computeBudgetActuals(mercury);
    const outflows = mercury.cashFlow.outflows30d;

    // cogs: 45000 * 0.25 = 11250
    expect(items[0].actual).toBe(Math.round(outflows * 0.25 * 100) / 100);
    expect(items[0].actual).toBe(11_250);

    // payroll: 45000 * 0.35 = 15750
    expect(items[1].actual).toBe(Math.round(outflows * 0.35 * 100) / 100);
    expect(items[1].actual).toBe(15_750);

    // marketing: 45000 * 0.15 = 6750
    expect(items[2].actual).toBe(Math.round(outflows * 0.15 * 100) / 100);
    expect(items[2].actual).toBe(6_750);

    // infrastructure: 45000 * 0.10 = 4500
    expect(items[3].actual).toBe(Math.round(outflows * 0.10 * 100) / 100);
    expect(items[3].actual).toBe(4_500);

    // ops: 45000 * 0.15 = 6750
    expect(items[4].actual).toBe(Math.round(outflows * 0.15 * 100) / 100);
    expect(items[4].actual).toBe(6_750);
  });

  it("without explicit budgets, budgets are derived as actual * 1.1", () => {
    const items = computeBudgetActuals(makeMercury());

    for (const item of items) {
      const expectedBudget = Math.round(item.actual * 1.1 * 100) / 100;
      expect(item.budgeted).toBe(expectedBudget);
    }

    // Spot check: cogs actual = 11250, budget = 11250 * 1.1 = 12375
    expect(items[0].budgeted).toBe(12_375);
  });

  it("with explicit budgets, those values are used", () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 10_000,
      "Payroll & Benefits": 14_000,
      "Sales & Marketing": 7_000,
      "Infrastructure & Hosting": 5_000,
      "General & Administrative": 8_000,
    };

    const items = computeBudgetActuals(makeMercury(), budgets);

    expect(items[0].budgeted).toBe(10_000);
    expect(items[1].budgeted).toBe(14_000);
    expect(items[2].budgeted).toBe(7_000);
    expect(items[3].budgeted).toBe(5_000);
    expect(items[4].budgeted).toBe(8_000);
  });

  it("partial explicit budgets fall back to derived for missing keys", () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 10_000,
    };

    const items = computeBudgetActuals(makeMercury(), budgets);

    // COGS uses explicit budget
    expect(items[0].budgeted).toBe(10_000);

    // Payroll falls back to derived (15750 * 1.1 = 17325)
    expect(items[1].budgeted).toBe(Math.round(15_750 * 1.1 * 100) / 100);
  });

  it("variance = actual - budgeted", () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 10_000,
      "Payroll & Benefits": 14_000,
      "Sales & Marketing": 7_000,
      "Infrastructure & Hosting": 5_000,
      "General & Administrative": 8_000,
    };

    const items = computeBudgetActuals(makeMercury(), budgets);

    for (const item of items) {
      const expectedVariance = Math.round((item.actual - item.budgeted) * 100) / 100;
      expect(item.variance).toBe(expectedVariance);
    }

    // COGS: 11250 - 10000 = 1250 (over budget)
    expect(items[0].variance).toBe(1_250);

    // Payroll: 15750 - 14000 = 1750 (over budget)
    expect(items[1].variance).toBe(1_750);
  });

  it("variancePct = (actual - budget) / budget * 100", () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 10_000,
      "Payroll & Benefits": 20_000,
      "Sales & Marketing": 6_000,
      "Infrastructure & Hosting": 4_000,
      "General & Administrative": 6_000,
    };

    const items = computeBudgetActuals(makeMercury(), budgets);

    // COGS: (11250 - 10000) / 10000 * 100 = 12.5%
    expect(items[0].variancePct).toBe(12.5);

    // Payroll: (15750 - 20000) / 20000 * 100 = -21.25%
    expect(items[1].variancePct).toBe(-21.25);
  });

  it("variancePct handles zero budget with nonzero actual as 100", () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 0,
    };

    const items = computeBudgetActuals(makeMercury(), budgets);

    // Zero budget with actual = 11250 should produce 100%
    expect(items[0].variancePct).toBe(100);
  });

  it('status is "over" when variancePct > 10', () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 10_000, // actual 11250: (11250-10000)/10000*100 = 12.5% > 10
    };

    const items = computeBudgetActuals(makeMercury(), budgets);
    expect(items[0].variancePct).toBeGreaterThan(10);
    expect(items[0].status).toBe("over");
  });

  it('status is "under" when variancePct < -10', () => {
    const budgets: Record<string, number> = {
      "Payroll & Benefits": 20_000, // actual 15750: (15750-20000)/20000*100 = -21.25% < -10
    };

    const items = computeBudgetActuals(makeMercury(), budgets);
    expect(items[1].variancePct).toBeLessThan(-10);
    expect(items[1].status).toBe("under");
  });

  it('status is "on-track" when variancePct is between -10 and 10', () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 11_000, // actual 11250: (11250-11000)/11000*100 = 2.27%
    };

    const items = computeBudgetActuals(makeMercury(), budgets);
    expect(items[0].variancePct).toBeGreaterThanOrEqual(-10);
    expect(items[0].variancePct).toBeLessThanOrEqual(10);
    expect(items[0].status).toBe("on-track");
  });

  it("without explicit budgets, derived budgets always produce on-track status", () => {
    // Derived budget = actual * 1.1, so variancePct = (actual - actual*1.1) / (actual*1.1) * 100
    // = -0.1/1.1 * 100 = -9.09%, which is between -10 and 10 → on-track
    const items = computeBudgetActuals(makeMercury());

    for (const item of items) {
      expect(item.status).toBe("on-track");
    }
  });

  it("handles null mercury (all zeros)", () => {
    const items = computeBudgetActuals(null);

    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.actual).toBe(0);
      expect(item.budgeted).toBe(0);
      expect(item.variance).toBe(0);
      expect(item.variancePct).toBe(0);
      expect(item.status).toBe("on-track");
    }
  });

  it("handles zero outflows", () => {
    const mercury = makeMercury({
      cashFlow: {
        totalBalance: 500_000,
        inflows30d: 12_000,
        outflows30d: 0,
        netCashFlow: 12_000,
        runway: 999,
        burnRate: 0,
      },
    });

    const items = computeBudgetActuals(mercury);

    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.actual).toBe(0);
      expect(item.budgeted).toBe(0);
      expect(item.variance).toBe(0);
      expect(item.variancePct).toBe(0);
      expect(item.status).toBe("on-track");
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   2. computeBudgetSummary
   ═══════════════════════════════════════════════════════════ */

describe("computeBudgetSummary", () => {
  it("totals are sum of individual items", () => {
    const items = computeBudgetActuals(makeMercury());
    const summary = computeBudgetSummary(items);

    const expectedBudget = items.reduce((sum, i) => sum + i.budgeted, 0);
    const expectedActual = items.reduce((sum, i) => sum + i.actual, 0);

    expect(summary.totalBudget).toBeCloseTo(expectedBudget, 2);
    expect(summary.totalActual).toBeCloseTo(expectedActual, 2);
  });

  it("totalVariance = totalActual - totalBudget", () => {
    const items = computeBudgetActuals(makeMercury());
    const summary = computeBudgetSummary(items);

    const expectedVariance = Math.round((summary.totalActual - summary.totalBudget) * 100) / 100;
    expect(summary.totalVariance).toBe(expectedVariance);
  });

  it("totalVariancePct is computed correctly", () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 10_000,
      "Payroll & Benefits": 14_000,
      "Sales & Marketing": 7_000,
      "Infrastructure & Hosting": 5_000,
      "General & Administrative": 8_000,
    };
    const items = computeBudgetActuals(makeMercury(), budgets);
    const summary = computeBudgetSummary(items);

    const expectedPct =
      Math.round(((summary.totalActual - summary.totalBudget) / summary.totalBudget) * 10000) / 100;
    expect(summary.totalVariancePct).toBe(expectedPct);
  });

  it("overspendCategories lists items with over status", () => {
    const budgets: Record<string, number> = {
      "Cost of Goods Sold": 10_000, // over (12.5%)
      "Payroll & Benefits": 14_000, // over (12.5%)
      "Sales & Marketing": 7_000, // on-track (-3.57%)
      "Infrastructure & Hosting": 5_000, // on-track (-10%)
      "General & Administrative": 8_000, // under (-15.63%)
    };

    const items = computeBudgetActuals(makeMercury(), budgets);
    const summary = computeBudgetSummary(items);

    expect(summary.overspendCategories).toContain("Cost of Goods Sold");
    expect(summary.overspendCategories).toContain("Payroll & Benefits");
    expect(summary.overspendCategories).not.toContain("Sales & Marketing");
    expect(summary.overspendCategories).not.toContain("General & Administrative");
  });

  it("items are included in the summary", () => {
    const items = computeBudgetActuals(makeMercury());
    const summary = computeBudgetSummary(items);

    expect(summary.items).toBe(items);
    expect(summary.items).toHaveLength(5);
  });

  it("empty items array returns zeros", () => {
    const summary = computeBudgetSummary([]);

    expect(summary.totalBudget).toBe(0);
    expect(summary.totalActual).toBe(0);
    expect(summary.totalVariance).toBe(0);
    expect(summary.totalVariancePct).toBe(0);
    expect(summary.items).toHaveLength(0);
    expect(summary.overspendCategories).toHaveLength(0);
  });

  it("totalVariancePct is 0 when totalBudget is 0", () => {
    const items = computeBudgetActuals(null); // all zeros
    const summary = computeBudgetSummary(items);

    expect(summary.totalBudget).toBe(0);
    expect(summary.totalVariancePct).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════
   3. identifyOverspendCategories
   ═══════════════════════════════════════════════════════════ */

describe("identifyOverspendCategories", () => {
  it('returns categories with "over" status', () => {
    const items: BudgetActualItem[] = [
      makeItem({ category: "Cost of Goods Sold", status: "over" }),
      makeItem({ category: "Payroll & Benefits", status: "on-track" }),
      makeItem({ category: "Sales & Marketing", status: "over" }),
      makeItem({ category: "Infrastructure & Hosting", status: "under" }),
      makeItem({ category: "General & Administrative", status: "on-track" }),
    ];

    const result = identifyOverspendCategories(items);
    expect(result).toEqual(["Cost of Goods Sold", "Sales & Marketing"]);
  });

  it("returns empty array when no items are over budget", () => {
    const items: BudgetActualItem[] = [
      makeItem({ category: "Cost of Goods Sold", status: "on-track" }),
      makeItem({ category: "Payroll & Benefits", status: "under" }),
      makeItem({ category: "Sales & Marketing", status: "on-track" }),
    ];

    const result = identifyOverspendCategories(items);
    expect(result).toEqual([]);
  });

  it("returns all categories when all are over budget", () => {
    const items: BudgetActualItem[] = [
      makeItem({ category: "Cost of Goods Sold", status: "over" }),
      makeItem({ category: "Payroll & Benefits", status: "over" }),
      makeItem({ category: "Sales & Marketing", status: "over" }),
      makeItem({ category: "Infrastructure & Hosting", status: "over" }),
      makeItem({ category: "General & Administrative", status: "over" }),
    ];

    const result = identifyOverspendCategories(items);
    expect(result).toEqual(EXPECTED_LABELS);
  });

  it("returns empty array for empty items array", () => {
    expect(identifyOverspendCategories([])).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════
   4. CATEGORY_RATIOS
   ═══════════════════════════════════════════════════════════ */

describe("CATEGORY_RATIOS", () => {
  it("equals DEFAULT_EXPENSE_RATIOS", () => {
    expect(CATEGORY_RATIOS).toBe(DEFAULT_EXPENSE_RATIOS);
    expect(CATEGORY_RATIOS).toEqual({
      cogs: 0.25,
      payroll: 0.35,
      marketing: 0.15,
      infrastructure: 0.10,
      ops: 0.15,
    });
  });

  it("values sum to 1.0", () => {
    const sum = Object.values(CATEGORY_RATIOS).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

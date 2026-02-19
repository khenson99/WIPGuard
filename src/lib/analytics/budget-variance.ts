// ─── Budget Variance Analysis ────────────────────────────
// Computes budget-vs-actual variance for expense categories.
// Mercury only provides aggregate inflows/outflows — no
// transaction-level detail — so actual category amounts are
// estimated using SaaS-standard ratios. Budget baselines
// can be supplied explicitly or derived automatically.

import type { AnalyticsDashboardData } from "./types";
import { DEFAULT_EXPENSE_RATIOS } from "./finance-utils";

// Re-export for convenience so consumers don't need two imports
export const CATEGORY_RATIOS = DEFAULT_EXPENSE_RATIOS;

// ── Exported interfaces ──────────────────────────────────

export interface BudgetActualItem {
  category: string;
  budgeted: number;
  actual: number;
  /** actual - budget (positive = over budget) */
  variance: number;
  /** (actual - budget) / budget * 100 */
  variancePct: number;
  /** "over" if variancePct > 10, "under" if < -10, else "on-track" */
  status: "under" | "on-track" | "over";
}

export interface BudgetSummaryData {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePct: number;
  items: BudgetActualItem[];
  overspendCategories: string[];
}

// ── Helpers ──────────────────────────────────────────────

/** Human-readable labels for each ratio key. */
const CATEGORY_LABELS: Record<keyof typeof DEFAULT_EXPENSE_RATIOS, string> = {
  cogs: "Cost of Goods Sold",
  payroll: "Payroll & Benefits",
  marketing: "Sales & Marketing",
  infrastructure: "Infrastructure & Hosting",
  ops: "General & Administrative",
};

/** Determine variance status from percentage. */
function varianceStatus(pct: number): "under" | "on-track" | "over" {
  if (pct > 10) return "over";
  if (pct < -10) return "under";
  return "on-track";
}

// ── Core computation ─────────────────────────────────────

/**
 * Compute budget-vs-actual items for each expense category.
 *
 * Actuals are estimated from Mercury outflows * category ratio.
 * If `budgetAmounts` is not provided, budgets are derived as
 * actuals * 1.1 (10% headroom above current spend).
 *
 * @param mercury  - Mercury provider data (nullable)
 * @param budgetAmounts - Optional explicit budgets keyed by category label
 */
export function computeBudgetActuals(
  mercury: AnalyticsDashboardData["mercury"],
  budgetAmounts?: Record<string, number>,
): BudgetActualItem[] {
  const totalOutflows = mercury?.cashFlow.outflows30d ?? 0;
  const items: BudgetActualItem[] = [];

  const ratioKeys = Object.keys(DEFAULT_EXPENSE_RATIOS) as Array<
    keyof typeof DEFAULT_EXPENSE_RATIOS
  >;

  for (const key of ratioKeys) {
    const label = CATEGORY_LABELS[key];
    const ratio = DEFAULT_EXPENSE_RATIOS[key];
    const actual = Math.round(totalOutflows * ratio * 100) / 100;

    // Use explicit budget if provided, otherwise derive with 10% headroom
    const budgeted =
      budgetAmounts && budgetAmounts[label] !== undefined
        ? budgetAmounts[label]
        : Math.round(actual * 1.1 * 100) / 100;

    const variance = Math.round((actual - budgeted) * 100) / 100;
    const variancePct =
      budgeted > 0
        ? Math.round(((actual - budgeted) / budgeted) * 10000) / 100
        : actual === 0
          ? 0
          : 100;

    items.push({
      category: label,
      budgeted,
      actual,
      variance,
      variancePct,
      status: varianceStatus(variancePct),
    });
  }

  return items;
}

/**
 * Build a full budget summary from individual line items.
 */
export function computeBudgetSummary(
  items: BudgetActualItem[],
): BudgetSummaryData {
  const totalBudget = items.reduce((sum, i) => sum + i.budgeted, 0);
  const totalActual = items.reduce((sum, i) => sum + i.actual, 0);
  const totalVariance = Math.round((totalActual - totalBudget) * 100) / 100;
  const totalVariancePct =
    totalBudget > 0
      ? Math.round(((totalActual - totalBudget) / totalBudget) * 10000) / 100
      : 0;

  return {
    totalBudget: Math.round(totalBudget * 100) / 100,
    totalActual: Math.round(totalActual * 100) / 100,
    totalVariance,
    totalVariancePct,
    items,
    overspendCategories: identifyOverspendCategories(items),
  };
}

/**
 * Return category names that are over budget (variancePct > 10).
 */
export function identifyOverspendCategories(
  items: BudgetActualItem[],
): string[] {
  return items
    .filter((item) => item.status === "over")
    .map((item) => item.category);
}

// Budget-vs-actual variance analysis — computes estimated actuals per budget
// line item using Mercury aggregate outflow data.
//
// Mercury data only provides aggregate inflows/outflows totals (no transaction-
// level detail such as merchant names, categories, or descriptions). Therefore,
// actual expenses per category are **estimated** using the same SaaS-standard
// ratios defined in pnl-builder.ts. The "other" category absorbs any remainder
// not covered by the known ratios.
//
// This module is pure computation — no database calls, no side effects.

import type {
  BudgetData,
  BudgetLineItemData,
  ExpenseCategory,
  MercuryData,
} from "@/lib/analytics/types";
import { computeVariance } from "@/lib/analytics/finance-utils";

// ---------------------------------------------------------------------------
// Default expense category splits (fraction of total outflows)
// Must stay in sync with DEFAULT_RATIOS in pnl-builder.ts.
// ---------------------------------------------------------------------------

const CATEGORY_RATIOS: Record<ExpenseCategory, number> = {
  cogs: 0.25,
  payroll: 0.35,
  marketing: 0.15,
  infrastructure: 0.10,
  ops: 0.15,
  other: 0, // "other" is a catch-all not covered by standard ratios
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round a number to two decimal places (monetary precision). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Scale 30-day outflows to match the budget date range. */
function estimateOutflowMultiplier(budget: BudgetData): number {
  const start = new Date(budget.startDate);
  const end = new Date(budget.endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 1;
  }
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 1;
  const days = ms / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.max(days / 30, 0);
}

// ---------------------------------------------------------------------------
// computeBudgetActuals
// ---------------------------------------------------------------------------

/**
 * Estimate actual amounts for each budget line item using Mercury's total
 * outflows and the SaaS-standard category ratios.
 *
 * For every line item, `actualAmount` is derived from:
 *   `mercury.cashFlow.outflows30d * outflowMultiplier * CATEGORY_RATIOS[category]`
 *
 * The "other" category receives whatever is left after all known-ratio
 * categories have been allocated.
 *
 * When `mercury` is null (disconnected / unavailable), all actuals fields
 * are returned as null.
 */
function computeBudgetActualsCore(
  budget: BudgetData,
  mercury: MercuryData | null,
): BudgetLineItemData[] {
  if (!mercury) {
    return budget.lineItems.map((item) => ({
      ...item,
      actualAmount: null,
      variance: null,
      variancePct: null,
    }));
  }

  const totalOutflows =
    mercury.cashFlow.outflows30d * estimateOutflowMultiplier(budget);

  // First pass: compute actuals for all known-ratio categories and track the
  // sum so we can derive the "other" remainder.
  let knownCategoryActualsSum = 0;

  const withActuals: BudgetLineItemData[] = budget.lineItems.map((item) => {
    if (item.category !== "other") {
      const actualAmount = round2(totalOutflows * CATEGORY_RATIOS[item.category]);
      knownCategoryActualsSum += actualAmount;
      const { variance, variancePct } = computeVariance(item.plannedAmount, actualAmount);
      return {
        ...item,
        actualAmount,
        variance: variance != null ? round2(variance) : null,
        variancePct: variancePct != null ? round2(variancePct) : null,
      };
    }
    // Placeholder for "other" — filled in the second pass below.
    return { ...item };
  });

  // Second pass: assign "other" category the remainder.
  for (let i = 0; i < withActuals.length; i++) {
    if (withActuals[i].category === "other") {
      const actualAmount = round2(totalOutflows - knownCategoryActualsSum);
      const { variance, variancePct } = computeVariance(withActuals[i].plannedAmount, actualAmount);
      withActuals[i] = {
        ...withActuals[i],
        actualAmount,
        variance: variance != null ? round2(variance) : null,
        variancePct: variancePct != null ? round2(variancePct) : null,
      };
    }
  }

  return withActuals;
}

// ---------------------------------------------------------------------------
// computeBudgetSummary
// ---------------------------------------------------------------------------

/**
 * Aggregate budget line items into totals.
 *
 * - `totalPlanned` — sum of all `plannedAmount` values.
 * - `totalActual`  — sum of all `actualAmount` values, or null if any are null.
 * - `totalVariance` — `totalActual - totalPlanned`, or null when totalActual
 *    is null.
 */
function computeBudgetSummaryCore(
  lineItems: BudgetLineItemData[],
): { totalPlanned: number; totalActual: number | null; totalVariance: number | null } {
  const totalPlanned = round2(
    lineItems.reduce((sum, item) => sum + item.plannedAmount, 0),
  );

  const hasNullActual = lineItems.some((item) => item.actualAmount == null);

  if (hasNullActual) {
    return { totalPlanned, totalActual: null, totalVariance: null };
  }

  const totalActual = round2(
    lineItems.reduce((sum, item) => sum + (item.actualAmount as number), 0),
  );
  const totalVariance = round2(totalActual - totalPlanned);

  return { totalPlanned, totalActual, totalVariance };
}

// ---------------------------------------------------------------------------
// identifyOverspendCategories
// ---------------------------------------------------------------------------

/**
 * Return line items where spending exceeds the planned amount by more than
 * `threshold` percent. Results are sorted by `variancePct` descending so the
 * worst overspend appears first.
 *
 * Used by the insight engine to surface budget alerts.
 */
/** Return categories over budget from BudgetActualItem rows. */
export function identifyOverspendCategories(
  items: BudgetActualItem[],
): string[];
/** Return line items over budget from BudgetLineItemData rows. */
export function identifyOverspendCategories(
  lineItems: BudgetLineItemData[],
  threshold?: number,
): BudgetLineItemData[];
export function identifyOverspendCategories(
  items: BudgetActualItem[] | BudgetLineItemData[],
  threshold: number = 15,
): string[] | BudgetLineItemData[] {
  if (items.length === 0) return [];
  // Discriminate: BudgetActualItem has `budgeted`.
  if ("budgeted" in items[0]) {
    return (items as BudgetActualItem[])
      .filter((i) => i.status === "over")
      .map((i) => i.category);
  }
  return (items as BudgetLineItemData[])
    .filter((item) => item.variancePct != null && item.variancePct > threshold)
    .sort((a, b) => (b.variancePct ?? 0) - (a.variancePct ?? 0));
}

// ---------------------------------------------------------------------------
// BudgetActualItem — flat row type used by finance-planning-tab
// ---------------------------------------------------------------------------

export interface BudgetActualItem {
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number;
  status: "under" | "on_track" | "over";
}

/**
 * Label-keyed expense ratios used by the simplified BudgetActualItem API.
 * Keys match the CATEGORY_CONFIG labels in finance-planning-tab.
 */
export const EXPENSE_LABEL_RATIOS: Record<string, number> = {
  "Cost of Goods Sold": 0.25,
  "Payroll & Benefits": 0.35,
  "Sales & Marketing": 0.15,
  "Infrastructure & Hosting": 0.10,
  "General & Administrative": 0.15,
};

const DEFAULT_LABELS = Object.keys(EXPENSE_LABEL_RATIOS);

/** Determine status from variancePct using a 10% threshold. */
function statusFromPct(pct: number): BudgetActualItem["status"] {
  if (pct > 10) return "over";
  if (pct < -10) return "under";
  return "on_track";
}

/** Map a label->planned-amount record into BudgetActualItem rows. */
function toBudgetActualItems(
  mercury: MercuryData | null,
  budgetAmounts?: Record<string, number>,
): BudgetActualItem[] {
  const totalOutflows = mercury?.cashFlow.outflows30d ?? 0;

  // When explicit budgets are provided, treat them as overrides. We still emit
  // the default label set so partially-specified budgets fall back to derived
  // values for missing categories.
  const labels = budgetAmounts
    ? [
        ...DEFAULT_LABELS,
        ...Object.keys(budgetAmounts).filter((label) => !DEFAULT_LABELS.includes(label)),
      ]
    : DEFAULT_LABELS;

  const items: BudgetActualItem[] = labels.map((label) => {
    const ratio = EXPENSE_LABEL_RATIOS[label] ?? 0;
    const actual = round2(totalOutflows * ratio);
    const planned = budgetAmounts?.[label] ?? round2(actual * 1.1);
    const variance = round2(actual - planned);
    const variancePct = planned === 0 ? (actual === 0 ? 0 : 100) : round2((variance / planned) * 100);
    return {
      category: label,
      budgeted: planned,
      actual,
      variance,
      variancePct,
      status: statusFromPct(variancePct),
    };
  });

  return items;
}

// ---------------------------------------------------------------------------
// BudgetSummary — summary type used by finance-planning-tab
// ---------------------------------------------------------------------------

export interface BudgetSummary {
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePct: number;
  overspendCategories: string[];
  items: BudgetActualItem[];
}

function toBudgetSummary(items: BudgetActualItem[]): BudgetSummary {
  const totalBudget = round2(items.reduce((s, i) => s + i.budgeted, 0));
  const totalActual = round2(items.reduce((s, i) => s + i.actual, 0));
  const totalVariance = round2(totalActual - totalBudget);
  const totalVariancePct = totalBudget === 0
    ? (totalActual === 0 ? 0 : 100)
    : round2((totalVariance / totalBudget) * 100);
  const overspendCategories = items
    .filter((i) => i.status === "over")
    .map((i) => i.category);
  return { totalBudget, totalActual, totalVariance, totalVariancePct, overspendCategories, items };
}

// Re-export overloads so finance-planning-tab can call with the simpler
// (mercury, budgetAmounts?) signature while the original BudgetData-based
// signature continues to work.

/** Compute budget-vs-actual items from Mercury data only (derives default budgets). */
export function computeBudgetActuals(
  mercury: MercuryData | null,
): BudgetActualItem[];
/** Compute budget-vs-actual items from Mercury data and a label->amount map. */
export function computeBudgetActuals(
  mercury: MercuryData | null,
  budgetAmounts: Record<string, number> | undefined,
): BudgetActualItem[];
/** Compute budget-vs-actual items from a full BudgetData record. */
export function computeBudgetActuals(
  budget: BudgetData,
  mercury: MercuryData | null,
): BudgetLineItemData[];
export function computeBudgetActuals(
  first: MercuryData | null | BudgetData,
  second?: MercuryData | null | Record<string, number>,
): BudgetActualItem[] | BudgetLineItemData[] {
  // Discriminate by checking for `lineItems` (BudgetData has it).
  if (first != null && typeof first === "object" && "lineItems" in first) {
    return computeBudgetActualsCore(first as BudgetData, second as MercuryData | null);
  }
  return toBudgetActualItems(
    first as MercuryData | null,
    second as Record<string, number> | undefined,
  );
}

/** Compute budget summary from BudgetActualItem rows. */
export function computeBudgetSummary(items: BudgetActualItem[]): BudgetSummary;
/** Compute budget summary from BudgetLineItemData rows. */
export function computeBudgetSummary(
  items: BudgetLineItemData[],
): { totalPlanned: number; totalActual: number | null; totalVariance: number | null };
export function computeBudgetSummary(
  items: BudgetActualItem[] | BudgetLineItemData[],
): BudgetSummary | { totalPlanned: number; totalActual: number | null; totalVariance: number | null } {
  if (items.length === 0) {
    // Return BudgetSummary-shaped zero result by default.
    return { totalBudget: 0, totalActual: 0, totalVariance: 0, totalVariancePct: 0, overspendCategories: [], items: [] };
  }
  // Discriminate: BudgetActualItem has `budgeted`, BudgetLineItemData has `plannedAmount`.
  if ("budgeted" in items[0]) {
    return toBudgetSummary(items as BudgetActualItem[]);
  }
  return computeBudgetSummaryCore(items as BudgetLineItemData[]);
}

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
export function computeBudgetActuals(
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
export function computeBudgetSummary(
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
export function identifyOverspendCategories(
  lineItems: BudgetLineItemData[],
  threshold: number = 15,
): BudgetLineItemData[] {
  return lineItems
    .filter((item) => item.variancePct != null && item.variancePct > threshold)
    .sort((a, b) => (b.variancePct ?? 0) - (a.variancePct ?? 0));
}

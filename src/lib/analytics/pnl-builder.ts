// ─── Profit & Loss Builder ───────────────────────────────
// Constructs a P&L statement from Stripe revenue and Mercury
// cash-flow data. Expense categories are estimated using
// SaaS-standard ratios because Mercury only provides aggregate
// inflows/outflows — no transaction-level detail.

import type { AnalyticsDashboardData } from "./types";
import { DEFAULT_EXPENSE_RATIOS } from "./finance-utils";

// ── Exported interfaces ──────────────────────────────────

export interface PnlLineItem {
  label: string;
  current: number;
  previous: number;
  category: "revenue" | "expense" | "subtotal" | "total";
}

export interface ProfitAndLossData {
  period: string;
  previousPeriod: string;
  items: PnlLineItem[];
  netIncome: number;
  previousNetIncome: number;
  grossMargin: number;
  operatingMargin: number;
}

// ── Helpers ──────────────────────────────────────────────

/** Map ratio keys to human-readable expense labels. */
const EXPENSE_LABELS: Record<keyof typeof DEFAULT_EXPENSE_RATIOS, string> = {
  cogs: "Cost of Goods Sold",
  payroll: "Payroll & Benefits",
  marketing: "Sales & Marketing",
  infrastructure: "Infrastructure & Hosting",
  ops: "General & Administrative",
};

/** Build period label like "Last 30 days". */
function periodLabel(offset: 0 | 1): string {
  return offset === 0 ? "Last 30 days" : "Prior 30 days";
}

// ── Core builder ─────────────────────────────────────────

/**
 * Build a complete P&L from Stripe + Mercury data.
 *
 * Revenue comes from Stripe (totalRevenue30d / totalRevenuePrev30d).
 * Expenses are derived from Mercury outflows multiplied by the
 * category ratios (configurable via `opts.ratios`).
 */
export function buildProfitAndLoss(
  stripe: AnalyticsDashboardData["stripe"],
  mercury: AnalyticsDashboardData["mercury"],
  opts?: { ratios?: typeof DEFAULT_EXPENSE_RATIOS },
): ProfitAndLossData {
  const ratios = opts?.ratios ?? DEFAULT_EXPENSE_RATIOS;

  // Revenue figures from Stripe
  const currentRevenue = stripe?.revenue.totalRevenue30d ?? 0;
  const previousRevenue = stripe?.revenue.totalRevenuePrev30d ?? 0;

  // Total outflows from Mercury (used to estimate expenses)
  const currentOutflows = mercury?.cashFlow.outflows30d ?? 0;
  // Estimate previous outflows from current (no historical data available)
  const previousOutflows = currentOutflows;

  const items: PnlLineItem[] = [];

  // ── Revenue section ──
  items.push({
    label: "Subscription Revenue",
    current: currentRevenue,
    previous: previousRevenue,
    category: "revenue",
  });

  items.push({
    label: "Total Revenue",
    current: currentRevenue,
    previous: previousRevenue,
    category: "subtotal",
  });

  // ── Expense section ──
  let totalCurrentExpenses = 0;
  let totalPreviousExpenses = 0;
  let currentCogs = 0;
  let previousCogs = 0;

  const ratioKeys = Object.keys(ratios) as Array<keyof typeof ratios>;

  for (const key of ratioKeys) {
    const ratio = ratios[key];
    const current = Math.round(currentOutflows * ratio * 100) / 100;
    const previous = Math.round(previousOutflows * ratio * 100) / 100;

    if (key === "cogs") {
      currentCogs = current;
      previousCogs = previous;
    }

    items.push({
      label: EXPENSE_LABELS[key],
      current,
      previous,
      category: "expense",
    });

    totalCurrentExpenses += current;
    totalPreviousExpenses += previous;
  }

  items.push({
    label: "Total Expenses",
    current: Math.round(totalCurrentExpenses * 100) / 100,
    previous: Math.round(totalPreviousExpenses * 100) / 100,
    category: "subtotal",
  });

  // ── Net income ──
  const netIncome = currentRevenue - totalCurrentExpenses;
  const previousNetIncome = previousRevenue - totalPreviousExpenses;

  items.push({
    label: "Net Income",
    current: Math.round(netIncome * 100) / 100,
    previous: Math.round(previousNetIncome * 100) / 100,
    category: "total",
  });

  // ── Margin calculations ──
  const grossMargin =
    currentRevenue > 0
      ? Math.round(((currentRevenue - currentCogs) / currentRevenue) * 10000) /
        100
      : 0;

  const operatingMargin =
    currentRevenue > 0
      ? Math.round((netIncome / currentRevenue) * 10000) / 100
      : 0;

  return {
    period: periodLabel(0),
    previousPeriod: periodLabel(1),
    items,
    netIncome: Math.round(netIncome * 100) / 100,
    previousNetIncome: Math.round(previousNetIncome * 100) / 100,
    grossMargin,
    operatingMargin,
  };
}

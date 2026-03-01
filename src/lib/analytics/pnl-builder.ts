// P&L builder — derives a Profit & Loss statement from Stripe + Mercury data.
//
// Mercury data only provides aggregate inflows/outflows (no transaction-level
// detail), so expense categorisation uses configurable SaaS-standard ratios
// applied to total outflows rather than merchant-based classification.

import type {
  PnLRow,
  ProfitAndLoss,
  StripeData,
  MercuryData,
} from "@/lib/analytics/types";

// ---------------------------------------------------------------------------
// Default expense category splits (fraction of total outflows)
// ---------------------------------------------------------------------------

export interface ExpenseRatios {
  cogs: number;           // cost of goods sold (hosting, infrastructure, etc.)
  payroll: number;
  marketing: number;
  infrastructure: number; // non-COGS infra (office, tools, SaaS)
  ops: number;            // general & administrative
}

const DEFAULT_RATIOS: ExpenseRatios = {
  cogs: 0.25,
  payroll: 0.35,
  marketing: 0.15,
  infrastructure: 0.10,
  ops: 0.15,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePnLRow(
  label: string,
  current: number,
  previous: number,
): PnLRow {
  const change = current - previous;
  const changePct = previous === 0 ? (current === 0 ? 0 : 100) : (change / Math.abs(previous)) * 100;
  return {
    label,
    currentPeriod: Math.round(current * 100) / 100,
    previousPeriod: Math.round(previous * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePct: Math.round(changePct * 10) / 10,
  };
}

function estimatePreviousOutflows(mercury: MercuryData | null): number {
  // Mercury gives us 30-day outflows. We approximate the previous period
  // by using burn rate (which is effectively 30-day outflows) as the baseline.
  // Without historical snapshots, current and previous are treated as equal.
  return mercury?.cashFlow.outflows30d ?? 0;
}

function previousPeriodLabel(periodLabel: string): string {
  const normalized = periodLabel.trim();

  const daysMatch = normalized.match(/^Last\s+(\d+)\s+days$/i);
  if (daysMatch) return `Prior ${daysMatch[1]} days`;

  const monthsMatch = normalized.match(/^Last\s+(\d+)\s+months$/i);
  if (monthsMatch) return `Prior ${monthsMatch[1]} months`;

  return "Previous period";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a Profit & Loss statement from Stripe revenue and Mercury expenses.
 *
 * `timeRange` controls the period label; the underlying data always reflects
 * the most recent 30-day window from Stripe charges and Mercury transactions.
 *
 * Because Mercury data lacks transaction-level detail, expense categories are
 * estimated using `ratios` (defaults to SaaS-standard splits). Override these
 * when actual breakdowns are known (e.g., from budget data).
 */
export function buildProfitAndLossCore(
  stripe: StripeData | null,
  mercury: MercuryData | null,
  opts: {
    timeRange?: string;
    ratios?: Partial<ExpenseRatios>;
  } = {},
): ProfitAndLoss {
  const ratios: ExpenseRatios = { ...DEFAULT_RATIOS, ...opts.ratios };
  const periodLabel = opts.timeRange ?? "Last 30 days";

  // --- Revenue ---
  const currentRevenue = stripe?.revenue.totalRevenue30d ?? 0;
  const previousRevenue = stripe?.revenue.totalRevenuePrev30d ?? 0;

  // --- Total expenses ---
  const currentExpenses = mercury?.cashFlow.outflows30d ?? 0;
  const previousExpenses = estimatePreviousOutflows(mercury);

  // --- COGS ---
  const currentCogs = currentExpenses * ratios.cogs;
  const previousCogs = previousExpenses * ratios.cogs;

  // --- Gross profit ---
  const currentGross = currentRevenue - currentCogs;
  const previousGross = previousRevenue - previousCogs;

  // --- Operating expenses by category (non-COGS portion) ---
  const nonCogsRatio = 1 - ratios.cogs;
  const opexCategories: { key: keyof Omit<ExpenseRatios, "cogs">; label: string }[] = [
    { key: "payroll", label: "Payroll & Compensation" },
    { key: "marketing", label: "Marketing & Sales" },
    { key: "infrastructure", label: "Infrastructure & Tools" },
    { key: "ops", label: "General & Administrative" },
  ];

  const operatingExpenses: PnLRow[] = opexCategories.map(({ key, label }) => {
    // Scale ratio relative to non-COGS total so categories sum to total opex
    const fraction = nonCogsRatio === 0 ? 0 : ratios[key] / nonCogsRatio;
    const nonCogsCurrentExpenses = currentExpenses * (1 - ratios.cogs);
    const nonCogsPreviousExpenses = previousExpenses * (1 - ratios.cogs);
    return makePnLRow(
      label,
      nonCogsCurrentExpenses * fraction,
      nonCogsPreviousExpenses * fraction,
    );
  });

  const currentTotalOpex = currentExpenses - currentCogs;
  const previousTotalOpex = previousExpenses - previousCogs;

  // --- Operating & net income ---
  const currentOperatingIncome = currentGross - currentTotalOpex;
  const previousOperatingIncome = previousGross - previousTotalOpex;

  // Net income = operating income (no tax/interest modeling yet)
  const currentNetIncome = currentOperatingIncome;
  const previousNetIncome = previousOperatingIncome;

  return {
    periodLabel,
    revenue: makePnLRow("Revenue", currentRevenue, previousRevenue),
    cogs: makePnLRow("Cost of Goods Sold", currentCogs, previousCogs),
    grossProfit: makePnLRow("Gross Profit", currentGross, previousGross),
    operatingExpenses,
    totalOpex: makePnLRow("Total Operating Expenses", currentTotalOpex, previousTotalOpex),
    operatingIncome: makePnLRow("Operating Income", currentOperatingIncome, previousOperatingIncome),
    netIncome: makePnLRow("Net Income", currentNetIncome, previousNetIncome),
  };
}

// ---------------------------------------------------------------------------
// Flat P&L types used by finance-pnl-tab
// ---------------------------------------------------------------------------

export interface PnlLineItem {
  label: string;
  category: "revenue" | "expense" | "subtotal" | "total";
  current: number;
  previous: number;
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

/**
 * Transform the structured ProfitAndLoss into the flat ProfitAndLossData
 * representation expected by the P&L tab component.
 *
 * Wraps `buildProfitAndLoss` so the tab can consume a single call.
 */
export function buildProfitAndLoss(
  stripe: StripeData | null,
  mercury: MercuryData | null,
  opts?: {
    timeRange?: string;
    ratios?: Partial<ExpenseRatios>;
  },
): ProfitAndLossData {
  const pnl = buildProfitAndLossCore(stripe, mercury, opts);

  const items: PnlLineItem[] = [];

  // Revenue section
  items.push({ label: "Total Revenue", category: "revenue", current: pnl.revenue.currentPeriod, previous: pnl.revenue.previousPeriod });

  // COGS
  items.push({ label: pnl.cogs.label, category: "expense", current: pnl.cogs.currentPeriod, previous: pnl.cogs.previousPeriod });

  // Gross Profit (subtotal)
  items.push({ label: pnl.grossProfit.label, category: "subtotal", current: pnl.grossProfit.currentPeriod, previous: pnl.grossProfit.previousPeriod });

  // Operating expenses
  for (const row of pnl.operatingExpenses) {
    items.push({ label: row.label, category: "expense", current: row.currentPeriod, previous: row.previousPeriod });
  }

  // Total opex (subtotal)
  items.push({ label: pnl.totalOpex.label, category: "subtotal", current: pnl.totalOpex.currentPeriod, previous: pnl.totalOpex.previousPeriod });

  // Operating income
  items.push({ label: pnl.operatingIncome.label, category: "subtotal", current: pnl.operatingIncome.currentPeriod, previous: pnl.operatingIncome.previousPeriod });

  // Net income (total)
  items.push({ label: pnl.netIncome.label, category: "total", current: pnl.netIncome.currentPeriod, previous: pnl.netIncome.previousPeriod });

  // Derived metrics
  const revenue = pnl.revenue.currentPeriod;
  const grossMargin = revenue === 0 ? 0 : ((pnl.grossProfit.currentPeriod / revenue) * 100);
  const operatingMargin = revenue === 0 ? 0 : ((pnl.operatingIncome.currentPeriod / revenue) * 100);

  return {
    period: pnl.periodLabel,
    previousPeriod: previousPeriodLabel(pnl.periodLabel),
    items,
    netIncome: pnl.netIncome.currentPeriod,
    previousNetIncome: pnl.netIncome.previousPeriod,
    grossMargin: Math.round(grossMargin * 10) / 10,
    operatingMargin: Math.round(operatingMargin * 10) / 10,
  };
}

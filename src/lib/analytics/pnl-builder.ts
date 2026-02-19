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
export function buildProfitAndLoss(
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

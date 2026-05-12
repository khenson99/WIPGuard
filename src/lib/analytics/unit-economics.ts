// Unit-economics engine — pure computation module for SaaS unit economics.
//
// Derives LTV, CAC, LTV:CAC ratio, ARPA, payback period, and gross margin
// from Stripe, Mercury, and HubSpot provider data. When Mercury transaction
// metadata has been classified into category totals, those ratios are used for
// COGS and marketing spend. Otherwise the module falls back to SaaS-standard
// ratios, matching pnl-builder.ts.

import type {
  StripeData,
  MercuryData,
  HubSpotData,
  UnitEconomics,
} from "@/lib/analytics/types";
import { categorizeMercuryTransaction } from "@/lib/analytics/budget-variance";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_EXPENSE_RATIOS: ExpenseRatios = {
  cogs: 0.25,
  payroll: 0.35,
  marketing: 0.15,
  infrastructure: 0.10,
  ops: 0.15,
};

/** When churn is zero we cap LTV at 10 years worth of ARPA. */
const MAX_LTV_MONTHS = 120;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to two decimal places. */
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

function spendFromTransactions(
  mercury: MercuryData | null,
): { cogs: number; marketing: number } | null {
  if (!mercury?.transactions || mercury.transactions.length === 0) {
    return null;
  }

  let cogs = 0;
  let marketing = 0;

  for (const tx of mercury.transactions) {
    if (typeof tx.amount !== "number" || !Number.isFinite(tx.amount) || tx.amount >= 0) {
      continue;
    }

    const category = categorizeMercuryTransaction(tx);
    const amount = Math.abs(tx.amount);
    if (category === "cogs") {
      cogs += amount;
    } else if (category === "marketing") {
      marketing += amount;
    }
  }

  return {
    cogs,
    marketing,
  };
}

// ---------------------------------------------------------------------------
// Extended type used by finance-unit-economics-tab
// ---------------------------------------------------------------------------

export type UnitEconomicsData = UnitEconomics & {
  arpa: number;
  magicNumber: number | null;
};

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Compute SaaS unit economics from provider data.
 *
 * All three providers are optional — missing providers are treated as having
 * zero values.  The function is pure: no database calls, no side effects.
 */
export function computeUnitEconomics(
  stripe: StripeData | null,
  mercury: MercuryData | null,
  hubspot: HubSpotData | null,
  opts: {
    ratios?: Partial<ExpenseRatios>;
    observedPeriodDays?: number;
  } = {},
): UnitEconomicsData {
  const mercuryBreakdown = mercury?.cashFlow.expenseBreakdown30d;
  const mercuryBreakdownTotal = mercuryBreakdown
    ? (mercuryBreakdown.cogs ?? 0) +
      (mercuryBreakdown.payroll ?? 0) +
      (mercuryBreakdown.marketing ?? 0) +
      (mercuryBreakdown.infrastructure ?? 0) +
      (mercuryBreakdown.ops ?? 0) +
      (mercuryBreakdown.other ?? 0)
    : 0;
  const ratios: ExpenseRatios = {
    ...DEFAULT_EXPENSE_RATIOS,
    ...(mercuryBreakdownTotal > 0
      ? {
          cogs: (mercuryBreakdown?.cogs ?? 0) / mercuryBreakdownTotal,
          payroll: (mercuryBreakdown?.payroll ?? 0) / mercuryBreakdownTotal,
          marketing: (mercuryBreakdown?.marketing ?? 0) / mercuryBreakdownTotal,
          infrastructure: (mercuryBreakdown?.infrastructure ?? 0) / mercuryBreakdownTotal,
          ops: ((mercuryBreakdown?.ops ?? 0) + (mercuryBreakdown?.other ?? 0)) / mercuryBreakdownTotal,
        }
      : {}),
    ...opts.ratios,
  };
  const observedPeriodDays =
    opts.observedPeriodDays ??
    mercury?.cashFlow.observedPeriodDays ??
    30;

  // -- Early exit: nothing to compute ---
  if (!stripe && !mercury && !hubspot) {
    return {
      ltv: 0,
      cac: 0,
      ltvCacRatio: 0,
      avgRevenuePerAccount: 0,
      arpa: 0,
      paybackMonths: 0,
      grossMarginPct: 0,
      magicNumber: null,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. ARPA — Average Revenue Per Account
  // ---------------------------------------------------------------------------

  let arpa = 0;
  if (stripe) {
    arpa =
      stripe.revenue.avgRevenuePerCustomer ||
      (stripe.subscriptions.active > 0
        ? stripe.revenue.mrr / stripe.subscriptions.active
        : 0);
  }

  // ---------------------------------------------------------------------------
  // 2. Monthly churn rate (decimal)
  // ---------------------------------------------------------------------------

  const monthlyChurnRate = stripe ? stripe.subscriptions.churnRate / 100 : 0;

  // ---------------------------------------------------------------------------
  // 3. LTV — Lifetime Value
  // ---------------------------------------------------------------------------

  const ltv =
    monthlyChurnRate > 0 ? arpa / monthlyChurnRate : arpa * MAX_LTV_MONTHS;

  // ---------------------------------------------------------------------------
  // 4. Gross margin
  // ---------------------------------------------------------------------------

  const revenue = stripe?.revenue.totalRevenue30d ?? 0;
  const categorizedSpend = spendFromTransactions(mercury);
  const totalOutflows = mercury?.cashFlow.outflows30d ?? 0;
  const cogs = categorizedSpend?.cogs ?? totalOutflows * COGS_RATIO;
  const grossMarginPct =
    revenue === 0 ? 0 : ((revenue - cogs) / revenue) * 100;

  // ---------------------------------------------------------------------------
  // 5. CAC — Customer Acquisition Cost
  // ---------------------------------------------------------------------------

  const marketingSpend =
    categorizedSpend?.marketing ?? totalOutflows * MARKETING_SPEND_RATIO;

  let newCustomers = hubspot?.funnel.closedWon ?? 0;
  if (newCustomers > 0 && Number.isFinite(observedPeriodDays) && observedPeriodDays > 0) {
    newCustomers = newCustomers * (30 / observedPeriodDays);
  }
  if (newCustomers <= 0 && stripe) {
    // Approximate new customers from active-sub base and churn rate (the
    // minimum number of new subs needed just to replace churn).
    newCustomers = Math.max(1, stripe.subscriptions.active * monthlyChurnRate);
  }
  // Guard: treat zero new customers as 1 to avoid division by zero.
  if (newCustomers <= 0) {
    newCustomers = 1;
  }

  const cac = marketingSpend / newCustomers;

  // ---------------------------------------------------------------------------
  // 6. Payback period (months)
  // ---------------------------------------------------------------------------

  const monthlyGrossProfit = arpa * (grossMarginPct / 100);
  const paybackMonths =
    monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : 0;

  // ---------------------------------------------------------------------------
  // 7. LTV:CAC ratio
  // ---------------------------------------------------------------------------

  const ltvCacRatio = cac > 0 ? ltv / cac : ltv;

  // ---------------------------------------------------------------------------
  // Result
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 8. Magic number — growth efficiency metric
  //    (net new ARR in period) / (S&M spend in previous period)
  //    Without historical snapshots we approximate using 30-day figures.
  // ---------------------------------------------------------------------------

  const netNewArr = stripe ? stripe.revenue.mrrChange * 12 : 0;
  const magicNumber: number | null =
    marketingSpend > 0 ? r2(netNewArr / marketingSpend) : null;

  return {
    ltv: r2(ltv),
    cac: r2(cac),
    ltvCacRatio: r2(ltvCacRatio),
    avgRevenuePerAccount: r2(arpa),
    arpa: r2(arpa),
    paybackMonths: r2(paybackMonths),
    grossMarginPct: r2(grossMarginPct),
    magicNumber,
  };
}

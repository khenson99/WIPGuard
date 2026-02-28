// Unit-economics engine — pure computation module for SaaS unit economics.
//
// Derives LTV, CAC, LTV:CAC ratio, ARPA, payback period, and gross margin
// from Stripe, Mercury, and HubSpot provider data.  Mercury only exposes
// aggregate cash-flow figures, so expense-category estimates (COGS, marketing
// spend) use SaaS-standard ratios applied to total outflows — identical to the
// approach used in pnl-builder.ts.

import type {
  StripeData,
  MercuryData,
  HubSpotData,
  UnitEconomics,
} from "@/lib/analytics/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fraction of Mercury outflows attributed to COGS (hosting, infra, etc.) */
const COGS_RATIO = 0.25;

/** Fraction of Mercury outflows attributed to marketing / sales spend. */
const MARKETING_SPEND_RATIO = 0.15;

/** When churn is zero we cap LTV at 10 years worth of ARPA. */
const MAX_LTV_MONTHS = 120;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to two decimal places. */
function r2(x: number): number {
  return Math.round(x * 100) / 100;
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
): UnitEconomicsData {
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
  const cogs = (mercury?.cashFlow.outflows30d ?? 0) * COGS_RATIO;
  const grossMarginPct =
    revenue === 0 ? 0 : ((revenue - cogs) / revenue) * 100;

  // ---------------------------------------------------------------------------
  // 5. CAC — Customer Acquisition Cost
  // ---------------------------------------------------------------------------

  const marketingSpend = (mercury?.cashFlow.outflows30d ?? 0) * MARKETING_SPEND_RATIO;

  let newCustomers = hubspot?.funnel.closedWon ?? 0;
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
    monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : Infinity;

  // ---------------------------------------------------------------------------
  // 7. LTV:CAC ratio
  // ---------------------------------------------------------------------------

  let ltvCacRatio: number;
  if (cac === 0) {
    ltvCacRatio = ltv > 0 ? Infinity : 0;
  } else {
    ltvCacRatio = ltv / cac;
  }

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

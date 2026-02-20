// ─── Unit Economics Engine ───────────────────────────────
// Computes SaaS unit economics (LTV, CAC, LTV:CAC, payback,
// gross margin, ARPA) from Stripe, Mercury, and HubSpot data.
// Mercury only provides aggregate inflows/outflows, so
// marketing spend is estimated via SaaS-standard ratios.

import type { AnalyticsDashboardData } from "./types";
import { DEFAULT_EXPENSE_RATIOS } from "./finance-utils";

// ── Exported interfaces ──────────────────────────────────

export interface UnitEconomicsData {
  /** Customer lifetime value */
  ltv: number;
  /** Customer acquisition cost */
  cac: number;
  /** LTV to CAC ratio */
  ltvCacRatio: number;
  /** Months to recover CAC */
  paybackMonths: number;
  /** Gross margin percentage */
  grossMarginPct: number;
  /** Average revenue per account (monthly) */
  arpa: number;
  /** Revenue per employee — null when headcount is unavailable */
  revenuePerEmployee: number | null;
  /** SaaS magic number — null (requires quarterly data we don't have) */
  magicNumber: number | null;
}

// ── Core computation ─────────────────────────────────────

/**
 * Compute unit economics from live provider data.
 *
 * Formulas:
 *   ARPA  = avgRevenuePerCustomer (from Stripe)
 *   Churn = subscriptions.churnRate / 100  (monthly, from Stripe)
 *   LTV   = ARPA / max(churn, 0.01)       (prevent divide-by-zero)
 *   CAC   = marketing spend / new customers
 *           marketing spend = outflows * marketing ratio (0.15)
 *           new customers   = recentContacts or fallback 10
 *   LTV:CAC = ltv / max(cac, 1)
 *   Payback = cac / max(arpa, 1)
 *   Gross margin = (revenue - COGS) / revenue * 100
 *           COGS = outflows * cogs ratio (0.25)
 *   Magic number = null (needs quarterly delta we don't track)
 */
export function computeUnitEconomics(
  stripe: AnalyticsDashboardData["stripe"],
  mercury: AnalyticsDashboardData["mercury"],
  hubspot: AnalyticsDashboardData["hubspot"],
): UnitEconomicsData {
  // ── ARPA ──
  const arpa = stripe?.revenue?.avgRevenuePerCustomer ?? 0;

  // ── Churn (monthly, as a decimal) ──
  const churnDecimal = (stripe?.subscriptions?.churnRate ?? 0) / 100;
  const effectiveChurn = Math.max(churnDecimal, 0.01);

  // ── LTV ──
  const ltv = Math.round((arpa / effectiveChurn) * 100) / 100;

  // ── CAC ──
  const totalOutflows = mercury?.cashFlow?.outflows30d ?? 0;
  const marketingSpend = totalOutflows * DEFAULT_EXPENSE_RATIOS.marketing;

  // Estimate new customers from HubSpot recentContacts, fallback to 10
  const recentContacts = hubspot?.contacts?.recentContacts ?? 0;
  const newCustomers = recentContacts > 0 ? recentContacts : 10;

  const cac =
    newCustomers > 0
      ? Math.round((marketingSpend / newCustomers) * 100) / 100
      : 0;

  // ── LTV:CAC ratio ──
  const ltvCacRatio =
    Math.round((ltv / Math.max(cac, 1)) * 100) / 100;

  // ── Payback months ──
  const paybackMonths =
    arpa > 0
      ? Math.round((cac / arpa) * 100) / 100
      : 0;

  // ── Gross margin ──
  const revenue = stripe?.revenue?.totalRevenue30d ?? 0;
  const cogs = totalOutflows * DEFAULT_EXPENSE_RATIOS.cogs;
  const grossMarginPct =
    revenue > 0
      ? Math.round(((revenue - cogs) / revenue) * 10000) / 100
      : 0;

  // ── Revenue per employee — null (no employee data available) ──
  const revenuePerEmployee: number | null = null;

  // ── Magic number — null (requires quarterly data we don't have) ──
  const magicNumber: number | null = null;

  return {
    ltv,
    cac,
    ltvCacRatio,
    paybackMonths,
    grossMarginPct,
    arpa,
    revenuePerEmployee,
    magicNumber,
  };
}

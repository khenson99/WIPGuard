import type {
  AnalyticsDashboardData,
  AnalyticsMetricsLayer,
  BudgetData,
  FinanceBudgetActualMetric,
  FinanceBudgetActualsMetric,
  FinanceMercuryMetric,
  FinanceSummaryMetric,
  FinanceStripeMetric,
} from "./types";
import { normalizePercentValue } from "./percentage-utils";
import { buildSubscriptionMrrBreakdown } from "./subscription-mrr";

export type {
  AnalyticsMetricsLayer,
  FinanceBudgetActualMetric,
  FinanceBudgetActualsMetric,
  FinanceMercuryMetric,
  FinanceSummaryMetric,
  FinanceStripeMetric,
} from "./types";

const CATEGORY_LABELS: Record<string, string> = {
  cogs: "Cost of Goods Sold",
  payroll: "Payroll & Benefits",
  marketing: "Sales & Marketing",
  infrastructure: "Infrastructure & Hosting",
  ops: "General & Administrative",
  other: "Other",
};

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function metricVariancePct(budgeted: number, actual: number): number {
  if (budgeted === 0) return actual === 0 ? 0 : 100;
  return roundMetric(((actual - budgeted) / budgeted) * 100);
}

function statusFromVariance(
  variance: number | null,
): FinanceBudgetActualMetric["status"] {
  if (variance == null || variance === 0) return "on_track";
  return variance > 0 ? "over" : "under";
}

function buildFinanceBudgetActualsMetric(
  activeBudget: BudgetData | null | undefined,
): FinanceBudgetActualsMetric | null {
  if (!activeBudget) return null;

  const items = activeBudget.lineItems.map((item) => {
    const budgeted = roundMetric(item.plannedAmount);
    const actual = roundMetric(item.actualAmount ?? 0);
    const variance = roundMetric(item.variance ?? actual - budgeted);
    const variancePct = roundMetric(
      item.variancePct ?? metricVariancePct(budgeted, actual),
    );

    return {
      category: CATEGORY_LABELS[item.category] ?? item.category,
      budgeted,
      actual,
      variance,
      variancePct,
      status: statusFromVariance(item.variance ?? variance),
    };
  });

  const totalBudget = roundMetric(activeBudget.totalPlanned);
  const totalActual = roundMetric(
    activeBudget.totalActual ??
      items.reduce((sum, item) => sum + item.actual, 0),
  );
  const totalVariance = roundMetric(
    activeBudget.totalVariance ?? totalActual - totalBudget,
  );
  const totalVariancePct = metricVariancePct(totalBudget, totalActual);

  return {
    budgetId: activeBudget.id,
    budgetName: activeBudget.name,
    totalBudget,
    totalActual,
    totalVariance,
    totalVariancePct,
    overspendCategories: items
      .filter((item) => item.status === "over")
      .map((item) => item.category),
    items,
  };
}

function buildFinanceSummaryMetric(
  data: AnalyticsDashboardData,
  kpis: AnalyticsMetricsLayer["kpis"],
): FinanceSummaryMetric {
  const stripe = data.stripe;
  const mercury = data.mercury;
  const subscriptionOverview = data.financialPlanning?.subscriptionOverview ?? null;
  const stripeActiveSubscriptions = stripe?.subscriptions?.active ?? 0;

  return {
    mrr: kpis.finance.mrr,
    mrrChange: stripe?.revenue?.mrrChange ?? 0,
    totalRevenue30d: stripe?.revenue?.totalRevenue30d ?? 0,
    revenueGrowth: normalizePercentValue(stripe?.revenue?.revenueGrowth ?? 0),
    activeSubscriptions:
      subscriptionOverview?.mergedActiveSubscriptions ?? stripeActiveSubscriptions,
    stripeActiveSubscriptions:
      subscriptionOverview?.stripeActiveSubscriptions ?? stripeActiveSubscriptions,
    hubspotActiveSubscriptions:
      subscriptionOverview?.hubspotActiveSubscriptions ?? 0,
    pastDueSubscriptions: stripe?.subscriptions?.pastDue ?? 0,
    trialingSubscriptions: stripe?.subscriptions?.trialing ?? 0,
    paymentSuccessPct: kpis.finance.paymentSuccessPct,
    churnRatePct: normalizePercentValue(stripe?.subscriptions?.churnRate ?? 0),
    cashBalance: mercury?.cashFlow?.totalBalance ?? 0,
    bankCash: mercury?.cashFlow?.bankCash ?? null,
    treasuryCash: mercury?.cashFlow?.treasuryCash ?? null,
    runwayMonths: mercury?.cashFlow?.runway ?? 0,
    netCashFlow30d: mercury?.cashFlow?.netCashFlow ?? 0,
    inflows30d: mercury?.cashFlow?.inflows30d ?? 0,
    outflows30d: mercury?.cashFlow?.outflows30d ?? 0,
    burnRate: mercury?.cashFlow?.burnRate ?? 0,
  };
}

function buildFinanceStripeMetric(
  data: AnalyticsDashboardData,
): FinanceStripeMetric | null {
  const stripe = data.stripe;
  if (!stripe) return null;

  return {
    mrr: stripe.revenue.mrr,
    mrrChange: stripe.revenue.mrrChange,
    totalRevenue30d: stripe.revenue.totalRevenue30d,
    totalRevenuePrev30d: stripe.revenue.totalRevenuePrev30d,
    revenueGrowth: normalizePercentValue(stripe.revenue.revenueGrowth),
    avgRevenuePerCustomer: stripe.revenue.avgRevenuePerCustomer,
    activeSubscriptions: stripe.subscriptions.active,
    pastDueSubscriptions: stripe.subscriptions.pastDue,
    canceledSubscriptions: stripe.subscriptions.canceled,
    trialingSubscriptions: stripe.subscriptions.trialing,
    churnRatePct: normalizePercentValue(stripe.subscriptions.churnRate),
    succeededPayments: stripe.payments.succeeded,
    failedPayments: stripe.payments.failed,
    paymentSuccessPct: normalizePercentValue(stripe.payments.successRate),
  };
}

function buildFinanceMercuryMetric(
  data: AnalyticsDashboardData,
): FinanceMercuryMetric | null {
  const mercury = data.mercury;
  if (!mercury) return null;

  return {
    totalBalance: mercury.cashFlow.totalBalance,
    bankCash: mercury.cashFlow.bankCash ?? null,
    treasuryCash: mercury.cashFlow.treasuryCash ?? null,
    runwayMonths: mercury.cashFlow.runway,
    netCashFlow30d: mercury.cashFlow.netCashFlow,
    inflows30d: mercury.cashFlow.inflows30d,
    outflows30d: mercury.cashFlow.outflows30d,
    burnRate: mercury.cashFlow.burnRate,
  };
}

export function buildAnalyticsMetricsLayer(
  data: AnalyticsDashboardData,
): AnalyticsMetricsLayer {
  const kpis = computeAnalyticsKpis(data);

  return {
    kpis,
    finance: {
      summary: buildFinanceSummaryMetric(data, kpis),
      stripe: buildFinanceStripeMetric(data),
      mercury: buildFinanceMercuryMetric(data),
      budgetActuals: buildFinanceBudgetActualsMetric(
        data.financialPlanning?.activeBudget,
      ),
    },
  };
}

/**
 * Compute fallback KPIs from raw provider data when `data.kpis` is not
 * pre-populated by the API layer.
 */
export function computeAnalyticsKpis(data: AnalyticsDashboardData) {
  const ga = data.googleAnalytics ?? data.ga;

  // ── Traffic KPIs ──
  let bounceRatePct = 0;
  let pagesPerSession = 0;

  if (ga) {
    // GA4 may return bounceRate as a fraction (0–1) or a percentage (0–100).
    const raw = ga.bounceRate;
    bounceRatePct = raw >= 0 && raw <= 1 ? raw * 100 : raw;
    pagesPerSession =
      ga.sessions30d > 0 ? ga.pageviews30d / ga.sessions30d : 0;
  }

  const engagementScore = Math.round(100 - bounceRatePct);
  const pageDepthScore = Math.min(Math.round(pagesPerSession * 20), 100);

  // ── Finance KPIs ──
  const stripe = data.stripe;
  const mrr = buildSubscriptionMrrBreakdown({ stripe, hubspot: data.hubspot }).totalMrr;
  const paymentSuccessPct = normalizePercentValue(stripe?.payments.successRate ?? 0);

  return {
    traffic: { bounceRatePct, pagesPerSession, engagementScore, pageDepthScore },
    finance: { mrr, paymentSuccessPct },
  };
}

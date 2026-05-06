import type {
  AnalyticsDashboardData,
  AnalyticsMetricsLayer,
  BudgetData,
  FinanceBudgetActualMetric,
  FinanceBudgetActualsMetric,
} from "./types";
import { normalizePercentValue } from "./percentage-utils";
import { buildSubscriptionMrrBreakdown } from "./subscription-mrr";

export type {
  AnalyticsMetricsLayer,
  FinanceBudgetActualMetric,
  FinanceBudgetActualsMetric,
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

export function buildAnalyticsMetricsLayer(
  data: AnalyticsDashboardData,
): AnalyticsMetricsLayer {
  const kpis = computeAnalyticsKpis(data);

  return {
    kpis,
    finance: {
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

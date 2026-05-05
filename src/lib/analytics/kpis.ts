import type { AnalyticsDashboardData } from "./types";
import { normalizePercentValue } from "./percentage-utils";
import { buildSubscriptionMrrBreakdown } from "./subscription-mrr";

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

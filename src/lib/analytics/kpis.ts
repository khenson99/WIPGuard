import type { AnalyticsDashboardData } from "./types";

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
  const mrr = stripe?.revenue.mrr ?? 0;
  // successRate is a 0–1 fraction; normalise to 0–100 like bounceRatePct.
  const rawSuccess = stripe?.payments.successRate ?? 0;
  const paymentSuccessPct = rawSuccess >= 0 && rawSuccess <= 1 ? rawSuccess * 100 : rawSuccess;

  return {
    traffic: { bounceRatePct, pagesPerSession, engagementScore, pageDepthScore },
    finance: { mrr, paymentSuccessPct },
  };
}

import type { AnalyticsDashboardData, AnalyticsKpis } from "@/lib/analytics/types";

function clamp01to100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

function fmtAvgSession(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

const TERMINAL_DEAL_STAGES = new Set([
  "Closed Won",
  "Closed Lost",
  "Unlikely",
  "Churn",
  "Ping Later",
  "On Hold",
]);

const DEMO_PIPELINE_STAGES = new Set([
  "Demo Scheduled",
  "No-Show/Reschedule",
  "Demo Follow-Up",
]);

export function computeAnalyticsKpis(data: AnalyticsDashboardData): AnalyticsKpis {
  const stripe = data.stripe;
  const mercury = data.mercury;
  const ga = data.googleAnalytics ?? data.ga ?? null;

  const mrr = stripe?.revenue?.mrr ?? null;
  const arr = mrr == null ? null : mrr * 12;

  const deals = data.hubspot?.deals ?? [];
  const totalDeals = data.hubspot?.funnel?.totalDeals ?? (data.hubspot ? deals.length : null);
  const activeDeals = data.hubspot
    ? deals.filter((deal) => !TERMINAL_DEAL_STAGES.has(deal.stageLabel)).length
    : null;

  const winRatePct = data.hubspot?.funnel?.winRate ?? (data.hubspot ? 0 : null);
  const noShowRatePct = data.hubspot?.funnel?.noShowRate ?? (data.hubspot ? 0 : null);

  const demosInPipeline = data.hubspot
    ? deals.filter((deal) => DEMO_PIPELINE_STAGES.has(deal.stageLabel)).length
    : null;

  const timeRange = data.timeRange;
  const demoRecords = data.demoAnalytics?.demos ?? [];
  const demosScheduledInRange =
    demoRecords.length === 0 || !timeRange
      ? (data.demoAnalytics ? 0 : null)
      : demoRecords.filter((demo) => {
          const t = new Date(demo.scheduledAt).getTime();
          const from = new Date(`${timeRange.from}T00:00:00.000Z`).getTime();
          const to = new Date(`${timeRange.to}T23:59:59.999Z`).getTime();
          return t >= from && t <= to;
        }).length;

  const avgConversionRatePct = (() => {
    const sources = data.demoAnalytics?.bySource ?? null;
    if (!sources) return null;
    if (sources.length === 0) return 0;
    const sum = sources.reduce((s, x) => s + (x.conversionRate ?? 0), 0);
    return Math.round((sum / sources.length) * 10) / 10;
  })();

  const bounceRatePct = ga ? ga.bounceRate * 100 : null;
  const avgSessionDurationSeconds = ga ? ga.avgSessionDuration : null;
  const avgSessionDurationLabel =
    avgSessionDurationSeconds == null ? null : fmtAvgSession(avgSessionDurationSeconds);
  const pagesPerSession =
    ga == null ? null : ga.sessions30d > 0 ? ga.pageviews30d / ga.sessions30d : 0;
  const engagementScore =
    bounceRatePct == null ? null : clamp01to100(Math.round(100 - bounceRatePct));
  const pageDepthScore =
    pagesPerSession == null ? null : clamp01to100(Math.round(pagesPerSession * 20));

  const googleAds = data.googleAds;
  const googleRoasScore = googleAds ? clamp01to100(googleAds.roas * 10) : null;
  const googleCpaScore = googleAds
    ? clamp01to100(
        100 -
          (googleAds.cpa / Math.max(googleAds.totalSpend30d / Math.max(googleAds.totalConversions, 1), 1)) * 50,
      )
    : null;

  const metaAds = data.metaAds;
  const metaCpaScore = metaAds ? clamp01to100(100 - (metaAds.cpa / 100) * 50) : null;
  const metaEngagementScore = metaAds ? clamp01to100(metaAds.ctr * 25) : null;

  const redditAds = data.redditAds;
  const redditCtrScore = redditAds ? clamp01to100(redditAds.ctr * 50) : null;
  const redditCpcScore = redditAds ? clamp01to100(100 - (redditAds.cpc / 10) * 50) : null;

  const failureRatioPctByProvider: AnalyticsKpis["ops"]["failureRatioPctByProvider"] = {};
  for (const [provider, telemetry] of Object.entries({
    googleWorkspace: data.googleWorkspace,
    slack: data.slack,
    hubspotOps: data.hubspotOps,
    codaOps: data.codaOps,
    redditOps: data.redditOps,
  })) {
    if (!telemetry) {
      failureRatioPctByProvider[provider as keyof typeof failureRatioPctByProvider] = null;
      continue;
    }
    const denom = Math.max(1, telemetry.eventsInRange);
    failureRatioPctByProvider[provider as keyof typeof failureRatioPctByProvider] =
      (telemetry.failuresInRange / denom) * 100;
  }

  const avgFirstResponseMinutes = data.pylon?.avgFirstResponseMinutes ?? null;
  const avgFirstResponseLabel =
    avgFirstResponseMinutes == null ? null : `${Math.round(avgFirstResponseMinutes)} min`;
  const csatScore = data.pylon?.csat ?? null;
  const csatPct = csatScore == null ? null : (csatScore / 5) * 100;

  const aiGlobal = data.aiInsights?.global ?? [];
  const aiCriticalCount = aiGlobal.length === 0 ? (data.aiInsights ? 0 : null) : aiGlobal.filter((i) => i.severity === "critical").length;
  const aiWarningCount = aiGlobal.length === 0 ? (data.aiInsights ? 0 : null) : aiGlobal.filter((i) => i.severity === "warning").length;
  const aiInfoCount = aiGlobal.length === 0 ? (data.aiInsights ? 0 : null) : aiGlobal.filter((i) => i.severity === "info").length;
  const aiAvgConfidencePct =
    aiGlobal.length === 0
      ? (data.aiInsights ? 0 : null)
      : Math.round((aiGlobal.reduce((sum, i) => sum + i.confidence, 0) / aiGlobal.length) * 100);

  return {
    finance: {
      mrr,
      arr,
      paymentSuccessPct: stripe?.payments?.successRate ?? null,
      churnRatePct: stripe?.subscriptions?.churnRate ?? null,
      revenueGrowthPct: stripe?.revenue?.revenueGrowth ?? null,
      runwayMonths: mercury?.cashFlow?.runway ?? null,
      runwayMonthsCapped24: mercury?.cashFlow?.runway == null ? null : Math.min(mercury.cashFlow.runway, 24),
    },
    sales: { totalDeals, activeDeals, winRatePct, noShowRatePct },
    demo: { demosScheduledInRange, demosInPipeline, avgConversionRatePct },
    traffic: {
      bounceRatePct,
      avgSessionDurationSeconds,
      avgSessionDurationLabel,
      pagesPerSession,
      engagementScore,
      pageDepthScore,
    },
    ads: {
      google: { roasScore: googleRoasScore, cpaScore: googleCpaScore },
      meta: { cpaScore: metaCpaScore, engagementScore: metaEngagementScore },
      reddit: { ctrScore: redditCtrScore, cpcScore: redditCpcScore },
    },
    ops: { failureRatioPctByProvider },
    support: { avgFirstResponseMinutes, avgFirstResponseLabel, csatScore, csatPct },
    ai: {
      criticalCount: aiCriticalCount,
      warningCount: aiWarningCount,
      infoCount: aiInfoCount,
      avgConfidencePct: aiAvgConfidencePct,
    },
  };
}

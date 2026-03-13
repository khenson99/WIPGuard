import type { AiInsightsBundle, AnalyticsDashboardData, ProviderFreshness } from "@/lib/analytics/types";

export function createEmptyAiInsightsBundle(generatedAt: string = new Date().toISOString()): AiInsightsBundle {
  return {
    generatedAt,
    global: [],
    bySection: {
      "ads-traffic": [],
      finance: [],
      "sales-pipeline": [],
      retention: [],
      "customer-success": [],
      "customer-journey": [],
      "demo-analytics": [],
      "process-analytics": [],
    },
  };
}

export function createEmptyAnalyticsDashboardData(input: {
  freshness: AnalyticsDashboardData["freshness"];
  timeRange: AnalyticsDashboardData["timeRange"];
  lastFullRefresh?: string;
}): AnalyticsDashboardData {
  return {
    hubspot: null,
    salesPerformance: null,
    stripe: null,
    mercury: null,
    googleAnalytics: null,
    googleAds: null,
    metaAds: null,
    metaPage: null,
    instagram: null,
    redditAds: null,
    webflow: null,
    coda: null,
    semrush: null,
    pylon: null,
    product: null,
    googleWorkspace: null,
    slack: null,
    hubspotOps: null,
    codaOps: null,
    redditOps: null,
    funnelJourney: null,
    lifecycleFunnel: null,
    customerJourney: null,
    visitorFunnel: null,
    demoAnalytics: null,
    processAnalytics: null,
    recommendations: [],
    distilledInsights: [],
    aiInsights: createEmptyAiInsightsBundle(),
    freshness: input.freshness,
    staleDomains: [],
    timeRange: input.timeRange,
    lastFullRefresh: input.lastFullRefresh ?? new Date().toISOString(),
    financialPlanning: null,
    errors: [],
  };
}

export function patchFreshnessWithStale(
  existing: ProviderFreshness,
  input: { stale: boolean; capturedAt?: string | null; source?: ProviderFreshness["source"]; lastError?: string | null }
): ProviderFreshness {
  return {
    ...existing,
    stale: existing.stale || input.stale,
    lastSnapshotAt: input.capturedAt ?? existing.lastSnapshotAt,
    source: input.source ?? (input.stale ? "snapshot" : existing.source),
    lastError: input.lastError ?? existing.lastError,
  };
}

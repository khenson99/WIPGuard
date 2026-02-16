import { describe, expect, it } from "vitest";
import { buildAiInsightsBundle, buildDistilledInsights } from "@/lib/analytics/insight-engine";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

function baseData(): AnalyticsDashboardData {
  return {
    hubspot: null,
    stripe: null,
    mercury: null,
    googleAnalytics: null,
    googleAds: null,
    metaAds: null,
    metaPage: null,
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
    recommendations: [],
    distilledInsights: [],
    aiInsights: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      global: [],
      bySection: {
        "ads-traffic": [],
        finance: [],
        "sales-pipeline": [],
        "customer-success": [],
      },
    },
    freshness: {},
    staleDomains: [],
    lastFullRefresh: "2026-01-01T00:00:00.000Z",
    errors: [],
  };
}

describe("analytics AI insights bundle", () => {
  it("builds explainable sectioned insights with severity ordering", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 2000,
      sessionsPrev30d: 2100,
      users30d: 1600,
      usersPrev30d: 1700,
      pageviews30d: 0,
      pageviewsPrev30d: 0,
      bounceRate: 0.72,
      avgSessionDuration: 40,
      trafficByChannel: [],
      topPages: [],
      dailyTrend: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.googleAds = {
      totalSpend30d: 3000,
      totalImpressions: 0,
      totalClicks: 5000,
      totalConversions: 30,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
      campaigns: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.metaAds = {
      totalSpend30d: 1500,
      totalImpressions: 0,
      totalClicks: 3200,
      totalConversions: 12,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      campaigns: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.mercury = {
      accounts: [],
      cashFlow: {
        totalBalance: 20000,
        inflows30d: 5000,
        outflows30d: 12000,
        netCashFlow: -7000,
        runway: 2.8,
        burnRate: 7000,
      },
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.stripe = {
      revenue: {
        mrr: 18000,
        mrrChange: -5.5,
        totalRevenue30d: 20000,
        totalRevenuePrev30d: 24000,
        revenueGrowth: -16.7,
        avgRevenuePerCustomer: 500,
      },
      subscriptions: {
        active: 42,
        pastDue: 4,
        canceled: 8,
        trialing: 3,
        churnRate: 0.12,
        recentChurnEvents: [],
      },
      payments: {
        succeeded: 120,
        failed: 22,
        successRate: 0.84,
      },
      revenueTrend: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.staleDomains = ["googleAnalytics", "mercury"];

    const bundle = buildAiInsightsBundle(data);

    expect(bundle.global.length).toBeGreaterThan(1);
    expect(bundle.global[0].severity).toBe("critical");
    expect(bundle.bySection.finance.length).toBeGreaterThan(0);
    expect(bundle.global.some((item) => item.stale)).toBe(true);
    expect(bundle.global.every((item) => item.evidence.length > 0)).toBe(true);
  });

  it("creates distilled insights from AI insights for compatibility", () => {
    const data = baseData();
    const distilled = buildDistilledInsights(data);
    expect(distilled.length).toBe(1);
    expect(distilled[0].title).toContain("No critical");
    expect(distilled[0].actions.length).toBeGreaterThan(0);
  });
});

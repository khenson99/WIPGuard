import { describe, expect, it } from "vitest";
import { buildCrossFunnelData, buildLifecycleFunnelData } from "@/lib/analytics/funnel";
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
        "customer-journey": [],
        "demo-analytics": [],
        "process-analytics": [],
      },
    },
    customerJourney: null,
    demoAnalytics: null,
    processAnalytics: null,
    freshness: {},
    staleDomains: [],
    timeRange: {
      preset: "30d",
      from: "2026-01-01",
      to: "2026-01-30",
      days: 30,
      label: "Last 30 days",
    },
    lastFullRefresh: "2026-01-30T00:00:00.000Z",
    errors: [],
  };
}

describe("analytics lifecycle funnel", () => {
  it("builds six deterministic lifecycle stages with transitions", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 12000,
      sessionsPrev30d: 10000,
      users30d: 9000,
      usersPrev30d: 8400,
      pageviews30d: 18000,
      pageviewsPrev30d: 16000,
      bounceRate: 0.52,
      avgSessionDuration: 82,
      trafficByChannel: [],
      topPages: [],
      dailyTrend: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.googleAds = {
      totalSpend30d: 2000,
      totalImpressions: 500000,
      totalClicks: 9000,
      totalConversions: 230,
      ctr: 1.8,
      cpc: 1.3,
      cpa: 8.7,
      roas: 2.2,
      campaigns: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.metaAds = {
      totalSpend30d: 1200,
      totalImpressions: 230000,
      totalClicks: 3500,
      totalConversions: 80,
      ctr: 1.1,
      cpc: 0.8,
      cpa: 6.8,
      campaigns: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.redditAds = {
      totalSpend30d: 400,
      totalImpressions: 90000,
      totalClicks: 1000,
      ctr: 1.1,
      cpc: 0.4,
      campaigns: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.hubspot = {
      funnel: {
        totalDeals: 500,
        closedWon: 60,
        closedLost: 30,
        unlikely: 12,
        churn: 8,
        activeSubscriptions: 110,
        noShows: 10,
        demoScheduled: 150,
        demoFollowUp: 95,
        avgDealSize: 7500,
        winRate: 66.6,
        effectiveWinRate: 57.1,
        noShowRate: 6.6,
        stages: [],
        dealsBySource: [],
      },
      contacts: {
        totalContacts: 1800,
        recentContacts: 320,
        bySource: [],
      },
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.stripe = {
      revenue: {
        mrr: 42000,
        mrrChange: 7.5,
        totalRevenue30d: 78000,
        totalRevenuePrev30d: 70000,
        revenueGrowth: 11.4,
        avgRevenuePerCustomer: 820,
      },
      subscriptions: {
        active: 140,
        pastDue: 5,
        canceled: 10,
        trialing: 12,
        churnRate: 0.03,
        recentChurnEvents: [],
      },
      payments: {
        succeeded: 1100,
        failed: 40,
        successRate: 0.964,
      },
      revenueTrend: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.pylon = {
      openConversations: 25,
      urgentConversations: 6,
      waitingOnTeam: 7,
      resolvedInRange: 44,
      avgFirstResponseMinutes: 21,
      csat: 4.7,
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };
    data.product = {
      activeContributors: 11,
      createdTasksInRange: 130,
      completedTasksInRange: 119,
      overdueOpenTasks: 9,
      backlogGrowth: 11,
      throughputRate: 91.5,
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };

    const lifecycle = buildLifecycleFunnelData(data);
    expect(lifecycle.stages).toHaveLength(6);
    expect(lifecycle.transitions).toHaveLength(5);
    expect(lifecycle.stages[0].id).toBe("awareness");
    expect(lifecycle.stages[5].id).toBe("expansion");
    expect(lifecycle.stages.every((stage) => stage.evidence.length > 0)).toBe(true);
  });

  it("projects lifecycle stages into cross-funnel touchpoints", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 1000,
      sessionsPrev30d: 900,
      users30d: 700,
      usersPrev30d: 600,
      pageviews30d: 0,
      pageviewsPrev30d: 0,
      bounceRate: 0.6,
      avgSessionDuration: 30,
      trafficByChannel: [],
      topPages: [],
      dailyTrend: [],
      _meta: { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" },
    };

    const cross = buildCrossFunnelData(data);
    expect(cross.stages).toHaveLength(6);
    expect(cross.narrative.length).toBeGreaterThan(0);
  });
});

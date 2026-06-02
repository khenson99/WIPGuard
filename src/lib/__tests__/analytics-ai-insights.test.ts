import { describe, expect, it } from "vitest";
import { buildAiInsightsBundle, buildDistilledInsights, __private__ } from "@/lib/analytics/insight-engine";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

const { sortInsights } = __private__;

function baseData(): AnalyticsDashboardData {
  return {
    hubspot: null,
    salesPerformance: null,
    stripe: null,
    mercury: null,
    googleAnalytics: null,
    googleSearchConsole: null,
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
    visitorFunnel: null,
    recommendations: [],
    distilledInsights: [],
    metrics: null,
    aiInsights: {
      generatedAt: "2026-01-01T00:00:00.000Z",
      global: [],
      bySection: {
        "website-traffic": [],
        "social-media": [],
        finance: [],
        "sales-pipeline": [],
        retention: [],
        "customer-success": [],
        "customer-journey": [],
        "demo-analytics": [],
        "process-analytics": [],
        revenue: [],
      },
    },
    freshness: {},
    staleDomains: [],
    lastFullRefresh: "2026-01-01T00:00:00.000Z",
    financialPlanning: null,
    customerJourney: null,
    demoAnalytics: null,
    processAnalytics: null,
    errors: [],
  };
}

const META = { fetchedAt: "2026-01-30", nextRefresh: "2026-01-30", source: "live" as const };

function hubspotWithSubscription(amount: number): NonNullable<AnalyticsDashboardData["hubspot"]> {
  return {
    funnel: {
      totalDeals: 1,
      closedWon: 1,
      closedLost: 0,
      unlikely: 0,
      churn: 0,
      activeSubscriptions: 1,
      noShows: 0,
      demoScheduled: 0,
      demoFollowUp: 0,
      avgDealSize: amount,
      winRate: 100,
      effectiveWinRate: 100,
      noShowRate: 0,
      stages: [],
      dealsBySource: [],
    },
    contacts: { totalContacts: 1, recentContacts: 1, bySource: [] },
    subscriptionDeals: [
      {
        dealId: `sub-${amount}`,
        dealName: `Subscription ${amount}`,
        stageId: "subscriptions",
        stageLabel: "Subscriptions",
        amount,
        source: "Referral",
        ownerId: null,
        updatedAt: "2026-01-10T00:00:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        closedAt: "2026-01-10T00:00:00Z",
        stripeCustomerId: null,
        pipelineId: "subscription-pipeline",
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: "buyer@example.com",
      },
    ],
    _meta: META,
  };
}

// ── Bundle-level tests ───────────────────────────────────

describe("analytics AI insights bundle", () => {
  it("builds explainable sectioned insights with severity ordering", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 2000, sessionsPrev30d: 2100,
      users30d: 1600, usersPrev30d: 1700,
      pageviews30d: 0, pageviewsPrev30d: 0,
      bounceRate: 0.72, avgSessionDuration: 40,
      trafficByChannel: [], topPages: [], dailyTrend: [],
      _meta: META,
    };
    data.googleAds = {
      totalSpend30d: 3000, totalImpressions: 0, totalClicks: 5000,
      totalConversions: 30, ctr: 0, cpc: 0, cpa: 0, roas: 0,
      campaigns: [], _meta: META,
    };
    data.metaAds = {
      totalSpend30d: 1500, totalImpressions: 0, totalClicks: 3200,
      totalConversions: 12, ctr: 0, cpc: 0, cpa: 0,
      campaigns: [], _meta: META,
    };
    data.mercury = {
      accounts: [],
      cashFlow: {
        totalBalance: 20000, inflows30d: 5000, outflows30d: 12000,
        netCashFlow: -7000, runway: 2.8, burnRate: 7000,
      },
      _meta: META,
    };
    data.stripe = {
      revenue: {
        mrr: 18000, mrrChange: -5.5,
        totalRevenue30d: 20000, totalRevenuePrev30d: 24000,
        revenueGrowth: -16.7, avgRevenuePerCustomer: 500,
      },
      subscriptions: {
        active: 42, pastDue: 4, canceled: 8, trialing: 3,
        churnRate: 0.12, recentChurnEvents: [],
      },
      payments: { succeeded: 120, failed: 22, successRate: 0.84 },
      revenueTrend: [],
      _meta: META,
    };
    data.staleDomains = ["googleAnalytics", "mercury"];

    const bundle = buildAiInsightsBundle(data);

    expect(bundle.global.length).toBeGreaterThan(1);
    expect(bundle.global[0].severity).toBe("critical");
    expect(bundle.bySection.finance.length).toBeGreaterThan(0);
    expect(bundle.global.some((item) => item.stale)).toBe(true);
    expect(bundle.global.every((item) => item.evidence.length > 0)).toBe(true);
    expect(bundle.global.every((item) => item.actions.every((action) => (action.type as string) !== "create_task"))).toBe(true);
  });

  it("caps insights at 12 globally", () => {
    const data = baseData();
    // Load every domain with data that triggers multiple insights
    data.googleAnalytics = {
      sessions30d: 500, sessionsPrev30d: 2000,
      users30d: 400, usersPrev30d: 1500,
      pageviews30d: 0, pageviewsPrev30d: 0,
      bounceRate: 0.80, avgSessionDuration: 30,
      trafficByChannel: [], topPages: [], dailyTrend: [],
      _meta: META,
    };
    data.googleAds = {
      totalSpend30d: 5000, totalImpressions: 10000, totalClicks: 4000,
      totalConversions: 20, ctr: 0.04, cpc: 1.25, cpa: 250, roas: 0.5,
      campaigns: [], _meta: META,
    };
    data.metaAds = {
      totalSpend30d: 6000, totalImpressions: 15000, totalClicks: 5000,
      totalConversions: 10, ctr: 0.03, cpc: 1.2, cpa: 600,
      campaigns: [], _meta: META,
    };
    data.mercury = {
      accounts: [],
      cashFlow: {
        totalBalance: 15000, inflows30d: 3000, outflows30d: 10000,
        netCashFlow: -7000, runway: 2.1, burnRate: 7000,
      },
      _meta: META,
    };
    data.stripe = {
      revenue: {
        mrr: 10000, mrrChange: -12,
        totalRevenue30d: 11000, totalRevenuePrev30d: 14000,
        revenueGrowth: -21, avgRevenuePerCustomer: 350,
      },
      subscriptions: {
        active: 30, pastDue: 5, canceled: 10, trialing: 2,
        churnRate: 0.15, recentChurnEvents: [],
      },
      payments: { succeeded: 80, failed: 25, successRate: 0.76 },
      revenueTrend: [],
      _meta: META,
    };
    data.hubspot = {
      funnel: {
        totalDeals: 50, closedWon: 5, closedLost: 10,
        unlikely: 25, churn: 12, activeSubscriptions: 30,
        noShows: 15, demoScheduled: 20, demoFollowUp: 18,
        avgDealSize: 400, winRate: 33, effectiveWinRate: 10,
        noShowRate: 30,
        stages: [
          { stageId: "1", label: "Prospect", count: 30, value: 12000 },
          { stageId: "2", label: "Lead", count: 5, value: 2000 },
          { stageId: "3", label: "Demo Scheduled", count: 3, value: 1200 },
        ],
        dealsBySource: [
          { source: "Organic", count: 40, value: 16000 },
          { source: "Referral", count: 10, value: 4000 },
        ],
      },
      contacts: { totalContacts: 200, recentContacts: 10, bySource: [] },
      _meta: META,
    };
    data.pylon = {
      openConversations: 30, urgentConversations: 25,
      waitingOnTeam: 10, resolvedInRange: 20,
      avgFirstResponseMinutes: 45, csat: 3.5,
      _meta: META,
    };
    data.product = {
      activeContributors: 3, mergedPullRequestsInRange: 20,
      completedLinearIssuesInRange: 8, cycleTimeRiskSignals: 12,
      deliveryBalance: 12, deliveryRate: 0.40,
      _meta: META,
    };

    const bundle = buildAiInsightsBundle(data);
    expect(bundle.global.length).toBeLessThanOrEqual(12);
  });

  it("does not raise zero-form warning when HubSpot collected forms have submissions", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 800,
      sessionsPrev30d: 700,
      users30d: 500,
      usersPrev30d: 450,
      pageviews30d: 1200,
      pageviewsPrev30d: 1000,
      bounceRate: 0.5,
      avgSessionDuration: 60,
      trafficByChannel: [],
      topPages: [],
      dailyTrend: [],
      _meta: META,
    };
    data.webflow = {
      siteName: "WIPGuard",
      lastPublished: "2026-05-20T00:00:00.000Z",
      totalPages: 5,
      totalCollections: 0,
      formSubmissions: [],
      customDomains: [],
      publishedPages: 5,
      draftPages: 0,
      archivedPages: 0,
      pages: [],
      seoAudit: {
        totalPages: 5,
        pagesWithSeoTitle: 5,
        pagesWithSeoDescription: 5,
        pagesWithOgImage: 5,
        seoScore: 100,
      },
      contentFreshness: {
        updatedLast7d: 0,
        updatedLast30d: 0,
        updatedLast90d: 0,
        staleOver90d: 0,
      },
      recentlyUpdatedPages: [],
      collections: [],
      totalCmsItems: 0,
      emptyCollections: 0,
      formTrend: [],
      totalFormSubmissions: 0,
      _meta: META,
    };
    data.hubspot = {
      funnel: {
        totalDeals: 0,
        closedWon: 0,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 0,
        demoScheduled: 0,
        demoFollowUp: 0,
        collectedFormSubmissions: 1,
        leadMagnetSubmissions: 1,
        contactRequestSubmissions: 0,
        avgDealSize: 0,
        winRate: 0,
        effectiveWinRate: 0,
        noShowRate: 0,
        stages: [],
        dealsBySource: [],
      },
      contacts: {
        totalContacts: 0,
        recentContacts: 0,
        bySource: [],
      },
      collectedForms: {
        formSubmissions: [{ formName: "Kanban Generator", count: 1, funnelCategory: "lead_magnet" }],
        submissions: [],
        totalFormSubmissions: 1,
        leadMagnetSubmissions: 1,
        contactRequestSubmissions: 0,
      },
      _meta: META,
    };

    const bundle = buildAiInsightsBundle(data);

    expect(bundle.global.some((insight) => insight.id === "ai-ads-webflow-zero-conv")).toBe(false);
  });

  it("does not raise zero-form warning when Webflow form submissions are unavailable", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 800,
      sessionsPrev30d: 700,
      users30d: 500,
      usersPrev30d: 450,
      pageviews30d: 1200,
      pageviewsPrev30d: 1000,
      bounceRate: 0.5,
      avgSessionDuration: 60,
      trafficByChannel: [],
      topPages: [],
      dailyTrend: [],
      _meta: META,
    };
    data.webflow = {
      siteName: "WIPGuard",
      lastPublished: "2026-05-20T00:00:00.000Z",
      totalPages: 5,
      totalCollections: 0,
      formSubmissions: [],
      customDomains: [],
      publishedPages: 5,
      draftPages: 0,
      archivedPages: 0,
      pages: [],
      seoAudit: {
        totalPages: 5,
        pagesWithSeoTitle: 5,
        pagesWithSeoDescription: 5,
        pagesWithOgImage: 5,
        seoScore: 100,
      },
      contentFreshness: {
        updatedLast7d: 0,
        updatedLast30d: 0,
        updatedLast90d: 0,
        staleOver90d: 0,
      },
      recentlyUpdatedPages: [],
      collections: [],
      totalCmsItems: 0,
      emptyCollections: 0,
      formTrend: [],
      totalFormSubmissions: 0,
      _meta: {
        ...META,
        diagnostics: {
          formSubmissionsAvailable: false,
          formSubmissionsError: "Webflow formSubmissions request failed (403): missing scope forms:read",
        },
      },
    };

    const bundle = buildAiInsightsBundle(data);

    expect(bundle.global.some((insight) => insight.id === "ai-ads-webflow-zero-conv")).toBe(false);
  });

  it("ignores unavailable HubSpot collected-form fallbacks when checking zero-form conversion", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 800,
      sessionsPrev30d: 700,
      users30d: 500,
      usersPrev30d: 450,
      pageviews30d: 1200,
      pageviewsPrev30d: 1000,
      bounceRate: 0.5,
      avgSessionDuration: 60,
      trafficByChannel: [],
      topPages: [],
      dailyTrend: [],
      _meta: META,
    };
    data.webflow = {
      siteName: "WIPGuard",
      lastPublished: "2026-05-20T00:00:00.000Z",
      totalPages: 5,
      totalCollections: 0,
      formSubmissions: [],
      customDomains: [],
      publishedPages: 5,
      draftPages: 0,
      archivedPages: 0,
      pages: [],
      seoAudit: {
        totalPages: 5,
        pagesWithSeoTitle: 5,
        pagesWithSeoDescription: 5,
        pagesWithOgImage: 5,
        seoScore: 100,
      },
      contentFreshness: {
        updatedLast7d: 0,
        updatedLast30d: 0,
        updatedLast90d: 0,
        staleOver90d: 0,
      },
      recentlyUpdatedPages: [],
      collections: [],
      totalCmsItems: 0,
      emptyCollections: 0,
      formTrend: [],
      totalFormSubmissions: 0,
      _meta: META,
    };
    data.hubspot = {
      funnel: {
        totalDeals: 0,
        closedWon: 0,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 0,
        demoScheduled: 0,
        demoFollowUp: 0,
        collectedFormSubmissions: 5,
        leadMagnetSubmissions: 3,
        contactRequestSubmissions: 2,
        avgDealSize: 0,
        winRate: 0,
        effectiveWinRate: 0,
        noShowRate: 0,
        stages: [],
        dealsBySource: [],
      },
      contacts: {
        totalContacts: 0,
        recentContacts: 0,
        bySource: [],
      },
      _meta: {
        ...META,
        diagnostics: {
          collectedFormsAvailable: false,
          collectedFormsError: "HubSpot collected forms request failed (403)",
        },
      },
    };

    const bundle = buildAiInsightsBundle(data);

    expect(bundle.global.some((insight) => insight.id === "ai-ads-webflow-zero-conv")).toBe(true);
  });

  it("creates distilled insights from AI insights for compatibility", () => {
    const data = baseData();
    const distilled = buildDistilledInsights(data);
    expect(distilled.length).toBe(1);
    expect(distilled[0].title).toContain("No critical");
    expect(distilled[0].actions.every((action) => (action.type as string) !== "create_task")).toBe(true);
  });

  it("returns steady-state insight when all data is null", () => {
    const data = baseData();
    const bundle = buildAiInsightsBundle(data);
    expect(bundle.global.length).toBe(1);
    expect(bundle.global[0].id).toBe("ai-steady-state");
    expect(bundle.global[0].severity).toBe("info");
  });

  it("sorts insights by severity then confidence", () => {
    const items = [
      { severity: "info" as const, confidence: 0.95 },
      { severity: "critical" as const, confidence: 0.70 },
      { severity: "warning" as const, confidence: 0.90 },
      { severity: "critical" as const, confidence: 0.85 },
    ] as Parameters<typeof sortInsights>[0];
    const sorted = sortInsights(items);
    expect(sorted[0].severity).toBe("critical");
    expect(sorted[0].confidence).toBe(0.85);
    expect(sorted[1].severity).toBe("critical");
    expect(sorted[1].confidence).toBe(0.70);
    expect(sorted[2].severity).toBe("warning");
    expect(sorted[3].severity).toBe("info");
  });
});

// ── Website traffic + social media insights ─────────────

describe("ads insights", () => {
  it("fires bounce rate alarm when above 55%", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 1000, sessionsPrev30d: 1000,
      users30d: 800, usersPrev30d: 800,
      pageviews30d: 0, pageviewsPrev30d: 0,
      bounceRate: 0.60, avgSessionDuration: 50,
      trafficByChannel: [], topPages: [], dailyTrend: [],
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const bounceInsight = bundle.global.find((i) => i.id === "ai-ads-bounce-rate");
    expect(bounceInsight).toBeDefined();
    expect(bounceInsight!.severity).toBe("warning");
    expect(bounceInsight!.subsectionId).toBe("ads-google-analytics");
  });

  it("normalizes percent-point bounce rate values before thresholding and display", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 1000, sessionsPrev30d: 1000,
      users30d: 800, usersPrev30d: 800,
      pageviews30d: 0, pageviewsPrev30d: 0,
      bounceRate: 60, avgSessionDuration: 50,
      trafficByChannel: [], topPages: [], dailyTrend: [],
      _meta: META,
    };

    const bundle = buildAiInsightsBundle(data);
    const bounceInsight = bundle.global.find((i) => i.id === "ai-ads-bounce-rate");

    expect(bounceInsight).toBeDefined();
    expect(bounceInsight!.severity).toBe("warning");
    expect(bounceInsight!.why).toContain("60.0%");
    expect(bounceInsight!.evidence[0]?.value).toBe("60.0%");
  });

  it("escalates bounce rate to critical above 65%", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 1000, sessionsPrev30d: 1000,
      users30d: 800, usersPrev30d: 800,
      pageviews30d: 0, pageviewsPrev30d: 0,
      bounceRate: 0.70, avgSessionDuration: 30,
      trafficByChannel: [], topPages: [], dailyTrend: [],
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const bounceInsight = bundle.global.find((i) => i.id === "ai-ads-bounce-rate");
    expect(bounceInsight!.severity).toBe("critical");
  });

  it("fires click-to-conversion alert below 2%", () => {
    const data = baseData();
    data.googleAds = {
      totalSpend30d: 2000, totalImpressions: 50000, totalClicks: 3000,
      totalConversions: 20, ctr: 0.06, cpc: 0.67, cpa: 100, roas: 1,
      campaigns: [], _meta: META,
    };
    data.metaAds = {
      totalSpend30d: 1000, totalImpressions: 20000, totalClicks: 2000,
      totalConversions: 10, ctr: 0.05, cpc: 0.5, cpa: 100,
      campaigns: [], _meta: META,
    };
    // Combined: 30 conversions / 5000 clicks = 0.6%
    const bundle = buildAiInsightsBundle(data);
    const convInsight = bundle.global.find((i) => i.id === "ai-ads-click-conv");
    expect(convInsight).toBeDefined();
    expect(convInsight!.section).toBe("social-media");
  });

  it("fires declining sessions alert when >15% drop", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 700, sessionsPrev30d: 1000,
      users30d: 500, usersPrev30d: 800,
      pageviews30d: 0, pageviewsPrev30d: 0,
      bounceRate: 0.40, avgSessionDuration: 60,
      trafficByChannel: [], topPages: [],
      dailyTrend: [
        { date: "2026-01-01", sessions: 30 },
        { date: "2026-01-02", sessions: 25 },
        { date: "2026-01-03", sessions: 20 },
      ],
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const decline = bundle.global.find((i) => i.id === "ai-ads-session-decline");
    expect(decline).toBeDefined();
    expect(decline!.severity).toBe("warning");
    expect(decline!.evidence[0].trendValues).toEqual([30, 25, 20]);
  });

  it("fires CPA disparity when one platform is 2x+ another", () => {
    const data = baseData();
    // Google: $2000 spend / 10 conv = $200 CPA
    // Meta: $1000 spend / 20 conv = $50 CPA → 4x disparity
    data.googleAds = {
      totalSpend30d: 2000, totalImpressions: 10000, totalClicks: 500,
      totalConversions: 10, ctr: 0.05, cpc: 4, cpa: 200, roas: 0.5,
      campaigns: [], _meta: META,
    };
    data.metaAds = {
      totalSpend30d: 1000, totalImpressions: 8000, totalClicks: 400,
      totalConversions: 20, ctr: 0.05, cpc: 2.5, cpa: 50,
      campaigns: [], _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const cpa = bundle.global.find((i) => i.id === "ai-ads-cpa-disparity");
    expect(cpa).toBeDefined();
    expect(cpa!.title).toContain("Google Ads");
    expect(cpa!.evidence.length).toBe(2);
  });

  it("does not fire ads insights when no ads data present", () => {
    const data = baseData();
    const bundle = buildAiInsightsBundle(data);
    expect(bundle.bySection["website-traffic"].length).toBe(0);
    expect(bundle.bySection["social-media"].length).toBe(0);
  });
});

// ── Finance insights ────────────────────────────────────

describe("finance insights", () => {
  it("fires runway risk when below 6 months", () => {
    const data = baseData();
    data.mercury = {
      accounts: [],
      cashFlow: {
        totalBalance: 30000, inflows30d: 8000, outflows30d: 12000,
        netCashFlow: -4000, runway: 5.5, burnRate: 4000,
      },
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const runway = bundle.global.find((i) => i.id === "ai-finance-runway");
    expect(runway).toBeDefined();
    expect(runway!.severity).toBe("warning");
    expect(runway!.subsectionId).toBe("finance-mercury");
  });

  it("escalates runway to critical below 4 months", () => {
    const data = baseData();
    data.mercury = {
      accounts: [],
      cashFlow: {
        totalBalance: 15000, inflows30d: 3000, outflows30d: 8000,
        netCashFlow: -5000, runway: 3.0, burnRate: 5000,
      },
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const runway = bundle.global.find((i) => i.id === "ai-finance-runway");
    expect(runway!.severity).toBe("critical");
  });

  it("fires churn rate alarm above 8%", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 20000, mrrChange: 0,
        totalRevenue30d: 22000, totalRevenuePrev30d: 22000,
        revenueGrowth: 0, avgRevenuePerCustomer: 500,
      },
      subscriptions: {
        active: 40, pastDue: 2, canceled: 6, trialing: 1,
        churnRate: 0.10, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 5, successRate: 0.95 },
      revenueTrend: [],
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const churn = bundle.global.find((i) => i.id === "ai-finance-churn");
    expect(churn).toBeDefined();
    expect(churn!.severity).toBe("warning");
    expect(churn!.subsectionId).toBe("finance-stripe");
  });

  it("escalates churn to critical above 12%", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 20000, mrrChange: 0,
        totalRevenue30d: 22000, totalRevenuePrev30d: 22000,
        revenueGrowth: 0, avgRevenuePerCustomer: 500,
      },
      subscriptions: {
        active: 40, pastDue: 2, canceled: 10, trialing: 1,
        churnRate: 0.15, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 5, successRate: 0.95 },
      revenueTrend: [],
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const churn = bundle.global.find((i) => i.id === "ai-finance-churn");
    expect(churn!.severity).toBe("critical");
  });

  it("fires payment failure warning below 90% success", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 20000, mrrChange: 2,
        totalRevenue30d: 22000, totalRevenuePrev30d: 21000,
        revenueGrowth: 4.8, avgRevenuePerCustomer: 500,
      },
      subscriptions: {
        active: 40, pastDue: 2, canceled: 1, trialing: 1,
        churnRate: 0.03, recentChurnEvents: [],
      },
      payments: { succeeded: 85, failed: 15, successRate: 0.85 },
      revenueTrend: [],
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const pf = bundle.global.find((i) => i.id === "ai-finance-payment-failures");
    expect(pf).toBeDefined();
    expect(pf!.severity).toBe("warning");
    expect(pf!.subsectionId).toBe("finance-stripe");
  });

  it("normalizes percent-style Stripe churn and payment success values", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 20000, mrrChange: 2,
        totalRevenue30d: 22000, totalRevenuePrev30d: 21000,
        revenueGrowth: 4.8, avgRevenuePerCustomer: 500,
      },
      subscriptions: {
        active: 40, pastDue: 2, canceled: 4, trialing: 1,
        churnRate: 10, recentChurnEvents: [],
      },
      payments: { succeeded: 85, failed: 15, successRate: 85 },
      revenueTrend: [],
      _meta: META,
    };

    const bundle = buildAiInsightsBundle(data);
    const churn = bundle.global.find((i) => i.id === "ai-finance-churn");
    const paymentFailures = bundle.global.find((i) => i.id === "ai-finance-payment-failures");

    expect(churn).toBeDefined();
    expect(churn!.evidence[0].value).toBe("10.0%");
    expect(paymentFailures).toBeDefined();
    expect(paymentFailures!.evidence[0].value).toBe("85.0%");
  });

  it("fires MRR decline alert when mrrChange < -5", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 18000, mrrChange: -7,
        totalRevenue30d: 18000, totalRevenuePrev30d: 19500,
        revenueGrowth: -7.7, avgRevenuePerCustomer: 450,
      },
      subscriptions: {
        active: 40, pastDue: 1, canceled: 3, trialing: 2,
        churnRate: 0.06, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 5, successRate: 0.95 },
      revenueTrend: [{ month: "2025-12", revenue: 19500 }, { month: "2026-01", revenue: 18000 }],
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const mrr = bundle.global.find((i) => i.id === "ai-finance-mrr-decline");
    expect(mrr).toBeDefined();
    expect(mrr!.severity).toBe("warning");
    expect(mrr!.evidence[0].trendValues).toEqual([19500, 18000]);
  });

  it("uses canonical MRR in MRR decline insight copy", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 18000, mrrChange: -7,
        totalRevenue30d: 18000, totalRevenuePrev30d: 19500,
        revenueGrowth: -7.7, avgRevenuePerCustomer: 450,
      },
      subscriptions: {
        active: 40, pastDue: 1, canceled: 3, trialing: 2,
        churnRate: 0.06, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 5, successRate: 0.95 },
      revenueTrend: [],
      _meta: META,
    };
    data.hubspot = hubspotWithSubscription(12_000);

    const bundle = buildAiInsightsBundle(data);
    const mrr = bundle.global.find((i) => i.id === "ai-finance-mrr-decline");

    expect(mrr).toBeDefined();
    expect(mrr!.why).toContain("$19,000");
    expect(mrr!.evidence[0].delta).toBe("$19,000 current MRR");
  });

  it("escalates MRR to critical when mrrChange < -10", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 15000, mrrChange: -12,
        totalRevenue30d: 15000, totalRevenuePrev30d: 17000,
        revenueGrowth: -11.8, avgRevenuePerCustomer: 375,
      },
      subscriptions: {
        active: 40, pastDue: 1, canceled: 3, trialing: 2,
        churnRate: 0.06, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 5, successRate: 0.95 },
      revenueTrend: [],
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const mrr = bundle.global.find((i) => i.id === "ai-finance-mrr-decline");
    expect(mrr!.severity).toBe("critical");
  });

  it("uses canonical MRR before flagging burn-to-revenue ratio", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 10000, mrrChange: 0,
        totalRevenue30d: 10000, totalRevenuePrev30d: 9000,
        revenueGrowth: 10, avgRevenuePerCustomer: 500,
      },
      subscriptions: {
        active: 20, pastDue: 0, canceled: 0, trialing: 0,
        churnRate: 0.04, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 0, successRate: 1 },
      revenueTrend: [],
      _meta: META,
    };
    data.mercury = {
      accounts: [],
      cashFlow: {
        totalBalance: 200000, inflows30d: 10000, outflows30d: 32000,
        netCashFlow: -22000, runway: 9.1, burnRate: 22000,
      },
      _meta: META,
    };
    data.hubspot = hubspotWithSubscription(24_000);

    const bundle = buildAiInsightsBundle(data);
    const burnTrend = bundle.global.find((i) => i.id === "ai-finance-burn-rate-trend");

    expect(burnTrend).toBeUndefined();
  });

  it("uses canonical MRR before flagging revenue forecast gaps", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 10000, mrrChange: 0,
        totalRevenue30d: 10000, totalRevenuePrev30d: 9000,
        revenueGrowth: 10, avgRevenuePerCustomer: 500,
      },
      subscriptions: {
        active: 20, pastDue: 0, canceled: 0, trialing: 0,
        churnRate: 4, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 0, successRate: 100 },
      revenueTrend: [],
      _meta: META,
    };
    data.hubspot = hubspotWithSubscription(12_000);

    const bundle = buildAiInsightsBundle(data);
    const forecastGap = bundle.global.find((i) => i.id === "ai-finance-revenue-vs-forecast");

    expect(forecastGap).toBeUndefined();
  });
});

// ── Sales & Pipeline insights ───────────────────────────

describe("sales insights", () => {
  function hubspotWithFunnel(overrides: Partial<NonNullable<AnalyticsDashboardData["hubspot"]>["funnel"]>) {
    return {
      funnel: {
        totalDeals: 50, closedWon: 10, closedLost: 5,
        unlikely: 8, churn: 3, activeSubscriptions: 30,
        noShows: 5, demoScheduled: 15, demoFollowUp: 8,
        avgDealSize: 1200, winRate: 67, effectiveWinRate: 38,
        noShowRate: 10,
        stages: [
          { stageId: "1", label: "Prospect", count: 20, value: 24000 },
          { stageId: "2", label: "Lead", count: 15, value: 18000 },
          { stageId: "3", label: "Demo Scheduled", count: 10, value: 12000 },
          { stageId: "4", label: "Closed Won", count: 10, value: 12000 },
        ],
        dealsBySource: [
          { source: "Organic", count: 25, value: 30000 },
          { source: "Referral", count: 15, value: 18000 },
          { source: "Paid", count: 10, value: 12000 },
        ],
        ...overrides,
      },
      contacts: { totalContacts: 200, recentContacts: 10, bySource: [] },
      _meta: META,
    };
  }

  it("fires no-show/conversion leak when noShowRate > 15", () => {
    const data = baseData();
    data.hubspot = hubspotWithFunnel({ noShowRate: 22, noShows: 11 });
    const bundle = buildAiInsightsBundle(data);
    const leak = bundle.global.find((i) => i.id === "ai-sales-conversion-leak");
    expect(leak).toBeDefined();
    expect(leak!.severity).toBe("warning");
    expect(leak!.subsectionId).toBe("sales-hubspot");
  });

  it("normalizes ratio-form no-show rate in sales insight thresholds and copy", () => {
    const data = baseData();
    data.hubspot = hubspotWithFunnel({ noShowRate: 0.22, noShows: 11 });
    const bundle = buildAiInsightsBundle(data);
    const leak = bundle.global.find((i) => i.id === "ai-sales-conversion-leak");

    expect(leak).toBeDefined();
    expect(leak!.severity).toBe("warning");
    expect(leak!.why).toContain("22.0%");
    expect(leak!.evidence[0]?.value).toBe("22.0%");
  });

  it("fires conversion leak when follow-up > closed won", () => {
    const data = baseData();
    data.hubspot = hubspotWithFunnel({ noShowRate: 10, demoFollowUp: 15, closedWon: 8 });
    const bundle = buildAiInsightsBundle(data);
    const leak = bundle.global.find((i) => i.id === "ai-sales-conversion-leak");
    expect(leak).toBeDefined();
  });

  it("finds deal-stage bottleneck at largest drop-off", () => {
    const data = baseData();
    data.hubspot = hubspotWithFunnel({
      stages: [
        { stageId: "1", label: "Prospect", count: 40, value: 48000 },
        { stageId: "2", label: "Lead", count: 35, value: 42000 },
        { stageId: "3", label: "Demo Scheduled", count: 8, value: 9600 },
        { stageId: "4", label: "Closed Won", count: 6, value: 7200 },
      ],
    });
    const bundle = buildAiInsightsBundle(data);
    const bottleneck = bundle.global.find((i) => i.id === "ai-sales-stage-bottleneck");
    expect(bottleneck).toBeDefined();
    expect(bottleneck!.title).toContain("Lead");
    expect(bottleneck!.title).toContain("Demo Scheduled");
  });

  it("fires source concentration risk when one source > 60%", () => {
    const data = baseData();
    data.hubspot = hubspotWithFunnel({
      totalDeals: 20,
      dealsBySource: [
        { source: "Organic", count: 17, value: 20400 },
        { source: "Referral", count: 3, value: 3600 },
      ],
    });
    const bundle = buildAiInsightsBundle(data);
    const concentration = bundle.global.find((i) => i.id === "ai-sales-source-concentration");
    expect(concentration).toBeDefined();
    expect(concentration!.title).toContain("Organic");
    expect(concentration!.severity).toBe("critical"); // 85% > 80% threshold
  });

  it("does not fire sales insights without hubspot data", () => {
    const data = baseData();
    const bundle = buildAiInsightsBundle(data);
    const salesSpecific = bundle.bySection["sales-pipeline"].filter((i) => i.id.startsWith("ai-sales-"));
    expect(salesSpecific.length).toBe(0);
  });
});

// ── Customer Success insights ───────────────────────────

describe("customer success insights", () => {
  it("fires escalation pressure when urgent conversations > 10", () => {
    const data = baseData();
    data.pylon = {
      openConversations: 20, urgentConversations: 15,
      waitingOnTeam: 5, resolvedInRange: 10,
      avgFirstResponseMinutes: 30, csat: 4.0,
      _meta: META,
    };
    data.product = {
      activeContributors: 5, mergedPullRequestsInRange: 10,
      completedLinearIssuesInRange: 8, cycleTimeRiskSignals: 2,
      deliveryBalance: 2, deliveryRate: 0.80,
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const escalation = bundle.global.find((i) => i.id === "ai-cs-escalation-risk");
    expect(escalation).toBeDefined();
    expect(escalation!.subsectionId).toBe("cs-pylon");
    expect(escalation!.why).toContain("throughput: 80.0%");
    expect(escalation!.evidence[1]?.delta).toBe("80.0% throughput");
  });

  it("fires throughput stall when deliveryRate < 70%", () => {
    const data = baseData();
    data.product = {
      activeContributors: 3, mergedPullRequestsInRange: 15,
      completedLinearIssuesInRange: 6, cycleTimeRiskSignals: 9,
      deliveryBalance: 9, deliveryRate: 0.55,
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const stall = bundle.global.find((i) => i.id === "ai-cs-throughput-stall");
    expect(stall).toBeDefined();
    expect(stall!.severity).toBe("warning");
    expect(stall!.subsectionId).toBeUndefined();
  });

  it("fires throughput stall for percent-point deliveryRate values below 70%", () => {
    const data = baseData();
    data.product = {
      activeContributors: 3, mergedPullRequestsInRange: 15,
      completedLinearIssuesInRange: 6, cycleTimeRiskSignals: 9,
      deliveryBalance: 9, deliveryRate: 55,
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const stall = bundle.global.find((i) => i.id === "ai-cs-throughput-stall");
    expect(stall).toBeDefined();
    expect(stall!.severity).toBe("warning");
    expect(stall!.evidence[0]?.value).toBe("55.0%");
  });

  it("escalates throughput stall to critical below 50%", () => {
    const data = baseData();
    data.product = {
      activeContributors: 3, mergedPullRequestsInRange: 15,
      completedLinearIssuesInRange: 4, cycleTimeRiskSignals: 11,
      deliveryBalance: 11, deliveryRate: 0.40,
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const stall = bundle.global.find((i) => i.id === "ai-cs-throughput-stall");
    expect(stall).toBeDefined();
    expect(stall!.severity).toBe("critical");
  });

  it("escalates throughput stall for percent-point deliveryRate values below 50%", () => {
    const data = baseData();
    data.product = {
      activeContributors: 3, mergedPullRequestsInRange: 15,
      completedLinearIssuesInRange: 4, cycleTimeRiskSignals: 11,
      deliveryBalance: 11, deliveryRate: 40,
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const stall = bundle.global.find((i) => i.id === "ai-cs-throughput-stall");
    expect(stall).toBeDefined();
    expect(stall!.severity).toBe("critical");
    expect(stall!.evidence[0]?.value).toBe("40.0%");
  });
});

// ── Cross-domain insights ───────────────────────────────

describe("cross-domain insights", () => {
  it("fires ad spend vs pipeline when closed won < 50% of spend", () => {
    const data = baseData();
    data.googleAds = {
      totalSpend30d: 5000, totalImpressions: 50000, totalClicks: 2000,
      totalConversions: 40, ctr: 0.04, cpc: 2.5, cpa: 125, roas: 1,
      campaigns: [], _meta: META,
    };
    data.hubspot = {
      funnel: {
        totalDeals: 30, closedWon: 5, closedLost: 3,
        unlikely: 2, churn: 1, activeSubscriptions: 20,
        noShows: 2, demoScheduled: 10, demoFollowUp: 5,
        avgDealSize: 300, winRate: 62, effectiveWinRate: 45,
        noShowRate: 8,
        stages: [
          { stageId: "1", label: "Prospect", count: 20, value: 6000 },
          { stageId: "cw", label: "Closed Won", count: 5, value: 1500 },
        ],
        dealsBySource: [{ source: "Organic", count: 30, value: 9000 }],
      },
      contacts: { totalContacts: 100, recentContacts: 5, bySource: [] },
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const spendVsPipeline = bundle.global.find((i) => i.id === "ai-xd-spend-vs-pipeline");
    expect(spendVsPipeline).toBeDefined();
    expect(spendVsPipeline!.crossDomain).toBe(true);
    expect(spendVsPipeline!.evidence.length).toBe(2);
  });

  it("normalizes closed-won stage labels before comparing ad spend to pipeline", () => {
    const data = baseData();
    data.googleAds = {
      totalSpend30d: 5000,
      totalImpressions: 50000,
      totalClicks: 2000,
      totalConversions: 40,
      ctr: 0.04,
      cpc: 2.5,
      cpa: 125,
      roas: 1,
      campaigns: [],
      _meta: META,
    };
    data.hubspot = {
      funnel: {
        totalDeals: 30,
        closedWon: 10,
        closedLost: 3,
        unlikely: 2,
        churn: 1,
        activeSubscriptions: 20,
        noShows: 2,
        demoScheduled: 10,
        demoFollowUp: 5,
        avgDealSize: 300,
        winRate: 76,
        effectiveWinRate: 62,
        noShowRate: 8,
        stages: [
          { stageId: "1", label: "Prospect", count: 20, value: 6000 },
          { stageId: "cw", label: " closed_won ", count: 10, value: 6000 },
        ],
        dealsBySource: [{ source: "Organic", count: 30, value: 12000 }],
      },
      contacts: { totalContacts: 100, recentContacts: 5, bySource: [] },
      _meta: META,
    };

    const bundle = buildAiInsightsBundle(data);
    const spendVsPipeline = bundle.global.find((i) => i.id === "ai-xd-spend-vs-pipeline");

    expect(spendVsPipeline).toBeUndefined();
  });

  it("fires revenue growth vs support load", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 25000, mrrChange: 8,
        totalRevenue30d: 27000, totalRevenuePrev30d: 24000,
        revenueGrowth: 12.5, avgRevenuePerCustomer: 600,
      },
      subscriptions: {
        active: 42, pastDue: 1, canceled: 1, trialing: 3,
        churnRate: 0.02, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 3, successRate: 0.97 },
      revenueTrend: [],
      _meta: META,
    };
    data.pylon = {
      openConversations: 35, urgentConversations: 20,
      waitingOnTeam: 15, resolvedInRange: 25,
      avgFirstResponseMinutes: 60, csat: 3.8,
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const growthVsSupport = bundle.global.find((i) => i.id === "ai-xd-growth-vs-support");
    expect(growthVsSupport).toBeDefined();
    expect(growthVsSupport!.crossDomain).toBe(true);
    expect(growthVsSupport!.section).toBe("customer-success");
  });

  it("normalizes ratio-style revenue growth before cross-domain thresholding", () => {
    const data = baseData();
    data.stripe = {
      revenue: {
        mrr: 25000, mrrChange: 8,
        totalRevenue30d: 27000, totalRevenuePrev30d: 24000,
        revenueGrowth: 0.125, avgRevenuePerCustomer: 600,
      },
      subscriptions: {
        active: 42, pastDue: 1, canceled: 1, trialing: 3,
        churnRate: 0.02, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 3, successRate: 0.97 },
      revenueTrend: [],
      _meta: META,
    };
    data.pylon = {
      openConversations: 35, urgentConversations: 20,
      waitingOnTeam: 15, resolvedInRange: 25,
      avgFirstResponseMinutes: 60, csat: 3.8,
      _meta: META,
    };

    const bundle = buildAiInsightsBundle(data);
    const growthVsSupport = bundle.global.find((i) => i.id === "ai-xd-growth-vs-support");

    expect(growthVsSupport).toBeDefined();
    expect(growthVsSupport!.why).toContain("Revenue growing 12.5%");
    expect(growthVsSupport!.evidence[0]?.value).toBe("12.5%");
  });

  it("fires low runway + small deal size", () => {
    const data = baseData();
    data.mercury = {
      accounts: [],
      cashFlow: {
        totalBalance: 20000, inflows30d: 5000, outflows30d: 9000,
        netCashFlow: -4000, runway: 4.5, burnRate: 4000,
      },
      _meta: META,
    };
    data.hubspot = {
      funnel: {
        totalDeals: 40, closedWon: 12, closedLost: 5,
        unlikely: 3, churn: 1, activeSubscriptions: 25,
        noShows: 3, demoScheduled: 10, demoFollowUp: 5,
        avgDealSize: 350, winRate: 70, effectiveWinRate: 57,
        noShowRate: 8,
        stages: [
          { stageId: "1", label: "Prospect", count: 20, value: 7000 },
          { stageId: "cw", label: "Closed Won", count: 12, value: 4200 },
        ],
        dealsBySource: [
          { source: "Organic", count: 20, value: 7000 },
          { source: "Referral", count: 20, value: 7000 },
        ],
      },
      contacts: { totalContacts: 100, recentContacts: 5, bySource: [] },
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const runwayDeal = bundle.global.find((i) => i.id === "ai-xd-runway-vs-deal-size");
    expect(runwayDeal).toBeDefined();
    expect(runwayDeal!.crossDomain).toBe(true);
    expect(runwayDeal!.section).toBe("finance");
  });

  it("does not fire cross-domain insights when thresholds not met", () => {
    const data = baseData();
    // Healthy scenario: good runway, large deal size, moderate support
    data.mercury = {
      accounts: [],
      cashFlow: {
        totalBalance: 500000, inflows30d: 50000, outflows30d: 20000,
        netCashFlow: 30000, runway: 25, burnRate: 20000,
      },
      _meta: META,
    };
    data.stripe = {
      revenue: {
        mrr: 50000, mrrChange: 5,
        totalRevenue30d: 55000, totalRevenuePrev30d: 52000,
        revenueGrowth: 5.8, avgRevenuePerCustomer: 1200,
      },
      subscriptions: {
        active: 42, pastDue: 1, canceled: 1, trialing: 3,
        churnRate: 0.02, recentChurnEvents: [],
      },
      payments: { succeeded: 100, failed: 3, successRate: 0.97 },
      revenueTrend: [],
      _meta: META,
    };
    data.pylon = {
      openConversations: 8, urgentConversations: 3,
      waitingOnTeam: 2, resolvedInRange: 10,
      avgFirstResponseMinutes: 15, csat: 4.5,
      _meta: META,
    };
    const bundle = buildAiInsightsBundle(data);
    const crossDomainInsights = bundle.global.filter((i) => i.crossDomain);
    expect(crossDomainInsights.length).toBe(0);
  });
});

// ── Stale domain tagging ────────────────────────────────

describe("stale domain tagging", () => {
  it("marks insights as stale when their domain is in staleDomains", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 1000, sessionsPrev30d: 1000,
      users30d: 800, usersPrev30d: 800,
      pageviews30d: 0, pageviewsPrev30d: 0,
      bounceRate: 0.70, avgSessionDuration: 40,
      trafficByChannel: [], topPages: [], dailyTrend: [],
      _meta: META,
    };
    data.staleDomains = ["googleAnalytics"];

    const bundle = buildAiInsightsBundle(data);
    const bounceInsight = bundle.global.find((i) => i.id === "ai-ads-bounce-rate");
    expect(bounceInsight).toBeDefined();
    expect(bounceInsight!.stale).toBe(true);
  });

  it("marks insights as not stale when domain is fresh", () => {
    const data = baseData();
    data.googleAnalytics = {
      sessions30d: 1000, sessionsPrev30d: 1000,
      users30d: 800, usersPrev30d: 800,
      pageviews30d: 0, pageviewsPrev30d: 0,
      bounceRate: 0.70, avgSessionDuration: 40,
      trafficByChannel: [], topPages: [], dailyTrend: [],
      _meta: META,
    };
    data.staleDomains = [];

    const bundle = buildAiInsightsBundle(data);
    const bounceInsight = bundle.global.find((i) => i.id === "ai-ads-bounce-rate");
    expect(bounceInsight).toBeDefined();
    expect(bounceInsight!.stale).toBe(false);
  });
});

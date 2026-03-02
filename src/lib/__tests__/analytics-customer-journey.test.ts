import { describe, expect, it } from "vitest";
import { buildCustomerJourneyData } from "@/lib/analytics/customer-journey";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type { AnalyticsDashboardData, HubSpotData } from "@/lib/analytics/types";

const META = { fetchedAt: "2026-02-10T00:00:00.000Z", nextRefresh: "2026-02-10T01:00:00.000Z", source: "live" as const };

type DealInput = NonNullable<HubSpotData["deals"]>[number];

function deal(overrides: Partial<DealInput> & Pick<DealInput, "dealId" | "dealName" | "stageId" | "stageLabel" | "amount" | "source">): DealInput {
  return {
    ownerId: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z",
    pipelineId: null,
    contactIds: [],
    primaryContactId: null,
    primaryContactEmail: null,
    ...overrides,
  };
}

function baseData(): AnalyticsDashboardData {
  return createEmptyAnalyticsDashboardData({
    freshness: {},
    timeRange: {
      preset: "30d",
      from: "2026-01-01",
      to: "2026-01-30",
      days: 30,
      label: "Last 30 days",
    },
  });
}

const MINIMAL_FUNNEL = {
  totalDeals: 1, closedWon: 0, closedLost: 0, unlikely: 0, churn: 0,
  activeSubscriptions: 0, noShows: 0, demoScheduled: 0, demoFollowUp: 0,
  avgDealSize: 0, winRate: 0, effectiveWinRate: 0, noShowRate: 0,
  stages: [] as { stageId: string; label: string; count: number; value: number }[],
  dealsBySource: [] as { source: string; count: number; value: number }[],
};

const MINIMAL_CONTACTS = { totalContacts: 0, recentContacts: 0, bySource: [] as { source: string; count: number }[] };

describe("buildCustomerJourneyData", () => {
  it("builds journeys, touchpoint summary, and attribution from hubspot deals", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        ...MINIMAL_FUNNEL,
        totalDeals: 2,
        closedWon: 1,
        activeSubscriptions: 1,
        demoScheduled: 1,
        demoFollowUp: 1,
        avgDealSize: 4000,
        winRate: 50,
        effectiveWinRate: 40,
        stages: [
          { stageId: "lead", label: "Lead", count: 1, value: 5000 },
          { stageId: "demo", label: "Demo Scheduled", count: 1, value: 3000 },
        ],
        dealsBySource: [{ source: "Organic", count: 2, value: 8000 }],
      },
      contacts: { totalContacts: 10, recentContacts: 2, bySource: [] },
      deals: [
        deal({
          dealId: "deal-1", dealName: "Acme Corp", stageId: "lead", stageLabel: "Lead",
          amount: 5000, source: "Organic", ownerId: "owner-1",
        }),
        deal({
          dealId: "deal-2", dealName: "Beta LLC", stageId: "demo", stageLabel: "Demo Scheduled",
          amount: 3000, source: "Paid", ownerId: "owner-2",
          createdAt: "2026-02-02T00:00:00.000Z", updatedAt: "2026-02-11T00:00:00.000Z",
        }),
      ],
      _meta: META,
    };

    data.stripe = {
      revenue: {
        mrr: 12000, mrrChange: 2, totalRevenue30d: 15000,
        totalRevenuePrev30d: 14000, revenueGrowth: 7.1, avgRevenuePerCustomer: 600,
      },
      subscriptions: { active: 20, pastDue: 1, canceled: 0, trialing: 2, churnRate: 0.02, recentChurnEvents: [] },
      payments: { succeeded: 100, failed: 2, successRate: 0.98 },
      revenueTrend: [],
      _meta: META,
    };

    data.googleAds = {
      totalSpend30d: 1000, totalImpressions: 10000, totalClicks: 200, totalConversions: 10,
      ctr: 2, cpc: 5, cpa: 100, roas: 1, campaigns: [], _meta: META,
    };

    const journey = buildCustomerJourneyData(data);

    expect(journey.journeys).toHaveLength(2);
    expect(journey.touchpointSummary.length).toBeGreaterThan(0);
    expect(journey.topPaths.length).toBeGreaterThan(0);
    expect(journey.attribution.length).toBeGreaterThan(0);
    expect(journey.avgTouchpoints).toBeGreaterThan(0);
  });

  it("populates stageOrder from pipeline stages", () => {
    const data = baseData();
    data.hubspot = {
      funnel: MINIMAL_FUNNEL,
      contacts: MINIMAL_CONTACTS,
      pipelineStages: [
        { stageId: "s1", label: "Lead" },
        { stageId: "s2", label: "Demo" },
        { stageId: "s3", label: "Won" },
      ],
      deals: [
        deal({ dealId: "deal-1", dealName: "Test", stageId: "s1", stageLabel: "Lead", amount: 1000, source: "Organic" }),
      ],
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);
    expect(journey.stageOrder).toEqual(["Lead", "Demo", "Won"]);
    expect(journey.stageOrderSource).toBe("pipeline");
  });

  it("falls back to canonical stage order when no pipeline stages", () => {
    const data = baseData();
    data.hubspot = {
      funnel: MINIMAL_FUNNEL,
      contacts: MINIMAL_CONTACTS,
      deals: [
        deal({ dealId: "deal-1", dealName: "Test", stageId: "s1", stageLabel: "Lead", amount: 1000, source: "Organic" }),
      ],
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);
    expect(journey.stageOrderSource).toBe("fallback");
    expect(journey.stageOrder!.length).toBeGreaterThan(0);
    expect(journey.stageOrder).toContain("Lead");
    expect(journey.stageOrder).toContain("Closed Won");
  });

  it("generates synthetic touchpoints from contact analytics", () => {
    const data = baseData();
    data.hubspot = {
      funnel: MINIMAL_FUNNEL,
      contacts: MINIMAL_CONTACTS,
      deals: [
        deal({
          dealId: "deal-1",
          dealName: "Organic Deal",
          stageId: "lead",
          stageLabel: "Lead",
          amount: 5000,
          source: "ORGANIC_SEARCH",
          primaryContactAnalytics: {
            source: "ORGANIC_SEARCH",
            sourceData1: "google",
            sourceData2: null,
            firstSeenAt: "2026-01-15T10:00:00.000Z",
            lastSeenAt: "2026-01-20T14:00:00.000Z",
            firstUrl: "https://example.com/pricing",
            lastUrl: "https://example.com/demo",
            numVisits: 5,
            numPageViews: 12,
            utmSource: "google",
            utmMedium: "organic",
            utmCampaign: null,
          },
        }),
      ],
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);
    expect(journey.journeys).toHaveLength(1);

    const j = journey.journeys[0];
    const organicTouchpoints = j.touchpoints.filter((tp) => tp.channel === "organic-search");
    expect(organicTouchpoints.length).toBeGreaterThanOrEqual(1);

    // First-seen touchpoint should have awareness phase
    const firstSeen = organicTouchpoints.find((tp) => tp.type === "first-touch");
    expect(firstSeen).toBeDefined();
    expect(firstSeen!.phase).toBe("awareness");
    expect(firstSeen!.timestamp).toBe("2026-01-15T10:00:00.000Z");

    // Last-seen touchpoint should have website phase
    const lastSeen = organicTouchpoints.find((tp) => tp.type === "engagement");
    expect(lastSeen).toBeDefined();
    expect(lastSeen!.phase).toBe("website");

    // Attribution table should include organic-search
    const organicAttribution = journey.attribution.find((a) => a.channel === "organic-search");
    expect(organicAttribution).toBeDefined();
  });

  it("maps paid-search from CPC utm_medium", () => {
    const data = baseData();
    data.hubspot = {
      funnel: MINIMAL_FUNNEL,
      contacts: MINIMAL_CONTACTS,
      deals: [
        deal({
          dealId: "deal-cpc",
          dealName: "CPC Deal",
          stageId: "lead",
          stageLabel: "Lead",
          amount: 2000,
          source: "OTHER_CAMPAIGNS",
          primaryContactAnalytics: {
            source: "OTHER_CAMPAIGNS",
            sourceData1: null,
            sourceData2: null,
            firstSeenAt: "2026-01-10T08:00:00.000Z",
            lastSeenAt: null,
            firstUrl: null,
            lastUrl: null,
            numVisits: 1,
            numPageViews: 2,
            utmSource: "google",
            utmMedium: "cpc",
            utmCampaign: "brand-q1",
          },
        }),
      ],
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);
    const j = journey.journeys[0];
    const paidSearch = j.touchpoints.filter((tp) => tp.channel === "paid-search");
    expect(paidSearch.length).toBeGreaterThanOrEqual(1);
    expect(paidSearch[0].detail).toContain("cpc");
  });
});

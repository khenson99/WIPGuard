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

  it("includes canonical subscription conversion touchpoints in journeys", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        ...MINIMAL_FUNNEL,
        totalDeals: 1,
        activeSubscriptions: 2,
      },
      contacts: MINIMAL_CONTACTS,
      deals: [
        deal({
          dealId: "deal-subscription",
          dealName: "Subscription Buyer",
          stageId: "closed-won",
          stageLabel: "Closed Won",
          amount: 5000,
          source: "Organic",
        }),
      ],
      subscriptionDeals: [
        {
          dealId: "linked-subscription",
          dealName: "Linked subscription",
          stageId: "subscriptions",
          stageLabel: "Subscriptions",
          amount: 12000,
          source: "Referral",
          ownerId: null,
          updatedAt: "2026-02-10T00:00:00.000Z",
          createdAt: "2026-02-01T00:00:00.000Z",
          closedAt: "2026-02-10T00:00:00.000Z",
          stripeCustomerId: "cus_linked",
          pipelineId: "subscription-pipeline",
          contactIds: [],
          primaryContactId: null,
          primaryContactEmail: "linked@example.com",
        },
        {
          dealId: "hubspot-only-subscription",
          dealName: "HubSpot only subscription",
          stageId: "subscriptions",
          stageLabel: "Subscriptions",
          amount: 24000,
          source: "Referral",
          ownerId: null,
          updatedAt: "2026-02-10T00:00:00.000Z",
          createdAt: "2026-02-01T00:00:00.000Z",
          closedAt: "2026-02-10T00:00:00.000Z",
          stripeCustomerId: null,
          pipelineId: "subscription-pipeline",
          contactIds: [],
          primaryContactId: null,
          primaryContactEmail: "buyer@example.org",
        },
      ],
      _meta: META,
    };
    data.stripe = {
      revenue: {
        mrr: 12000,
        mrrChange: 0,
        totalRevenue30d: 12000,
        totalRevenuePrev30d: 12000,
        revenueGrowth: 0,
        avgRevenuePerCustomer: 600,
      },
      subscriptions: {
        active: 20,
        pastDue: 0,
        canceled: 0,
        trialing: 0,
        churnRate: 0,
        activeCustomerRefs: [
          {
            customerId: "cus_linked",
            email: "linked@example.com",
            emailDomain: "example.com",
          },
        ],
        recentChurnEvents: [],
      },
      payments: { succeeded: 20, failed: 0, successRate: 1 },
      revenueTrend: [],
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);

    expect(journey.journeys[0].touchpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "stripe",
          type: "conversion",
          detail: "21 active subscriptions",
          value: 14000,
        }),
      ]),
    );
    expect(journey.touchpointSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "stripe",
          conversionCount: 1,
        }),
      ]),
    );
  });

  it("normalizes HubSpot deal stages before building journey conversion touchpoints", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        ...MINIMAL_FUNNEL,
        totalDeals: 1,
        closedWon: 1,
      },
      contacts: MINIMAL_CONTACTS,
      deals: [
        deal({
          dealId: "formatted-won",
          dealName: "Formatted Won",
          stageId: "closedwon",
          stageLabel: " closed won ",
          amount: 5000,
          source: "Organic",
        }),
      ],
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);

    expect(journey.journeys[0].currentStage).toBe("Closed Won");
    expect(journey.journeys[0].touchpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "hubspot",
          type: "conversion",
          detail: "Closed Won: Formatted Won",
          value: 5000,
        }),
      ]),
    );
    expect(journey.touchpointSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "hubspot",
          conversionCount: 1,
        }),
      ]),
    );
  });

  it("normalizes HubSpot deal stage punctuation before building conversion touchpoints", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        ...MINIMAL_FUNNEL,
        totalDeals: 1,
        closedWon: 1,
      },
      contacts: MINIMAL_CONTACTS,
      deals: [
        deal({
          dealId: "punctuated-won",
          dealName: "Punctuated Won",
          stageId: "closed_won",
          stageLabel: "Closed_Won",
          amount: 5000,
          source: "Organic",
        }),
      ],
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);

    expect(journey.journeys[0].currentStage).toBe("Closed Won");
    expect(journey.journeys[0].touchpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "hubspot",
          type: "conversion",
          detail: "Closed Won: Punctuated Won",
          value: 5000,
        }),
      ]),
    );
    expect(journey.touchpointSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "hubspot",
          conversionCount: 1,
        }),
      ]),
    );
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

  it("includes HubSpot collected forms in form engagement touchpoints", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        ...MINIMAL_FUNNEL,
        totalDeals: 1,
        collectedFormSubmissions: 2,
        leadMagnetSubmissions: 1,
        contactRequestSubmissions: 1,
      },
      contacts: MINIMAL_CONTACTS,
      deals: [
        deal({
          dealId: "deal-forms",
          dealName: "Forms Buyer",
          stageId: "lead",
          stageLabel: "Lead",
          amount: 1000,
          source: "Organic",
        }),
      ],
      collectedForms: {
        formSubmissions: [
          { formName: "Kanban Generator", count: 1, funnelCategory: "lead_magnet" },
          { formName: "Get in Touch", count: 1, funnelCategory: "contact_request" },
        ],
        submissions: [],
        totalFormSubmissions: 2,
        leadMagnetSubmissions: 1,
        contactRequestSubmissions: 1,
      },
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);

    expect(journey.touchpointSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "webflow",
          totalTouchpoints: 1,
        }),
      ]),
    );
  });

  it("uses known Webflow form totals without counting unavailable HubSpot form telemetry", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        ...MINIMAL_FUNNEL,
        totalDeals: 1,
        collectedFormSubmissions: 5,
      },
      contacts: MINIMAL_CONTACTS,
      deals: [
        deal({
          dealId: "deal-webflow-forms",
          dealName: "Webflow Forms Buyer",
          stageId: "lead",
          stageLabel: "Lead",
          amount: 1000,
          source: "Organic",
        }),
      ],
      _meta: {
        ...META,
        diagnostics: {
          collectedFormsAvailable: false,
          collectedFormsError: "HubSpot collected forms request failed (500)",
        },
      },
    };
    data.webflow = {
      siteName: "WIP Guard",
      lastPublished: "2026-02-09T00:00:00.000Z",
      totalPages: 1,
      totalCollections: 0,
      formSubmissions: [{ formName: "Contact", count: 2 }],
      formSubmissionDetails: [],
      customDomains: [],
      publishedPages: 1,
      draftPages: 0,
      archivedPages: 0,
      pages: [],
      seoAudit: {
        totalPages: 1,
        pagesWithSeoTitle: 1,
        pagesWithSeoDescription: 1,
        pagesWithOgImage: 1,
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
      totalFormSubmissions: 9,
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);

    expect(journey.journeys[0].touchpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "webflow",
          detail: "9 form submissions across 1 forms",
        }),
      ]),
    );
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

import { describe, expect, it } from "vitest";
import { buildRevenueDashboardData } from "@/lib/analytics/revenue-dashboard";
import type {
  AnalyticsDashboardData,
  DemoAnalyticsData,
  HubSpotData,
  MercuryData,
  SalesPerformancePack,
  StripeData,
} from "@/lib/analytics/types";

const meta = {
  fetchedAt: "2026-02-17T00:00:00.000Z",
  nextRefresh: "2026-02-17T01:00:00.000Z",
  source: "live" as const,
};

function makeHubSpot(): HubSpotData {
  return {
    funnel: {
      totalDeals: 4,
      closedWon: 2,
      closedLost: 1,
      unlikely: 0,
      churn: 0,
      activeSubscriptions: 1,
      noShows: 1,
      demoScheduled: 3,
      demoFollowUp: 2,
      avgDealSize: 4500,
      winRate: 66.7,
      effectiveWinRate: 50,
      noShowRate: 25,
      stages: [
        { stageId: "presentationscheduled", label: "Demo Scheduled", count: 2, value: 12000 },
        { stageId: "closedwon", label: "Closed Won", count: 2, value: 9000 },
      ],
      dealsBySource: [
        { source: "Organic", count: 2, value: 9000, closedWon: 1 },
        { source: "Partner", count: 1, value: 5000, closedWon: 1 },
      ],
    },
    contacts: { totalContacts: 10, recentContacts: 3, bySource: [] },
    deals: [
      {
        dealId: "won-1",
        dealName: "Acme",
        stageId: "closedwon",
        stageLabel: "Closed Won",
        amount: 4000,
        source: "Organic",
        ownerId: "owner-1",
        repName: "Ava",
        updatedAt: "2026-02-03T12:00:00.000Z",
        createdAt: "2026-01-15T00:00:00.000Z",
        closedAt: "2026-02-03T12:00:00.000Z",
        stripeCustomerId: "cus_linked",
        pipelineId: "default",
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: "buyer@example.com",
      },
      {
        dealId: "won-2",
        dealName: "Beta",
        stageId: "closedwon",
        stageLabel: "Closed Won",
        amount: 5000,
        source: "Partner",
        ownerId: "owner-2",
        repName: "Ben",
        updatedAt: "2026-02-11T12:00:00.000Z",
        createdAt: "2026-01-21T00:00:00.000Z",
        closedAt: "2026-02-11T12:00:00.000Z",
        stripeCustomerId: null,
        pipelineId: "default",
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: "lead@beta.example",
      },
      {
        dealId: "open-1",
        dealName: "Gamma",
        stageId: "presentationscheduled",
        stageLabel: "Demo Scheduled",
        amount: 12000,
        source: "Organic",
        ownerId: "owner-1",
        repName: "Ava",
        updatedAt: "2026-02-12T12:00:00.000Z",
        createdAt: "2026-02-01T00:00:00.000Z",
        closedAt: null,
        stripeCustomerId: null,
        pipelineId: "default",
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: null,
      },
    ],
    subscriptionDeals: [
      {
        dealId: "sub-linked",
        dealName: "Linked subscription",
        stageId: "subscription",
        stageLabel: "Subscription",
        amount: 2000,
        source: "HubSpot",
        ownerId: "owner-1",
        repName: "Ava",
        updatedAt: "2026-02-14T00:00:00.000Z",
        createdAt: "2026-02-01T00:00:00.000Z",
        closedAt: null,
        stripeCustomerId: "cus_linked",
        pipelineId: "subscriptions",
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: "buyer@example.com",
      },
      {
        dealId: "sub-hubspot-only",
        dealName: "HubSpot-only subscription",
        stageId: "subscription",
        stageLabel: "Subscription",
        amount: 3000,
        source: "HubSpot",
        ownerId: "owner-2",
        repName: "Ben",
        updatedAt: "2026-02-14T00:00:00.000Z",
        createdAt: "2026-02-01T00:00:00.000Z",
        closedAt: null,
        stripeCustomerId: null,
        pipelineId: "subscriptions",
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: "ops@hubspot-only.example",
      },
    ],
    repScoreboard: [
      {
        ownerId: "owner-1",
        ownerName: "Ava",
        totalDeals: 2,
        totalPipeline: 16000,
        avgDealSize: 8000,
        demos: 2,
        noShows: 0,
        noShowRate: 0,
        wonCount: 1,
        wonRevenue: 4000,
        avgWon: 4000,
        lostCount: 0,
        winRate: 100,
        demoToWonRate: 50,
        churnedWon: 0,
        churnRate: 0,
      },
    ],
    _meta: meta,
  };
}

function makeStripe(): StripeData {
  return {
    revenue: {
      mrr: 10000,
      mrrChange: 500,
      totalRevenue30d: 7500,
      totalRevenuePrev30d: 5000,
      revenueGrowth: 50,
      avgRevenuePerCustomer: 5000,
    },
    subscriptions: {
      active: 2,
      pastDue: 1,
      canceled: 0,
      trialing: 1,
      churnRate: 2,
      recentChurnEvents: [],
      activeCustomerRefs: [
        { customerId: "cus_linked", email: "buyer@example.com", emailDomain: "example.com" },
        { customerId: "cus_other", email: "finance@other.example", emailDomain: "other.example" },
      ],
    },
    payments: { succeeded: 3, failed: 1, successRate: 75 },
    revenueTrend: [
      { month: "2026-02-03", revenue: 2500 },
      { month: "2026-02-12", revenue: 5000 },
    ],
    _meta: meta,
  };
}

function makeMercury(): MercuryData {
  return {
    accounts: [],
    cashFlow: {
      totalBalance: 100000,
      bankCash: 75000,
      treasuryCash: 25000,
      totalCash: 100000,
      inflows30d: 12000,
      outflows30d: 20000,
      netCashFlow: -8000,
      runway: 12.5,
      burnRate: 8000,
    },
    transactions: [
      {
        id: "tx-1",
        postedAt: "2026-02-04T12:00:00.000Z",
        amount: 2000,
        kind: "externalTransfer",
        mercuryCategory: null,
        description: "Customer wire",
        counterpartyName: "Acme",
      },
      {
        id: "tx-2",
        postedAt: "2026-02-13T12:00:00.000Z",
        amount: -3000,
        kind: "cardTransaction",
        mercuryCategory: null,
        description: "Cloud services",
        counterpartyName: "Vendor",
      },
    ],
    _meta: meta,
  };
}

function makeDemoAnalytics(): DemoAnalyticsData {
  return {
    totalScheduled: 3,
    totalCompleted: 2,
    totalNoShows: 1,
    noShowRate: 33.3,
    avgLeadTimeDays: 2,
    upcomingCount: 0,
    meetingBackedUpcomingCount: 0,
    unscheduledDemoCount: 0,
    analyzedDemoCount: 0,
    avgDemoQualityScore: 0,
    transcriptCoveragePct: 0,
    topStrengthThemes: [],
    topGapThemes: [],
    demos: [],
    upcomingDemos: [],
    bySource: [],
    byOutcome: [],
    conversionFunnel: [],
    weeklyTrend: [
      { week: "2026-02-02", scheduled: 2, completed: 1, noShows: 1 },
      { week: "2026-02-09", scheduled: 1, completed: 1, noShows: 0 },
    ],
    journeyPaths: [],
  };
}

function makeSalesPerformance(): SalesPerformancePack {
  return {
    from: "2026-02-01T00:00:00.000Z",
    to: "2026-02-28T23:59:59.999Z",
    generatedAt: "2026-02-17T00:00:00.000Z",
    fromSnapshot: false,
    channelMapping: [],
    repMonthRows: [
      {
        month: "2026-02",
        repName: "Ava",
        leadsCreatedCount: 4,
        opportunitiesCreatedCount: 2,
        leadToOpportunityRate: 0.5,
        signedDealsCount: 1,
        signedDealsBookedValue: 4000,
        avgSignedDealSizeBooked: 4000,
        medianSignedDealSizeBooked: 4000,
        signedDealsRealizedValue30d: 2500,
        bookedToRealizedRatio30d: 0.625,
        opportunityToClosedRate90d: 0.5,
        winRateDecided: 1,
        signedInboundShare: 1,
        signedOutboundShare: 0,
        signedPartnerShare: 0,
        signedProductLedShare: 0,
        signedUnknownShare: 0,
        dataQuality: {
          signedDealsMissingSourcePct: 0,
          signedDealsMissingCloseDatePct: 0,
          signedDealsMissingOwnerPct: 0,
          opportunitiesMissingOwnerPct: 0,
          leadsMissingOwnerPct: 0,
        },
      },
    ],
    repMonthChannelRows: [],
    dealAuditRows: [],
    errors: [],
  };
}

function makeData(overrides: Partial<AnalyticsDashboardData> = {}): AnalyticsDashboardData {
  return {
    hubspot: makeHubSpot(),
    salesPerformance: makeSalesPerformance(),
    stripe: makeStripe(),
    mercury: makeMercury(),
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
    customerJourney: null,
    visitorFunnel: null,
    demoAnalytics: makeDemoAnalytics(),
    processAnalytics: null,
    recommendations: [],
    distilledInsights: [],
    aiInsights: { generatedAt: meta.fetchedAt, global: [], bySection: {} as never },
    freshness: {
      hubspot: {
        provider: "hubspot",
        source: "connection",
        status: "CONNECTED",
        connectedAt: meta.fetchedAt,
        lastSyncedAt: meta.fetchedAt,
        lastError: null,
        stale: false,
        lastSnapshotAt: meta.fetchedAt,
      },
      stripe: {
        provider: "stripe",
        source: "connection",
        status: "CONNECTED",
        connectedAt: meta.fetchedAt,
        lastSyncedAt: meta.fetchedAt,
        lastError: null,
        stale: false,
        lastSnapshotAt: meta.fetchedAt,
      },
      mercury: {
        provider: "mercury",
        source: "connection",
        status: "CONNECTED",
        connectedAt: meta.fetchedAt,
        lastSyncedAt: meta.fetchedAt,
        lastError: null,
        stale: false,
        lastSnapshotAt: meta.fetchedAt,
      },
    },
    staleDomains: [],
    lastFullRefresh: meta.fetchedAt,
    financialPlanning: null,
    metrics: null,
    errors: [],
    ...overrides,
  };
}

describe("buildRevenueDashboardData", () => {
  it("computes investor revenue summary and weekly operating metrics", () => {
    const result = buildRevenueDashboardData(makeData());

    expect(result.summary).toMatchObject({
      activeSubscriptions: 3,
      stripeActiveSubscriptions: 2,
      hubspotActiveSubscriptions: 2,
      mrr: 10250,
      arr: 123000,
      stripeMrr: 10000,
      hubspotOnlySubscriptionMrr: 250,
      excludedLinkedHubspotSubscriptionMrr: 166.67,
      cashBalance: 100000,
      runwayMonths: 12.5,
      burnRate: 8000,
      netCashFlow30d: -8000,
      paymentSuccessPct: 75,
      churnRatePct: 2,
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demosScheduled: 2,
        demosCompleted: 1,
        demoNoShows: 1,
        customersWon: 1,
        stripeRevenueCollected: 2500,
        hubspotBookedRevenue: 4000,
        mercuryInflows: 2000,
        mercuryOutflows: 0,
        mercuryNetCashFlow: 2000,
      },
      {
        week: "2026-02-09",
        demosScheduled: 1,
        demosCompleted: 1,
        demoNoShows: 0,
        customersWon: 1,
        stripeRevenueCollected: 5000,
        hubspotBookedRevenue: 5000,
        mercuryInflows: 0,
        mercuryOutflows: 3000,
        mercuryNetCashFlow: -3000,
      },
    ]);

    expect(result.pipeline).toMatchObject({
      openPipelineValue: 12000,
      openPipelineCount: 1,
      qualifiedPipelineValue: 12000,
      qualifiedPipelineCount: 1,
      winRate: 66.7,
      effectiveWinRate: 50,
      demoFollowUpCount: 2,
      bookedValue: 4000,
      realizedValue30d: 2500,
    });
    expect(result.pipeline.stageBreakdown).toHaveLength(2);
    expect(result.pipeline.repScoreboard[0]?.ownerName).toBe("Ava");
    expect(result.trust.sources.map((source) => source.key)).toEqual(["hubspot", "stripe", "mercury"]);
    expect(result.trust.warnings).toEqual([]);
  });

  it("keeps partial dashboard data visible when providers are missing", () => {
    const result = buildRevenueDashboardData(makeData({ stripe: null, mercury: null }));

    expect(result.summary.mrr).toBe(416.67);
    expect(result.summary.arr).toBe(5000);
    expect(result.summary.activeSubscriptions).toBe(2);
    expect(result.summary.cashBalance).toBe(0);
    expect(result.trust.warnings).toEqual(
      expect.arrayContaining(["Stripe data is unavailable.", "Mercury data is unavailable."]),
    );
  });

  it("normalizes ratio-style Stripe percentages in the revenue summary", () => {
    const stripe = makeStripe();
    stripe.payments.successRate = 0.975;
    stripe.subscriptions.churnRate = 0.04;

    const result = buildRevenueDashboardData(makeData({ stripe }));

    expect(result.summary.paymentSuccessPct).toBe(97.5);
    expect(result.summary.churnRatePct).toBe(4);
  });

  it("normalizes ratio-style HubSpot funnel rates in the revenue pipeline", () => {
    const hubspot = makeHubSpot();
    hubspot.funnel.winRate = 0.667;
    hubspot.funnel.effectiveWinRate = 0.5;
    hubspot.funnel.noShowRate = 0.25;

    const result = buildRevenueDashboardData(makeData({ hubspot }));

    expect(result.pipeline.winRate).toBe(66.7);
    expect(result.pipeline.effectiveWinRate).toBe(50);
    expect(result.pipeline.noShowRate).toBe(25);
  });

  it("builds weekly Mercury rows from the filtered transaction list that backs cash flow totals", () => {
    const mercury = makeMercury();
    mercury.cashFlow = {
      ...mercury.cashFlow,
      inflows30d: 2500,
      outflows30d: 1500,
      netCashFlow: 1000,
      burnRate: 0,
    };
    mercury.transactions = [
      {
        id: "customer-wire",
        postedAt: "2026-02-04T12:00:00.000Z",
        amount: 2500,
        kind: "incomingDomesticWire",
        mercuryCategory: null,
        description: "Customer wire",
        counterpartyName: "Acme",
      },
      {
        id: "vendor-payment",
        postedAt: "2026-02-04T15:00:00.000Z",
        amount: -1500,
        kind: "outgoingPayment",
        mercuryCategory: null,
        description: "Vendor",
        counterpartyName: "Vendor",
      },
    ];

    const result = buildRevenueDashboardData(makeData({ mercury }));
    const mercuryNetFromWeekly = result.weekly.reduce(
      (sum, point) => sum + point.mercuryNetCashFlow,
      0,
    );

    expect(result.summary.netCashFlow30d).toBe(1000);
    expect(mercuryNetFromWeekly).toBe(1000);
    expect(result.weekly.find((point) => point.week === "2026-02-02")).toMatchObject({
      mercuryInflows: 2500,
      mercuryOutflows: 1500,
      mercuryNetCashFlow: 1000,
    });
  });
});

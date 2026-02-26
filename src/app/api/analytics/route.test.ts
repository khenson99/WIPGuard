import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers", () => ({
  fetchHubSpotData: vi.fn(),
  fetchMercuryData: vi.fn(),
  fetchStripeData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-ga-webflow", () => ({
  fetchGAData: vi.fn(),
  fetchWebflowData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-ads", () => ({
  fetchGoogleAdsData: vi.fn(),
  fetchMetaAdsData: vi.fn(),
  fetchMetaPageData: vi.fn(),
  fetchRedditAdsData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-coda", () => ({
  fetchCodaData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-semrush", () => ({
  fetchSemrushData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-pylon", () => ({
  fetchPylonData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-integrations", () => ({
  fetchIntegrationTelemetryData: vi.fn(),
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  readLatestSnapshot: vi.fn(),
  readLatestSuccessfulSnapshot: vi.fn(),
  storeAnalyticsSnapshot: vi.fn(),
  storeAnalyticsSnapshotFailure: vi.fn(),
  snapshotExpiryFromNow: vi.fn(() => new Date("2026-02-10T00:00:00.000Z")),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { count: vi.fn() },
    statusHistory: { findMany: vi.fn() },
    stripeCustomerLink: { findMany: vi.fn() },
  },
}));

const META = { fetchedAt: "2026-02-10T00:00:00.000Z", nextRefresh: "2026-02-10T01:00:00.000Z", source: "live" as const };

const HUBSPOT_DATA = {
  funnel: {
    totalDeals: 2,
    closedWon: 1,
    closedLost: 0,
    unlikely: 0,
    churn: 0,
    activeSubscriptions: 1,
    noShows: 1,
    demoScheduled: 2,
    demoFollowUp: 1,
    avgDealSize: 4000,
    winRate: 50,
    effectiveWinRate: 40,
    noShowRate: 33.3,
    stages: [
      { stageId: "lead", label: "Lead", count: 1, value: 5000 },
      { stageId: "demo", label: "Demo Scheduled", count: 1, value: 3000 },
    ],
    dealsBySource: [{ source: "Organic", count: 2, value: 8000 }],
  },
  contacts: {
    totalContacts: 10,
    recentContacts: 2,
    bySource: [],
  },
  deals: [
    {
      dealId: "deal-1",
      dealName: "Acme Corp",
      stageId: "lead",
      stageLabel: "Lead",
      amount: 5000,
      source: "Organic",
      ownerId: "owner-1",
      updatedAt: "2026-02-10T00:00:00.000Z",
    },
    {
      dealId: "deal-2",
      dealName: "Beta LLC",
      stageId: "demo",
      stageLabel: "Demo Scheduled",
      amount: 3000,
      source: "Paid",
      ownerId: "owner-2",
      updatedAt: "2026-02-11T00:00:00.000Z",
    },
  ],
  _meta: META,
};

const STRIPE_DATA = {
  revenue: {
    mrr: 12000,
    mrrChange: 2,
    totalRevenue30d: 15000,
    totalRevenuePrev30d: 14000,
    revenueGrowth: 7.1,
    avgRevenuePerCustomer: 600,
  },
  subscriptions: {
    active: 20,
    pastDue: 1,
    canceled: 0,
    trialing: 2,
    churnRate: 0.02,
    recentChurnEvents: [],
  },
  payments: {
    succeeded: 100,
    failed: 2,
    successRate: 0.98,
  },
  revenueTrend: [],
  _meta: META,
};

const MERCURY_DATA = {
  accounts: [],
  cashFlow: {
    totalBalance: 20000,
    inflows30d: 5000,
    outflows30d: 6000,
    netCashFlow: -1000,
    runway: 5,
    burnRate: 1000,
  },
  _meta: META,
};

const GA_DATA = {
  sessions30d: 1000,
  sessionsPrev30d: 900,
  users30d: 700,
  usersPrev30d: 600,
  pageviews30d: 1200,
  pageviewsPrev30d: 1100,
  bounceRate: 0.5,
  avgSessionDuration: 60,
  trafficByChannel: [],
  topPages: [],
  dailyTrend: [],
  _meta: META,
};

const GOOGLE_ADS_DATA = {
  totalSpend30d: 1000,
  totalImpressions: 10000,
  totalClicks: 200,
  totalConversions: 10,
  ctr: 2,
  cpc: 5,
  cpa: 100,
  roas: 1,
  campaigns: [],
  _meta: META,
};

const META_ADS_DATA = {
  totalSpend30d: 500,
  totalImpressions: 6000,
  totalClicks: 120,
  totalConversions: 6,
  ctr: 2,
  cpc: 4,
  cpa: 80,
  campaigns: [],
  _meta: META,
};

const REDDIT_ADS_DATA = {
  totalSpend30d: 300,
  totalImpressions: 4000,
  totalClicks: 80,
  ctr: 2,
  cpc: 3,
  campaigns: [],
  _meta: META,
};

const WEBFLOW_DATA = {
  siteName: "Test Site",
  lastPublished: "2026-02-01T00:00:00.000Z",
  totalPages: 5,
  totalCollections: 2,
  formSubmissions: [],
  customDomains: [],
  _meta: META,
};

const CODA_DATA = {
  totalCards: 0,
  cardsByStatus: [],
  recentCards: [],
  _meta: META,
};

const SEMRUSH_DATA = {
  domain: "example.com",
  authorityScore: 10,
  backlinks: 20,
  organicKeywords: 5,
  organicTraffic: 100,
  organicTrafficCost: 50,
  paidKeywords: 0,
  paidTraffic: 0,
  paidTrafficCost: 0,
  topKeywords: [],
  organicCompetitors: [],
  _meta: META,
};

const PYLON_DATA = {
  openConversations: 5,
  urgentConversations: 1,
  waitingOnTeam: 1,
  resolvedInRange: 5,
  avgFirstResponseMinutes: 10,
  csat: 4.5,
  _meta: META,
};

const TELEMETRY_DATA = {
  provider: "slack",
  totalRules: 1,
  enabledRules: 1,
  erroredRules: 0,
  receiptsInRange: 1,
  tasksCreatedInRange: 1,
  eventsInRange: 1,
  failuresInRange: 0,
  trend: [],
  topFailureReasons: [],
  _meta: META,
};

function freshness(provider: IntegrationProvider) {
  return {
    provider,
    source: "connection" as const,
    status: null,
    connectedAt: null,
    lastSyncedAt: null,
    lastError: null,
  };
}

describe("GET /api/analytics", () => {
  beforeEach(async () => {
    vi.resetAllMocks();

    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    } as never);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    vi.mocked(getCredentials).mockResolvedValue({
      hubspotToken: "hubspot",
      stripeKey: "stripe",
      mercuryKey: "mercury",
      gaPropertyId: "ga-prop",
      gaClientEmail: "ga@example.com",
      gaPrivateKey: "ga-key",
      googleAdsDevToken: "ads-dev",
      googleAdsCustomerId: "ads-customer",
      googleAdsRefreshToken: "ads-refresh",
      googleAdsClientId: "ads-client",
      googleAdsClientSecret: "ads-secret",
      googleAdsLoginCustomerId: null,
      metaAccessToken: "meta-token",
      metaAdAccountId: "meta-ad",
      metaPageId: "meta-page",
      metaInstagramAccountId: null,
      redditClientId: "reddit-client",
      redditClientSecret: "reddit-secret",
      redditRefreshToken: "reddit-refresh",
      redditAdAccountId: "reddit-account",
      redditUserAgent: "ua",
      webflowApiToken: "webflow-token",
      webflowSiteId: "webflow-site",
      semrushApiToken: "semrush-token",
      semrushDomain: "example.com",
      codaApiToken: "coda-token",
      codaDocId: "coda-doc",
      pylonApiKey: "pylon-token",
      googleWorkspaceAccessToken: "workspace-token",
      slackAccessToken: "slack-token",
      freshness: {
        [IntegrationProvider.GOOGLE_WORKSPACE]: freshness(IntegrationProvider.GOOGLE_WORKSPACE),
        [IntegrationProvider.HUBSPOT]: freshness(IntegrationProvider.HUBSPOT),
        [IntegrationProvider.SLACK]: freshness(IntegrationProvider.SLACK),
        [IntegrationProvider.CODA]: freshness(IntegrationProvider.CODA),
        [IntegrationProvider.REDDIT]: freshness(IntegrationProvider.REDDIT),
        [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE),
        [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY),
        [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW),
        [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS),
        [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS),
        [IntegrationProvider.META_PAGE]: freshness(IntegrationProvider.META_PAGE),
        [IntegrationProvider.PYLON]: freshness(IntegrationProvider.PYLON),
      },
    } as never);

    const { fetchHubSpotData, fetchMercuryData, fetchStripeData } = await import("@/lib/analytics/fetchers");
    vi.mocked(fetchHubSpotData).mockResolvedValue(HUBSPOT_DATA as never);
    vi.mocked(fetchMercuryData).mockResolvedValue(MERCURY_DATA as never);
    vi.mocked(fetchStripeData).mockResolvedValue(STRIPE_DATA as never);

    const { fetchGAData, fetchWebflowData } = await import("@/lib/analytics/fetchers-ga-webflow");
    vi.mocked(fetchGAData).mockResolvedValue(GA_DATA as never);
    vi.mocked(fetchWebflowData).mockResolvedValue(WEBFLOW_DATA as never);

    const { fetchGoogleAdsData, fetchMetaAdsData, fetchMetaPageData, fetchRedditAdsData } = await import("@/lib/analytics/fetchers-ads");
    vi.mocked(fetchGoogleAdsData).mockResolvedValue(GOOGLE_ADS_DATA as never);
    vi.mocked(fetchMetaAdsData).mockResolvedValue(META_ADS_DATA as never);
    vi.mocked(fetchMetaPageData).mockResolvedValue({ pageLikes: 0, pageFollowers: 0, postReach30d: 0, postEngagement30d: 0, topPosts: [], _meta: META } as never);
    vi.mocked(fetchRedditAdsData).mockResolvedValue(REDDIT_ADS_DATA as never);

    const { fetchCodaData } = await import("@/lib/analytics/fetchers-coda");
    vi.mocked(fetchCodaData).mockResolvedValue(CODA_DATA as never);

    const { fetchSemrushData } = await import("@/lib/analytics/fetchers-semrush");
    vi.mocked(fetchSemrushData).mockResolvedValue(SEMRUSH_DATA as never);

    const { fetchPylonData } = await import("@/lib/analytics/fetchers-pylon");
    vi.mocked(fetchPylonData).mockResolvedValue(PYLON_DATA as never);

    const { fetchIntegrationTelemetryData } = await import("@/lib/analytics/fetchers-integrations");
    vi.mocked(fetchIntegrationTelemetryData).mockResolvedValue(TELEMETRY_DATA as never);

    const { readLatestSnapshot, readLatestSuccessfulSnapshot } = await import("@/lib/analytics/snapshots");
    vi.mocked(readLatestSnapshot).mockResolvedValue({
      payload: null,
      capturedAt: null,
      expiresAt: null,
      stale: false,
      fromSnapshot: false,
      status: null,
      error: null,
    } as never);
    vi.mocked(readLatestSuccessfulSnapshot).mockResolvedValue({
      payload: null,
      capturedAt: null,
      expiresAt: null,
      stale: false,
      fromSnapshot: false,
      status: null,
      error: null,
    } as never);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.task.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.statusHistory.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.stripeCustomerLink.findMany).mockResolvedValue([
      {
        id: "link-1",
        userId: "user-1",
        stripeCustomerId: "cus_123",
        hubspotDealId: "deal-1",
        hubspotDealName: "Acme Corp",
      },
    ] as never);
  });

  it("returns customer journey domain data", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=customer-journey"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.customerJourney).toBeTruthy();
    expect(body.customerJourney.journeys.length).toBeGreaterThan(0);
  });

  it("returns demo analytics domain data", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=demo-analytics"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.demoAnalytics).toBeTruthy();
    expect(body.demoAnalytics.totalScheduled).toBeGreaterThan(0);
  });

  it("hydrates stripe customer links onto hubspot deals", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=demo-analytics"));
    const body = await response.json();

    const deal = body.hubspot.deals.find((entry: { dealId: string }) => entry.dealId === "deal-1");
    expect(deal.stripeCustomerId).toBe("cus_123");
  });

  it("returns process analytics domain data", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=process-analytics"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processAnalytics).toBeTruthy();
    expect(body.processAnalytics.healthScore).toBeGreaterThanOrEqual(0);
  });

  it("does not time out stripe at the default 8.5s budget", async () => {
    vi.useFakeTimers();

    try {
      const { fetchStripeData } = await import("@/lib/analytics/fetchers");
      vi.mocked(fetchStripeData).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(STRIPE_DATA as never), 9_000);
          }) as never
      );

      const { GET } = await import("@/app/api/analytics/route");
      const responsePromise = GET(
        new Request("http://localhost/api/analytics?section=finance-stripe")
      );

      await vi.advanceTimersByTimeAsync(9_000);

      const response = await responsePromise;
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.stripe).toBeTruthy();
      expect(
        body.errors.some((entry: { source: string }) => entry.source === "stripe")
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

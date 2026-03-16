import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOwnerUserId: vi.fn((userId: string) => {
    const owner = process.env.INTEGRATION_OWNER_USER_ID?.trim();
    return owner && owner.length > 0 ? owner : userId;
  }),
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
    user: { findUnique: vi.fn() },
    securityAuditEvent: { create: vi.fn() },
    task: { count: vi.fn() },
    statusHistory: { findMany: vi.fn() },
    stripeCustomerLink: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
    financialGoal: { findMany: vi.fn() },
    forecastScenario: { findMany: vi.fn() },
    dealMeeting: { findMany: vi.fn() },
    automationArtifact: { findMany: vi.fn() },
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

const ZERO_STRIPE_DATA = {
  revenue: {
    mrr: 0,
    mrrChange: 0,
    totalRevenue30d: 0,
    totalRevenuePrev30d: 0,
    revenueGrowth: 0,
    avgRevenuePerCustomer: 0,
  },
  subscriptions: {
    active: 0,
    pastDue: 0,
    canceled: 0,
    trialing: 0,
    churnRate: 0,
    recentChurnEvents: [],
  },
  payments: {
    succeeded: 0,
    failed: 0,
    successRate: 0,
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
        [IntegrationProvider.GOOGLE_ANALYTICS]: freshness(IntegrationProvider.GOOGLE_ANALYTICS),
        [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE),
        [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY),
        [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW),
        [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS),
        [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS),
        [IntegrationProvider.META_PAGE]: freshness(IntegrationProvider.META_PAGE),
        [IntegrationProvider.SEMRUSH]: freshness(IntegrationProvider.SEMRUSH),
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
      needsRefresh: false,
      stale: false,
      fromSnapshot: false,
      status: null,
      error: null,
    } as never);
    vi.mocked(readLatestSuccessfulSnapshot).mockResolvedValue({
      payload: null,
      capturedAt: null,
      expiresAt: null,
      needsRefresh: false,
      stale: false,
      fromSnapshot: false,
      status: null,
      error: null,
    } as never);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: "member",
      organizationId: "org-1",
    } as never);
    vi.mocked(prisma.securityAuditEvent.create).mockResolvedValue({} as never);
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
    vi.mocked(prisma.budget.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.financialGoal.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.forecastScenario.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.dealMeeting.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.automationArtifact.findMany).mockResolvedValue([] as never);
  });

  it("returns 403 when analytics read permission is denied", async () => {
    const { getCredentials } = await import("@/lib/analytics/credentials");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ role: "observer" } as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics"));

    expect(response.status).toBe(403);
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it("returns customer journey domain data", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=customer-journey"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.customerJourney).toBeTruthy();
    expect(body.customerJourney.journeys.length).toBeGreaterThan(0);
  });

  it("treats ai-insights as a full-domain analytics request", async () => {
    const { fetchGoogleAdsData, fetchMetaAdsData, fetchRedditAdsData } = await import("@/lib/analytics/fetchers-ads");
    const { fetchWebflowData } = await import("@/lib/analytics/fetchers-ga-webflow");
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=ai-insights&refresh=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchGoogleAdsData).toHaveBeenCalled();
    expect(fetchMetaAdsData).toHaveBeenCalled();
    expect(fetchRedditAdsData).toHaveBeenCalled();
    expect(fetchWebflowData).toHaveBeenCalled();
    expect(body.meta?.section).toBe("ai-insights");
    expect(body.meta?.forceRefresh).toBe(true);
    expect(body.aiInsights).toBeTruthy();
  });

  it("omits removed customer-success product analytics", async () => {
    const { getServerSession } = await import("next-auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    } as never);

    vi.mocked(prisma.task.count).mockResolvedValue(0 as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=customer-success"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.product).toBeNull();
    expect(prisma.task.count).not.toHaveBeenCalled();
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
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=demo-analytics"));
    const body = await response.json();

    const deal = body.hubspot.deals.find((entry: { dealId: string }) => entry.dealId === "deal-1");
    expect(deal.stripeCustomerId).toBe("cus_123");
    expect(prisma.stripeCustomerLink.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("dedupes merged active subscriptions by unique customer identity", async () => {
    const { fetchHubSpotData, fetchStripeData } = await import("@/lib/analytics/fetchers");
    vi.mocked(fetchHubSpotData).mockResolvedValue({
      ...HUBSPOT_DATA,
      funnel: {
        ...HUBSPOT_DATA.funnel,
        activeSubscriptions: 3,
      },
      deals: [
        {
          dealId: "deal-sub-1",
          dealName: "Acme Subscription",
          stageId: "subscription",
          stageLabel: "Subscription",
          amount: 5000,
          source: "Organic",
          ownerId: "owner-1",
          updatedAt: "2026-02-10T00:00:00.000Z",
          stripeCustomerId: "cus_dup",
          primaryContactEmail: "ops@acme.com",
        },
        {
          dealId: "deal-sub-2",
          dealName: "Beta Subscription",
          stageId: "subscription",
          stageLabel: "Subscription",
          amount: 3000,
          source: "Paid",
          ownerId: "owner-2",
          updatedAt: "2026-02-11T00:00:00.000Z",
          stripeCustomerId: null,
          primaryContactEmail: "owner@beta.io",
        },
        {
          dealId: "deal-sub-3",
          dealName: "Gamma Subscription",
          stageId: "subscription",
          stageLabel: "Subscription",
          amount: 2000,
          source: "Referral",
          ownerId: "owner-3",
          updatedAt: "2026-02-12T00:00:00.000Z",
          stripeCustomerId: null,
          primaryContactEmail: "team@gamma.io",
        },
      ],
    } as never);
    vi.mocked(fetchStripeData).mockResolvedValue({
      ...STRIPE_DATA,
      subscriptions: {
        ...STRIPE_DATA.subscriptions,
        active: 3,
        activeCustomerRefs: [
          { customerId: "cus_dup", email: "ops@acme.com", emailDomain: "acme.com" },
          { customerId: "cus_dup", email: "billing@acme.com", emailDomain: "acme.com" },
          { customerId: "cus_beta", email: "owner@beta.io", emailDomain: "beta.io" },
        ],
      },
    } as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=finance"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.financialPlanning.subscriptionOverview).toEqual({
      mergedActiveSubscriptions: 3,
      stripeActiveSubscriptions: 3,
      hubspotActiveSubscriptions: 3,
    });
  });

  it("keeps budget category actuals unavailable until spend is mapped to budget lines", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      {
        id: "budget-1",
        name: "Operating Plan",
        period: "MONTHLY",
        startDate: new Date("2026-02-01T00:00:00.000Z"),
        endDate: new Date("2026-02-28T00:00:00.000Z"),
        lineItems: [
          {
            id: "line-1",
            category: "MARKETING",
            plannedAmount: 5000,
            notes: null,
          },
          {
            id: "line-2",
            category: "PAYROLL",
            plannedAmount: 12000,
            notes: null,
          },
        ],
      },
    ] as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=finance"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.financialPlanning.activeBudget.totalActual).toBeNull();
    expect(body.financialPlanning.activeBudget.totalVariance).toBeNull();
    expect(body.financialPlanning.activeBudget.lineItems).toEqual([
      expect.objectContaining({
        id: "line-1",
        category: "marketing",
        plannedAmount: 5000,
        actualAmount: null,
        variance: null,
        variancePct: null,
      }),
      expect.objectContaining({
        id: "line-2",
        category: "payroll",
        plannedAmount: 12000,
        actualAmount: null,
        variance: null,
        variancePct: null,
      }),
    ]);
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

  it("falls back to the env stripe key when the connection-backed account is empty", async () => {
    const previousStripeSecretKey = process.env.STRIPE_SECRET_KEY;

    try {
      process.env.STRIPE_SECRET_KEY = "stripe-env";

      const { getCredentials } = await import("@/lib/analytics/credentials");
      vi.mocked(getCredentials).mockResolvedValue({
        hubspotToken: "hubspot",
        stripeKey: "stripe-connection",
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
        pylonBaseUrl: null,
        googleWorkspaceAccessToken: "workspace-token",
        slackAccessToken: "slack-token",
        freshness: {
          [IntegrationProvider.GOOGLE_WORKSPACE]: freshness(IntegrationProvider.GOOGLE_WORKSPACE),
          [IntegrationProvider.HUBSPOT]: freshness(IntegrationProvider.HUBSPOT),
          [IntegrationProvider.SLACK]: freshness(IntegrationProvider.SLACK),
          [IntegrationProvider.CODA]: freshness(IntegrationProvider.CODA),
          [IntegrationProvider.REDDIT]: freshness(IntegrationProvider.REDDIT),
          [IntegrationProvider.GOOGLE_ANALYTICS]: freshness(IntegrationProvider.GOOGLE_ANALYTICS),
          [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE),
          [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY),
          [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW),
          [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS),
          [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS),
          [IntegrationProvider.META_PAGE]: freshness(IntegrationProvider.META_PAGE),
          [IntegrationProvider.SEMRUSH]: freshness(IntegrationProvider.SEMRUSH),
          [IntegrationProvider.PYLON]: freshness(IntegrationProvider.PYLON),
        },
      } as never);

      const { fetchStripeData } = await import("@/lib/analytics/fetchers");
      vi.mocked(fetchStripeData)
        .mockResolvedValueOnce(ZERO_STRIPE_DATA as never)
        .mockResolvedValueOnce(STRIPE_DATA as never);

      const { GET } = await import("@/app/api/analytics/route");
      const response = await GET(
        new Request("http://localhost/api/analytics?section=finance-stripe")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.stripe).toEqual(STRIPE_DATA);
      expect(body.freshness.stripe.source).toBe("env");
      expect(fetchStripeData).toHaveBeenNthCalledWith(
        1,
        "stripe-connection",
        expect.objectContaining({})
      );
      expect(fetchStripeData).toHaveBeenNthCalledWith(
        2,
        "stripe-env",
        expect.objectContaining({})
      );
    } finally {
      if (previousStripeSecretKey === undefined) {
        delete process.env.STRIPE_SECRET_KEY;
      } else {
        process.env.STRIPE_SECRET_KEY = previousStripeSecretKey;
      }
    }
  });

  it("fetches Google Analytics with OAuth credentials when no service account is configured", async () => {
    const { getCredentials } = await import("@/lib/analytics/credentials");
    const { fetchGAData } = await import("@/lib/analytics/fetchers-ga-webflow");

    vi.mocked(getCredentials).mockResolvedValue({
      hubspotToken: null,
      stripeKey: null,
      mercuryKey: null,
      gaPropertyId: "ga-prop",
      gaClientEmail: null,
      gaPrivateKey: null,
      googleAdsDevToken: null,
      googleAdsCustomerId: null,
      googleAdsRefreshToken: null,
      googleAdsClientId: null,
      googleAdsClientSecret: null,
      googleAdsLoginCustomerId: null,
      metaAccessToken: null,
      metaAdAccountId: null,
      metaPageId: null,
      metaInstagramAccountId: null,
      redditClientId: null,
      redditClientSecret: null,
      redditRefreshToken: null,
      redditAdAccountId: null,
      redditUserAgent: null,
      webflowApiToken: null,
      webflowSiteId: null,
      semrushApiToken: null,
      semrushDomain: null,
      codaApiToken: null,
      codaDocId: null,
      pylonApiKey: null,
      pylonBaseUrl: null,
      googleWorkspaceAccessToken: null,
      slackAccessToken: null,
      freshness: {
        [IntegrationProvider.GOOGLE_WORKSPACE]: freshness(IntegrationProvider.GOOGLE_WORKSPACE),
        [IntegrationProvider.HUBSPOT]: freshness(IntegrationProvider.HUBSPOT),
        [IntegrationProvider.SLACK]: freshness(IntegrationProvider.SLACK),
        [IntegrationProvider.CODA]: freshness(IntegrationProvider.CODA),
        [IntegrationProvider.REDDIT]: freshness(IntegrationProvider.REDDIT),
        [IntegrationProvider.GOOGLE_ANALYTICS]: freshness(IntegrationProvider.GOOGLE_ANALYTICS),
        [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE),
        [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY),
        [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW),
        [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS),
        [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS),
        [IntegrationProvider.META_PAGE]: freshness(IntegrationProvider.META_PAGE),
        [IntegrationProvider.SEMRUSH]: freshness(IntegrationProvider.SEMRUSH),
        [IntegrationProvider.PYLON]: freshness(IntegrationProvider.PYLON),
      },
    } as never);

    vi.mocked(fetchGAData).mockResolvedValue(GA_DATA as never);

    const previousRefreshToken = process.env.GA_REFRESH_TOKEN;
    const previousClientId = process.env.GOOGLE_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    process.env.GA_REFRESH_TOKEN = "ga-refresh";
    process.env.GOOGLE_CLIENT_ID = "google-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";

    try {
      const { GET } = await import("@/app/api/analytics/route");
      const response = await GET(
        new Request("http://localhost/api/analytics?section=ads-google-analytics")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.googleAnalytics).toEqual(GA_DATA);
      expect(fetchGAData).toHaveBeenCalledWith(
        "ga-prop",
        "",
        "",
        expect.objectContaining({})
      );
    } finally {
      if (previousRefreshToken === undefined) {
        delete process.env.GA_REFRESH_TOKEN;
      } else {
        process.env.GA_REFRESH_TOKEN = previousRefreshToken;
      }
      if (previousClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = previousClientId;
      }
      if (previousClientSecret === undefined) {
        delete process.env.GOOGLE_CLIENT_SECRET;
      } else {
        process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
      }
    }
  });

  it("resolves integration credentials, snapshots, and telemetry through the shared owner", async () => {
    const previousOwner = process.env.INTEGRATION_OWNER_USER_ID;
    process.env.INTEGRATION_OWNER_USER_ID = "owner-1";

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const { readLatestSnapshot, storeAnalyticsSnapshot } = await import("@/lib/analytics/snapshots");
    const { fetchIntegrationTelemetryData } = await import("@/lib/analytics/fetchers-integrations");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(getCredentials).mockImplementation(async (requestedUserId?: string) => {
      if (requestedUserId !== "owner-1") {
        return {
          hubspotToken: null,
          stripeKey: null,
          mercuryKey: null,
          gaPropertyId: null,
          gaClientEmail: null,
          gaPrivateKey: null,
          googleAdsDevToken: null,
          googleAdsCustomerId: null,
          googleAdsRefreshToken: null,
          googleAdsClientId: null,
          googleAdsClientSecret: null,
          googleAdsLoginCustomerId: null,
          metaAccessToken: null,
          metaAdAccountId: null,
          metaPageId: null,
          metaInstagramAccountId: null,
          redditClientId: null,
          redditClientSecret: null,
          redditRefreshToken: null,
          redditAdAccountId: null,
          redditUserAgent: null,
          webflowApiToken: null,
          webflowSiteId: null,
          semrushApiToken: null,
          semrushDomain: null,
          codaApiToken: null,
          codaDocId: null,
          pylonApiKey: null,
          pylonBaseUrl: null,
          googleWorkspaceAccessToken: null,
          slackAccessToken: null,
          freshness: {
            [IntegrationProvider.GOOGLE_WORKSPACE]: freshness(IntegrationProvider.GOOGLE_WORKSPACE),
            [IntegrationProvider.HUBSPOT]: freshness(IntegrationProvider.HUBSPOT),
            [IntegrationProvider.SLACK]: freshness(IntegrationProvider.SLACK),
            [IntegrationProvider.CODA]: freshness(IntegrationProvider.CODA),
            [IntegrationProvider.REDDIT]: freshness(IntegrationProvider.REDDIT),
            [IntegrationProvider.GOOGLE_ANALYTICS]: freshness(IntegrationProvider.GOOGLE_ANALYTICS),
            [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE),
            [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY),
            [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW),
            [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS),
            [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS),
            [IntegrationProvider.META_PAGE]: freshness(IntegrationProvider.META_PAGE),
            [IntegrationProvider.SEMRUSH]: freshness(IntegrationProvider.SEMRUSH),
            [IntegrationProvider.PYLON]: freshness(IntegrationProvider.PYLON),
          },
        } as never;
      }

      return {
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
        pylonBaseUrl: null,
        googleWorkspaceAccessToken: "workspace-token",
        slackAccessToken: "slack-token",
        freshness: {
          [IntegrationProvider.GOOGLE_WORKSPACE]: freshness(IntegrationProvider.GOOGLE_WORKSPACE),
          [IntegrationProvider.HUBSPOT]: freshness(IntegrationProvider.HUBSPOT),
          [IntegrationProvider.SLACK]: freshness(IntegrationProvider.SLACK),
          [IntegrationProvider.CODA]: freshness(IntegrationProvider.CODA),
          [IntegrationProvider.REDDIT]: freshness(IntegrationProvider.REDDIT),
          [IntegrationProvider.GOOGLE_ANALYTICS]: freshness(IntegrationProvider.GOOGLE_ANALYTICS),
          [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE),
          [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY),
          [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW),
          [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS),
          [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS),
          [IntegrationProvider.META_PAGE]: freshness(IntegrationProvider.META_PAGE),
          [IntegrationProvider.SEMRUSH]: freshness(IntegrationProvider.SEMRUSH),
          [IntegrationProvider.PYLON]: freshness(IntegrationProvider.PYLON),
        },
      } as never;
    });

    try {
      const { GET } = await import("@/app/api/analytics/route");
      const response = await GET(new Request("http://localhost/api/analytics"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.stripe).toEqual(STRIPE_DATA);
      expect(getCredentials).toHaveBeenCalledWith("owner-1");
      expect(prisma.stripeCustomerLink.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });

      expect(
        vi.mocked(readLatestSnapshot).mock.calls.some(
          ([input]) => input.userId === "owner-1" && input.providerKey === "stripe"
        )
      ).toBe(true);
      expect(
        vi.mocked(readLatestSnapshot).mock.calls.some(
          ([input]) => input.userId === "owner-1" && input.providerKey === "googleWorkspace"
        )
      ).toBe(true);
      expect(
        vi.mocked(readLatestSnapshot).mock.calls.some(
          ([input]) => input.providerKey === "product"
        )
      ).toBe(false);

      expect(
        vi.mocked(storeAnalyticsSnapshot).mock.calls.some(
          ([input]) => input.userId === "owner-1" && input.providerKey === "stripe"
        )
      ).toBe(true);
      expect(
        vi.mocked(storeAnalyticsSnapshot).mock.calls.some(
          ([input]) => input.providerKey === "product"
        )
      ).toBe(false);

      expect(vi.mocked(fetchIntegrationTelemetryData).mock.calls.length).toBeGreaterThan(0);
      expect(
        vi.mocked(fetchIntegrationTelemetryData).mock.calls.every(
          ([input]) => input.userId === "owner-1"
        )
      ).toBe(true);
    } finally {
      if (previousOwner === undefined) {
        delete process.env.INTEGRATION_OWNER_USER_ID;
      } else {
        process.env.INTEGRATION_OWNER_USER_ID = previousOwner;
      }
    }
  });

  it("keeps analytics credential resolution per-user when no shared owner is configured", async () => {
    const previousOwner = process.env.INTEGRATION_OWNER_USER_ID;
    delete process.env.INTEGRATION_OWNER_USER_ID;

    try {
      const { getCredentials } = await import("@/lib/analytics/credentials");
      const { GET } = await import("@/app/api/analytics/route");

      const response = await GET(
        new Request("http://localhost/api/analytics?section=finance")
      );
      expect(response.status).toBe(200);
      expect(getCredentials).toHaveBeenCalledWith("user-1");
    } finally {
      if (previousOwner === undefined) {
        delete process.env.INTEGRATION_OWNER_USER_ID;
      } else {
        process.env.INTEGRATION_OWNER_USER_ID = previousOwner;
      }
    }
  });
  it("reads provider-backed analytics using the integration owner user", async () => {
    const previousOwner = process.env.INTEGRATION_OWNER_USER_ID;
    process.env.INTEGRATION_OWNER_USER_ID = "owner-mercury";

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const { readLatestSnapshot } = await import("@/lib/analytics/snapshots");

    try {
      vi.mocked(readLatestSnapshot).mockResolvedValueOnce({
        payload: MERCURY_DATA,
        capturedAt: "2026-02-10T00:00:00.000Z",
        expiresAt: "2026-02-10T01:00:00.000Z",
        needsRefresh: false,
        stale: false,
        fromSnapshot: true,
        status: "SUCCESS",
        error: null,
      } as never);

      const { GET } = await import("@/app/api/analytics/route");
      const response = await GET(
        new Request("http://localhost/api/analytics?section=finance-mercury")
      );

      expect(response.status).toBe(200);
      expect(getCredentials).toHaveBeenCalledWith("owner-mercury");
      expect(readLatestSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "owner-mercury",
          providerKey: "mercury",
        }),
      );
    } finally {
      if (previousOwner === undefined) {
        delete process.env.INTEGRATION_OWNER_USER_ID;
      } else {
        process.env.INTEGRATION_OWNER_USER_ID = previousOwner;
      }
    }
  });

  it("live-fetches finance-critical Mercury data even when a snapshot exists", async () => {
    const previousOwner = process.env.INTEGRATION_OWNER_USER_ID;
    process.env.INTEGRATION_OWNER_USER_ID = "owner-mercury";

    const staleMercury = {
      ...MERCURY_DATA,
      cashFlow: {
        ...MERCURY_DATA.cashFlow,
        totalBalance: 1000,
        runway: 1,
      },
    };
    const liveMercury = {
      ...MERCURY_DATA,
      cashFlow: {
        ...MERCURY_DATA.cashFlow,
        totalBalance: 3000000,
        runway: 3000,
      },
    };

    const { readLatestSnapshot, storeAnalyticsSnapshot } = await import("@/lib/analytics/snapshots");
    const { fetchMercuryData } = await import("@/lib/analytics/fetchers");

    try {
      vi.mocked(readLatestSnapshot).mockResolvedValueOnce({
        payload: staleMercury,
        capturedAt: "2026-02-10T00:00:00.000Z",
        expiresAt: "2026-02-10T01:00:00.000Z",
        needsRefresh: false,
        stale: false,
        fromSnapshot: true,
        status: "SUCCESS",
        error: null,
      } as never);
      vi.mocked(fetchMercuryData).mockResolvedValueOnce(liveMercury as never);

      const { GET } = await import("@/app/api/analytics/route");
      const response = await GET(
        new Request("http://localhost/api/analytics?section=finance-mercury")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.mercury.cashFlow.totalBalance).toBe(3000000);
      expect(body.mercury.cashFlow.runway).toBe(3000);
      expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "owner-mercury",
          providerKey: "mercury",
          payload: liveMercury,
        }),
      );
    } finally {
      if (previousOwner === undefined) {
        delete process.env.INTEGRATION_OWNER_USER_ID;
      } else {
        process.env.INTEGRATION_OWNER_USER_ID = previousOwner;
      }
    }
  });

  it("falls back to the last successful finance snapshot when the live fetch fails", async () => {
    const previousOwner = process.env.INTEGRATION_OWNER_USER_ID;
    process.env.INTEGRATION_OWNER_USER_ID = "owner-mercury";

    const fallbackMercury = {
      ...MERCURY_DATA,
      cashFlow: {
        ...MERCURY_DATA.cashFlow,
        totalBalance: 250000,
        runway: 250,
      },
    };

    const { readLatestSnapshot, readLatestSuccessfulSnapshot, storeAnalyticsSnapshotFailure } =
      await import("@/lib/analytics/snapshots");
    const { fetchMercuryData } = await import("@/lib/analytics/fetchers");

    try {
      vi.mocked(readLatestSnapshot).mockResolvedValueOnce({
        payload: MERCURY_DATA,
        capturedAt: "2026-02-10T00:00:00.000Z",
        expiresAt: "2026-02-10T01:00:00.000Z",
        needsRefresh: false,
        stale: false,
        fromSnapshot: true,
        status: "SUCCESS",
        error: null,
      } as never);
      vi.mocked(fetchMercuryData).mockRejectedValueOnce(new Error("Mercury timeout"));
      vi.mocked(readLatestSuccessfulSnapshot).mockResolvedValueOnce({
        payload: fallbackMercury,
        capturedAt: "2026-02-10T00:00:00.000Z",
        expiresAt: "2026-02-10T01:00:00.000Z",
        needsRefresh: false,
        stale: true,
        fromSnapshot: true,
        status: "SUCCESS",
        error: null,
      } as never);

      const { GET } = await import("@/app/api/analytics/route");
      const response = await GET(
        new Request("http://localhost/api/analytics?section=finance-mercury")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.mercury.cashFlow.totalBalance).toBe(250000);
      expect(body.staleDomains).toContain("mercury");
      expect(body.errors).toContainEqual(
        expect.objectContaining({
          source: "mercury",
          message: "Mercury timeout",
        }),
      );
      expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "owner-mercury",
          providerKey: "mercury",
          error: "Mercury timeout",
        }),
      );
    } finally {
      if (previousOwner === undefined) {
        delete process.env.INTEGRATION_OWNER_USER_ID;
      } else {
        process.env.INTEGRATION_OWNER_USER_ID = previousOwner;
      }
    }
  });

  it("keeps non-finance domains snapshot-first on normal requests", async () => {
    const snapshotGa = {
      ...GA_DATA,
      sessions30d: 4321,
    };

    const { readLatestSnapshot } = await import("@/lib/analytics/snapshots");
    const { fetchGAData } = await import("@/lib/analytics/fetchers-ga-webflow");

    vi.mocked(readLatestSnapshot).mockResolvedValueOnce({
      payload: snapshotGa,
      capturedAt: "2026-02-10T00:00:00.000Z",
      expiresAt: "2026-02-10T01:00:00.000Z",
      needsRefresh: false,
      stale: false,
      fromSnapshot: true,
      status: "SUCCESS",
      error: null,
    } as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(
      new Request("http://localhost/api/analytics?section=ads-google-analytics")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.googleAnalytics.sessions30d).toBe(4321);
    expect(fetchGAData).not.toHaveBeenCalled();
  });
});

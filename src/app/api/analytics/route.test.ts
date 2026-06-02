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

vi.mock("@/lib/analytics/fetchers-google-search-console", () => ({
  fetchGoogleSearchConsoleData: vi.fn(),
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

vi.mock("@/lib/analytics/fetchers-development", () => ({
  fetchPostHogData: vi.fn(),
  fetchLinearData: vi.fn(),
  fetchGitHubData: vi.fn(),
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

vi.mock("@/lib/imladris/ingestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imladris/ingestion")>();
  return {
    ...actual,
    ingestImladrisRawRecords: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    securityAuditEvent: { create: vi.fn() },
    integrationConnection: { findMany: vi.fn() },
    analyticsSnapshot: { findMany: vi.fn() },
    imladrisSourceSyncRun: { findMany: vi.fn() },
    imladrisCanonicalMetricValue: { findMany: vi.fn() },
    stripeCustomerLink: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
    financialGoal: { findMany: vi.fn() },
    forecastScenario: { findMany: vi.fn() },
    integrationRule: { findUnique: vi.fn() },
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
  subscriptionDeals: [
    {
      dealId: "deal-subscription",
      dealName: "Zaybra Subscription",
      stageId: "2239936224",
      stageLabel: "Subscriptions",
      amount: 3598,
      source: "HubSpot",
      ownerId: "owner-3",
      updatedAt: "2026-02-12T00:00:00.000Z",
      createdAt: "2026-02-01T00:00:00.000Z",
      stripeCustomerId: null,
      pipelineId: "1390107368",
      contactIds: [],
      primaryContactId: null,
      primaryContactEmail: "ops@example-subscription.com",
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
    activeCustomerRefs: [
      { customerId: "cus_123", email: "billing@example.com", emailDomain: "example.com" },
    ],
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
    activeCustomerRefs: [],
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

const GOOGLE_SEARCH_CONSOLE_DATA = {
  siteUrl: "https://example.com/",
  clicks: 42,
  impressions: 1200,
  ctr: 0.035,
  position: 8.4,
  queryCount: 1,
  pageCount: 1,
  dailyTrend: [],
  topQueries: [
    {
      query: "wipguard analytics",
      clicks: 25,
      impressions: 400,
      ctr: 0.0625,
      position: 3.2,
    },
  ],
  topPages: [
    {
      page: "https://example.com/",
      clicks: 42,
      impressions: 1200,
      ctr: 0.035,
      position: 8.4,
    },
  ],
  devices: [],
  countries: [],
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

const POSTHOG_DATA = {
  events: [
    {
      id: "evt_1",
      event: "activation_completed",
      timestamp: "2026-02-10T12:00:00.000Z",
      properties: { accountId: "acct_1" },
    },
  ],
  eventCount: 1,
  _meta: META,
};

const LINEAR_DATA = {
  issues: [
    {
      id: "lin_1",
      identifier: "WIP-1",
      title: "Persist integration telemetry",
      updatedAt: "2026-02-10T12:00:00.000Z",
      completedAt: "2026-02-10T13:00:00.000Z",
      state: { type: "completed" },
    },
  ],
  issueCount: 1,
  _meta: META,
};

const GITHUB_DATA = {
  pullRequests: [
    {
      id: 42,
      number: 7,
      title: "Harden sync",
      updated_at: "2026-02-10T12:00:00.000Z",
      merged_at: "2026-02-10T13:00:00.000Z",
      merged: true,
    },
  ],
  pullRequestCount: 1,
  _meta: META,
};

const TELEMETRY_DATA = {
  provider: "slack",
  totalRules: 1,
  enabledRules: 1,
  erroredRules: 0,
  receiptsInRange: 1,
  artifactsCreatedInRange: 1,
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
      searchConsoleAccessToken: "gsc-token",
      searchConsoleSiteUrl: "https://example.com/",
      googleAdsDevToken: "ads-dev",
      googleAdsCustomerId: "ads-customer",
      googleAdsRefreshToken: "ads-refresh",
      googleAdsClientId: "ads-client",
      googleAdsClientSecret: "ads-secret",
      googleAdsLoginCustomerId: null,
      metaAccessToken: "meta-token",
      metaAdsAccessToken: "meta-token",
      metaPageAccessToken: "meta-token",
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
      posthogApiKey: "posthog-token",
      posthogProjectId: "posthog-project",
      posthogHost: "https://posthog.example.com",
      linearApiKey: "linear-token",
      githubToken: "github-token",
      githubOwner: "wipguard",
      githubRepo: "app",
      googleWorkspaceAccessToken: "workspace-token",
      slackAccessToken: "slack-token",
      freshness: {
        [IntegrationProvider.GOOGLE_WORKSPACE]: freshness(IntegrationProvider.GOOGLE_WORKSPACE),
        [IntegrationProvider.HUBSPOT]: freshness(IntegrationProvider.HUBSPOT),
        [IntegrationProvider.SLACK]: freshness(IntegrationProvider.SLACK),
        [IntegrationProvider.CODA]: freshness(IntegrationProvider.CODA),
        [IntegrationProvider.REDDIT]: freshness(IntegrationProvider.REDDIT),
        [IntegrationProvider.GOOGLE_ANALYTICS]: freshness(IntegrationProvider.GOOGLE_ANALYTICS),
        [IntegrationProvider.GOOGLE_SEARCH_CONSOLE]: freshness(IntegrationProvider.GOOGLE_SEARCH_CONSOLE),
        [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE),
        [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY),
        [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW),
        [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS),
        [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS),
        [IntegrationProvider.META_PAGE]: freshness(IntegrationProvider.META_PAGE),
        [IntegrationProvider.SEMRUSH]: freshness(IntegrationProvider.SEMRUSH),
        [IntegrationProvider.PYLON]: freshness(IntegrationProvider.PYLON),
        [IntegrationProvider.POSTHOG]: freshness(IntegrationProvider.POSTHOG),
        [IntegrationProvider.LINEAR]: freshness(IntegrationProvider.LINEAR),
        [IntegrationProvider.GITHUB]: freshness(IntegrationProvider.GITHUB),
      },
    } as never);

    const { fetchHubSpotData, fetchMercuryData, fetchStripeData } = await import("@/lib/analytics/fetchers");
    vi.mocked(fetchHubSpotData).mockResolvedValue(HUBSPOT_DATA as never);
    vi.mocked(fetchMercuryData).mockResolvedValue(MERCURY_DATA as never);
    vi.mocked(fetchStripeData).mockResolvedValue(STRIPE_DATA as never);

    const { fetchGAData, fetchWebflowData } = await import("@/lib/analytics/fetchers-ga-webflow");
    vi.mocked(fetchGAData).mockResolvedValue(GA_DATA as never);
    vi.mocked(fetchWebflowData).mockResolvedValue(WEBFLOW_DATA as never);

    const { fetchGoogleSearchConsoleData } = await import("@/lib/analytics/fetchers-google-search-console");
    vi.mocked(fetchGoogleSearchConsoleData).mockResolvedValue(GOOGLE_SEARCH_CONSOLE_DATA as never);

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

    const { fetchPostHogData, fetchLinearData, fetchGitHubData } = await import("@/lib/analytics/fetchers-development");
    vi.mocked(fetchPostHogData).mockResolvedValue(POSTHOG_DATA as never);
    vi.mocked(fetchLinearData).mockResolvedValue(LINEAR_DATA as never);
    vi.mocked(fetchGitHubData).mockResolvedValue(GITHUB_DATA as never);

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

    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "raw-route-1",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: "member",
      organizationId: "org-1",
    } as never);
    vi.mocked(prisma.securityAuditEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.imladrisSourceSyncRun.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.imladrisCanonicalMetricValue.findMany).mockResolvedValue([] as never);
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
    vi.mocked(prisma.integrationRule.findUnique).mockResolvedValue(null as never);
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
    const { fetchCodaData } = await import("@/lib/analytics/fetchers-coda");
    const { fetchPostHogData, fetchLinearData, fetchGitHubData } = await import("@/lib/analytics/fetchers-development");
    const { fetchWebflowData } = await import("@/lib/analytics/fetchers-ga-webflow");
    const { fetchGoogleSearchConsoleData } = await import("@/lib/analytics/fetchers-google-search-console");
    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=ai-insights&refresh=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchGoogleAdsData).toHaveBeenCalled();
    expect(fetchMetaAdsData).toHaveBeenCalled();
    expect(fetchRedditAdsData).toHaveBeenCalled();
    expect(fetchWebflowData).toHaveBeenCalled();
    expect(fetchCodaData).toHaveBeenCalledWith("coda-token", "coda-doc", {
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    });
    expect(fetchGoogleSearchConsoleData).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "gsc-token",
      siteUrl: "https://example.com/",
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    }));
    expect(fetchPostHogData).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "posthog-token",
      projectId: "posthog-project",
      host: "https://posthog.example.com",
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    }));
    expect(fetchLinearData).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "linear-token",
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    }));
    expect(fetchGitHubData).toHaveBeenCalledWith(expect.objectContaining({
      token: "github-token",
      owner: "wipguard",
      repo: "app",
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.CODA,
      checkpoint: expect.objectContaining({
        providerKey: "coda",
        source: "analytics-route",
      }),
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
      checkpoint: expect.objectContaining({
        providerKey: "googleSearchConsole",
        source: "analytics-route",
      }),
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.POSTHOG,
      checkpoint: expect.objectContaining({
        providerKey: "posthog",
        source: "analytics-route",
      }),
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.LINEAR,
      checkpoint: expect.objectContaining({
        providerKey: "linear",
        source: "analytics-route",
      }),
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.GITHUB,
      checkpoint: expect.objectContaining({
        providerKey: "github",
        source: "analytics-route",
      }),
    }));
    expect(body.coda).toEqual(CODA_DATA);
    expect(body.googleSearchConsole).toEqual(GOOGLE_SEARCH_CONSOLE_DATA);
    expect(body.posthog).toEqual(POSTHOG_DATA);
    expect(body.linear).toEqual(LINEAR_DATA);
    expect(body.github).toEqual(GITHUB_DATA);
    expect(body.meta?.section).toBe("ai-insights");
    expect(body.meta?.forceRefresh).toBe(true);
    expect(body.aiInsights).toBeTruthy();
  });

  it("runs customer-success product analytics inside tenant context", async () => {
    const { getServerSession } = await import("next-auth");
    const { prisma } = await import("@/lib/prisma");
    const { getRequestContext } = await import("@/lib/request-context");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    } as never);

    vi.mocked(prisma.imladrisCanonicalMetricValue.findMany).mockImplementation((async () => {
      if (getRequestContext()?.organizationId !== "org-1") {
        throw new Error("Missing tenant context");
      }
      return [] as never;
    }) as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=customer-success"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.product).toBeTruthy();
    expect(body.errors.some((entry: { source: string; message: string }) => entry.message === "Missing tenant context")).toBe(false);
  });

  it("returns Coda operational telemetry for the customer-success Coda section", async () => {
    const { fetchCodaData } = await import("@/lib/analytics/fetchers-coda");
    const { fetchIntegrationTelemetryData } = await import("@/lib/analytics/fetchers-integrations");
    const { GET } = await import("@/app/api/analytics/route");

    const response = await GET(new Request("http://localhost/api/analytics?section=cs-coda&refresh=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchCodaData).toHaveBeenCalledWith("coda-token", "coda-doc", {
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    });
    expect(fetchIntegrationTelemetryData).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      provider: IntegrationProvider.CODA,
      from: expect.any(Date),
      to: expect.any(Date),
    }));
    expect(body.coda).toEqual(CODA_DATA);
    expect(body.codaOps).toEqual(TELEMETRY_DATA);
  });

  it("returns demo analytics domain data", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=demo-analytics"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.demoAnalytics).toBeTruthy();
    expect(body.demoAnalytics.totalScheduled).toBeGreaterThan(0);
  });

  it("normalizes closed-won stage labels for visitor funnel secondary metrics", async () => {
    const { isClosedWonStageLabel } = await import("@/app/api/analytics/route");

    expect(isClosedWonStageLabel("Closed Won")).toBe(true);
    expect(isClosedWonStageLabel(" closed_won ")).toBe(true);
    expect(isClosedWonStageLabel("closed-won")).toBe(true);
    expect(isClosedWonStageLabel("Demo Scheduled")).toBe(false);
  });

  it("returns revenue dashboard data from revenue sources only", async () => {
    const { fetchHubSpotData, fetchMercuryData, fetchStripeData } = await import("@/lib/analytics/fetchers");
    const { fetchGoogleAdsData } = await import("@/lib/analytics/fetchers-ads");
    const { readLatestSnapshot } = await import("@/lib/analytics/snapshots");
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/analytics/route");
    vi.mocked(readLatestSnapshot).mockResolvedValue({
      payload: { fromSnapshot: true, _meta: META },
      capturedAt: "2026-02-10T00:00:00.000Z",
      expiresAt: "2026-02-10T01:00:00.000Z",
      needsRefresh: false,
      stale: false,
      fromSnapshot: true,
      status: "SUCCESS",
      error: null,
    } as never);
    vi.mocked(prisma.integrationRule.findUnique).mockResolvedValueOnce({
      config: {
        mercuryExpenseMappings: [
          { match: "founder payroll", category: "ops" },
          { match: "ignore me", category: "not-real" },
        ],
      },
    } as never);

    const response = await GET(new Request("http://localhost/api/analytics?section=revenue"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchHubSpotData).toHaveBeenCalled();
    expect(fetchStripeData).toHaveBeenCalled();
    expect(fetchMercuryData).toHaveBeenCalledWith("mercury", {
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
      expenseMappings: [{ match: "founder payroll", category: "ops" }],
    });
    expect(fetchGoogleAdsData).not.toHaveBeenCalled();
    expect(prisma.integrationRule.findUnique).toHaveBeenCalledWith({
      where: {
        userId_provider_key: {
          userId: "user-1",
          provider: IntegrationProvider.MERCURY,
          key: "mercury_cashflow_sync",
        },
      },
      select: { config: true },
    });
    expect(body.revenueDashboard?.summary.arr).toBe(147598);
    expect(body.revenueDashboard?.trust.sources.map((source: { key: string }) => source.key)).toEqual([
      "hubspot",
      "stripe",
      "mercury",
    ]);
  });

  it("normalizes percent-point bounce rate values in recommendations", async () => {
    const { fetchGAData } = await import("@/lib/analytics/fetchers-ga-webflow");
    vi.mocked(fetchGAData).mockResolvedValueOnce({
      ...GA_DATA,
      bounceRate: 60,
    } as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=overview"));
    const body = await response.json();

    const bounceRecommendation = body.recommendations.find(
      (recommendation: { id: string }) => recommendation.id === "ads-bounce",
    );
    expect(bounceRecommendation).toBeDefined();
    expect(bounceRecommendation.insight).toContain("60.0%");
    expect(bounceRecommendation.insight).not.toContain("6000.0%");
  });

  it("normalizes ratio-form HubSpot no-show rate values in recommendations", async () => {
    const { fetchHubSpotData } = await import("@/lib/analytics/fetchers");
    vi.mocked(fetchHubSpotData).mockResolvedValueOnce({
      ...HUBSPOT_DATA,
      funnel: {
        ...HUBSPOT_DATA.funnel,
        noShowRate: 0.25,
      },
    } as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=overview"));
    const body = await response.json();

    const noShowRecommendation = body.recommendations.find(
      (recommendation: { id: string }) => recommendation.id === "sales-noshow",
    );
    expect(noShowRecommendation).toBeDefined();
  });

  it("uses previous HubSpot subscription revenue in overview MRR deltas", async () => {
    const { readLatestSuccessfulSnapshot } = await import("@/lib/analytics/snapshots");
    vi.mocked(readLatestSuccessfulSnapshot).mockImplementation(
      async (input: { providerKey: string }) => {
        if (input.providerKey === "stripe") {
          return {
            payload: {
              ...STRIPE_DATA,
              revenue: {
                ...STRIPE_DATA.revenue,
                mrr: 10000,
              },
            },
            capturedAt: "2026-01-10T00:00:00.000Z",
            expiresAt: "2026-01-10T01:00:00.000Z",
            needsRefresh: false,
            stale: false,
            fromSnapshot: true,
            status: "SUCCESS",
            error: null,
          } as never;
        }
        if (input.providerKey === "hubspot") {
          return {
            payload: {
              ...HUBSPOT_DATA,
              subscriptionDeals: [
                {
                  ...HUBSPOT_DATA.subscriptionDeals[0],
                  dealId: "previous-hubspot-only-subscription",
                  amount: 24000,
                  primaryContactEmail: "previous@example-subscription.com",
                },
              ],
            },
            capturedAt: "2026-01-10T00:00:00.000Z",
            expiresAt: "2026-01-10T01:00:00.000Z",
            needsRefresh: false,
            stale: false,
            fromSnapshot: true,
            status: "SUCCESS",
            error: null,
          } as never;
        }
        return {
          payload: null,
          capturedAt: null,
          expiresAt: null,
          needsRefresh: false,
          stale: false,
          fromSnapshot: false,
          status: null,
          error: null,
        } as never;
      },
    );

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=overview"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deltas.finance.mrr.previous).toBe(12000);
    expect(body.deltas.finance.mrr.current).toBe(12299.83);
    expect(body.deltas.finance.mrr.delta).toBeCloseTo(299.83, 2);
  });

  it("uses previous HubSpot-only subscription revenue in overview MRR deltas", async () => {
    const { readLatestSuccessfulSnapshot } = await import("@/lib/analytics/snapshots");
    vi.mocked(readLatestSuccessfulSnapshot).mockImplementation(
      async (input: { providerKey: string }) => {
        if (input.providerKey === "hubspot") {
          return {
            payload: {
              ...HUBSPOT_DATA,
              subscriptionDeals: [
                {
                  ...HUBSPOT_DATA.subscriptionDeals[0],
                  dealId: "previous-hubspot-only-subscription",
                  amount: 24000,
                  primaryContactEmail: "previous@example-subscription.com",
                },
              ],
            },
            capturedAt: "2026-01-10T00:00:00.000Z",
            expiresAt: "2026-01-10T01:00:00.000Z",
            needsRefresh: false,
            stale: false,
            fromSnapshot: true,
            status: "SUCCESS",
            error: null,
          } as never;
        }
        return {
          payload: null,
          capturedAt: null,
          expiresAt: null,
          needsRefresh: false,
          stale: false,
          fromSnapshot: false,
          status: null,
          error: null,
        } as never;
      },
    );

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=overview"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deltas.finance.mrr.previous).toBe(2000);
    expect(body.deltas.finance.mrr.current).toBe(12299.83);
    expect(body.deltas.finance.mrr.delta).toBeCloseTo(10299.83, 2);
  });

  it("loads unlinked HubSpot meetings for demo analytics instead of only deal-linked meetings", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/analytics/route");
    await GET(new Request("http://localhost/api/analytics?section=demo-analytics"));

    expect(prisma.dealMeeting.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { deal: { organizationId: "org-1" } },
            { customerRecord: { organizationId: "org-1" } },
            { dealId: null, customerRecordId: null },
          ],
        },
      }),
    );
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

  it("builds finance-planning subscription overview from HubSpot subscription pipeline deals", async () => {
    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=finance-planning"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hubspot.subscriptionDeals).toHaveLength(1);
    expect(body.financialPlanning.subscriptionOverview).toEqual({
      mergedActiveSubscriptions: 21,
      stripeActiveSubscriptions: 20,
      hubspotActiveSubscriptions: 1,
      stripeMrr: 12000,
      hubspotSubscriptionMrr: 299.83,
      hubspotOnlySubscriptionMrr: 299.83,
      excludedLinkedHubspotSubscriptionMrr: 0,
      totalMrr: 12299.83,
      totalArr: 147598,
    });
  });

  it("excludes Stripe-linked HubSpot subscriptions from finance-planning active counts", async () => {
    const { fetchHubSpotData } = await import("@/lib/analytics/fetchers");
    vi.mocked(fetchHubSpotData).mockResolvedValueOnce({
      ...HUBSPOT_DATA,
      funnel: {
        ...HUBSPOT_DATA.funnel,
        activeSubscriptions: 2,
      },
      subscriptionDeals: [
        ...HUBSPOT_DATA.subscriptionDeals,
        {
          ...HUBSPOT_DATA.subscriptionDeals[0],
          dealId: "deal-subscription-linked",
          dealName: "Linked Stripe subscription",
          stripeCustomerId: "cus_123",
          primaryContactEmail: "billing@example.com",
        },
      ],
    } as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=finance-planning"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.financialPlanning.subscriptionOverview).toMatchObject({
      mergedActiveSubscriptions: 21,
      stripeActiveSubscriptions: 20,
      hubspotActiveSubscriptions: 1,
      hubspotSubscriptionMrr: 599.67,
      hubspotOnlySubscriptionMrr: 299.83,
      excludedLinkedHubspotSubscriptionMrr: 299.83,
      totalMrr: 12299.83,
    });
  });

  it("uses canonical finance metrics for financial goal progress", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.financialGoal.findMany).mockResolvedValueOnce([
      {
        id: "goal-mrr",
        metric: "mrr",
        targetValue: 20000,
        deadline: new Date("2027-01-01T00:00:00.000Z"),
      },
      {
        id: "goal-arr",
        metric: "arr",
        targetValue: 240000,
        deadline: new Date("2027-01-01T00:00:00.000Z"),
      },
      {
        id: "goal-customers",
        metric: "customer_count",
        targetValue: 10,
        deadline: new Date("2027-01-01T00:00:00.000Z"),
      },
    ] as never);

    const { GET } = await import("@/app/api/analytics/route");
    const response = await GET(new Request("http://localhost/api/analytics?section=finance-planning"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.financialPlanning.goals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "goal-mrr",
          currentValue: 12299.83,
        }),
        expect.objectContaining({
          id: "goal-arr",
          currentValue: 147598,
        }),
        expect.objectContaining({
          id: "goal-customers",
          currentValue: 21,
        }),
      ]),
    );
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
        metaAdsAccessToken: "meta-token",
        metaPageAccessToken: "meta-token",
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
      metaAdsAccessToken: null,
      metaPageAccessToken: null,
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

  it("persists live analytics fetches into Imladris raw records before storing snapshots", async () => {
    const previousOwner = process.env.INTEGRATION_OWNER_USER_ID;
    process.env.INTEGRATION_OWNER_USER_ID = "owner-mercury";

    const { storeAnalyticsSnapshot } = await import("@/lib/analytics/snapshots");
    const { ingestImladrisRawRecords } = await import("@/lib/imladris/ingestion");

    try {
      const { GET } = await import("@/app/api/analytics/route");
      const response = await GET(
        new Request("http://localhost/api/analytics?section=finance-mercury")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.mercury).toEqual(MERCURY_DATA);
      expect(ingestImladrisRawRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: IntegrationProvider.MERCURY,
          context: {
            userId: "owner-mercury",
            organizationId: "org-1",
          },
          mode: "analytics-route",
          windowStart: expect.any(Date),
          windowEnd: expect.any(Date),
          checkpoint: {
            providerKey: "mercury",
            source: "analytics-route",
            rangePreset: "30d",
          },
        }),
      );
      expect(
        vi.mocked(ingestImladrisRawRecords).mock.invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(storeAnalyticsSnapshot).mock.invocationCallOrder[0],
      );
    } finally {
      if (previousOwner === undefined) {
        delete process.env.INTEGRATION_OWNER_USER_ID;
      } else {
        process.env.INTEGRATION_OWNER_USER_ID = previousOwner;
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
          metaAdsAccessToken: null,
          metaPageAccessToken: null,
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
        metaAdsAccessToken: "meta-token",
        metaPageAccessToken: "meta-token",
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
          ([input]) => input.userId === "user-1" && input.providerKey === "product"
        )
      ).toBe(true);

      expect(
        vi.mocked(storeAnalyticsSnapshot).mock.calls.some(
          ([input]) => input.userId === "owner-1" && input.providerKey === "stripe"
        )
      ).toBe(true);
      expect(
        vi.mocked(storeAnalyticsSnapshot).mock.calls.some(
          ([input]) => input.userId === "user-1" && input.providerKey === "product"
        )
      ).toBe(true);

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

  it("refuses to store truncated live finance payloads and falls back to the last successful snapshot", async () => {
    const previousOwner = process.env.INTEGRATION_OWNER_USER_ID;
    process.env.INTEGRATION_OWNER_USER_ID = "owner-mercury";

    const truncatedMercury = {
      ...MERCURY_DATA,
      cashFlow: {
        ...MERCURY_DATA.cashFlow,
        totalBalance: 999999,
      },
      _meta: {
        ...META,
        truncated: true,
        truncatedResources: ["accounts"],
      },
    };
    const fallbackMercury = {
      ...MERCURY_DATA,
      cashFlow: {
        ...MERCURY_DATA.cashFlow,
        totalBalance: 250000,
        runway: 250,
      },
    };

    const {
      readLatestSnapshot,
      readLatestSuccessfulSnapshot,
      storeAnalyticsSnapshot,
      storeAnalyticsSnapshotFailure,
    } = await import("@/lib/analytics/snapshots");
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
      vi.mocked(fetchMercuryData).mockResolvedValueOnce(truncatedMercury as never);
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
          message:
            "Provider payload for mercury is truncated; refusing to persist partial analytics route data",
        }),
      );
      expect(storeAnalyticsSnapshot).not.toHaveBeenCalledWith(
        expect.objectContaining({
          providerKey: "mercury",
          payload: truncatedMercury,
        }),
      );
      expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "owner-mercury",
          providerKey: "mercury",
          error:
            "Provider payload for mercury is truncated; refusing to persist partial analytics route data",
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationProvider,
  type IntegrationRule,
} from "@/generated/prisma/client";
import {
  CODA_DOC_SYNC_RULE_KEY,
  ensureProviderMetricsRulesForConnectedProviders,
  GITHUB_PULL_REQUESTS_SYNC_RULE_KEY,
  GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
  GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
  GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
  HUBSPOT_PIPELINE_SYNC_RULE_KEY,
  LINEAR_ISSUES_SYNC_RULE_KEY,
  MERCURY_CASHFLOW_SYNC_RULE_KEY,
  META_INSTAGRAM_METRICS_RULE_KEY,
  META_PAGE_METRICS_RULE_KEY,
  POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
  SEMRUSH_DOMAIN_SYNC_RULE_KEY,
  SLACK_ACTIVITY_SYNC_RULE_KEY,
  STRIPE_REVENUE_SYNC_RULE_KEY,
  WEBFLOW_SITE_SYNC_RULE_KEY,
  buildProviderMetricsSyncResponsePayload,
  runProviderMetricsRule,
} from "@/lib/integrations/provider-metrics-sync";
import { getCredentials } from "@/lib/analytics/credentials";
import { fetchHubSpotData, fetchMercuryData, fetchStripeData } from "@/lib/analytics/fetchers";
import { fetchCodaData } from "@/lib/analytics/fetchers-coda";
import { fetchMetaInstagramData } from "@/lib/analytics/fetchers-ads";
import {
  fetchGitHubData,
  fetchLinearData,
  fetchPostHogData,
} from "@/lib/analytics/fetchers-development";
import { fetchGoogleSearchConsoleData } from "@/lib/analytics/fetchers-google-search-console";
import { fetchGAData, fetchWebflowData } from "@/lib/analytics/fetchers-ga-webflow";
import { fetchGoogleWorkspaceData } from "@/lib/analytics/fetchers-google-workspace";
import { fetchSemrushData } from "@/lib/analytics/fetchers-semrush";
import { fetchSlackData } from "@/lib/analytics/fetchers-slack";
import { storeAnalyticsSnapshot, storeAnalyticsSnapshotFailure } from "@/lib/analytics/snapshots";
import { ingestImladrisRawRecords } from "@/lib/imladris/ingestion";

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
  hasIntegrationCredential: vi.fn((provider: IntegrationProvider, credentials: Record<string, unknown>) => {
    if (provider === IntegrationProvider.GOOGLE_WORKSPACE) {
      return Boolean(credentials.googleWorkspaceAccessToken);
    }
    if (provider === IntegrationProvider.HUBSPOT) {
      return Boolean(credentials.hubspotToken);
    }
    if (provider === IntegrationProvider.SLACK) {
      return Boolean(credentials.slackAccessToken);
    }
    if (provider === IntegrationProvider.CODA) {
      return Boolean(credentials.codaApiToken && credentials.codaDocId);
    }
    if (provider === IntegrationProvider.GOOGLE_ANALYTICS) {
      return Boolean(
        credentials.gaPropertyId &&
          (credentials.gaClientEmail || credentials.gaPrivateKey),
      );
    }
    if (provider === IntegrationProvider.GOOGLE_SEARCH_CONSOLE) {
      return Boolean(credentials.searchConsoleSiteUrl && credentials.searchConsoleAccessToken);
    }
    if (provider === IntegrationProvider.STRIPE) {
      return Boolean(credentials.stripeKey);
    }
    if (provider === IntegrationProvider.MERCURY) {
      return Boolean(credentials.mercuryKey);
    }
    if (provider === IntegrationProvider.WEBFLOW) {
      return Boolean(credentials.webflowApiToken && credentials.webflowSiteId);
    }
    if (provider === IntegrationProvider.PYLON) {
      return Boolean(credentials.pylonApiKey);
    }
    if (provider === IntegrationProvider.META_PAGE) {
      return Boolean(
        credentials.metaPageAccessToken &&
          (credentials.metaPageId || credentials.metaInstagramAccountId),
      );
    }
    if (provider === IntegrationProvider.SEMRUSH) {
      return Boolean(credentials.semrushApiToken && credentials.semrushDomain);
    }
    if (provider === IntegrationProvider.POSTHOG) {
      return Boolean(credentials.posthogApiKey && credentials.posthogProjectId);
    }
    return false;
  }),
}));

vi.mock("@/lib/analytics/fetchers", () => ({
  fetchHubSpotData: vi.fn(),
  fetchStripeData: vi.fn(),
  fetchMercuryData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-coda", () => ({
  fetchCodaData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-ads", () => ({
  fetchGoogleAdsData: vi.fn(),
  fetchMetaAdsData: vi.fn(),
  fetchMetaInstagramData: vi.fn(),
  fetchMetaPageData: vi.fn(),
  fetchRedditAdsData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-pylon", () => ({
  fetchPylonData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-development", () => ({
  fetchPostHogData: vi.fn(),
  fetchLinearData: vi.fn(),
  fetchGitHubData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-ga-webflow", () => ({
  fetchGAData: vi.fn(),
  fetchWebflowData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-google-search-console", () => ({
  fetchGoogleSearchConsoleData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-google-workspace", () => ({
  fetchGoogleWorkspaceData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-semrush", () => ({
  fetchSemrushData: vi.fn(),
}));

vi.mock("@/lib/analytics/fetchers-slack", () => ({
  fetchSlackData: vi.fn(),
}));

vi.mock("@/lib/analytics/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/snapshots")>();
  return {
    ...actual,
    storeAnalyticsSnapshot: vi.fn(),
    storeAnalyticsSnapshotFailure: vi.fn(),
  };
});

vi.mock("@/lib/imladris/ingestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imladris/ingestion")>();
  return {
    ...actual,
    ingestImladrisRawRecords: vi.fn(),
  };
});

function makeRule(input: {
  id?: string;
  provider?: IntegrationProvider;
  key?: string;
} = {}): IntegrationRule {
  return {
    id: input.id ?? "rule_1",
    userId: "user_1",
    provider: input.provider ?? IntegrationProvider.STRIPE,
    key: input.key ?? STRIPE_REVENUE_SYNC_RULE_KEY,
    enabled: true,
    config: {
      rangePreset: "30d",
      contextKey: "default",
    },
    checkpoint: {},
    lastObservedAt: null,
    lastRunAt: null,
    lastError: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  } as IntegrationRule;
}

const prismaMock = vi.hoisted(() => ({
  integrationRule: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  integrationConnection: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("provider metrics sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    vi.clearAllMocks();
    const stripeRule = makeRule();
    prismaMock.integrationRule.findUnique.mockResolvedValue(stripeRule);
    prismaMock.integrationRule.create.mockResolvedValue(stripeRule);
    prismaMock.integrationRule.update.mockResolvedValue(stripeRule);
    prismaMock.integrationConnection.findMany.mockResolvedValue([]);
    prismaMock.integrationConnection.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.integrationConnection.upsert.mockResolvedValue({});
    prismaMock.user.findUnique.mockResolvedValue({ organizationId: "org_1" });
    vi.mocked(getCredentials).mockResolvedValue({ stripeKey: "sk_test_123" } as never);
    vi.mocked(fetchStripeData).mockResolvedValue({
      revenue: {
        mrr: 42000,
        totalRevenue30d: 51000,
      },
      subscriptions: {
        active: 12,
        recentChurnEvents: [
          {
            customer: "cus_1",
            canceledAt: "2026-05-28T10:00:00.000Z",
            amount: 99,
          },
        ],
        activeCustomerRefs: [
          {
            customerId: "cus_2",
            email: "buyer@example.com",
            emailDomain: "example.com",
          },
        ],
      },
      payments: {
        succeeded: 20,
        failed: 1,
      },
      revenueTrend: [{ month: "2026-05-31", revenue: 2000 }],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchHubSpotData).mockResolvedValue({
      totalDeals: 12,
      closedWon: 4,
      closedLost: 2,
      winRate: 66.7,
      pipelineValue: 128000,
      avgDealSize: 32000,
      recentContacts: 18,
      funnelStages: [
        { stage: "Demo Scheduled", count: 5, value: 64000 },
      ],
      dealsBySource: [
        { source: "Organic Search", count: 6, value: 72000 },
      ],
      deals: [
        {
          dealId: "deal_1",
          dealName: "Acme expansion",
          stageId: "closedwon",
          stageLabel: "Closed Won",
          amount: 42000,
          source: "Organic Search",
          ownerId: "owner_1",
          repName: "Ada Lovelace",
          updatedAt: "2026-05-31T10:00:00.000Z",
          createdAt: "2026-05-15T10:00:00.000Z",
          closedAt: "2026-05-31T10:00:00.000Z",
          pipelineId: "default",
          contactIds: ["contact_1"],
          primaryContactId: "contact_1",
          primaryContactEmail: "buyer@example.com",
          stageHistory: [],
        },
      ],
      subscriptionDeals: [],
      repScoreboard: [
        {
          ownerId: "owner_1",
          ownerName: "Ada Lovelace",
          totalDeals: 3,
          totalPipeline: 64000,
          avgDealSize: 21333,
          demos: 2,
          noShows: 0,
          noShowRate: 0,
          wonCount: 1,
          wonRevenue: 42000,
          avgWon: 42000,
          lostCount: 0,
          winRate: 100,
          demoToWonRate: 50,
          churnedWon: 0,
          churnRate: 0,
        },
      ],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchCodaData).mockResolvedValue({
      totalCards: 1,
      cardsByStatus: [{ status: "Downloaded", count: 1 }],
      recentCards: [
        {
          id: "row_1",
          name: "ICP worksheet",
          status: "Downloaded",
          creator: "Ada Lovelace",
          creatorEmail: "ada@example.com",
          createdAt: "2026-05-31T10:00:00.000Z",
          updatedAt: "2026-05-31T10:00:00.000Z",
          createdAtIso: "2026-05-31T10:00:00.000Z",
        },
      ],
      rangeSummary: {
        from: "2025-05-01",
        to: "2026-06-01",
        cardsCreated: 1,
        submissions: 1,
        unknownEmailCards: 0,
      },
      recentSubmitters: [
        {
          creator: "Ada Lovelace",
          email: "ada@example.com",
          cardsCreated: 1,
          firstSubmittedAt: "2026-05-31T10:00:00.000Z",
          lastSubmittedAt: "2026-05-31T10:00:00.000Z",
          hubspotStatus: "unknown",
        },
      ],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchMercuryData).mockResolvedValue({
      accounts: [
        {
          accountId: "acct_1",
          accountName: "Operating",
          balance: 250000,
          type: "checking",
        },
      ],
      cashFlow: {
        totalBalance: 250000,
        bankCash: 250000,
        treasuryCash: 0,
        totalCash: 250000,
        inflows30d: 15000,
        outflows30d: 65000,
        netCashFlow: -50000,
        runway: 5,
        burnRate: 50000,
      },
      transactions: [
        {
          id: "tx_1",
          postedAt: "2026-05-27T00:00:00.000Z",
          amount: -65000,
          kind: "card",
          mercuryCategory: "software",
          description: "Infrastructure",
        },
      ],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchPostHogData).mockResolvedValue({
      events: [
        {
          id: "evt_1",
          event: "activation_completed",
          timestamp: "2026-05-30T10:00:00.000Z",
          properties: { companyId: "acct_1" },
        },
      ],
      eventCount: 1,
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchLinearData).mockResolvedValue({
      issues: [
        {
          id: "lin_1",
          identifier: "IML-1",
          createdAt: "2026-05-29T00:00:00.000Z",
          completedAt: "2026-05-31T00:00:00.000Z",
          state: { type: "completed" },
        },
      ],
      issueCount: 1,
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchGitHubData).mockResolvedValue({
      pullRequests: [
        {
          id: 42,
          number: 7,
          title: "Ship Imladris sync",
          updated_at: "2026-05-31T08:00:00.000Z",
          merged_at: "2026-05-31T09:00:00.000Z",
        },
      ],
      pullRequestCount: 1,
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchGAData).mockResolvedValue({
      sessions30d: 4200,
      sessionsPrev30d: 3900,
      users30d: 1800,
      usersPrev30d: 1600,
      pageviews30d: 9800,
      pageviewsPrev30d: 9100,
      bounceRate: 0.41,
      avgSessionDuration: 97,
      trafficByChannel: [
        { channel: "Organic Search", sessions: 2100, users: 900, pageviews: 4700 },
      ],
      topPages: [
        { path: "/pricing", pageviews: 900, avgSessionDuration: 110 },
      ],
      dailyTrend: [{ date: "2026-05-31", sessions: 120, users: 70, pageviews: 300 }],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchGoogleSearchConsoleData).mockResolvedValue({
      siteUrl: "https://example.com/",
      clicks: 120,
      impressions: 2400,
      ctr: 0.05,
      position: 4.2,
      queryCount: 1,
      pageCount: 1,
      dailyTrend: [
        { date: "2026-05-31", clicks: 12, impressions: 100, ctr: 0.12, position: 3.2 },
      ],
      topQueries: [
        { query: "imladris analytics", clicks: 60, impressions: 900, ctr: 0.0667, position: 2.8 },
      ],
      topPages: [
        { page: "https://example.com/pricing", clicks: 48, impressions: 700, ctr: 0.0686, position: 3.1 },
      ],
      devices: [
        { device: "DESKTOP", clicks: 80, impressions: 1500, ctr: 0.0533, position: 3.9 },
      ],
      countries: [
        { country: "usa", clicks: 72, impressions: 1400, ctr: 0.0514, position: 4.1 },
      ],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchWebflowData).mockResolvedValue({
      siteName: "Imladris",
      lastPublished: "2026-05-30T00:00:00.000Z",
      totalPages: 2,
      totalCollections: 1,
      formSubmissions: [{ formName: "Demo request", count: 3 }],
      customDomains: ["imladris.example"],
      publishedPages: 2,
      draftPages: 0,
      archivedPages: 0,
      pages: [
        {
          id: "page_1",
          title: "Pricing",
          slug: "pricing",
          createdOn: "2026-01-01T00:00:00.000Z",
          updatedOn: "2026-05-30T00:00:00.000Z",
          draft: false,
          archived: false,
          seoTitle: "Pricing | Imladris",
          seoDescription: "Startup operating metrics",
          openGraphImageUrl: "https://example.com/og.png",
        },
      ],
      seoAudit: {
        totalPages: 2,
        pagesWithSeoTitle: 1,
        pagesWithSeoDescription: 1,
        pagesWithOgImage: 1,
        seoScore: 50,
      },
      contentFreshness: {
        updatedLast7d: 1,
        updatedLast30d: 1,
        updatedLast90d: 2,
        staleOver90d: 0,
      },
      recentlyUpdatedPages: [
        {
          id: "page_1",
          title: "Pricing",
          slug: "pricing",
          createdOn: "2026-01-01T00:00:00.000Z",
          updatedOn: "2026-05-30T00:00:00.000Z",
          draft: false,
          archived: false,
          seoTitle: "Pricing | Imladris",
          seoDescription: "Startup operating metrics",
          openGraphImageUrl: "https://example.com/og.png",
        },
      ],
      collections: [
        {
          id: "collection_1",
          displayName: "Blog",
          slug: "blog",
          itemCount: 12,
          createdOn: "2026-01-01T00:00:00.000Z",
        },
      ],
      totalCmsItems: 12,
      emptyCollections: 0,
      formTrend: [{ date: "2026-05-31", submissions: 3 }],
      totalFormSubmissions: 3,
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchGoogleWorkspaceData).mockResolvedValue({
      profile: {
        emailAddress: "founder@example.com",
        messagesTotal: 1200,
        threadsTotal: 420,
      },
      calendarEvents: [
        {
          eventId: "evt_1",
          calendarId: "primary",
          summary: "Customer kickoff",
          status: "confirmed",
          htmlLink: "https://calendar.google.com/event?eid=evt_1",
          creatorEmail: "founder@example.com",
          organizerEmail: "founder@example.com",
          attendeeCount: 3,
          startedAt: "2026-05-31T16:00:00.000Z",
          endedAt: "2026-05-31T17:00:00.000Z",
          updatedAt: "2026-05-30T12:00:00.000Z",
        },
      ],
      emailThreads: [
        {
          threadId: "thread_1",
          messageId: "msg_1",
          subject: "Re: Renewal",
          from: "buyer@example.com",
          to: "founder@example.com",
          snippet: "Following up on renewal",
          labelIds: ["INBOX"],
          occurredAt: "2026-05-31T09:00:00.000Z",
        },
      ],
      documents: [
        {
          fileId: "file_1",
          name: "Mutual action plan",
          mimeType: "application/vnd.google-apps.document",
          webViewLink: "https://drive.google.com/file/d/file_1/view",
          ownerEmail: "founder@example.com",
          modifiedAt: "2026-05-30T18:00:00.000Z",
        },
      ],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchSemrushData).mockResolvedValue({
      domain: "example.com",
      authorityScore: 42,
      backlinks: 1200,
      organicKeywords: 300,
      organicTraffic: 1800,
      organicTrafficCost: 4200,
      paidKeywords: 12,
      paidTraffic: 80,
      paidTrafficCost: 300,
      topKeywords: [{ keyword: "analytics dashboard", position: 3 }],
      organicCompetitors: [{ domain: "competitor.com", organicTraffic: 500 }],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(fetchSlackData).mockResolvedValue({
      team: {
        id: "T123",
        name: "Imladris",
        domain: "imladris",
      },
      channels: [
        {
          id: "C123",
          name: "customer-success",
          isChannel: true,
          isPrivate: false,
          isArchived: false,
          numMembers: 8,
          updatedAt: "2026-05-31T10:00:00.000Z",
        },
      ],
      users: [
        {
          id: "U123",
          name: "ada",
          realName: "Ada Lovelace",
          deleted: false,
          isBot: false,
          updatedAt: "2026-05-30T10:00:00.000Z",
        },
      ],
      messages: [
        {
          channelId: "C123",
          channelName: "customer-success",
          ts: "1780240800.000000",
          userId: "U123",
          text: "Customer signal discussed",
          replyCount: 2,
          occurredAt: "2026-05-31T10:00:00.000Z",
        },
      ],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);
    vi.mocked(storeAnalyticsSnapshot).mockResolvedValue({ id: "snapshot_1" } as never);
    vi.mocked(storeAnalyticsSnapshotFailure).mockResolvedValue(undefined as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 7,
      acceptedCount: 7,
      errorCount: 0,
    });
  });

  afterEach(() => {
    delete process.env.PROVIDER_SYNC_TIMEOUT_MS;
    vi.useRealTimers();
  });

  it("stores provider payloads in the Imladris raw layer during initial scheduled sync", async () => {
    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user_1" },
      select: { organizationId: true },
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledOnce();
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      prisma: prismaMock,
      provider: IntegrationProvider.STRIPE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      mode: "historical",
      windowStart: new Date("2025-05-01T00:00:00.000Z"),
      windowEnd: new Date("2026-06-01T23:59:59.999Z"),
      checkpoint: expect.objectContaining({
        ruleId: "rule_1",
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
        snapshotKey: "stripe",
        rangePreset: "30d",
        syncMode: "backfill",
        from: "2025-05-01",
        to: "2026-06-01",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "revenue_summary",
          externalId: expect.stringContaining("stripe:revenue_summary:"),
          payload: expect.objectContaining({
            mrr: 42000,
            totalRevenue30d: 51000,
          }),
        }),
        expect.objectContaining({
          objectType: "recent_churn_event",
          externalId: expect.stringContaining("cus_1"),
          occurredAt: "2026-05-28T10:00:00.000Z",
        }),
        expect.objectContaining({
          objectType: "active_customer_ref",
          externalId: expect.stringContaining("cus_2"),
        }),
      ]),
    }));
    expect(result.rawRecordCount).toBe(7);
    expect(result.acceptedRawRecordCount).toBe(7);
  });

  it("does not mark disabled provider rules as freshly synced", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValueOnce({
      ...makeRule(),
      enabled: false,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    });

    expect(fetchStripeData).not.toHaveBeenCalled();
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalled();
    expect(ingestImladrisRawRecords).not.toHaveBeenCalled();
    expect(prismaMock.integrationRule.update).not.toHaveBeenCalled();
    expect(prismaMock.integrationConnection.updateMany).not.toHaveBeenCalled();
    expect(result.rawRecordCount).toBe(0);
    expect(result.acceptedRawRecordCount).toBe(0);
  });

  it("preserves pulled raw data when success rule metadata persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prismaMock.integrationRule.update.mockRejectedValueOnce(
      new Error("rule checkpoint write failed"),
    );

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    });

    expect(result.rawRecordCount).toBe(7);
    expect(result.acceptedRawRecordCount).toBe(7);
    expect(result.statusPersistenceErrors).toEqual([
      "integrationRule status persistence failed: rule checkpoint write failed",
    ]);
    expect(storeAnalyticsSnapshotFailure).not.toHaveBeenCalled();
    expect(prismaMock.integrationConnection.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        provider: IntegrationProvider.STRIPE,
      },
      data: expect.objectContaining({
        status: "CONNECTED",
      }),
    });
    expect(consoleError).toHaveBeenCalledWith(
      "provider_metrics_sync.success_status_persist_failed",
      expect.objectContaining({
        provider: IntegrationProvider.STRIPE,
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
        userId: "user_1",
        persistenceTarget: "integrationRule",
        persistenceError: "rule checkpoint write failed",
      }),
    );
    consoleError.mockRestore();
  });

  it("surfaces raw ingestion status persistence failures without dropping accepted provider data", async () => {
    vi.mocked(ingestImladrisRawRecords).mockResolvedValueOnce({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 7,
      acceptedCount: 7,
      errorCount: 0,
      statusPersistenceErrors: [
        "imladrisSourceSyncRun status persistence failed: sync run update unavailable",
      ],
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    });

    expect(result.rawRecordCount).toBe(7);
    expect(result.acceptedRawRecordCount).toBe(7);
    expect(result.statusPersistenceErrors).toEqual([
      "imladrisSourceSyncRun status persistence failed: sync run update unavailable",
    ]);
    expect(storeAnalyticsSnapshotFailure).not.toHaveBeenCalled();
  });

  it("does not store a successful analytics snapshot when raw ingestion is partial", async () => {
    vi.mocked(ingestImladrisRawRecords).mockResolvedValueOnce({
      syncRunId: "sync_partial",
      status: "PARTIAL",
      recordCount: 7,
      acceptedCount: 5,
      errorCount: 2,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    });

    expect(result.rawRecordCount).toBe(7);
    expect(result.acceptedRawRecordCount).toBe(5);
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalled();
    expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user_1",
      providerKey: "stripe",
      contextKey: "default",
      rangePreset: "30d",
      error: "Imladris raw ingestion partially succeeded for stripe_revenue_sync: 5/7 records accepted.",
    }));
    const ruleUpdate = prismaMock.integrationRule.update.mock.calls[0]?.[0];
    expect(ruleUpdate).toEqual({
      where: { id: "rule_1" },
      data: expect.objectContaining({
        lastObservedAt: null,
        lastError: "Imladris raw ingestion partially succeeded for stripe_revenue_sync: 5/7 records accepted.",
      }),
    });
    expect(ruleUpdate?.data.checkpoint).not.toEqual(expect.objectContaining({
      from: expect.any(String),
      to: expect.any(String),
    }));
  });

  it("marks direct sync responses degraded when raw ingestion is partial", () => {
    const payload = buildProviderMetricsSyncResponsePayload({
      ruleId: "rule_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      provider: IntegrationProvider.STRIPE,
      snapshotKey: "stripe",
      dryRun: false,
      rangePreset: "30d",
      from: "2026-05-01",
      to: "2026-06-01",
      capturedAt: "2026-06-01T12:00:00.000Z",
      rawRecordCount: 7,
      acceptedRawRecordCount: 5,
      statusPersistenceErrors: [],
    });

    expect(payload.ok).toBe(false);
    expect(payload.degraded).toBe(true);
    expect(payload.warnings).toEqual([
      "Imladris raw ingestion partially succeeded for stripe_revenue_sync: 5/7 records accepted.",
    ]);
  });

  it("preserves pulled raw data when success connection metadata persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prismaMock.integrationConnection.updateMany.mockRejectedValueOnce(
      new Error("connection lastSyncedAt write failed"),
    );

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    });

    expect(result.rawRecordCount).toBe(7);
    expect(result.acceptedRawRecordCount).toBe(7);
    expect(result.statusPersistenceErrors).toEqual([
      "integrationConnection status persistence failed: connection lastSyncedAt write failed",
    ]);
    expect(storeAnalyticsSnapshotFailure).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "provider_metrics_sync.success_status_persist_failed",
      expect.objectContaining({
        provider: IntegrationProvider.STRIPE,
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
        userId: "user_1",
        persistenceTarget: "integrationConnection",
        persistenceError: "connection lastSyncedAt write failed",
      }),
    );
    consoleError.mockRestore();
  });

  it("creates a missing connection row when successful metrics sync freshness has no row to update", async () => {
    prismaMock.integrationConnection.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    });

    expect(result.statusPersistenceErrors).toEqual([]);
    expect(prismaMock.integrationConnection.upsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user_1",
          provider: IntegrationProvider.STRIPE,
        },
      },
      update: {
        status: "CONNECTED",
        lastSyncedAt: new Date("2026-06-01T12:00:00.000Z"),
        lastError: null,
      },
      create: {
        userId: "user_1",
        provider: IntegrationProvider.STRIPE,
        status: "CONNECTED",
        lastSyncedAt: new Date("2026-06-01T12:00:00.000Z"),
        lastError: null,
      },
    });
  });

  it("records a failed analytics snapshot when a provider pull fails", async () => {
    vi.mocked(fetchStripeData).mockRejectedValueOnce(
      new Error("Stripe 503 temporarily unavailable"),
    ).mockRejectedValueOnce(
      new Error("Stripe 503 temporarily unavailable"),
    ).mockRejectedValueOnce(
      new Error("Stripe 503 temporarily unavailable"),
    );

    await expect(
      runProviderMetricsRule({
        userId: "user_1",
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      }),
    ).rejects.toThrow("Stripe 503 temporarily unavailable");

    expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith({
      userId: "user_1",
      providerKey: "stripe",
      contextKey: "default",
      rangePreset: "30d",
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
      error: "Stripe 503 temporarily unavailable",
      expiresAt: expect.any(Date),
    });
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalled();
    expect(ingestImladrisRawRecords).not.toHaveBeenCalled();
  });

  it("rejects truncated provider payloads before storing partial raw data", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValueOnce(
      makeRule({
        provider: IntegrationProvider.POSTHOG,
        key: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValueOnce({
      posthogApiKey: "phx_token",
      posthogProjectId: "project_1",
    } as never);
    vi.mocked(fetchPostHogData).mockResolvedValueOnce({
      events: [{ id: "evt_1", event: "activation_completed" }],
      eventCount: 1,
      _meta: {
        fetchedAt: "2026-06-01T12:00:00.000Z",
        source: "live",
        pageCount: 100,
        truncated: true,
      },
    } as never);

    await expect(
      runProviderMetricsRule({
        userId: "user_1",
        ruleKey: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
      }),
    ).rejects.toThrow(
      "Provider payload for posthog_product_events_sync is truncated; refusing to persist partial provider data",
    );

    expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "posthog",
      error:
        "Provider payload for posthog_product_events_sync is truncated; refusing to persist partial provider data",
    }));
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalled();
    expect(ingestImladrisRawRecords).not.toHaveBeenCalled();
  });

  it("still records the rule failure when failed-snapshot persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetchStripeData).mockRejectedValue(
      new Error("Stripe 503 temporarily unavailable"),
    );
    vi.mocked(storeAnalyticsSnapshotFailure).mockRejectedValueOnce(
      new Error("snapshot write failed"),
    );

    await expect(
      runProviderMetricsRule({
        userId: "user_1",
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      }),
    ).rejects.toThrow("Stripe 503 temporarily unavailable");

    expect(storeAnalyticsSnapshotFailure).toHaveBeenCalledOnce();
    expect(prismaMock.integrationRule.update).toHaveBeenCalledWith({
      where: { id: "rule_1" },
      data: expect.objectContaining({
        lastError: "Stripe 503 temporarily unavailable",
      }),
    });
    expect(consoleError).toHaveBeenCalledWith(
      "provider_metrics_sync.failure_snapshot_failed",
      expect.objectContaining({
        provider: IntegrationProvider.STRIPE,
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
        originalError: "Stripe 503 temporarily unavailable",
        failureSnapshotError: "snapshot write failed",
      }),
    );
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalled();
    expect(ingestImladrisRawRecords).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not mask the provider error when rule failure status persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetchStripeData).mockRejectedValue(
      new Error("Stripe 503 temporarily unavailable"),
    );
    prismaMock.integrationRule.update.mockRejectedValueOnce(
      new Error("rule status write failed"),
    );

    await expect(
      runProviderMetricsRule({
        userId: "user_1",
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      }),
    ).rejects.toThrow("Stripe 503 temporarily unavailable");

    expect(consoleError).toHaveBeenCalledWith(
      "provider_metrics_sync.failure_status_persist_failed",
      expect.objectContaining({
        provider: IntegrationProvider.STRIPE,
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
        userId: "user_1",
        originalError: "Stripe 503 temporarily unavailable",
        persistenceError: "rule status write failed",
      }),
    );
    consoleError.mockRestore();
  });

  it("does not mask auth failures when connection status persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetchStripeData).mockRejectedValue(
      new Error("Stripe unauthorized token expired"),
    );
    prismaMock.integrationConnection.updateMany.mockRejectedValueOnce(
      new Error("connection status write failed"),
    );

    await expect(
      runProviderMetricsRule({
        userId: "user_1",
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      }),
    ).rejects.toThrow("Stripe unauthorized token expired");

    expect(consoleError).toHaveBeenCalledWith(
      "provider_metrics_sync.failure_status_persist_failed",
      expect.objectContaining({
        provider: IntegrationProvider.STRIPE,
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
        userId: "user_1",
        originalError: "Stripe unauthorized token expired",
        persistenceError: "connection status write failed",
      }),
    );
    consoleError.mockRestore();
  });

  it("creates a missing connection row when an auth failure has no row to update", async () => {
    vi.mocked(fetchStripeData).mockRejectedValue(
      new Error("Stripe unauthorized token expired"),
    );
    prismaMock.integrationConnection.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      runProviderMetricsRule({
        userId: "user_1",
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      }),
    ).rejects.toThrow("Stripe unauthorized token expired");

    expect(prismaMock.integrationConnection.upsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user_1",
          provider: IntegrationProvider.STRIPE,
        },
      },
      update: {
        status: "ERROR",
        lastError: "Stripe unauthorized token expired",
      },
      create: {
        userId: "user_1",
        provider: IntegrationProvider.STRIPE,
        status: "ERROR",
        lastError: "Stripe unauthorized token expired",
      },
    });
  });

  it("creates enabled default metrics rules for connected providers missing scheduled sync rules", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([
      { provider: IntegrationProvider.STRIPE },
      { provider: IntegrationProvider.POSTHOG },
      { provider: IntegrationProvider.CODA },
      { provider: IntegrationProvider.SEMRUSH },
      { provider: IntegrationProvider.GOOGLE_ANALYTICS },
      { provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE },
      { provider: IntegrationProvider.HUBSPOT },
      { provider: IntegrationProvider.SLACK },
      { provider: IntegrationProvider.GOOGLE_WORKSPACE },
      { provider: IntegrationProvider.WEBFLOW },
    ]);
    prismaMock.integrationRule.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        makeRule({
          provider: IntegrationProvider.POSTHOG,
          key: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
        }),
      )
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.integrationRule.create.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.STRIPE,
        key: STRIPE_REVENUE_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      stripeKey: "sk_test_123",
      posthogApiKey: "phx_test",
      posthogProjectId: "12345",
      codaApiToken: "coda_test",
      codaDocId: "dCoda123",
      semrushApiToken: "semrush_test",
      semrushDomain: "example.com",
      gaPropertyId: "properties/123",
      gaClientEmail: "analytics@example.com",
      gaPrivateKey: "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
      searchConsoleSiteUrl: "https://example.com/",
      searchConsoleAccessToken: "gsc_test",
      hubspotToken: "hubspot_test",
      slackAccessToken: "xoxb-test",
      googleWorkspaceAccessToken: "google_workspace_test",
      webflowApiToken: "webflow_test",
      webflowSiteId: "site_123",
    } as never);

    const result = await ensureProviderMetricsRulesForConnectedProviders({
      userId: "user_1",
    });

    expect(result.created).toBe(9);
    expect(prismaMock.integrationConnection.findMany).toHaveBeenCalledWith({
      distinct: ["provider"],
      where: {
        userId: "user_1",
        status: { in: ["CONNECTED", "ERROR"] },
      },
      select: { provider: true },
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.STRIPE,
        key: STRIPE_REVENUE_SYNC_RULE_KEY,
        enabled: true,
        config: expect.objectContaining({
          rangePreset: "30d",
          contextKey: "default",
        }),
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.SEMRUSH,
        key: SEMRUSH_DOMAIN_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.CODA,
        key: CODA_DOC_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_ANALYTICS,
        key: GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        key: GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.SLACK,
        key: SLACK_ACTIVITY_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.WEBFLOW,
        key: WEBFLOW_SITE_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
  });

  it("bootstraps metrics rules for env-managed credentials even without connection rows", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([]);
    prismaMock.integrationRule.findUnique.mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue({
      stripeKey: "sk_env",
      posthogApiKey: "phx_env",
      posthogProjectId: "12345",
    } as never);

    const result = await ensureProviderMetricsRulesForConnectedProviders({
      userId: "user_1",
    });

    expect(result.created).toBe(2);
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.STRIPE,
        key: STRIPE_REVENUE_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.POSTHOG,
        key: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
  });

  it("treats duplicate rule creation during bootstrap as an already-created rule", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([
      { provider: IntegrationProvider.STRIPE },
    ]);
    prismaMock.integrationRule.findUnique.mockResolvedValue(null);
    prismaMock.integrationRule.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed on the fields: (`userId`,`provider`,`key`)"), {
        code: "P2002",
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      stripeKey: "sk_test_123",
    } as never);

    const result = await ensureProviderMetricsRulesForConnectedProviders({
      userId: "user_1",
    });

    expect(result).toEqual({ created: 0, examined: 1 });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.STRIPE,
        key: STRIPE_REVENUE_SYNC_RULE_KEY,
        enabled: true,
      }),
    });
  });

  it("does not bootstrap a Coda rule from token-only credentials without a doc ID", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([
      { provider: IntegrationProvider.CODA },
    ]);
    vi.mocked(getCredentials).mockResolvedValue({
      codaApiToken: "coda_token",
      codaDocId: null,
    } as never);

    const result = await ensureProviderMetricsRulesForConnectedProviders({
      userId: "user_1",
    });

    expect(result).toEqual({ created: 0, examined: 0 });
    expect(prismaMock.integrationRule.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.integrationRule.create).not.toHaveBeenCalled();
  });

  it("does not bootstrap resource-scoped providers from token-only credentials", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([
      { provider: IntegrationProvider.SEMRUSH },
      { provider: IntegrationProvider.WEBFLOW },
    ]);
    vi.mocked(getCredentials).mockResolvedValue({
      semrushApiToken: "semrush_token",
      semrushDomain: null,
      webflowApiToken: "webflow_token",
      webflowSiteId: null,
    } as never);

    const result = await ensureProviderMetricsRulesForConnectedProviders({
      userId: "user_1",
    });

    expect(result).toEqual({ created: 0, examined: 0 });
    expect(prismaMock.integrationRule.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.integrationRule.create).not.toHaveBeenCalled();
  });

  it("bootstraps only the Meta Instagram rule when only Instagram credentials are runnable", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([
      { provider: IntegrationProvider.META_PAGE },
    ]);
    prismaMock.integrationRule.findUnique.mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue({
      metaPageAccessToken: "meta-page-token",
      metaPageId: null,
      metaInstagramAccountId: "ig_123",
    } as never);

    const result = await ensureProviderMetricsRulesForConnectedProviders({
      userId: "user_1",
    });

    expect(result).toEqual({ created: 1, examined: 1 });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.META_PAGE,
        key: META_INSTAGRAM_METRICS_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: IntegrationProvider.META_PAGE,
        key: META_PAGE_METRICS_RULE_KEY,
      }),
    });
  });

  it("bootstraps only the Meta Page rule when only Page credentials are runnable", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([
      { provider: IntegrationProvider.META_PAGE },
    ]);
    prismaMock.integrationRule.findUnique.mockResolvedValue(null);
    vi.mocked(getCredentials).mockResolvedValue({
      metaPageAccessToken: "meta-page-token",
      metaPageId: "page_123",
      metaInstagramAccountId: null,
    } as never);

    const result = await ensureProviderMetricsRulesForConnectedProviders({
      userId: "user_1",
    });

    expect(result).toEqual({ created: 1, examined: 1 });
    expect(prismaMock.integrationRule.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.integrationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.META_PAGE,
        key: META_PAGE_METRICS_RULE_KEY,
        enabled: true,
      }),
    });
    expect(prismaMock.integrationRule.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: IntegrationProvider.META_PAGE,
        key: META_INSTAGRAM_METRICS_RULE_KEY,
      }),
    });
  });

  it("passes the provider sync date window to Meta Instagram pulls", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValueOnce({
      ...makeRule({
        provider: IntegrationProvider.META_PAGE,
        key: META_INSTAGRAM_METRICS_RULE_KEY,
      }),
      config: {
        rangePreset: "30d",
        contextKey: "default",
        metaPageId: "page_123",
        metaInstagramAccountId: "ig_123",
      },
      checkpoint: {
        lastRunAt: "2026-05-31T12:00:00.000Z",
        from: "2026-05-03",
        to: "2026-05-31",
        rangePreset: "30d",
        snapshotKey: "instagram",
        syncMode: "incremental",
      },
    });
    vi.mocked(getCredentials).mockResolvedValueOnce({
      metaPageAccessToken: "meta-page-token",
      metaPageId: "page_from_credentials",
      metaInstagramAccountId: "ig_from_credentials",
    } as never);
    vi.mocked(fetchMetaInstagramData).mockResolvedValueOnce({
      followers: 1200,
      reach30d: 300,
      engagement30d: 75,
      traffic: 0,
      bounceRate: 0,
      clicks: 0,
      returningVisitors: 0,
      topPosts: [],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);

    await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: META_INSTAGRAM_METRICS_RULE_KEY,
    });

    expect(fetchMetaInstagramData).toHaveBeenCalledWith(
      "meta-page-token",
      "ig_123",
      { pageId: "page_123" },
      new Date("2026-05-03T00:00:00.000Z"),
      new Date("2026-06-01T23:59:59.999Z"),
    );
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.META_PAGE,
      mode: "incremental",
      windowStart: new Date("2026-05-03T00:00:00.000Z"),
      windowEnd: new Date("2026-06-01T23:59:59.999Z"),
      checkpoint: expect.objectContaining({
        ruleKey: META_INSTAGRAM_METRICS_RULE_KEY,
        snapshotKey: "instagram",
        from: "2026-05-03",
        to: "2026-06-01",
      }),
    }));
  });

  it("retries transient provider fetch failures before persisting raw records", async () => {
    vi.mocked(fetchStripeData).mockRejectedValueOnce(
      new Error("Stripe 503 temporarily unavailable"),
    );

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    });

    expect(fetchStripeData).toHaveBeenCalledTimes(2);
    expect(storeAnalyticsSnapshot).toHaveBeenCalledOnce();
    expect(ingestImladrisRawRecords).toHaveBeenCalledOnce();
    expect(result.rawRecordCount).toBe(7);
    expect(result.acceptedRawRecordCount).toBe(7);
  });

  it("times out hung provider fetches and records the rule failure", async () => {
    process.env.PROVIDER_SYNC_TIMEOUT_MS = "50";
    vi.mocked(fetchStripeData).mockImplementation(
      () => new Promise(() => undefined) as never,
    );

    const observed = runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
    }).then(
      () => ({ status: "resolved" as const }),
      (error) => ({
        status: "rejected" as const,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(151);

    await expect(
      Promise.race([
        observed,
        Promise.resolve({ status: "pending" as const }),
      ]),
    ).resolves.toEqual({
      status: "rejected",
      message: "Provider metrics sync timed out after 50ms",
    });
    expect(fetchStripeData).toHaveBeenCalledTimes(3);
    expect(prismaMock.integrationRule.update).toHaveBeenCalledWith({
      where: { id: "rule_1" },
      data: expect.objectContaining({
        lastError: "Provider metrics sync timed out after 50ms",
      }),
    });
    expect(storeAnalyticsSnapshot).not.toHaveBeenCalled();
    expect(ingestImladrisRawRecords).not.toHaveBeenCalled();
  });

  it("uses a 13-month historical window for provider backfills", async () => {
    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      mode: "backfill",
    });

    expect(fetchStripeData).toHaveBeenCalledWith("sk_test_123", {
      fromDate: new Date("2025-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      mode: "historical",
      windowStart: new Date("2025-05-01T00:00:00.000Z"),
      windowEnd: new Date("2026-06-01T23:59:59.999Z"),
      checkpoint: expect.objectContaining({
        syncMode: "backfill",
        from: "2025-05-01",
        to: "2026-06-01",
      }),
    }));
    expect(result.from).toBe("2025-05-01");
    expect(result.to).toBe("2026-06-01");
  });

  it("uses a 13-month historical window on the first scheduled provider run", async () => {
    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      mode: "incremental",
    });

    expect(fetchStripeData).toHaveBeenCalledWith("sk_test_123", {
      fromDate: new Date("2025-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      mode: "historical",
      windowStart: new Date("2025-05-01T00:00:00.000Z"),
      windowEnd: new Date("2026-06-01T23:59:59.999Z"),
      checkpoint: expect.objectContaining({
        syncMode: "backfill",
        from: "2025-05-01",
        to: "2026-06-01",
      }),
    }));
    expect(result.from).toBe("2025-05-01");
    expect(result.to).toBe("2026-06-01");
  });

  it("uses incremental windows after a historical provider checkpoint exists", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValueOnce({
      ...makeRule(),
      lastRunAt: new Date("2026-05-31T12:00:00.000Z"),
      checkpoint: {
        lastRunAt: "2026-05-31T12:00:00.000Z",
        syncMode: "backfill",
        from: "2025-04-30",
        to: "2026-05-31",
        snapshotKey: "stripe",
      },
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      mode: "incremental",
    });

    expect(fetchStripeData).toHaveBeenCalledWith("sk_test_123", {
      fromDate: new Date("2026-05-03T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      mode: "incremental",
      windowStart: new Date("2026-05-03T00:00:00.000Z"),
      windowEnd: new Date("2026-06-01T23:59:59.999Z"),
      checkpoint: expect.objectContaining({
        syncMode: "incremental",
        from: "2026-05-03",
        to: "2026-06-01",
      }),
    }));
    expect(result.from).toBe("2026-05-03");
    expect(result.to).toBe("2026-06-01");
  });

  it("repairs stale incremental checkpoints by catching up from the last covered day", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValueOnce({
      ...makeRule(),
      lastRunAt: new Date("2026-03-15T12:00:00.000Z"),
      checkpoint: {
        lastRunAt: "2026-03-15T12:00:00.000Z",
        syncMode: "incremental",
        from: "2026-02-14",
        to: "2026-03-15",
        snapshotKey: "stripe",
      },
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      mode: "incremental",
    });

    expect(fetchStripeData).toHaveBeenCalledWith("sk_test_123", {
      fromDate: new Date("2026-03-15T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      mode: "incremental",
      windowStart: new Date("2026-03-15T00:00:00.000Z"),
      windowEnd: new Date("2026-06-01T23:59:59.999Z"),
      checkpoint: expect.objectContaining({
        syncMode: "incremental",
        from: "2026-03-15",
        to: "2026-06-01",
      }),
    }));
    expect(result.from).toBe("2026-03-15");
    expect(result.to).toBe("2026-06-01");
  });

  it("retries historical coverage after a failed first provider run", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValueOnce({
      ...makeRule(),
      lastRunAt: new Date("2026-05-31T12:00:00.000Z"),
      checkpoint: {},
      lastError: "Stripe 503 temporarily unavailable",
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      mode: "incremental",
    });

    expect(fetchStripeData).toHaveBeenCalledWith("sk_test_123", {
      fromDate: new Date("2025-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      mode: "historical",
      windowStart: new Date("2025-05-01T00:00:00.000Z"),
      windowEnd: new Date("2026-06-01T23:59:59.999Z"),
      checkpoint: expect.objectContaining({
        syncMode: "backfill",
        from: "2025-05-01",
        to: "2026-06-01",
      }),
    }));
    expect(result.from).toBe("2025-05-01");
    expect(result.to).toBe("2026-06-01");
  });

  it("stores Mercury balances and transactions using canonical finance object types", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.MERCURY,
        key: MERCURY_CASHFLOW_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({ mercuryKey: "mercury_test" } as never);

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: MERCURY_CASHFLOW_SYNC_RULE_KEY,
    });

    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.MERCURY,
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "account_balance",
          externalId: "mercury:account_balance:acct_1",
          payload: expect.objectContaining({
            accountId: "acct_1",
            balance: 250000,
          }),
        }),
        expect.objectContaining({
          objectType: "transaction",
          externalId: "mercury:transaction:tx_1",
          occurredAt: "2026-05-27T00:00:00.000Z",
          payload: expect.objectContaining({
            amount: -65000,
          }),
        }),
      ]),
    }));
    expect(result.rawRecordCount).toBeGreaterThanOrEqual(3);
  });

  it("runs Coda provider rules into Imladris raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.CODA,
        key: CODA_DOC_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      codaApiToken: "coda_test",
      codaDocId: "dCoda123",
    } as never);

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: CODA_DOC_SYNC_RULE_KEY,
    });

    expect(fetchCodaData).toHaveBeenCalledWith("coda_test", "dCoda123", {
      fromDate: new Date("2025-05-01T00:00:00.000Z"),
      toDate: new Date("2026-06-01T23:59:59.999Z"),
    });
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.CODA,
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "recent_card",
          externalId: "coda:recent_card:row_1",
          payload: expect.objectContaining({
            id: "row_1",
            sourcePath: "recentCards",
            snapshotKey: "coda",
          }),
        }),
      ]),
      checkpoint: expect.objectContaining({
        ruleKey: CODA_DOC_SYNC_RULE_KEY,
        snapshotKey: "coda",
        syncMode: "backfill",
      }),
    }));
    expect(result.provider).toBe(IntegrationProvider.CODA);
    expect(result.snapshotKey).toBe("coda");
    expect(result.rawRecordCount).toBe(7);
    expect(result.acceptedRawRecordCount).toBe(7);
  });

  it("runs PostHog, Linear, and GitHub provider rules into Imladris raw records", async () => {
    const cases = [
      {
        ruleKey: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
        provider: IntegrationProvider.POSTHOG,
        snapshotKey: "posthog",
        credentials: {
          posthogApiKey: "phx_test",
          posthogProjectId: "12345",
          posthogHost: "https://us.posthog.com",
        },
        fetcher: fetchPostHogData,
        expectedFetchArgs: {
          apiKey: "phx_test",
          projectId: "12345",
          host: "https://us.posthog.com",
        },
        expectedObjectType: "event",
      },
      {
        ruleKey: LINEAR_ISSUES_SYNC_RULE_KEY,
        provider: IntegrationProvider.LINEAR,
        snapshotKey: "linear",
        credentials: { linearApiKey: "lin_test" },
        fetcher: fetchLinearData,
        expectedFetchArgs: { apiKey: "lin_test" },
        expectedObjectType: "issue",
      },
      {
        ruleKey: GITHUB_PULL_REQUESTS_SYNC_RULE_KEY,
        provider: IntegrationProvider.GITHUB,
        snapshotKey: "github",
        credentials: {
          githubToken: "ghp_test",
          githubOwner: "example",
          githubRepo: "imladris",
        },
        fetcher: fetchGitHubData,
        expectedFetchArgs: {
          token: "ghp_test",
          owner: "example",
          repo: "imladris",
        },
        expectedObjectType: "pull_request",
      },
    ] as const;

    for (const testCase of cases) {
      vi.clearAllMocks();
      prismaMock.integrationRule.findUnique.mockResolvedValue(
        makeRule({
          provider: testCase.provider,
          key: testCase.ruleKey,
        }),
      );
      prismaMock.integrationRule.update.mockResolvedValue(
        makeRule({
          provider: testCase.provider,
          key: testCase.ruleKey,
        }),
      );
      prismaMock.integrationConnection.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.user.findUnique.mockResolvedValue({ organizationId: "org_1" });
      vi.mocked(getCredentials).mockResolvedValue(testCase.credentials as never);
      vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
        syncRunId: "sync_1",
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 2,
        errorCount: 0,
      });

      const result = await runProviderMetricsRule({
        userId: "user_1",
        ruleKey: testCase.ruleKey,
      });

      expect(testCase.fetcher).toHaveBeenCalledWith(expect.objectContaining({
        ...testCase.expectedFetchArgs,
        fromDate: expect.any(Date),
        toDate: expect.any(Date),
      }));
      expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: testCase.snapshotKey,
        userId: "user_1",
      }));
      expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
        provider: testCase.provider,
        context: {
          userId: "user_1",
          organizationId: "org_1",
        },
        checkpoint: expect.objectContaining({
          ruleKey: testCase.ruleKey,
          snapshotKey: testCase.snapshotKey,
        }),
        records: expect.arrayContaining([
          expect.objectContaining({
            objectType: testCase.expectedObjectType,
          }),
        ]),
      }));
      expect(result.snapshotKey).toBe(testCase.snapshotKey);
      expect(result.rawRecordCount).toBe(2);
      expect(result.acceptedRawRecordCount).toBe(2);
    }
  });

  it("uses PostHog event timestamps as raw record occurrence times", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.POSTHOG,
        key: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.POSTHOG,
        key: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      posthogApiKey: "phx_test",
      posthogProjectId: "12345",
    } as never);

    await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: POSTHOG_PRODUCT_EVENTS_SYNC_RULE_KEY,
    });

    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.POSTHOG,
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "event",
          externalId: "posthog:event:evt_1",
          occurredAt: "2026-05-30T10:00:00.000Z",
          sourceUpdatedAt: "2026-05-30T10:00:00.000Z",
          payload: expect.objectContaining({
            id: "evt_1",
            timestamp: "2026-05-30T10:00:00.000Z",
          }),
        }),
      ]),
    }));
  });

  it("runs SEMrush provider rules into Imladris raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.SEMRUSH,
        key: SEMRUSH_DOMAIN_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.SEMRUSH,
        key: SEMRUSH_DOMAIN_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      semrushApiToken: "semrush-token",
      semrushDomain: "example.com",
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 3,
      acceptedCount: 3,
      errorCount: 0,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: SEMRUSH_DOMAIN_SYNC_RULE_KEY,
    });

    expect(fetchSemrushData).toHaveBeenCalledWith("semrush-token", "example.com");
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "semrush",
      userId: "user_1",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.SEMRUSH,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: expect.objectContaining({
        ruleKey: SEMRUSH_DOMAIN_SYNC_RULE_KEY,
        snapshotKey: "semrush",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
        }),
        expect.objectContaining({
          objectType: "top_keyword",
        }),
      ]),
    }));
    expect(result.snapshotKey).toBe("semrush");
    expect(result.rawRecordCount).toBe(3);
    expect(result.acceptedRawRecordCount).toBe(3);
  });

  it("runs Google Analytics provider rules into Imladris raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.GOOGLE_ANALYTICS,
        key: GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.GOOGLE_ANALYTICS,
        key: GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      gaPropertyId: "123456",
      gaClientEmail: "analytics@example.iam.gserviceaccount.com",
      gaPrivateKey: "private-key",
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 4,
      acceptedCount: 4,
      errorCount: 0,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
    });

    expect(fetchGAData).toHaveBeenCalledWith(
      "123456",
      "analytics@example.iam.gserviceaccount.com",
      "private-key",
      {
        fromDate: expect.any(Date),
        toDate: expect.any(Date),
      },
    );
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "googleAnalytics",
      userId: "user_1",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.GOOGLE_ANALYTICS,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: expect.objectContaining({
        ruleKey: GOOGLE_ANALYTICS_TRAFFIC_SYNC_RULE_KEY,
        snapshotKey: "googleAnalytics",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
        }),
        expect.objectContaining({
          objectType: "traffic_by_channel",
        }),
      ]),
    }));
    expect(result.snapshotKey).toBe("googleAnalytics");
    expect(result.rawRecordCount).toBe(4);
    expect(result.acceptedRawRecordCount).toBe(4);
  });

  it("runs Google Search Console provider rules into Imladris raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        key: GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        key: GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      searchConsoleAccessToken: "gsc-token",
      searchConsoleSiteUrl: "https://example.com/",
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 6,
      acceptedCount: 6,
      errorCount: 0,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
    });

    expect(fetchGoogleSearchConsoleData).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "gsc-token",
      siteUrl: "https://example.com/",
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    }));
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "googleSearchConsole",
      userId: "user_1",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: expect.objectContaining({
        ruleKey: GOOGLE_SEARCH_CONSOLE_SYNC_RULE_KEY,
        snapshotKey: "googleSearchConsole",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
        }),
        expect.objectContaining({
          objectType: "top_query",
          externalId: "googleSearchConsole:top_query:imladris analytics",
        }),
        expect.objectContaining({
          objectType: "top_page",
          externalId: "googleSearchConsole:top_page:https://example.com/pricing",
        }),
      ]),
    }));
    expect(result.snapshotKey).toBe("googleSearchConsole");
    expect(result.rawRecordCount).toBe(6);
    expect(result.acceptedRawRecordCount).toBe(6);
  });

  it("runs HubSpot provider rules into Imladris raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      hubspotToken: "hubspot-token",
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 5,
      acceptedCount: 5,
      errorCount: 0,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
    });

    expect(fetchHubSpotData).toHaveBeenCalledWith("hubspot-token", {
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
    });
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "hubspot",
      userId: "user_1",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.HUBSPOT,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: expect.objectContaining({
        ruleKey: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
        snapshotKey: "hubspot",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
        }),
        expect.objectContaining({
          objectType: "deal",
          externalId: "hubspot:deal:deal_1",
        }),
        expect.objectContaining({
          objectType: "funnel_stage",
        }),
      ]),
    }));
    expect(result.snapshotKey).toBe("hubspot");
    expect(result.rawRecordCount).toBe(5);
    expect(result.acceptedRawRecordCount).toBe(5);
  });

  it("persists nested HubSpot deal stage history as parent-scoped raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.HUBSPOT,
        key: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({ hubspotToken: "hubspot-token" } as never);
    vi.mocked(fetchHubSpotData).mockResolvedValue({
      totalDeals: 1,
      closedWon: 0,
      closedLost: 0,
      winRate: 0,
      pipelineValue: 42000,
      avgDealSize: 42000,
      recentContacts: 1,
      funnelStages: [],
      dealsBySource: [],
      deals: [
        {
          dealId: "deal_1",
          dealName: "Acme expansion",
          stageId: "contractsent",
          stageLabel: "Contract Sent",
          amount: 42000,
          source: "Organic Search",
          ownerId: "owner_1",
          repName: "Ada Lovelace",
          updatedAt: "2026-05-31T10:00:00.000Z",
          createdAt: "2026-05-15T10:00:00.000Z",
          closedAt: null,
          pipelineId: "default",
          contactIds: ["contact_1"],
          primaryContactId: "contact_1",
          primaryContactEmail: "buyer@example.com",
          stageHistory: [
            {
              occurredAt: "2026-05-20T15:30:00.000Z",
              stageId: "contractsent",
              stageLabel: "Contract Sent",
            },
          ],
        },
        {
          dealId: "deal_2",
          dealName: "Globex expansion",
          stageId: "contractsent",
          stageLabel: "Contract Sent",
          amount: 12000,
          source: "Partner",
          ownerId: "owner_1",
          repName: "Ada Lovelace",
          updatedAt: "2026-05-31T11:00:00.000Z",
          createdAt: "2026-05-16T10:00:00.000Z",
          closedAt: null,
          pipelineId: "default",
          contactIds: ["contact_2"],
          primaryContactId: "contact_2",
          primaryContactEmail: "buyer2@example.com",
          stageHistory: [
            {
              occurredAt: "2026-05-21T15:30:00.000Z",
              stageId: "contractsent",
              stageLabel: "Contract Sent",
            },
          ],
        },
      ],
      subscriptionDeals: [],
      repScoreboard: [],
      _meta: { fetchedAt: "2026-06-01T12:00:00.000Z" },
    } as never);

    await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: HUBSPOT_PIPELINE_SYNC_RULE_KEY,
    });

    const ingestionInput = vi.mocked(ingestImladrisRawRecords).mock.calls[0]?.[0];
    const stageHistoryRecords =
      ingestionInput?.records.filter((record) => record.objectType === "stage_history") ?? [];

    expect(ingestionInput).toEqual(expect.objectContaining({
      provider: IntegrationProvider.HUBSPOT,
    }));
    expect(stageHistoryRecords).toHaveLength(2);
    expect(stageHistoryRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "stage_history",
        externalId: expect.stringContaining("hubspot:deal:deal_1"),
        occurredAt: "2026-05-20T15:30:00.000Z",
        sourceUpdatedAt: "2026-05-20T15:30:00.000Z",
        payload: expect.objectContaining({
          sourcePath: "deals.stageHistory",
          sourceParentExternalId: "hubspot:deal:deal_1",
          snapshotKey: "hubspot",
          stageId: "contractsent",
          stageLabel: "Contract Sent",
        }),
      }),
      expect.objectContaining({
        objectType: "stage_history",
        externalId: expect.stringContaining("hubspot:deal:deal_2"),
        occurredAt: "2026-05-21T15:30:00.000Z",
        sourceUpdatedAt: "2026-05-21T15:30:00.000Z",
        payload: expect.objectContaining({
          sourcePath: "deals.stageHistory",
          sourceParentExternalId: "hubspot:deal:deal_2",
          snapshotKey: "hubspot",
          stageId: "contractsent",
          stageLabel: "Contract Sent",
        }),
      }),
    ]));
  });

  it("runs Slack provider rules into Imladris raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.SLACK,
        key: SLACK_ACTIVITY_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.SLACK,
        key: SLACK_ACTIVITY_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      slackAccessToken: "xoxb-slack-token",
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 4,
      acceptedCount: 4,
      errorCount: 0,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: SLACK_ACTIVITY_SYNC_RULE_KEY,
    });

    expect(fetchSlackData).toHaveBeenCalledWith({
      accessToken: "xoxb-slack-token",
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
      channelIds: undefined,
    });
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "slack",
      userId: "user_1",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.SLACK,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: expect.objectContaining({
        ruleKey: SLACK_ACTIVITY_SYNC_RULE_KEY,
        snapshotKey: "slack",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
        }),
        expect.objectContaining({
          objectType: "channel",
          externalId: "slack:channel:C123",
        }),
        expect.objectContaining({
          objectType: "message",
          externalId: "slack:message:1780240800.000000",
        }),
      ]),
    }));
    expect(result.snapshotKey).toBe("slack");
    expect(result.rawRecordCount).toBe(4);
    expect(result.acceptedRawRecordCount).toBe(4);
  });

  it("runs Google Workspace provider rules into Imladris raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.GOOGLE_WORKSPACE,
        key: GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      googleWorkspaceAccessToken: "google-workspace-token",
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 4,
      acceptedCount: 4,
      errorCount: 0,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
    });

    expect(fetchGoogleWorkspaceData).toHaveBeenCalledWith({
      accessToken: "google-workspace-token",
      fromDate: expect.any(Date),
      toDate: expect.any(Date),
      calendarIds: undefined,
    });
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "googleWorkspace",
      userId: "user_1",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: expect.objectContaining({
        ruleKey: GOOGLE_WORKSPACE_ACTIVITY_SYNC_RULE_KEY,
        snapshotKey: "googleWorkspace",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
        }),
        expect.objectContaining({
          objectType: "calendar_event",
          externalId: "googleWorkspace:calendar_event:evt_1",
        }),
        expect.objectContaining({
          objectType: "email_thread",
          externalId: "googleWorkspace:email_thread:thread_1",
        }),
        expect.objectContaining({
          objectType: "document",
          externalId: "googleWorkspace:document:file_1",
        }),
      ]),
    }));
    expect(result.snapshotKey).toBe("googleWorkspace");
    expect(result.rawRecordCount).toBe(4);
    expect(result.acceptedRawRecordCount).toBe(4);
  });

  it("runs Webflow provider rules into Imladris raw records", async () => {
    prismaMock.integrationRule.findUnique.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.WEBFLOW,
        key: WEBFLOW_SITE_SYNC_RULE_KEY,
      }),
    );
    prismaMock.integrationRule.update.mockResolvedValue(
      makeRule({
        provider: IntegrationProvider.WEBFLOW,
        key: WEBFLOW_SITE_SYNC_RULE_KEY,
      }),
    );
    vi.mocked(getCredentials).mockResolvedValue({
      webflowApiToken: "webflow-token",
      webflowSiteId: "site_1",
    } as never);
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 5,
      acceptedCount: 5,
      errorCount: 0,
    });

    const result = await runProviderMetricsRule({
      userId: "user_1",
      ruleKey: WEBFLOW_SITE_SYNC_RULE_KEY,
    });

    expect(fetchWebflowData).toHaveBeenCalledWith(
      "webflow-token",
      "site_1",
      expect.any(Date),
      expect.any(Date),
    );
    expect(storeAnalyticsSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "webflow",
      userId: "user_1",
    }));
    expect(ingestImladrisRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.WEBFLOW,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: expect.objectContaining({
        ruleKey: WEBFLOW_SITE_SYNC_RULE_KEY,
        snapshotKey: "webflow",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "snapshot",
        }),
        expect.objectContaining({
          objectType: "page",
          externalId: "webflow:page:page_1",
        }),
        expect.objectContaining({
          objectType: "collection",
          externalId: "webflow:collection:collection_1",
        }),
        expect.objectContaining({
          objectType: "form_submission",
        }),
      ]),
    }));
    expect(result.snapshotKey).toBe("webflow");
    expect(result.rawRecordCount).toBe(5);
    expect(result.acceptedRawRecordCount).toBe(5);
  });

  it("fails the provider sync when raw Imladris ingestion rejects all records", async () => {
    vi.mocked(ingestImladrisRawRecords).mockResolvedValueOnce({
      syncRunId: "sync_failed",
      status: "ERROR",
      recordCount: 7,
      acceptedCount: 0,
      errorCount: 7,
    });

    await expect(
      runProviderMetricsRule({
        userId: "user_1",
        ruleKey: STRIPE_REVENUE_SYNC_RULE_KEY,
      }),
    ).rejects.toThrow("Imladris raw ingestion failed");

    expect(prismaMock.integrationRule.update).toHaveBeenCalledWith({
      where: { id: "rule_1" },
      data: expect.objectContaining({
        lastError: "Imladris raw ingestion failed for stripe_revenue_sync: 0/7 records accepted.",
      }),
    });
    expect(prismaMock.integrationConnection.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CONNECTED",
          lastError: null,
        }),
      }),
    );
  });
});

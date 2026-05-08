import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "admin" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    integrationConnection: {
      findMany: vi.fn(),
    },
    analyticsSnapshot: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
  hasIntegrationCredential: vi.fn(
    (provider: IntegrationProvider, credentials: Record<string, unknown>) => {
      if (provider === IntegrationProvider.GOOGLE_ANALYTICS) {
        return Boolean(credentials.gaPropertyId && credentials.gaClientEmail && credentials.gaPrivateKey);
      }
      if (provider === IntegrationProvider.GOOGLE_ADS) {
        return Boolean(
          credentials.googleAdsDevToken &&
            credentials.googleAdsCustomerId &&
            credentials.googleAdsRefreshToken &&
            credentials.googleAdsClientId &&
            credentials.googleAdsClientSecret
        );
      }
      if (provider === IntegrationProvider.PYLON) {
        return Boolean(credentials.pylonApiKey);
      }
      return false;
    }
  ),
  defaultFreshnessSnapshot: vi.fn((provider: IntegrationProvider) => ({
    provider,
    source: "none",
    status: null,
    connectedAt: null,
    lastSyncedAt: null,
    lastError: null,
  })),
}));

vi.mock("@/lib/analytics/provider-health", () => ({
  snapshotKeysForIntegrationProvider: vi.fn((provider: IntegrationProvider) => {
    if (provider === IntegrationProvider.META_ADS) return ["metaAds"];
    if (provider === IntegrationProvider.META_PAGE) return ["metaPage"];
    if (provider === IntegrationProvider.GOOGLE_ADS) return ["googleAds"];
    if (provider === IntegrationProvider.GOOGLE_ANALYTICS) return ["googleAnalytics"];
    if (provider === IntegrationProvider.PYLON) return ["pylon"];
    return ["slack"];
  }),
  snapshotsForProvider: vi.fn(() => []),
  evaluateProviderSyncHealth: vi.fn(() => ({
    syncHealth: "missing",
    syncHealthReason: "No integration credentials found.",
    lastSnapshotAt: null,
    lastSnapshotStatus: null,
  })),
}));

vi.mock("@/lib/integrations/env-diagnostic", () => ({
  logIntegrationEnvDiagnostic: vi.fn(),
}));

vi.mock("@/lib/integrations/catalog", () => ({
  listIntegrationDefinitions: vi.fn(() => [
    {
      slug: "google-workspace",
      provider: IntegrationProvider.GOOGLE_WORKSPACE,
      name: "Google Workspace",
      description: "Google Workspace integration",
      capabilities: ["Gmail"],
      authType: "oauth",
    },
    {
      slug: "hubspot",
      provider: IntegrationProvider.HUBSPOT,
      name: "HubSpot",
      description: "HubSpot integration",
      capabilities: ["Deals"],
      authType: "oauth",
    },
    {
      slug: "slack",
      provider: IntegrationProvider.SLACK,
      name: "Slack",
      description: "Slack integration",
      capabilities: ["Notifications"],
      authType: "oauth",
    },
    {
      slug: "coda",
      provider: IntegrationProvider.CODA,
      name: "Coda",
      description: "Coda integration",
      capabilities: ["Docs"],
      authType: "token",
    },
    {
      slug: "reddit",
      provider: IntegrationProvider.REDDIT,
      name: "Reddit",
      description: "Reddit integration",
      capabilities: ["Threads"],
      authType: "oauth",
    },
    {
      slug: "google-analytics",
      provider: IntegrationProvider.GOOGLE_ANALYTICS,
      name: "Google Analytics",
      description: "Google Analytics integration",
      capabilities: ["Traffic"],
      authType: "token",
    },
    {
      slug: "stripe",
      provider: IntegrationProvider.STRIPE,
      name: "Stripe",
      description: "Stripe integration",
      capabilities: ["Revenue"],
      authType: "oauth",
    },
    {
      slug: "mercury",
      provider: IntegrationProvider.MERCURY,
      name: "Mercury",
      description: "Mercury integration",
      capabilities: ["Cashflow"],
      authType: "oauth",
    },
    {
      slug: "webflow",
      provider: IntegrationProvider.WEBFLOW,
      name: "Webflow",
      description: "Webflow integration",
      capabilities: ["Sites"],
      authType: "oauth",
    },
    {
      slug: "google-ads",
      provider: IntegrationProvider.GOOGLE_ADS,
      name: "Google Ads",
      description: "Google Ads integration",
      capabilities: ["Campaigns"],
      authType: "oauth",
    },
    {
      slug: "meta-ads",
      provider: IntegrationProvider.META_ADS,
      name: "Meta Ads",
      description: "Meta Ads integration",
      capabilities: ["Campaigns"],
      authType: "oauth",
    },
    {
      slug: "meta-page",
      provider: IntegrationProvider.META_PAGE,
      name: "Meta Page",
      description: "Meta Page integration",
      capabilities: ["Pages"],
      authType: "token",
    },
    {
      slug: "pylon",
      provider: IntegrationProvider.PYLON,
      name: "Pylon",
      description: "Pylon integration",
      capabilities: ["Conversations"],
      authType: "token",
    },
  ]),
  isIntegrationConfigured: vi.fn(() => true),
  getMissingIntegrationEnv: vi.fn(() => []),
}));

function freshness(
  provider: IntegrationProvider,
  source: "connection" | "env" | "none"
) {
  return {
    provider,
    source,
    status: null,
    connectedAt: null,
    lastSyncedAt: null,
    lastError: null,
  };
}

describe("GET /api/integrations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns integrations across all providers with credentialSource", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { getCredentials } = await import("@/lib/analytics/credentials");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.groupBy)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    vi.mocked(getCredentials).mockResolvedValue({
      hubspotToken: null,
      stripeKey: null,
      mercuryKey: null,
      gaPropertyId: "ga-prop",
      gaClientEmail: "ga@example.com",
      gaPrivateKey: "ga-key",
      googleAdsDevToken: "dev",
      googleAdsCustomerId: "customer",
      googleAdsRefreshToken: "refresh",
      googleAdsClientId: "client",
      googleAdsClientSecret: "secret",
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
      pylonApiKey: "pylon",
      googleWorkspaceAccessToken: null,
      slackAccessToken: null,
      freshness: {
        [IntegrationProvider.GOOGLE_WORKSPACE]: freshness(IntegrationProvider.GOOGLE_WORKSPACE, "none"),
        [IntegrationProvider.HUBSPOT]: freshness(IntegrationProvider.HUBSPOT, "none"),
        [IntegrationProvider.SLACK]: freshness(IntegrationProvider.SLACK, "env"),
        [IntegrationProvider.CODA]: freshness(IntegrationProvider.CODA, "none"),
        [IntegrationProvider.REDDIT]: freshness(IntegrationProvider.REDDIT, "none"),
        [IntegrationProvider.GOOGLE_ANALYTICS]: freshness(IntegrationProvider.GOOGLE_ANALYTICS, "env"),
        [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE, "none"),
        [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY, "none"),
        [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW, "none"),
        [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS, "env"),
        [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS, "none"),
        [IntegrationProvider.META_PAGE]: freshness(IntegrationProvider.META_PAGE, "none"),
        [IntegrationProvider.PYLON]: freshness(IntegrationProvider.PYLON, "env"),
      },
    } as never);

    const { GET } = await import("@/app/api/integrations/route");
    const response = await GET({} as never);
    const body = (await response.json()) as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(12);
    for (const item of body) {
      expect(item).toHaveProperty("metadata");
      expect(
        item.metadata === null || (typeof item.metadata === "object" && !Array.isArray(item.metadata))
      ).toBe(true);
    }
    expect(body.some((item) => item.provider === IntegrationProvider.PYLON)).toBe(true);
    expect(
      body.find((item) => item.provider === IntegrationProvider.GOOGLE_ADS)?.connected
    ).toBe(true);
    expect(
      body.find((item) => item.provider === IntegrationProvider.GOOGLE_ANALYTICS)?.connected
    ).toBe(true);
    expect(body.find((item) => item.provider === IntegrationProvider.PYLON)?.connected).toBe(true);
    expect(
      body.find((item) => item.provider === IntegrationProvider.GOOGLE_ADS)?.credentialSource
    ).toBe("env");
    expect(
      body.find((item) => item.provider === IntegrationProvider.GOOGLE_ANALYTICS)?.credentialSource
    ).toBe("env");
    expect(prisma.analyticsSnapshot.groupBy).toHaveBeenCalledTimes(2);
  });

  it("falls back to safe freshness when a provider freshness entry is missing", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { getCredentials } = await import("@/lib/analytics/credentials");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-2" } } as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.groupBy)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const freshnessMap = {
      [IntegrationProvider.GOOGLE_WORKSPACE]: freshness(IntegrationProvider.GOOGLE_WORKSPACE, "none"),
      [IntegrationProvider.HUBSPOT]: freshness(IntegrationProvider.HUBSPOT, "none"),
      [IntegrationProvider.SLACK]: freshness(IntegrationProvider.SLACK, "none"),
      [IntegrationProvider.CODA]: freshness(IntegrationProvider.CODA, "none"),
      [IntegrationProvider.REDDIT]: freshness(IntegrationProvider.REDDIT, "none"),
      [IntegrationProvider.GOOGLE_ANALYTICS]: freshness(IntegrationProvider.GOOGLE_ANALYTICS, "none"),
      [IntegrationProvider.STRIPE]: freshness(IntegrationProvider.STRIPE, "none"),
      [IntegrationProvider.MERCURY]: freshness(IntegrationProvider.MERCURY, "none"),
      [IntegrationProvider.WEBFLOW]: freshness(IntegrationProvider.WEBFLOW, "none"),
      [IntegrationProvider.GOOGLE_ADS]: freshness(IntegrationProvider.GOOGLE_ADS, "none"),
      [IntegrationProvider.META_ADS]: freshness(IntegrationProvider.META_ADS, "none"),
      // META_PAGE intentionally omitted to validate safe fallback.
      [IntegrationProvider.PYLON]: freshness(IntegrationProvider.PYLON, "none"),
    } as unknown as Record<IntegrationProvider, ReturnType<typeof freshness>>;

    vi.mocked(getCredentials).mockResolvedValue({
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
      googleWorkspaceAccessToken: null,
      slackAccessToken: null,
      freshness: freshnessMap,
    } as never);

    const { GET } = await import("@/app/api/integrations/route");
    const response = await GET({} as never);
    const body = (await response.json()) as Array<Record<string, unknown>>;
    const metaPage = body.find((item) => item.provider === IntegrationProvider.META_PAGE);

    expect(response.status).toBe(200);
    expect(metaPage?.credentialSource).toBe("none");
  });
});

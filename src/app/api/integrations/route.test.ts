import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSnapshotStatus, IntegrationProvider } from "@/generated/prisma/client";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: vi.fn(),
    },
    analyticsSnapshot: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
}));

vi.mock("@/lib/analytics/provider-health", () => ({
  snapshotKeysForIntegrationProvider: vi.fn(() => ["slack"]),
  snapshotsForProvider: vi.fn(() => []),
  evaluateProviderSyncHealth: vi.fn(() => ({
    syncHealth: "missing",
    syncHealthReason: "No integration credentials found.",
    lastSnapshotAt: null,
    lastSnapshotStatus: null,
  })),
}));

vi.mock("@/lib/integrations/catalog", () => ({
  listIntegrationDefinitions: vi.fn(() => [
    {
      slug: "slack",
      provider: IntegrationProvider.SLACK,
      name: "Slack",
      description: "Slack integration",
      capabilities: ["Notifications"],
      authType: "oauth",
    },
  ]),
  isIntegrationConfigured: vi.fn(() => true),
  getMissingIntegrationEnv: vi.fn(() => []),
}));

describe("GET /api/integrations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns credentialSource in payload", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { getCredentials } = await import("@/lib/analytics/credentials");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

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
      metaAdAccountId: null,
      metaPageId: null,
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
      freshness: {
        [IntegrationProvider.GOOGLE_WORKSPACE]: {
          provider: IntegrationProvider.GOOGLE_WORKSPACE,
          source: "none",
          status: null,
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
        },
        [IntegrationProvider.HUBSPOT]: {
          provider: IntegrationProvider.HUBSPOT,
          source: "none",
          status: null,
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
        },
        [IntegrationProvider.SLACK]: {
          provider: IntegrationProvider.SLACK,
          source: "env",
          status: null,
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
        },
        [IntegrationProvider.CODA]: {
          provider: IntegrationProvider.CODA,
          source: "none",
          status: null,
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
        },
        [IntegrationProvider.REDDIT]: {
          provider: IntegrationProvider.REDDIT,
          source: "none",
          status: null,
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
        },
        [IntegrationProvider.STRIPE]: {
          provider: IntegrationProvider.STRIPE,
          source: "none",
          status: null,
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
        },
        [IntegrationProvider.MERCURY]: {
          provider: IntegrationProvider.MERCURY,
          source: "none",
          status: null,
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
        },
        [IntegrationProvider.WEBFLOW]: {
          provider: IntegrationProvider.WEBFLOW,
          source: "none",
          status: null,
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
        },
      },
    } as never);

    const { GET } = await import("@/app/api/integrations/route");
    const response = await GET();
    const body = (await response.json()) as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(body[0]?.credentialSource).toBe("env");
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        distinct: ["providerKey"],
      })
    );
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          status: AnalyticsSnapshotStatus.SUCCESS,
        }),
      })
    );
  });
});

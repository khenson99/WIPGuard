import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AnalyticsSnapshotStatus, IntegrationProvider } from "@/generated/prisma/client";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOwnerUserId: vi.fn((userId: string) => `owner:${userId}`),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsSnapshot: { findMany: vi.fn() },
  },
}));

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

describe("GET /api/analytics/summary", () => {
  beforeEach(async () => {
    vi.resetAllMocks();

    const { auth } = await import("@/lib/auth");
    const { getCredentials } = await import("@/lib/analytics/credentials");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "viewer@example.com" },
    } as never);

    vi.mocked(getCredentials).mockResolvedValue({
      hubspotToken: "hubspot-token",
      stripeKey: "stripe-token",
      mercuryKey: "mercury-token",
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
    } as never);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "mercury",
        status: AnalyticsSnapshotStatus.SUCCESS,
        expiresAt: new Date("2099-02-10T00:00:00.000Z"),
        capturedAt: new Date("2026-02-10T00:00:00.000Z"),
        lastError: null,
      },
    ] as never);
  });

  it("uses the integration owner for credentials and snapshot health", async () => {
    const { getCredentials } = await import("@/lib/analytics/credentials");
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/analytics/summary/route");

    const response = await GET(
      new NextRequest("http://localhost/api/analytics/summary?range=30d"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getCredentials).toHaveBeenCalledWith("owner:user-1");
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner:user-1",
        }),
      }),
    );
    expect(body.primarySections.some((section: { status: string }) => section.status !== "missing")).toBe(true);
  });
});

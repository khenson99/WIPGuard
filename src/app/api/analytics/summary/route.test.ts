import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    retentionTenantCurrent: { count: vi.fn() },
    retentionSyncRun: { findFirst: vi.fn() },
    retentionSourceRecord: { groupBy: vi.fn(), findMany: vi.fn() },
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
      user: { id: "user-1", email: "viewer@example.com", organizationId: "org_1" },
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
    vi.mocked(prisma.retentionTenantCurrent.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.retentionSyncRun.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.retentionSourceRecord.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.retentionSourceRecord.findMany).mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("marks retention as degraded when Arda is fallback-only", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/analytics/summary/route");

    vi.mocked(prisma.retentionTenantCurrent.count).mockResolvedValue(5 as never);
    vi.mocked(prisma.retentionSyncRun.findFirst).mockResolvedValue({
      startedAt: new Date("2026-03-16T01:00:03.635Z"),
      lastError: null,
      status: "SUCCESS",
    } as never);
    vi.mocked(prisma.retentionSourceRecord.groupBy).mockResolvedValue([
      {
        objectType: "tenant",
        _count: { _all: 18 },
      },
    ] as never);
    vi.mocked(prisma.retentionSourceRecord.findMany).mockResolvedValue([
      {
        payload: {
          userDetailsCardCount: 103,
          userDetailsItemCount: 102,
          userDetailsOrderCount: 0,
        },
      },
    ] as never);

    const response = await GET(new NextRequest("http://localhost/api/analytics/summary?range=30d"));
    const body = await response.json();
    const retention = body.primarySections.find((section: { id: string }) => section.id === "retention");

    expect(response.status).toBe(200);
    expect(retention.status).toBe("degraded");
  });

  it("marks retention as degraded when the latest sync errored even if tenant rows exist", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/analytics/summary/route");

    vi.mocked(prisma.retentionTenantCurrent.count).mockResolvedValue(5 as never);
    vi.mocked(prisma.retentionSyncRun.findFirst).mockResolvedValue({
      startedAt: new Date("2026-03-16T01:00:03.635Z"),
      lastError: "Arda sync failed",
      status: "ERROR",
    } as never);

    const response = await GET(new NextRequest("http://localhost/api/analytics/summary?range=30d"));
    const body = await response.json();
    const retention = body.primarySections.find((section: { id: string }) => section.id === "retention");

    expect(response.status).toBe(200);
    expect(retention.status).toBe("degraded");
  });

  it("uses aliased provider snapshots when deriving summary child health", async () => {
    const { getCredentials } = await import("@/lib/analytics/credentials");
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/analytics/summary/route");

    vi.mocked(getCredentials).mockResolvedValue({
      gaPropertyId: "properties/123",
      gaClientEmail: "ga@example.com",
      gaPrivateKey: "private-key",
    } as never);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "google_analytics",
        status: AnalyticsSnapshotStatus.SUCCESS,
        expiresAt: new Date("2099-02-10T00:00:00.000Z"),
        capturedAt: new Date("2026-02-10T00:00:00.000Z"),
        lastError: null,
      },
    ] as never);

    const response = await GET(new NextRequest("http://localhost/api/analytics/summary?range=30d"));
    const body = await response.json();
    const website = body.primarySections.find((section: { id: string }) => section.id === "website-traffic");
    const googleAnalytics = website.children.find(
      (child: { id: string }) => child.id === "ads-google-analytics",
    );

    expect(response.status).toBe(200);
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerKey: {
            in: expect.arrayContaining(["googleAnalytics", "google_analytics"]),
          },
        }),
      }),
    );
    expect(googleAnalytics.status).toBe("connected");
    expect(googleAnalytics.lastSnapshotAt).toBe("2026-02-10T00:00:00.000Z");
  });

  it("ignores future-dated snapshots when deriving summary child health", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
    const { getCredentials } = await import("@/lib/analytics/credentials");
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("@/app/api/analytics/summary/route");

    vi.mocked(getCredentials).mockResolvedValue({
      gaPropertyId: "properties/123",
      gaClientEmail: "ga@example.com",
      gaPrivateKey: "private-key",
    } as never);
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "googleAnalytics",
        status: AnalyticsSnapshotStatus.SUCCESS,
        expiresAt: new Date("2099-02-11T00:00:00.000Z"),
        capturedAt: new Date("2026-02-11T00:00:00.000Z"),
        lastError: null,
      },
    ] as never);

    const response = await GET(new NextRequest("http://localhost/api/analytics/summary?range=30d"));
    const body = await response.json();
    const website = body.primarySections.find((section: { id: string }) => section.id === "website-traffic");
    const googleAnalytics = website.children.find(
      (child: { id: string }) => child.id === "ads-google-analytics",
    );

    expect(response.status).toBe(200);
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          capturedAt: { lte: new Date("2026-02-10T12:00:00.000Z") },
        }),
      }),
    );
    expect(googleAnalytics.status).toBe("degraded");
    expect(googleAnalytics.lastSnapshotAt).toBeNull();
  });
});

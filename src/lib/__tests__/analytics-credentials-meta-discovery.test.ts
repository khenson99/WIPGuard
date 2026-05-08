import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";

const {
  mockIntegrationConnectionFindMany,
  mockIntegrationConnectionUpsert,
} = vi.hoisted(() => ({
  mockIntegrationConnectionFindMany: vi.fn(),
  mockIntegrationConnectionUpsert: vi.fn(),
}));

const {
  mockDiscoverMetaAdAccountId,
  mockDiscoverMetaPageAndInstagram,
} = vi.hoisted(() => ({
  mockDiscoverMetaAdAccountId: vi.fn(),
  mockDiscoverMetaPageAndInstagram: vi.fn(),
}));

const { mockGetValidIntegrationAccessToken } = vi.hoisted(() => ({
  mockGetValidIntegrationAccessToken: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: mockIntegrationConnectionFindMany,
      upsert: mockIntegrationConnectionUpsert,
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/meta-auth", () => ({
  discoverMetaAdAccountId: mockDiscoverMetaAdAccountId,
  discoverMetaPageAndInstagram: mockDiscoverMetaPageAndInstagram,
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: mockGetValidIntegrationAccessToken,
}));

describe("analytics credentials meta discovery gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_AD_ACCOUNT_ID;
    delete process.env.META_PAGE_ID;
    delete process.env.META_INSTAGRAM_ACCOUNT_ID;
  });

  it("discovers missing instagramAccountId when pageId is already configured", async () => {
    process.env.META_ACCESS_TOKEN = "meta-token";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      {
        provider: IntegrationProvider.META_ADS,
        status: IntegrationConnectionStatus.DISCONNECTED,
        accessToken: null,
        refreshToken: null,
        tokenType: "Bearer",
        expiresAt: null,
        scopes: [],
        metadata: {
          adAccountId: "act_123",
          pageId: "page_existing",
        },
        connectedAt: new Date("2026-02-20T00:00:00.000Z"),
        lastSyncedAt: null,
        lastError: null,
      },
    ]);

    mockDiscoverMetaPageAndInstagram.mockResolvedValueOnce({
      pageId: "page_discovered",
      instagramAccountId: "ig_discovered",
    });

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.metaPageId).toBe("page_existing");
    expect(creds.metaInstagramAccountId).toBe("ig_discovered");

    expect(mockDiscoverMetaAdAccountId).not.toHaveBeenCalled();
    expect(mockDiscoverMetaPageAndInstagram).toHaveBeenCalledWith({
      accessToken: expect.any(String),
    });

    expect(mockIntegrationConnectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: { userId: "user_1", provider: IntegrationProvider.META_ADS },
        },
        update: {
          metadata: expect.objectContaining({
            pageId: "page_existing",
            instagramAccountId: "ig_discovered",
            metaDiscoveredAt: expect.any(String),
          }),
        },
      })
    );
  });

  it("discovers missing pageId when instagramAccountId is already configured", async () => {
    process.env.META_ACCESS_TOKEN = "meta-token";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      {
        provider: IntegrationProvider.META_ADS,
        status: IntegrationConnectionStatus.DISCONNECTED,
        accessToken: null,
        refreshToken: null,
        tokenType: "Bearer",
        expiresAt: null,
        scopes: [],
        metadata: {
          adAccountId: "act_123",
          instagramAccountId: "ig_existing",
        },
        connectedAt: new Date("2026-02-20T00:00:00.000Z"),
        lastSyncedAt: null,
        lastError: null,
      },
    ]);

    mockDiscoverMetaPageAndInstagram.mockResolvedValueOnce({
      pageId: "page_discovered",
      instagramAccountId: "ig_discovered",
    });

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.metaPageId).toBe("page_discovered");
    expect(creds.metaInstagramAccountId).toBe("ig_existing");

    expect(mockDiscoverMetaAdAccountId).not.toHaveBeenCalled();
    expect(mockDiscoverMetaPageAndInstagram).toHaveBeenCalledWith({
      accessToken: expect.any(String),
    });

    expect(mockIntegrationConnectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: { userId: "user_1", provider: IntegrationProvider.META_ADS },
        },
        update: {
          metadata: expect.objectContaining({
            pageId: "page_discovered",
            instagramAccountId: "ig_existing",
            metaDiscoveredAt: expect.any(String),
          }),
        },
      })
    );
  });

  it("keeps Meta Page credentials separate from Meta Ads credentials", async () => {
    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      {
        userId: "user_1",
        provider: IntegrationProvider.META_ADS,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "plainv1.ads",
        refreshToken: null,
        tokenType: "Bearer",
        expiresAt: null,
        scopes: [],
        metadata: {
          adAccountId: "act_123",
        },
        connectedAt: new Date("2026-02-20T00:00:00.000Z"),
        lastSyncedAt: null,
        lastError: null,
      },
      {
        userId: "user_1",
        provider: IntegrationProvider.META_PAGE,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "plainv1.page",
        refreshToken: null,
        tokenType: "Bearer",
        expiresAt: null,
        scopes: [],
        metadata: {
          pageId: "page_123",
          instagramAccountId: "ig_123",
        },
        connectedAt: new Date("2026-02-20T00:00:00.000Z"),
        lastSyncedAt: null,
        lastError: null,
      },
    ]);
    mockGetValidIntegrationAccessToken.mockImplementation(
      async ({ provider }: { provider: IntegrationProvider }) =>
        provider === IntegrationProvider.META_ADS ? "ads-token" : "page-token"
    );

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.metaAdsAccessToken).toBe("ads-token");
    expect(creds.metaPageAccessToken).toBe("page-token");
    expect(creds.metaAccessToken).toBe("ads-token");
    expect(creds.metaAdAccountId).toBe("act_123");
    expect(creds.metaPageId).toBe("page_123");
  });
});

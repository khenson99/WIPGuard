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
});


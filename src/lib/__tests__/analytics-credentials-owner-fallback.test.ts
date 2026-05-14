import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";

const {
  mockIntegrationConnectionFindMany,
  mockIntegrationConnectionUpdateMany,
  mockIntegrationConnectionUpdate,
  mockIntegrationConnectionUpsert,
} = vi.hoisted(() => ({
  mockIntegrationConnectionFindMany: vi.fn(),
  mockIntegrationConnectionUpdateMany: vi.fn(),
  mockIntegrationConnectionUpdate: vi.fn(),
  mockIntegrationConnectionUpsert: vi.fn(),
}));

const { mockGetValidIntegrationAccessToken } = vi.hoisted(() => ({
  mockGetValidIntegrationAccessToken: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: mockIntegrationConnectionFindMany,
      updateMany: mockIntegrationConnectionUpdateMany,
      update: mockIntegrationConnectionUpdate,
      upsert: mockIntegrationConnectionUpsert,
    },
  },
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: mockGetValidIntegrationAccessToken,
}));

describe("analytics credentials owner fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTEGRATION_OWNER_USER_ID = "owner_1";
  });

  afterEach(() => {
    delete process.env.INTEGRATION_OWNER_USER_ID;
    delete process.env.SEMRUSH_API_TOKEN;
    delete process.env.SEMRUSH_DOMAIN;
  });

  it("fills a missing Stripe provider from another connected user when the owner has other rows", async () => {
    mockIntegrationConnectionFindMany
      .mockResolvedValueOnce([
        {
          userId: "owner_1",
          provider: IntegrationProvider.SLACK,
          status: IntegrationConnectionStatus.DISCONNECTED,
          accessToken: null,
          refreshToken: null,
          tokenType: null,
          expiresAt: null,
          scopes: [],
          metadata: null,
          connectedAt: new Date("2026-03-01T00:00:00.000Z"),
          lastSyncedAt: null,
          lastError: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          userId: "member_2",
          provider: IntegrationProvider.STRIPE,
          status: IntegrationConnectionStatus.CONNECTED,
          accessToken: "plainv1.stripe-access",
          refreshToken: "plainv1.stripe-refresh",
          tokenType: "Bearer",
          expiresAt: null,
          scopes: ["read_write"],
          metadata: null,
          connectedAt: new Date("2026-03-02T00:00:00.000Z"),
          lastSyncedAt: new Date("2026-03-02T01:00:00.000Z"),
          lastError: null,
        },
      ]);

    mockGetValidIntegrationAccessToken.mockResolvedValue("sk_live_connected");

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("owner_1");

    expect(mockIntegrationConnectionFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId: { not: "owner_1" },
          status: IntegrationConnectionStatus.CONNECTED,
        },
      })
    );
    expect(mockGetValidIntegrationAccessToken).toHaveBeenCalledWith({
      userId: "member_2",
      provider: IntegrationProvider.STRIPE,
    });
    expect(creds.stripeKey).toBe("sk_live_connected");
    expect(creds.freshness[IntegrationProvider.STRIPE]).toEqual(
      expect.objectContaining({
        provider: IntegrationProvider.STRIPE,
        source: "connection",
        status: IntegrationConnectionStatus.CONNECTED,
      })
    );
  });

  it("prefers a connected Stripe fallback when the owner row exists but is disconnected", async () => {
    mockIntegrationConnectionFindMany
      .mockResolvedValueOnce([
        {
          userId: "owner_1",
          provider: IntegrationProvider.STRIPE,
          status: IntegrationConnectionStatus.DISCONNECTED,
          accessToken: null,
          refreshToken: null,
          tokenType: null,
          expiresAt: null,
          scopes: [],
          metadata: null,
          connectedAt: new Date("2026-03-01T00:00:00.000Z"),
          lastSyncedAt: null,
          lastError: "stale owner row",
        },
      ])
      .mockResolvedValueOnce([
        {
          userId: "member_2",
          provider: IntegrationProvider.STRIPE,
          status: IntegrationConnectionStatus.CONNECTED,
          accessToken: "plainv1.stripe-access",
          refreshToken: "plainv1.stripe-refresh",
          tokenType: "Bearer",
          expiresAt: null,
          scopes: ["read_write"],
          metadata: null,
          connectedAt: new Date("2026-03-02T00:00:00.000Z"),
          lastSyncedAt: new Date("2026-03-02T01:00:00.000Z"),
          lastError: null,
        },
      ]);

    mockGetValidIntegrationAccessToken.mockResolvedValue("sk_live_connected");

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("owner_1");

    expect(mockIntegrationConnectionFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId: { not: "owner_1" },
          status: IntegrationConnectionStatus.CONNECTED,
        },
      })
    );
    expect(mockGetValidIntegrationAccessToken).toHaveBeenCalledWith({
      userId: "member_2",
      provider: IntegrationProvider.STRIPE,
    });
    expect(creds.stripeKey).toBe("sk_live_connected");
    expect(creds.freshness[IntegrationProvider.STRIPE]).toEqual(
      expect.objectContaining({
        provider: IntegrationProvider.STRIPE,
        source: "connection",
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: null,
      })
    );
  });

  it("uses a saved SEMrush token and domain from the integration connection", async () => {
    mockIntegrationConnectionFindMany
      .mockResolvedValueOnce([
        {
          userId: "owner_1",
          provider: IntegrationProvider.SEMRUSH,
          status: IntegrationConnectionStatus.CONNECTED,
          accessToken: "plainv1.semrush-token",
          refreshToken: null,
          tokenType: "Bearer",
          expiresAt: null,
          scopes: [],
          metadata: { domain: "example.com" },
          connectedAt: new Date("2026-03-03T00:00:00.000Z"),
          lastSyncedAt: new Date("2026-03-03T01:00:00.000Z"),
          lastError: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const { getCredentials, hasIntegrationCredential } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("owner_1");

    expect(creds.semrushApiToken).toBe("semrush-token");
    expect(creds.semrushDomain).toBe("example.com");
    expect(hasIntegrationCredential(IntegrationProvider.SEMRUSH, creds)).toBe(true);
    expect(creds.freshness[IntegrationProvider.SEMRUSH]).toEqual(
      expect.objectContaining({
        provider: IntegrationProvider.SEMRUSH,
        source: "connection",
        status: IntegrationConnectionStatus.CONNECTED,
      })
    );
  });

  it("requires both SEMrush token and domain for env fallback credentials", async () => {
    mockIntegrationConnectionFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    process.env.SEMRUSH_API_TOKEN = "env-semrush-token";

    const { getCredentials, hasIntegrationCredential } = await import("@/lib/analytics/credentials");
    const withoutDomain = await getCredentials("owner_1");

    expect(withoutDomain.semrushApiToken).toBe("env-semrush-token");
    expect(withoutDomain.semrushDomain).toBeNull();
    expect(hasIntegrationCredential(IntegrationProvider.SEMRUSH, withoutDomain)).toBe(false);
    expect(withoutDomain.freshness[IntegrationProvider.SEMRUSH]).toEqual(
      expect.objectContaining({
        provider: IntegrationProvider.SEMRUSH,
        source: "none",
      })
    );

    mockIntegrationConnectionFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    process.env.SEMRUSH_DOMAIN = "example.com";

    const withDomain = await getCredentials("owner_1");
    expect(withDomain.semrushApiToken).toBe("env-semrush-token");
    expect(withDomain.semrushDomain).toBe("example.com");
    expect(hasIntegrationCredential(IntegrationProvider.SEMRUSH, withDomain)).toBe(true);
    expect(withDomain.freshness[IntegrationProvider.SEMRUSH]).toEqual(
      expect.objectContaining({
        provider: IntegrationProvider.SEMRUSH,
        source: "env",
      })
    );
  });
});

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
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.MERCURY_API_TOKEN;
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

  it("uses env Stripe and Mercury keys when connected rows cannot resolve tokens", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_env";
    process.env.MERCURY_API_TOKEN = "mercury_env";

    mockIntegrationConnectionFindMany
      .mockResolvedValueOnce([
        {
          userId: "owner_1",
          provider: IntegrationProvider.STRIPE,
          status: IntegrationConnectionStatus.CONNECTED,
          accessToken: null,
          refreshToken: null,
          tokenType: "Bearer",
          expiresAt: null,
          scopes: [],
          metadata: null,
          connectedAt: new Date("2026-03-01T00:00:00.000Z"),
          lastSyncedAt: null,
          lastError: "token missing",
        },
        {
          userId: "owner_1",
          provider: IntegrationProvider.MERCURY,
          status: IntegrationConnectionStatus.CONNECTED,
          accessToken: null,
          refreshToken: null,
          tokenType: "Bearer",
          expiresAt: null,
          scopes: [],
          metadata: null,
          connectedAt: new Date("2026-03-01T00:00:00.000Z"),
          lastSyncedAt: null,
          lastError: "token missing",
        },
      ])
      .mockResolvedValueOnce([]);

    mockGetValidIntegrationAccessToken.mockResolvedValue(null);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("owner_1");

    expect(creds.stripeKey).toBe("sk_live_env");
    expect(creds.mercuryKey).toBe("mercury_env");
    expect(creds.freshness[IntegrationProvider.STRIPE]).toEqual(
      expect.objectContaining({
        source: "env",
        status: null,
      }),
    );
    expect(creds.freshness[IntegrationProvider.MERCURY]).toEqual(
      expect.objectContaining({
        source: "env",
        status: null,
      }),
    );
  });
});

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

const {
  mockRefreshOAuthToken,
  mockCompactErrorMessage,
} = vi.hoisted(() => ({
  mockRefreshOAuthToken: vi.fn(),
  mockCompactErrorMessage: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
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

vi.mock("@/lib/integrations/oauth", () => ({
  refreshOAuthToken: mockRefreshOAuthToken,
  compactErrorMessage: mockCompactErrorMessage,
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: mockGetValidIntegrationAccessToken,
}));

describe("analytics credentials OAuth refresh persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.INTEGRATION_TOKEN_SECRET = "test-secret";
    process.env.HUBSPOT_CLIENT_ID = "hubspot-client";
    process.env.HUBSPOT_CLIENT_SECRET = "hubspot-secret";
    mockIntegrationConnectionUpdateMany.mockResolvedValue({ count: 1 });
    mockIntegrationConnectionUpdate.mockResolvedValue({});
    mockIntegrationConnectionUpsert.mockResolvedValue({});
    mockGetValidIntegrationAccessToken.mockRejectedValue(new Error("still unavailable"));
  });

  afterEach(() => {
    delete process.env.INTEGRATION_TOKEN_SECRET;
    delete process.env.HUBSPOT_CLIENT_ID;
    delete process.env.HUBSPOT_CLIENT_SECRET;
  });

  it("creates a missing connection row when required OAuth refresh failure persistence updates zero rows", async () => {
    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      {
        userId: "user_1",
        provider: IntegrationProvider.HUBSPOT,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "plainv1.expired-hubspot-token",
        refreshToken: "plainv1.revoked-refresh-token",
        tokenType: "Bearer",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        scopes: ["oauth"],
        metadata: null,
        connectedAt: new Date("2025-12-01T00:00:00.000Z"),
        lastSyncedAt: new Date("2025-12-02T00:00:00.000Z"),
        lastError: null,
      },
    ]);
    mockRefreshOAuthToken.mockRejectedValueOnce(new Error("refresh token revoked"));
    mockIntegrationConnectionUpdateMany.mockResolvedValueOnce({ count: 0 });

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const credentials = await getCredentials("user_1");

    expect(credentials.freshness[IntegrationProvider.HUBSPOT]).toEqual(
      expect.objectContaining({
        provider: IntegrationProvider.HUBSPOT,
        source: "none",
        status: IntegrationConnectionStatus.ERROR,
        lastError: "refresh token revoked",
      })
    );
    expect(mockIntegrationConnectionUpsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user_1",
          provider: IntegrationProvider.HUBSPOT,
        },
      },
      update: {
        status: IntegrationConnectionStatus.ERROR,
        lastError: "refresh token revoked",
        lastSyncedAt: null,
      },
      create: {
        userId: "user_1",
        provider: IntegrationProvider.HUBSPOT,
        status: IntegrationConnectionStatus.ERROR,
        lastError: "refresh token revoked",
        lastSyncedAt: null,
      },
    });
  });

  it("upserts refreshed tokens so successful required OAuth refresh can recreate a missing connection row", async () => {
    const refreshedExpiresAt = new Date("2026-06-01T00:00:00.000Z");
    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      {
        userId: "user_1",
        provider: IntegrationProvider.HUBSPOT,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "plainv1.expired-hubspot-token",
        refreshToken: "plainv1.refresh-token",
        tokenType: "Bearer",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        scopes: ["oauth"],
        metadata: null,
        connectedAt: new Date("2025-12-01T00:00:00.000Z"),
        lastSyncedAt: new Date("2025-12-02T00:00:00.000Z"),
        lastError: null,
      },
    ]);
    mockRefreshOAuthToken.mockResolvedValueOnce({
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
      tokenType: "Bearer",
      expiresAt: refreshedExpiresAt,
      scopes: ["oauth", "crm.objects.contacts.read"],
      raw: {},
    });
    mockGetValidIntegrationAccessToken.mockResolvedValueOnce("fresh-access-token");

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const credentials = await getCredentials("user_1");

    expect(credentials.hubspotToken).toBe("fresh-access-token");
    expect(mockIntegrationConnectionUpdate).not.toHaveBeenCalled();
    expect(mockIntegrationConnectionUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: IntegrationConnectionStatus.ERROR,
        }),
      })
    );
    expect(mockIntegrationConnectionUpsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user_1",
          provider: IntegrationProvider.HUBSPOT,
        },
      },
      update: expect.objectContaining({
        accessToken: expect.stringMatching(/^encv1\./),
        refreshToken: expect.stringMatching(/^encv1\./),
        tokenType: "Bearer",
        expiresAt: refreshedExpiresAt,
        scopes: ["oauth", "crm.objects.contacts.read"],
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: null,
      }),
      create: expect.objectContaining({
        userId: "user_1",
        provider: IntegrationProvider.HUBSPOT,
        accessToken: expect.stringMatching(/^encv1\./),
        refreshToken: expect.stringMatching(/^encv1\./),
        tokenType: "Bearer",
        expiresAt: refreshedExpiresAt,
        scopes: ["oauth", "crm.objects.contacts.read"],
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: null,
      }),
    });
  });
});

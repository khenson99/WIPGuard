import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("token refresh", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.INTEGRATION_TOKEN_SECRET = "test-integration-secret";
    process.env.HUBSPOT_CLIENT_ID = "hubspot-client";
    process.env.HUBSPOT_CLIENT_SECRET = "hubspot-secret";
    process.env.META_APP_ID = "meta-app";
    process.env.META_APP_SECRET = "meta-secret";
    vi.mocked(prisma.integrationConnection.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValue({} as never);
  });

  it("refreshes an expired HubSpot OAuth token and persists it with an upsert", async () => {
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValueOnce({
      id: "c1",
      userId: "user_1",
      provider: IntegrationProvider.HUBSPOT,
      status: IntegrationConnectionStatus.CONNECTED,
      providerAccountId: "hub-1",
      accountLabel: "test",
      scopes: [],
      accessToken: "plainv1.old_access",
      refreshToken: "plainv1.refresh",
      tokenType: null,
      expiresAt: new Date(Date.now() - 60_000),
      connectedAt: new Date(),
      lastSyncedAt: null,
      lastError: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          access_token: "new_access",
          refresh_token: "new_refresh",
          token_type: "bearer",
          expires_in: 3600,
        }),
        text: async () => "",
      }))
    );

    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValueOnce({} as never);

    const token = await getValidIntegrationAccessToken({
      userId: "user_1",
      provider: IntegrationProvider.HUBSPOT,
    });

    expect(token).toBe("new_access");
    expect(prisma.integrationConnection.update).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: "user_1",
            provider: IntegrationProvider.HUBSPOT,
          },
        },
        update: expect.objectContaining({
          accessToken: expect.stringMatching(/^encv1\./),
          refreshToken: expect.stringMatching(/^encv1\./),
          tokenType: "bearer",
          status: IntegrationConnectionStatus.CONNECTED,
          lastError: null,
        }),
        create: expect.objectContaining({
          userId: "user_1",
          provider: IntegrationProvider.HUBSPOT,
          accessToken: expect.stringMatching(/^encv1\./),
          refreshToken: expect.stringMatching(/^encv1\./),
          tokenType: "bearer",
          status: IntegrationConnectionStatus.CONNECTED,
          lastError: null,
        }),
      })
    );
  });

  it("exchanges a Meta token for a long-lived token when expiring", async () => {
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValueOnce({
      id: "c2",
      userId: "user_1",
      provider: IntegrationProvider.META_ADS,
      status: IntegrationConnectionStatus.CONNECTED,
      providerAccountId: "meta-1",
      accountLabel: "test",
      scopes: [],
      accessToken: "plainv1.short_lived",
      refreshToken: null,
      tokenType: null,
      expiresAt: new Date(Date.now() + 10_000),
      connectedAt: new Date(),
      lastSyncedAt: null,
      lastError: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          access_token: "long_lived",
          expires_in: 60 * 24 * 60 * 60,
        }),
        text: async () => "",
      }))
    );

    vi.mocked(prisma.integrationConnection.upsert).mockResolvedValueOnce({} as never);

    const token = await getValidIntegrationAccessToken({
      userId: "user_1",
      provider: IntegrationProvider.META_ADS,
    });

    expect(token).toBe("long_lived");
    expect(prisma.integrationConnection.update).not.toHaveBeenCalled();
    expect(prisma.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: {
            userId: "user_1",
            provider: IntegrationProvider.META_ADS,
          },
        },
        update: expect.objectContaining({
          accessToken: expect.stringMatching(/^encv1\./),
          refreshToken: null,
          tokenType: "Bearer",
          status: IntegrationConnectionStatus.CONNECTED,
          lastError: null,
          metadata: expect.objectContaining({
            tokenExpiresAt: expect.any(String),
          }),
        }),
        create: expect.objectContaining({
          userId: "user_1",
          provider: IntegrationProvider.META_ADS,
          accessToken: expect.stringMatching(/^encv1\./),
          refreshToken: null,
          tokenType: "Bearer",
          status: IntegrationConnectionStatus.CONNECTED,
          lastError: null,
          metadata: expect.objectContaining({
            tokenExpiresAt: expect.any(String),
          }),
        }),
      })
    );
  });

  it("marks the connection ERROR when OAuth refresh fails", async () => {
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValueOnce({
      id: "c3",
      userId: "user_1",
      provider: IntegrationProvider.HUBSPOT,
      status: IntegrationConnectionStatus.CONNECTED,
      providerAccountId: "hub-1",
      accountLabel: "test",
      scopes: [],
      accessToken: "plainv1.old_access",
      refreshToken: "plainv1.revoked_refresh",
      tokenType: null,
      expiresAt: new Date(Date.now() - 60_000),
      connectedAt: new Date(),
      lastSyncedAt: null,
      lastError: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers(),
        json: async () => ({ error: "invalid_grant" }),
        text: async () => "invalid_grant",
      }))
    );

    await expect(
      getValidIntegrationAccessToken({
        userId: "user_1",
        provider: IntegrationProvider.HUBSPOT,
      })
    ).rejects.toThrow("invalid_grant");

    expect(prisma.integrationConnection.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        provider: IntegrationProvider.HUBSPOT,
      },
      data: {
        status: IntegrationConnectionStatus.ERROR,
        lastError: "invalid_grant",
        lastSyncedAt: null,
      },
    });
  });
});

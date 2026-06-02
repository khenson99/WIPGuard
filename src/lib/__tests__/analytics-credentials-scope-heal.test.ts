import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";

const {
  mockIntegrationConnectionFindMany,
  mockIntegrationConnectionUpdateMany,
  mockIntegrationConnectionUpsert,
} = vi.hoisted(() => ({
  mockIntegrationConnectionFindMany: vi.fn(),
  mockIntegrationConnectionUpdateMany: vi.fn(),
  mockIntegrationConnectionUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: mockIntegrationConnectionFindMany,
      updateMany: mockIntegrationConnectionUpdateMany,
      update: vi.fn(),
      upsert: mockIntegrationConnectionUpsert,
    },
  },
}));

describe("analytics credentials scope healing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears stale Google Ads missing-scope errors when aliases satisfy required scopes", async () => {
    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      {
        provider: IntegrationProvider.GOOGLE_ADS,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: null,
        refreshToken: "plainv1.google-ads-refresh",
        tokenType: "Bearer",
        expiresAt: null,
        scopes: [
          "openid",
          "https://www.googleapis.com/auth/adwords",
          "https://www.googleapis.com/auth/userinfo.email",
        ],
        metadata: {
          insufficientScopes: true,
          missingScopes: ["email"],
        },
        connectedAt: new Date("2026-02-20T00:00:00.000Z"),
        lastSyncedAt: null,
        lastError: "Missing required OAuth scopes: email",
      },
    ]);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(mockIntegrationConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_ADS,
      },
      data: expect.objectContaining({
        lastError: null,
        metadata: expect.objectContaining({
          insufficientScopes: false,
        }),
      }),
    });

    expect(creds.freshness[IntegrationProvider.GOOGLE_ADS]).toEqual(
      expect.objectContaining({
        provider: IntegrationProvider.GOOGLE_ADS,
        source: "connection",
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: null,
      })
    );
  });

  it("recreates the OAuth connection when scope healing races a missing row", async () => {
    const connectedAt = new Date("2026-02-20T00:00:00.000Z");
    const expiresAt = new Date("2026-03-20T00:00:00.000Z");
    const scopes = [
      "openid",
      "https://www.googleapis.com/auth/adwords",
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      {
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_ADS,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "enc.google-ads-access",
        refreshToken: "enc.google-ads-refresh",
        tokenType: "Bearer",
        expiresAt,
        scopes,
        metadata: {
          insufficientScopes: true,
          missingScopes: ["email"],
          customerId: "123-456-7890",
        },
        connectedAt,
        lastSyncedAt: null,
        lastError: "Missing required OAuth scopes: email",
      },
    ]);
    mockIntegrationConnectionUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockIntegrationConnectionUpsert.mockResolvedValueOnce({} as never);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(mockIntegrationConnectionUpsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user_1",
          provider: IntegrationProvider.GOOGLE_ADS,
        },
      },
      update: {
        metadata: {
          insufficientScopes: false,
          customerId: "123-456-7890",
        },
        lastError: null,
      },
      create: {
        userId: "user_1",
        provider: IntegrationProvider.GOOGLE_ADS,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "enc.google-ads-access",
        refreshToken: "enc.google-ads-refresh",
        tokenType: "Bearer",
        expiresAt,
        scopes,
        metadata: {
          insufficientScopes: false,
          customerId: "123-456-7890",
        },
        connectedAt,
        lastSyncedAt: null,
        lastError: null,
      },
    });
    expect(creds.freshness[IntegrationProvider.GOOGLE_ADS]).toEqual(
      expect.objectContaining({
        provider: IntegrationProvider.GOOGLE_ADS,
        source: "connection",
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: null,
      })
    );
  });
});

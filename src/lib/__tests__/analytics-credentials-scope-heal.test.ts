import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";

const {
  mockIntegrationConnectionFindMany,
  mockIntegrationConnectionUpdateMany,
} = vi.hoisted(() => ({
  mockIntegrationConnectionFindMany: vi.fn(),
  mockIntegrationConnectionUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: mockIntegrationConnectionFindMany,
      updateMany: mockIntegrationConnectionUpdateMany,
      update: vi.fn(),
      upsert: vi.fn(),
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
});


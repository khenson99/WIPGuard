import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
import { prisma } from "@/lib/prisma";
import { pushProspectsToHubSpot } from "./hubspot-prospect-pusher";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    manufacturerProspect: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    integrationReceipt: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    integrationRule: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: vi.fn(),
}));

vi.mock("@/lib/integrations/token-crypto", () => ({
  protectIntegrationSecret: vi.fn((value: string) => value),
  unprotectIntegrationSecret: vi.fn((value: string | null | undefined) =>
    typeof value === "string" && value.startsWith("plainv1.")
      ? value.slice("plainv1.".length)
      : value,
  ),
}));

describe("HubSpot prospect pusher auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getValidIntegrationAccessToken).mockResolvedValue("hs-token");
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      provider: IntegrationProvider.HUBSPOT,
      status: IntegrationConnectionStatus.CONNECTED,
      providerAccountId: "hubspot-account",
      accountLabel: "HubSpot",
      scopes: [],
      accessToken: "plainv1.hs-token",
      refreshToken: "plainv1.refresh-token",
      tokenType: "bearer",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      connectedAt: new Date(),
      lastSyncedAt: null,
      lastError: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.manufacturerProspect.findMany).mockResolvedValue([] as never);
  });

  it("uses the shared token refresh helper before pushing prospects", async () => {
    const result = await pushProspectsToHubSpot("user-1");

    expect(result).toEqual([]);
    expect(getValidIntegrationAccessToken).toHaveBeenCalledWith({
      userId: "user-1",
      provider: IntegrationProvider.HUBSPOT,
    });
    expect(prisma.integrationConnection.update).not.toHaveBeenCalled();
  });
});

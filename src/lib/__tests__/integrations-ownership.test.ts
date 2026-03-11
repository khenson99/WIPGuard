import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    integrationConnection: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("integration ownership", () => {
  const originalOwnerUserId = process.env.INTEGRATION_OWNER_USER_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTEGRATION_OWNER_USER_ID = "owner_1";
  });

  afterEach(() => {
    if (originalOwnerUserId == null) {
      delete process.env.INTEGRATION_OWNER_USER_ID;
      return;
    }

    process.env.INTEGRATION_OWNER_USER_ID = originalOwnerUserId;
  });

  it("recovers the owner organization from connection metadata", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { resolveIntegrationOrganizationId } = await import(
      "@/lib/integrations/ownership"
    );

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: null } as never);
    vi.mocked(prisma.integrationConnection.findMany).mockResolvedValue([
      {
        organizationId: null,
        metadata: { connectedByUserId: "user_2" },
        updatedAt: new Date(),
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { organizationId: "org_2" },
    ] as never);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);

    await expect(resolveIntegrationOrganizationId("owner_1")).resolves.toBe("org_2");
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "owner_1",
        OR: [{ organizationId: null }, { organizationId: "" }],
      },
      data: {
        organizationId: "org_2",
      },
    });
  });

  it("copies the source organization to the owner during migration", async () => {
    const { IntegrationProvider } = await import("@/generated/prisma/client");
    const { prisma } = await import("@/lib/prisma");
    const { bestEffortMigrateConnectionsToOwner } = await import(
      "@/lib/integrations/ownership"
    );

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ organizationId: null } as never);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.integrationConnection.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ provider: IntegrationProvider.CODA }] as never);
    vi.mocked(prisma.integrationConnection.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.integrationConnection.findFirst).mockResolvedValue({
      provider: IntegrationProvider.CODA,
      status: "CONNECTED",
      providerAccountId: "acct_1",
      accountLabel: "Coda",
      scopes: [],
      accessToken: "enc:token",
      refreshToken: null,
      tokenType: "Bearer",
      expiresAt: null,
      connectedAt: new Date("2026-03-10T00:00:00.000Z"),
      lastSyncedAt: new Date("2026-03-10T00:00:00.000Z"),
      lastError: null,
      metadata: { connectedByUserId: "user_2" },
      organizationId: null,
      user: {
        organizationId: "org_7",
      },
    } as never);
    vi.mocked(prisma.integrationConnection.create).mockResolvedValue({} as never);

    const result = await bestEffortMigrateConnectionsToOwner("owner_1");

    expect(result).toEqual({ copied: 1, skipped: 0 });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "owner_1",
        OR: [{ organizationId: null }, { organizationId: "" }],
      },
      data: {
        organizationId: "org_7",
      },
    });
    expect(prisma.integrationConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "owner_1",
          organizationId: "org_7",
        }),
      })
    );
  });
});

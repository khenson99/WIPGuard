import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  getAppRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationRecommendation: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/automations/recommendations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("keeps workflow owners in the inbox filter for non-admin viewers", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAppRole } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "owner_1" } } as never);
    vi.mocked(getAppRole).mockResolvedValue("member" as never);
    vi.mocked(prisma.automationRecommendation.findMany).mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/automations/recommendations/route");
    const response = await GET(
      new NextRequest("http://localhost/api/automations/recommendations")
    );

    expect(response.status).toBe(200);

    const query = vi.mocked(prisma.automationRecommendation.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown> & { OR: Array<Record<string, unknown>> };
    };

    expect(query.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflow: {
            is: {
              ownerId: "owner_1",
            },
          },
        }),
        { requestedById: "owner_1" },
        { approverId: "owner_1" },
        { executedById: "owner_1" },
      ])
    );
    expect(query.where.workflow).toBeUndefined();
  });

  it("keeps workflow owners in the inbox filter when mine-only mode is enabled", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAppRole } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "owner_2" } } as never);
    vi.mocked(getAppRole).mockResolvedValue("member" as never);
    vi.mocked(prisma.automationRecommendation.findMany).mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/automations/recommendations/route");
    const response = await GET(
      new NextRequest("http://localhost/api/automations/recommendations?mine=true")
    );

    expect(response.status).toBe(200);

    const query = vi.mocked(prisma.automationRecommendation.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown> & { OR: Array<Record<string, unknown>> };
    };

    expect(query.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflow: {
            is: {
              ownerId: "owner_2",
            },
          },
        }),
      ])
    );
    expect(query.where.OR).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflow: {
            is: {
              scope: "SHARED",
            },
          },
        }),
      ])
    );
    expect(query.where.workflow).toBeUndefined();
  });

  it("allows private-workflow participants without requiring owner or shared visibility", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAppRole } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "reviewer_1" } } as never);
    vi.mocked(getAppRole).mockResolvedValue("member" as never);
    vi.mocked(prisma.automationRecommendation.findMany).mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/automations/recommendations/route");
    const response = await GET(
      new NextRequest("http://localhost/api/automations/recommendations")
    );

    expect(response.status).toBe(200);

    const query = vi.mocked(prisma.automationRecommendation.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown> & { OR: Array<Record<string, unknown>> };
    };

    expect(query.where.OR).toEqual(
      expect.arrayContaining([{ approverId: "reviewer_1" }])
    );
    expect(query.where.workflow).toBeUndefined();
  });

  it("keeps mine-only filtering for admins", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAppRole } = await import("@/lib/permissions");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "admin_1" } } as never);
    vi.mocked(getAppRole).mockResolvedValue("admin" as never);
    vi.mocked(prisma.automationRecommendation.findMany).mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/automations/recommendations/route");
    const response = await GET(
      new NextRequest("http://localhost/api/automations/recommendations?mine=true")
    );

    expect(response.status).toBe(200);

    const query = vi.mocked(prisma.automationRecommendation.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown> & { OR: Array<Record<string, unknown>> };
    };

    expect(query.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflow: {
            is: {
              ownerId: "admin_1",
            },
          },
        }),
        { requestedById: "admin_1" },
        { approverId: "admin_1" },
        { executedById: "admin_1" },
      ])
    );
    expect(query.where.OR).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflow: {
            is: {
              scope: "SHARED",
            },
          },
        }),
      ])
    );
  });
});

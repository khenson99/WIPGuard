import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  companyGoalTracking: {
    deleteMany: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

function request(body: unknown): NextRequest {
  return new NextRequest("https://wipguard.test/api/goals/tracking", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/goals/tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the selected Linear project ids for the authenticated user scope", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: "user_1",
        organizationId: "org_1",
      },
    } as never);
    prismaMock.companyGoalTracking.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.companyGoalTracking.upsert.mockResolvedValue({});

    const { PATCH } = await import("./route");
    const response = await PATCH(request({
      linearProjectIds: [" project_1 ", "project_2", "project_1", ""],
    }));

    await expect(response.json()).resolves.toEqual({
      linearProjectIds: ["project_1", "project_2"],
    });
    expect(prismaMock.companyGoalTracking.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        scopeKey: "org:org_1",
        linearProjectId: { notIn: ["project_1", "project_2"] },
      },
    });
    expect(prismaMock.companyGoalTracking.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId_scopeKey_linearProjectId: {
          userId: "user_1",
          scopeKey: "org:org_1",
          linearProjectId: "project_1",
        },
      },
      create: expect.objectContaining({
        userId: "user_1",
        organizationId: "org_1",
        scopeKey: "org:org_1",
        linearProjectId: "project_1",
        sortOrder: 0,
      }),
      update: expect.objectContaining({
        enabled: true,
        sortOrder: 0,
      }),
    }));
  });

  it("rejects unauthenticated requests", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { PATCH } = await import("./route");
    const response = await PATCH(request({ linearProjectIds: ["project_1"] }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});

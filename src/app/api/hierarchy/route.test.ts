import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "member" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companyPriority: {
      findMany: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/hierarchy", () => {
  beforeEach(async () => {
    vi.resetAllMocks();

    const { resetHierarchyCache } = await import("@/lib/hierarchy-cache");
    resetHierarchyCache();

    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    } as never);

    const { enforcePermission } = await import("@/lib/permissions");
    vi.mocked(enforcePermission).mockResolvedValue({
      role: "member",
    } as never);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.companyPriority.findMany).mockResolvedValue([
      {
        id: "priority-1",
        name: "Revenue",
        priority: 1,
        responsible: [],
        accountable: [],
        consulted: [],
        informed: [],
        projects: [],
      },
    ] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
  });

  it("reuses the cached hierarchy response until the user cache is invalidated", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { invalidateHierarchy } = await import("@/lib/hierarchy-cache");
    const { GET } = await import("@/app/api/hierarchy/route");

    const requestUrl = "http://localhost/api/hierarchy?depth=3";

    const firstResponse = await GET(new NextRequest(requestUrl));
    const firstBody = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstBody).toMatchObject({
      mode: "tree",
      priorities: [{ id: "priority-1", name: "Revenue" }],
      orphanProjects: [],
      unassignedTasks: [],
    });
    expect(prisma.companyPriority.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.project.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.task.findMany).toHaveBeenCalledTimes(1);

    const secondResponse = await GET(new NextRequest(requestUrl));
    expect(secondResponse.status).toBe(200);
    expect(prisma.companyPriority.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.project.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.task.findMany).toHaveBeenCalledTimes(1);

    invalidateHierarchy("user-1");

    const thirdResponse = await GET(new NextRequest(requestUrl));
    expect(thirdResponse.status).toBe(200);
    expect(prisma.companyPriority.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.project.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.task.findMany).toHaveBeenCalledTimes(2);
  });
});

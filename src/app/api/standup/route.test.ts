import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/policy-check", () => ({
  loadPolicies: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

describe("GET /api/standup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/standup/route");
    const response = await GET();
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Unauthorized");
  });

  it("returns grouped standup data with coaching prompts", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();

    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { loadPolicies } = await import("@/lib/policy-check");

    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(loadPolicies).mockResolvedValue([
      { columnName: "ACTIVE", wipLimit: 1, enforcement: "hard", overrideRoles: [] },
      { columnName: "WORKING_ON_TODAY", wipLimit: 3, enforcement: "hard", overrideRoles: [] },
    ] as never);

    vi.mocked(prisma.task.groupBy).mockResolvedValue([
      { status: "ACTIVE", _count: { id: 2 } },
      { status: "NOT_DONE", _count: { id: 1 } },
      { status: "WORKING_ON_TODAY", _count: { id: 1 } },
    ] as never);

    vi.mocked(prisma.task.findMany).mockResolvedValue([
      {
        id: "t-1",
        title: "Implement dashboard card",
        status: "ACTIVE",
        priority: "P1",
        degreeOfDifficulty: "MEDIUM",
        updatedAt: now.toISOString(),
        dueDate: null,
        unplanned: false,
        project: { id: "p-1", name: "Core" },
        dependsOn: [],
        dependedBy: [],
        responsible: [{ id: "u1", name: "Alice", email: "alice@example.com", image: null }],
      },
      {
        id: "t-2",
        title: "Unblock API dependency",
        status: "NOT_DONE",
        priority: "P0",
        degreeOfDifficulty: "HIGH",
        updatedAt: old,
        dueDate: null,
        unplanned: false,
        project: { id: "p-1", name: "Core" },
        dependsOn: [{ id: "d-1", title: "Backend migration", status: "ACTIVE" }],
        dependedBy: [],
        responsible: [{ id: "u1", name: "Alice", email: "alice@example.com", image: null }],
      },
      {
        id: "t-3",
        title: "Prepare release notes",
        status: "WORKING_ON_TODAY",
        priority: "P2",
        degreeOfDifficulty: "LOW",
        updatedAt: old,
        dueDate: null,
        unplanned: true,
        project: null,
        dependsOn: [],
        dependedBy: [],
        responsible: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/standup/route");
    const response = await GET();
    const payload = (await response.json()) as {
      owners: Array<{ userId: string; blockedCount: number }>;
      unassigned: Array<{ id: string }>;
      blocked: Array<{ id: string }>;
      stale: Array<{ id: string }>;
      wipState: Array<{ column: string; exceeded: boolean }>;
      coachingPrompts: Array<{ type: string }>;
      totalActive: number;
    };

    expect(response.status).toBe(200);
    expect(payload.owners.length).toBe(1);
    expect(payload.owners[0].userId).toBe("u1");
    expect(payload.unassigned.map((task) => task.id)).toContain("t-3");
    expect(payload.blocked.map((task) => task.id)).toContain("t-2");
    expect(payload.stale.map((task) => task.id)).toEqual(expect.arrayContaining(["t-2", "t-3"]));
    expect(payload.wipState.find((entry) => entry.column === "ACTIVE")?.exceeded).toBe(true);
    expect(payload.coachingPrompts.map((prompt) => prompt.type)).toEqual(
      expect.arrayContaining(["blocked_alert", "wip_exceeded", "stale_warning"])
    );
    expect(payload.totalActive).toBe(3);
  });
});

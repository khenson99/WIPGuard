import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const txMocks = vi.hoisted(() => ({
  boardSettingsUpsert: vi.fn(),
  boardSettingsUpdateMany: vi.fn(),
  taskUpdate: vi.fn(),
  statusHistoryCreateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "member" })),
}));

vi.mock("@/lib/policy-check", () => ({
  loadPolicies: vi.fn(async () => []),
  getUserRole: vi.fn(async () => "member"),
  recordPolicyOverride: vi.fn(),
}));

vi.mock("@/lib/policy-engine", () => ({
  checkWipPolicy: vi.fn(() => ({
    allowed: true,
    requiresOverride: false,
    currentCount: 0,
    wipLimit: null,
  })),
}));

vi.mock("@/lib/socket-emit", () => ({
  emitTaskReordered: vi.fn(),
}));

vi.mock("@/lib/hierarchy-cache", () => ({
  invalidateHierarchy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    boardSettings: {
      findMany: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    logbookEntry: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input !== "function") {
        throw new Error("Expected interactive transaction");
      }

      return input({
        boardSettings: {
          upsert: txMocks.boardSettingsUpsert,
          updateMany: txMocks.boardSettingsUpdateMany,
        },
        task: {
          update: txMocks.taskUpdate,
        },
        statusHistory: {
          createMany: txMocks.statusHistoryCreateMany,
        },
      });
    }),
  },
}));

describe("PATCH /api/tasks/reorder", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    txMocks.boardSettingsUpsert.mockResolvedValue({});
    txMocks.boardSettingsUpdateMany.mockResolvedValue({ count: 1 });
    txMocks.taskUpdate.mockResolvedValue({});
    txMocks.statusHistoryCreateMany.mockResolvedValue({ count: 1 });

    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", name: "Test User" },
    } as never);

    const { enforcePermission } = await import("@/lib/permissions");
    vi.mocked(enforcePermission).mockResolvedValue({
      role: "member",
    } as never);

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.boardSettings.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.task.count).mockResolvedValue(0 as never);
  });

  it("persists status history inside the reorder transaction", async () => {
    const updatedAt = new Date("2026-03-01T12:00:00.000Z");
    const backlogUpdatedAt = new Date("2026-03-01T11:00:00.000Z");
    const activeUpdatedAt = new Date("2026-03-01T11:30:00.000Z");
    const existingTask = {
      id: "task-1",
      title: "Follow up",
      projectId: "project-1",
      status: "BACKLOG",
      columnOrder: 2,
      updatedAt,
    };

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.task.findMany)
      .mockResolvedValueOnce([existingTask] as never)
      .mockResolvedValueOnce([existingTask] as never);
    vi.mocked(prisma.boardSettings.findMany).mockResolvedValue([
      { columnName: "BACKLOG", updatedAt: backlogUpdatedAt },
      { columnName: "ACTIVE", updatedAt: activeUpdatedAt },
    ] as never);

    const { PATCH } = await import("@/app/api/tasks/reorder/route");
    const { invalidateHierarchy } = await import("@/lib/hierarchy-cache");
    const response = await PATCH(
      new NextRequest("http://localhost/api/tasks/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          items: [
            {
              taskId: "task-1",
              status: "ACTIVE",
              columnOrder: 0,
              expectedUpdatedAt: updatedAt.toISOString(),
            },
          ],
          expectedColumnVersions: {
            BACKLOG: backlogUpdatedAt.getTime(),
            ACTIVE: activeUpdatedAt.getTime(),
          },
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(txMocks.boardSettingsUpsert).toHaveBeenCalledTimes(2);
    expect(txMocks.boardSettingsUpdateMany).toHaveBeenCalledWith({
      where: { columnName: "ACTIVE", updatedAt: activeUpdatedAt },
      data: { updatedAt: expect.any(Date) },
    });
    expect(txMocks.boardSettingsUpdateMany).toHaveBeenCalledWith({
      where: { columnName: "BACKLOG", updatedAt: backlogUpdatedAt },
      data: { updatedAt: expect.any(Date) },
    });
    expect(txMocks.taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "ACTIVE",
          columnOrder: 0,
        }),
      })
    );
    expect(txMocks.statusHistoryCreateMany).toHaveBeenCalledWith({
      data: [
        {
          taskId: "task-1",
          fromStatus: "BACKLOG",
          toStatus: "ACTIVE",
          changedBy: "user-1",
        },
      ],
    });
    expect(payload.columnVersions).toMatchObject({
      BACKLOG: backlogUpdatedAt.getTime(),
      ACTIVE: activeUpdatedAt.getTime(),
    });
    expect(invalidateHierarchy).toHaveBeenCalledWith("user-1");
  });

  it("returns 409 when the column version is stale", async () => {
    const updatedAt = new Date("2026-03-01T12:00:00.000Z");
    const backlogUpdatedAt = new Date("2026-03-01T11:00:00.000Z");
    const activeUpdatedAt = new Date("2026-03-01T11:30:00.000Z");
    const existingTask = {
      id: "task-1",
      title: "Follow up",
      projectId: "project-1",
      status: "BACKLOG",
      columnOrder: 2,
      updatedAt,
    };

    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.task.findMany)
      .mockResolvedValueOnce([existingTask] as never)
      .mockResolvedValueOnce([existingTask] as never);
    vi.mocked(prisma.boardSettings.findMany).mockResolvedValue([
      { columnName: "BACKLOG", updatedAt: backlogUpdatedAt },
      { columnName: "ACTIVE", updatedAt: activeUpdatedAt },
    ] as never);
    txMocks.boardSettingsUpdateMany.mockResolvedValueOnce({ count: 0 });

    const { PATCH } = await import("@/app/api/tasks/reorder/route");
    const response = await PATCH(
      new NextRequest("http://localhost/api/tasks/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          items: [
            {
              taskId: "task-1",
              status: "ACTIVE",
              columnOrder: 0,
              expectedUpdatedAt: updatedAt.toISOString(),
            },
          ],
          expectedColumnVersions: {
            BACKLOG: backlogUpdatedAt.getTime(),
            ACTIVE: activeUpdatedAt.getTime(),
          },
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.conflict).toMatchObject({
      reason: "STALE_COLUMN_VERSION",
      columnVersions: {
        BACKLOG: backlogUpdatedAt.getTime(),
        ACTIVE: activeUpdatedAt.getTime(),
      },
    });
    expect(txMocks.taskUpdate).not.toHaveBeenCalled();
    expect(txMocks.statusHistoryCreateMany).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockWipPolicyFindMany,
  mockTaskCount,
  mockPolicyOverrideCreate,
  mockUserFindUnique,
} = vi.hoisted(() => ({
  mockWipPolicyFindMany: vi.fn(),
  mockTaskCount: vi.fn(),
  mockPolicyOverrideCreate: vi.fn(),
  mockUserFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wipPolicy: {
      findMany: mockWipPolicyFindMany,
    },
    task: {
      count: mockTaskCount,
    },
    policyOverride: {
      create: mockPolicyOverrideCreate,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

import {
  countTasksInColumn,
  enforcePolicy,
  getUserRole,
  loadPolicies,
  recordPolicyOverride,
} from "@/lib/policy-check";

describe("policy-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads WIP policies from Prisma rows", async () => {
    mockWipPolicyFindMany.mockResolvedValue([
      {
        columnName: "ACTIVE",
        wipLimit: 2,
        enforcement: "BLOCK",
        overrideRoles: ["admin"],
      },
    ]);

    await expect(loadPolicies()).resolves.toEqual([
      {
        columnName: "ACTIVE",
        wipLimit: 2,
        enforcement: "BLOCK",
        overrideRoles: ["admin"],
      },
    ]);
  });

  it("counts tasks in a column and excludes the current task when requested", async () => {
    mockTaskCount.mockResolvedValue(3);

    await expect(countTasksInColumn("ACTIVE", "task-1")).resolves.toBe(3);
    expect(mockTaskCount).toHaveBeenCalledWith({
      where: {
        status: "ACTIVE",
        id: { not: "task-1" },
      },
    });
  });

  it("blocks a transition when the WIP limit is reached for a non-override role", async () => {
    mockWipPolicyFindMany.mockResolvedValue([
      {
        columnName: "ACTIVE",
        wipLimit: 1,
        enforcement: "BLOCK",
        overrideRoles: ["admin"],
      },
    ]);
    mockTaskCount.mockResolvedValue(1);

    const result = await enforcePolicy("ACTIVE", "member");

    expect(result.allowed).toBe(false);
    expect(result.enforcement).toBe("BLOCK");
    expect(result.requiresOverride).toBe(false);
  });

  it("records policy overrides through Prisma", async () => {
    mockPolicyOverrideCreate.mockResolvedValue({ id: "override-1" });

    await recordPolicyOverride({
      taskId: "task-1",
      action: "task.reorder",
      reason: "Urgent customer escalation",
      actorId: "user-1",
      actorRole: "admin",
      column: "ACTIVE",
      wipCount: 3,
      wipLimit: 2,
    });

    expect(mockPolicyOverrideCreate).toHaveBeenCalledWith({
      data: {
        taskId: "task-1",
        action: "task.reorder",
        reason: "Urgent customer escalation",
        actorId: "user-1",
        actorRole: "admin",
        column: "ACTIVE",
        wipCount: 3,
        wipLimit: 2,
      },
    });
  });

  it("falls back to member when the user record is missing", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    await expect(getUserRole("missing-user")).resolves.toBe("member");
  });
});

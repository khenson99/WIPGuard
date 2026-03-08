import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskStatus } from "@/generated/prisma/client";
import { executeAutomationAction } from "@/lib/automations/actions";
import { prisma } from "@/lib/prisma";
import { getNextColumnOrder } from "@/lib/task-order";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      findUnique: vi.fn(),
    },
    task: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/task-order", () => ({
  getNextColumnOrder: vi.fn(),
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: vi.fn(),
}));

vi.mock("@/lib/integrations/http-client", () => ({
  fetchJsonWithResilience: vi.fn(),
  fetchWithResilience: vi.fn(),
}));

vi.mock("@/lib/integrations/slack-notifications", () => ({
  sendSlackDirectMessage: vi.fn(),
}));

describe("automation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({
      requestedById: "user_1",
      workflow: {
        ownerId: "owner_1",
      },
    } as never);
  });

  it("creates tasks using prisma-aware column ordering", async () => {
    vi.mocked(getNextColumnOrder).mockResolvedValue(4);
    vi.mocked(prisma.task.create).mockResolvedValue({
      id: "task_1",
      title: "Follow up",
    } as never);

    const result = await executeAutomationAction({
      runId: "run_1",
      actionType: "create_task",
      actionPayload: {
        title: "Follow up",
        status: "active",
        responsibleId: "user_2",
      },
    });

    expect(getNextColumnOrder).toHaveBeenCalledWith(prisma, TaskStatus.ACTIVE);
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Follow up",
        status: TaskStatus.ACTIVE,
        columnOrder: 4,
        accountable: {
          connect: [{ id: "user_1" }],
        },
        responsible: {
          connect: [{ id: "user_2" }],
        },
      }),
      select: { id: true, title: true },
    });
    expect(result).toEqual({
      actionType: "create_task",
      status: "executed",
      targetId: "task_1",
      detail: "Follow up",
    });
  });

  it("updates tasks with only normalized fields", async () => {
    vi.mocked(prisma.task.update).mockResolvedValue({
      id: "task_2",
      title: "Renamed",
    } as never);

    const result = await executeAutomationAction({
      runId: "run_1",
      actionType: "update_task",
      actionPayload: {
        taskId: "task_2",
        title: " Renamed ",
        notes: "   ",
        status: "done",
      },
    });

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "task_2" },
      data: {
        title: "Renamed",
        status: TaskStatus.DONE,
      },
      select: { id: true, title: true },
    });
    expect(result).toEqual({
      actionType: "update_task",
      status: "executed",
      targetId: "task_2",
      detail: "Renamed",
    });
  });
});

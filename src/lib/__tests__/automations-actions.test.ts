import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskStatus } from "@/generated/prisma/client";
import { executeAutomationAction } from "@/lib/automations/actions";
import {
  createAirtableTaskRecord,
  getAirtableWriteConfigForUser,
  updateAirtableTaskRecord,
} from "@/lib/integrations/airtable";
import { fetchJsonWithResilience } from "@/lib/integrations/http-client";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
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

vi.mock("@/lib/integrations/airtable", () => ({
  createAirtableTaskRecord: vi.fn(),
  getAirtableTaskConfigForUser: vi.fn(),
  getAirtableWriteConfigForUser: vi.fn(),
  isAirtableRecordId: vi.fn((value: string | null | undefined) =>
    typeof value === "string" && value.startsWith("rec")
  ),
  updateAirtableTaskRecord: vi.fn(),
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
    vi.mocked(getAirtableWriteConfigForUser).mockResolvedValue(null);
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

  it("creates Airtable records when Airtable task config is available", async () => {
    vi.mocked(getAirtableWriteConfigForUser).mockResolvedValue({
      token: "pat123",
      baseId: "app123",
      tableName: "Tasks",
      writeEnabled: true,
      titleField: "Title",
      notesField: "Notes",
      statusField: "Status",
      priorityField: "Priority",
      projectIdField: "Project ID",
      responsibleIdField: "Responsible ID",
      automationRunIdField: "Automation Run ID",
      automationActionField: "Automation Action",
    });
    vi.mocked(createAirtableTaskRecord).mockResolvedValue({
      id: "rec1234567890",
      title: "Follow up",
    });

    const result = await executeAutomationAction({
      runId: "run_1",
      actionType: "create_task",
      actionPayload: {
        title: "Follow up",
        status: "active",
      },
    });

    expect(createAirtableTaskRecord).toHaveBeenCalledWith({
      userId: "user_1",
      runId: "run_1",
      payload: {
        title: "Follow up",
        status: "active",
      },
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      actionType: "create_task",
      status: "executed",
      targetId: "rec1234567890",
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

  it("updates Airtable-backed tasks when the task id is an Airtable record id", async () => {
    vi.mocked(getAirtableWriteConfigForUser).mockResolvedValue({
      token: "pat123",
      baseId: "app123",
      tableName: "Tasks",
      writeEnabled: true,
      titleField: "Title",
      notesField: "Notes",
      statusField: "Status",
      priorityField: "Priority",
      projectIdField: "Project ID",
      responsibleIdField: "Responsible ID",
      automationRunIdField: "Automation Run ID",
      automationActionField: "Automation Action",
    });
    vi.mocked(updateAirtableTaskRecord).mockResolvedValue({
      id: "rec9876543210",
      title: "Renamed",
    });

    const result = await executeAutomationAction({
      runId: "run_1",
      actionType: "update_task",
      actionPayload: {
        runId: "run_1",
        taskId: "rec9876543210",
        title: " Renamed ",
        status: "done",
      },
    });

    expect(updateAirtableTaskRecord).toHaveBeenCalledWith({
      userId: "user_1",
      recordId: "rec9876543210",
      payload: {
        runId: "run_1",
        taskId: "rec9876543210",
        title: " Renamed ",
        status: "done",
      },
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      actionType: "update_task",
      status: "executed",
      targetId: "rec9876543210",
      detail: "Renamed",
    });
  });

  it("creates HubSpot reminder tasks with CRM associations", async () => {
    vi.mocked(getValidIntegrationAccessToken).mockResolvedValue("hubspot_token");
    vi.mocked(fetchJsonWithResilience).mockResolvedValue({
      id: "hubspot_task_1",
    } as never);

    const result = await executeAutomationAction({
      runId: "run_1",
      actionType: "create_hubspot_task",
      actionPayload: {
        title: "Follow up on demo next steps",
        body: "Send the pricing recap and confirm procurement timing.",
        dueAt: "2026-03-10T16:00:00.000Z",
        reminderAt: "2026-03-10T15:30:00.000Z",
        status: "waiting",
        priority: "high",
        taskType: "email",
        ownerId: "12345",
        dealId: "deal_123",
        contactIds: ["contact_456"],
        companyId: "company_789",
      },
    });

    expect(getValidIntegrationAccessToken).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "HUBSPOT",
    });
    expect(fetchJsonWithResilience).toHaveBeenCalledWith({
      url: "https://api.hubapi.com/crm/v3/objects/tasks",
      init: {
        method: "POST",
        headers: {
          Authorization: "Bearer hubspot_token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            hs_task_subject: "Follow up on demo next steps",
            hs_task_body: "Send the pricing recap and confirm procurement timing.",
            hs_task_status: "WAITING",
            hs_task_priority: "HIGH",
            hs_task_type: "EMAIL",
            hs_timestamp: "2026-03-10T16:00:00.000Z",
            hubspot_owner_id: "12345",
            hs_task_reminders: [new Date("2026-03-10T15:30:00.000Z").getTime()],
          },
          associations: [
            {
              to: { id: "company_789" },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 192,
                },
              ],
            },
            {
              to: { id: "contact_456" },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 204,
                },
              ],
            },
            {
              to: { id: "deal_123" },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 216,
                },
              ],
            },
          ],
        }),
      },
      timeoutMs: 12_000,
      maxAttempts: 3,
    });
    expect(result).toEqual({
      actionType: "create_hubspot_task",
      status: "executed",
      targetId: "hubspot_task_1",
      detail: "Follow up on demo next steps",
    });
  });

  it("maps workflow priorities to HubSpot task priorities", async () => {
    vi.mocked(getValidIntegrationAccessToken).mockResolvedValue("hubspot_token");
    vi.mocked(fetchJsonWithResilience).mockResolvedValue({
      id: "hubspot_task_2",
    } as never);

    await executeAutomationAction({
      runId: "run_1",
      actionType: "create_hubspot_task",
      actionPayload: {
        title: "Escalate risk follow-up",
        dueAt: "2026-03-10T16:00:00.000Z",
        priority: "P1",
      },
    });

    expect(fetchJsonWithResilience).toHaveBeenCalledWith(
      expect.objectContaining({
        init: expect.objectContaining({
          body: JSON.stringify({
            properties: {
              hs_task_subject: "Escalate risk follow-up",
              hs_task_body: "",
              hs_task_status: "NOT_STARTED",
              hs_task_priority: "HIGH",
              hs_task_type: "TODO",
              hs_timestamp: "2026-03-10T16:00:00.000Z",
            },
          }),
        }),
      })
    );
  });
});

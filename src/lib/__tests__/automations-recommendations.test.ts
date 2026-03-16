import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationRecommendationStatus } from "@/lib/automations/prisma-enums";
import { executeAutomationAction } from "@/lib/automations/actions";
import { MANUAL_EXECUTION_REQUIRED_MESSAGE } from "@/lib/automations/execution-policy";
import {
  executeApprovedRecommendationsForRun,
  executeAutomationRecommendation,
} from "@/lib/automations/recommendations";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRun: {
      findUnique: vi.fn(),
    },
    automationRecommendation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/automations/actions", () => ({
  executeAutomationAction: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  getAppRole: vi.fn(),
}));

vi.mock("@/lib/automations/service", () => ({
  normalizeWorkflowRolePolicy: vi.fn(() => ({
    approveRoles: ["admin", "member"],
  })),
}));

describe("automation recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({
      requestedById: "user_1",
      workflow: {
        ownerId: "owner_1",
      },
    } as never);
  });

  it("blocks manual-only recommendation action types from execution", async () => {
    vi.mocked(prisma.automationRecommendation.findUnique).mockResolvedValue({
      id: "rec_manual",
      runId: "run_1",
      actionType: "adjust_ad_spend",
      actionPayload: { campaignId: "camp_1" },
      requiresApproval: true,
      status: AutomationRecommendationStatus.APPROVED,
      requestedById: null,
      approverId: "user_1",
      executedById: null,
      run: {
        workflow: {
          ownerId: "owner_1",
        },
      },
    } as never);

    await expect(
      executeAutomationRecommendation({
        recommendationId: "rec_manual",
        actorUserId: "user_1",
      })
    ).rejects.toThrow(MANUAL_EXECUTION_REQUIRED_MESSAGE);

    expect(executeAutomationAction).not.toHaveBeenCalled();
  });

  it("executes supported recommendation action types during batch execution", async () => {
    vi.mocked(prisma.automationRecommendation.findMany).mockResolvedValue([
      { id: "rec_manual", actionType: "adjust_ad_spend" },
      { id: "rec_crm", actionType: "create_hubspot_task" },
    ] as never);
    vi.mocked(prisma.automationRecommendation.findUnique).mockResolvedValue({
      id: "rec_crm",
      runId: "run_1",
      actionType: "create_hubspot_task",
      actionPayload: { title: "Create CRM follow-up" },
      requiresApproval: false,
      status: AutomationRecommendationStatus.APPROVED,
      requestedById: "user_1",
      approverId: null,
      executedById: null,
      approvedAt: null,
      run: {
        workflow: {
          ownerId: "owner_1",
        },
      },
    } as never);
    vi.mocked(executeAutomationAction).mockResolvedValue({
      actionType: "create_hubspot_task",
      status: "executed",
      targetId: "hubspot_task_1",
      detail: "Create CRM follow-up",
    } as never);
    vi.mocked(prisma.automationRecommendation.update).mockResolvedValue({
      id: "rec_crm",
      status: AutomationRecommendationStatus.EXECUTED,
    } as never);

    const result = await executeApprovedRecommendationsForRun({
      runId: "run_1",
      actorUserId: "user_1",
    });

    expect(result).toEqual({
      attempted: 1,
      executed: 1,
      failed: 0,
      recommendationIds: ["rec_crm"],
    });
    expect(executeAutomationAction).toHaveBeenCalledTimes(1);
  });

  it("passes recommendation defaults through to HubSpot task execution", async () => {
    vi.mocked(prisma.automationRecommendation.findUnique).mockResolvedValue({
      id: "rec_hubspot_task",
      runId: "run_1",
      title: "Create CRM follow-up task",
      priority: "P1",
      dueAt: new Date("2026-03-10T16:00:00.000Z"),
      actionType: "create_hubspot_task",
      actionPayload: { dealId: "deal_123" },
      requiresApproval: false,
      status: AutomationRecommendationStatus.APPROVED,
      requestedById: "user_1",
      approverId: null,
      executedById: null,
      approvedAt: null,
      run: {
        workflow: {
          ownerId: "owner_1",
        },
      },
    } as never);
    vi.mocked(executeAutomationAction).mockResolvedValue({
      actionType: "create_hubspot_task",
      status: "executed",
      targetId: "hubspot_task_1",
      detail: "Create CRM follow-up task",
    } as never);
    vi.mocked(prisma.automationRecommendation.update).mockResolvedValue({
      id: "rec_hubspot_task",
      status: AutomationRecommendationStatus.EXECUTED,
    } as never);

    await executeAutomationRecommendation({
      recommendationId: "rec_hubspot_task",
      actorUserId: "user_1",
    });

    expect(executeAutomationAction).toHaveBeenCalledWith({
      runId: "run_1",
      actionType: "create_hubspot_task",
      actionPayload: {
        dealId: "deal_123",
        title: "Create CRM follow-up task",
        priority: "P1",
        dueAt: "2026-03-10T16:00:00.000Z",
      },
    });
  });
});

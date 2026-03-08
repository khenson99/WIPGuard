import { AutomationRecommendationStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { executeAutomationAction } from "@/lib/automations/actions";
import {
  canExecuteRecommendationAction,
  MANUAL_EXECUTION_REQUIRED_MESSAGE,
} from "@/lib/automations/execution-policy";
import { normalizeWorkflowRolePolicy } from "@/lib/automations/service";
import { getAppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function resolveRecommendationActor(runId: string): Promise<string> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: {
      requestedById: true,
      workflow: {
        select: {
          ownerId: true,
        },
      },
    },
  });

  const actorUserId = run?.requestedById ?? run?.workflow.ownerId ?? null;
  if (!actorUserId) {
    throw new Error("Unable to resolve automation actor");
  }
  return actorUserId;
}

async function assertCanApproveRecommendation(input: {
  actorUserId: string;
  recommendation: {
    approverId: string | null;
    run: {
      workflow: {
        ownerId: string;
        rolePolicy: Prisma.JsonValue | null;
      };
    };
  };
}): Promise<void> {
  if (
    input.recommendation.approverId &&
    input.recommendation.approverId !== input.actorUserId
  ) {
    throw new Error("Forbidden");
  }

  if (input.recommendation.run.workflow.ownerId === input.actorUserId) {
    return;
  }

  if (!input.recommendation.approverId) {
    const role = await getAppRole(input.actorUserId);
    const policy = normalizeWorkflowRolePolicy(
      input.recommendation.run.workflow.rolePolicy
    );
    if (!policy.approveRoles.includes(role)) {
      throw new Error("Forbidden");
    }
  }
}

async function assertCanExecuteRecommendation(input: {
  actorUserId: string;
  recommendation: {
    requestedById: string | null;
    approverId: string | null;
    executedById: string | null;
    run: {
      workflow: {
        ownerId: string;
      };
    };
  };
}): Promise<void> {
  const allowedUserIds = new Set(
    [
      input.recommendation.requestedById,
      input.recommendation.approverId,
      input.recommendation.executedById,
      input.recommendation.run.workflow.ownerId,
    ].filter((value): value is string => Boolean(value))
  );

  if (allowedUserIds.has(input.actorUserId)) {
    return;
  }

  const role = await getAppRole(input.actorUserId);
  if (role !== "admin") {
    throw new Error("Forbidden");
  }
}

export async function resolveAutomationRecommendation(input: {
  recommendationId: string;
  actorUserId: string;
  decision: "approve" | "reject";
  note?: string;
}) {
  const recommendation = await prisma.automationRecommendation.findUnique({
    where: { id: input.recommendationId },
    include: {
      run: {
        include: {
          workflow: {
            select: {
              ownerId: true,
              rolePolicy: true,
            },
          },
        },
      },
    },
  });

  if (!recommendation) {
    throw new Error("Recommendation not found");
  }

  if (
    recommendation.status === AutomationRecommendationStatus.EXECUTED ||
    recommendation.status === AutomationRecommendationStatus.FAILED
  ) {
    throw new Error("Recommendation is already resolved");
  }

  await assertCanApproveRecommendation({
    actorUserId: input.actorUserId,
    recommendation,
  });

  const now = new Date();
  const status =
    input.decision === "approve"
      ? AutomationRecommendationStatus.APPROVED
      : AutomationRecommendationStatus.REJECTED;

  return prisma.automationRecommendation.update({
    where: { id: recommendation.id },
    data: {
      status,
      approverId: recommendation.approverId ?? input.actorUserId,
      approvedAt: input.decision === "approve" ? now : null,
      resolvedAt: now,
      decisionNote: input.note ?? null,
      executionError:
        input.decision === "reject" ? "Rejected by reviewer" : null,
    },
  });
}

export async function executeAutomationRecommendation(input: {
  recommendationId: string;
  actorUserId?: string | null;
}) {
  const recommendation = await prisma.automationRecommendation.findUnique({
    where: { id: input.recommendationId },
    include: {
      run: {
        include: {
          workflow: {
            select: {
              ownerId: true,
            },
          },
        },
      },
    },
  });

  if (!recommendation) {
    throw new Error("Recommendation not found");
  }

  const actorUserId =
    input.actorUserId ?? (await resolveRecommendationActor(recommendation.runId));

  await assertCanExecuteRecommendation({
    actorUserId,
    recommendation,
  });

  if (recommendation.status === AutomationRecommendationStatus.EXECUTED) {
    return recommendation;
  }

  if (recommendation.status === AutomationRecommendationStatus.REJECTED) {
    throw new Error("Recommendation was rejected");
  }

  if (
    recommendation.requiresApproval &&
    recommendation.status !== AutomationRecommendationStatus.APPROVED
  ) {
    throw new Error("Recommendation requires approval before execution");
  }

  if (!canExecuteRecommendationAction(recommendation.actionType)) {
    throw new Error(MANUAL_EXECUTION_REQUIRED_MESSAGE);
  }

  try {
    const result = await executeAutomationAction({
      runId: recommendation.runId,
      actionType: recommendation.actionType,
      actionPayload: asRecord(recommendation.actionPayload),
    });

    return prisma.automationRecommendation.update({
      where: { id: recommendation.id },
      data: {
        status:
          result.status === "executed"
            ? AutomationRecommendationStatus.EXECUTED
            : AutomationRecommendationStatus.FAILED,
        approverId:
          recommendation.approverId ??
          (recommendation.requiresApproval ? null : actorUserId),
        approvedAt:
          recommendation.approvedAt ??
          (recommendation.requiresApproval ? null : new Date()),
        executedById: actorUserId,
        executedAt: new Date(),
        resolvedAt: new Date(),
        executionResult: result.payload
          ? (result.payload as Prisma.JsonObject)
          : ({
              actionType: result.actionType,
              status: result.status,
              targetId: result.targetId,
              detail: result.detail,
            } as Prisma.JsonObject),
        executionError:
          result.status === "executed" ? null : result.detail ?? "Execution skipped",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Recommendation execution failed";

    return prisma.automationRecommendation.update({
      where: { id: recommendation.id },
      data: {
        status: AutomationRecommendationStatus.FAILED,
        executedById: actorUserId,
        executedAt: new Date(),
        resolvedAt: new Date(),
        executionError: message,
      },
    });
  }
}

export async function executeApprovedRecommendationsForRun(input: {
  runId: string;
  actorUserId?: string | null;
  recommendationIds?: string[];
  actionTypes?: string[];
  limit?: number;
}) {
  const actorUserId =
    input.actorUserId ?? (await resolveRecommendationActor(input.runId));

  const recommendations = await prisma.automationRecommendation.findMany({
    where: {
      runId: input.runId,
      status: AutomationRecommendationStatus.APPROVED,
      ...(Array.isArray(input.recommendationIds) && input.recommendationIds.length > 0
        ? { id: { in: input.recommendationIds } }
        : {}),
      ...(Array.isArray(input.actionTypes) && input.actionTypes.length > 0
        ? { actionType: { in: input.actionTypes } }
        : {}),
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take:
      typeof input.limit === "number" && Number.isFinite(input.limit)
        ? Math.max(1, Math.trunc(input.limit))
        : 50,
    select: { id: true, actionType: true },
  });

  const executableRecommendations = recommendations.filter((recommendation) =>
    canExecuteRecommendationAction(recommendation.actionType)
  );

  const results = [];
  for (const recommendation of executableRecommendations) {
    results.push(
      await executeAutomationRecommendation({
        recommendationId: recommendation.id,
        actorUserId,
      })
    );
  }

  return {
    attempted: executableRecommendations.length,
    executed: results.filter(
      (recommendation) =>
        recommendation.status === AutomationRecommendationStatus.EXECUTED
    ).length,
    failed: results.filter(
      (recommendation) =>
        recommendation.status === AutomationRecommendationStatus.FAILED
    ).length,
    recommendationIds: executableRecommendations.map(
      (recommendation) => recommendation.id
    ),
  };
}

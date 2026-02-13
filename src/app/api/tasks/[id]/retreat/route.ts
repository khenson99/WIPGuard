import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TaskStatus } from "@/generated/prisma/client";
import { enforcePolicy, getUserRole, recordPolicyOverride } from "@/lib/policy-check";
import { compactColumns, getNextColumnOrder } from "@/lib/task-order";
import { enforcePermission } from "@/lib/permissions";

const STATUS_BACK: Partial<Record<TaskStatus, TaskStatus>> = {
  QUEUED: "BACKLOG",
  WORKING_ON_TODAY: "QUEUED",
  ACTIVE: "WORKING_ON_TODAY",
  NOT_DONE: "ACTIVE",
  DONE: "ACTIVE",
};

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "task.transition",
      request,
      targetType: "task",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const existing = await prisma.task.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const expectedUpdatedAt = (body as Record<string, unknown>).expectedUpdatedAt as
      | string
      | undefined;
    if (expectedUpdatedAt) {
      const expectedTs = Date.parse(expectedUpdatedAt);
      if (Number.isNaN(expectedTs)) {
        return NextResponse.json(
          { error: "Invalid expectedUpdatedAt" },
          { status: 400 }
        );
      }
      if (existing.updatedAt.getTime() !== expectedTs) {
        return NextResponse.json(
          {
            error: "Conflict",
            conflict: {
              reason: "STALE_VERSION",
              message:
                "Task changed before this retreat was applied. Refresh and retry.",
              current: {
                id: existing.id,
                status: existing.status,
                columnOrder: existing.columnOrder,
                updatedAt: existing.updatedAt.toISOString(),
              },
              expectedUpdatedAt,
            },
          },
          { status: 409 }
        );
      }
    }

    const prevStatus: TaskStatus | undefined = STATUS_BACK[existing.status];
    if (!prevStatus) {
      return NextResponse.json(
        { error: `Cannot retreat task from status "${existing.status}".` },
        { status: 400 }
      );
    }

    // ── WIP policy enforcement ──
    const userRole = await getUserRole(session.user.id);
    const policyResult = await enforcePolicy(prevStatus, userRole, id);

    if (!policyResult.allowed) {
      return NextResponse.json(
        {
          error: "WIP limit exceeded",
          policy: policyResult,
        },
        { status: 409 }
      );
    }

    if (policyResult.requiresOverride) {
      const overrideReason = (body as Record<string, unknown>).overrideReason as string | undefined;
      if (!overrideReason) {
        return NextResponse.json(
          {
            error: "Override reason required",
            policy: policyResult,
          },
          { status: 409 }
        );
      }

      await recordPolicyOverride({
        taskId: id,
        action: "retreat",
        reason: overrideReason,
        actorId: session.user.id,
        actorName: session.user.name ?? undefined,
        actorRole: userRole,
        column: prevStatus,
        wipCount: policyResult.currentCount,
        wipLimit: policyResult.wipLimit,
      });
    }

    const previousColumnOrder = await getNextColumnOrder(prisma, prevStatus, id);

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: prevStatus,
        columnOrder: previousColumnOrder,
        completedOn: existing.status === "DONE" ? null : undefined,
      },
      include: {
        project: true,
        sprint: true,
        parent: true,
        responsible: {
          select: { id: true, name: true, email: true, image: true },
        },
        accountable: {
          select: { id: true, name: true, email: true, image: true },
        },
        consulted: {
          select: { id: true, name: true, email: true, image: true },
        },
        informed: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    await prisma.statusHistory.create({
      data: {
        taskId: id,
        fromStatus: existing.status,
        toStatus: prevStatus,
        changedBy: session.user.id,
      },
    });

    await compactColumns(prisma, [existing.status, prevStatus]);

    return NextResponse.json({
      task,
      retreated: { from: existing.status, to: prevStatus },
      policy: policyResult.warning ? policyResult : undefined,
    });
  } catch (error) {
    console.error("POST /api/tasks/[id]/retreat error:", error);
    return NextResponse.json(
      { error: "Failed to retreat task" },
      { status: 500 }
    );
  }
}

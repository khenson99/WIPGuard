import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TaskStatus } from "@/generated/prisma/client";
import { enforcePolicy, getUserRole, recordPolicyOverride } from "@/lib/policy-check";
import { compactColumns, getNextColumnOrder } from "@/lib/task-order";

const STATUS_FLOW: Partial<Record<TaskStatus, TaskStatus>> = {
  BACKLOG: "QUEUED",
  QUEUED: "WORKING_ON_TODAY",
  WORKING_ON_TODAY: "ACTIVE",
  ACTIVE: "DONE",
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

    const existing = await prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        sprint: true,
        responsible: { select: { id: true, name: true } },
        accountable: { select: { id: true, name: true } },
      },
    });

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
                "Task changed before this advance was applied. Refresh and retry.",
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

    const nextStatus: TaskStatus | undefined = STATUS_FLOW[existing.status];
    if (!nextStatus) {
      return NextResponse.json(
        {
          error: `Cannot advance task from status "${existing.status}". Task is already at a terminal status.`,
        },
        { status: 400 }
      );
    }

    // ── WIP policy enforcement ──
    const userRole = await getUserRole(session.user.id);
    const policyResult = await enforcePolicy(nextStatus, userRole, id);

    if (!policyResult.allowed) {
      return NextResponse.json(
        {
          error: "WIP limit exceeded",
          policy: policyResult,
        },
        { status: 409 }
      );
    }

    // If override is required, the client must supply a reason
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
        action: "advance",
        reason: overrideReason,
        actorId: session.user.id,
        actorName: session.user.name ?? undefined,
        actorRole: userRole,
        column: nextStatus,
        wipCount: policyResult.currentCount,
        wipLimit: policyResult.wipLimit,
      });
    }

    const movingToDone = nextStatus === "DONE";
    const nextColumnOrder = await getNextColumnOrder(prisma, nextStatus, id);

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: nextStatus,
        columnOrder: nextColumnOrder,
        completedOn: movingToDone ? new Date() : undefined,
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
        toStatus: nextStatus,
        changedBy: session.user.id,
      },
    });

    if (movingToDone) {
      await prisma.logbookEntry.create({
        data: {
          taskId: id,
          taskTitle: task.title,
          taskNotes: task.notes,
          projectName: task.project?.name ?? null,
          sprintName: task.sprint?.name ?? null,
          priority: task.priority,
          status: task.status,
          responsible: task.responsible.map((u: { name: string | null }) => u.name).join(", ") || null,
          accountable: task.accountable.map((u: { name: string | null }) => u.name).join(", ") || null,
          completedOn: task.completedOn ?? new Date(),
          metadata: {
            taskId: task.id,
            projectId: task.projectId,
            sprintId: task.sprintId,
            priority: task.priority,
            degreeOfDifficulty: task.degreeOfDifficulty,
            startDate: task.startDate,
            dueDate: task.dueDate,
            completedOn: task.completedOn,
            unplanned: task.unplanned,
            responsible: task.responsible,
            accountable: task.accountable,
          },
        },
      });
    }

    await compactColumns(prisma, [existing.status, nextStatus]);

    return NextResponse.json({
      task,
      advanced: { from: existing.status, to: nextStatus },
      policy: policyResult.warning ? policyResult : undefined,
    });
  } catch (error) {
    console.error("POST /api/tasks/[id]/advance error:", error);
    return NextResponse.json(
      { error: "Failed to advance task" },
      { status: 500 }
    );
  }
}

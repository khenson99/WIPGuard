import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emitBoardEvent } from "@/lib/socket-emit";
import { loadPolicies, getUserRole, recordPolicyOverride } from "@/lib/policy-check";
import { checkWipPolicy } from "@/lib/policy-engine";
import type { TaskStatus } from "@/generated/prisma/client";

interface ReorderItem {
  taskId: string;
  status: string;
  columnOrder: number;
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const items: ReorderItem[] = body.items ?? body;
    const overrideReason = body.overrideReason as string | undefined;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Request body must include an array of reorder items" },
        { status: 400 }
      );
    }

    const taskIds = items.map((item) => item.taskId);
    const existingTasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, status: true },
    });

    const existingByIdMap = new Map<string, string>(
      existingTasks.map((t: { id: string; status: string }) => [t.id, t.status])
    );

    // Identify which items involve a status change
    const statusChanges: { taskId: string; from: string; to: string }[] = [];
    for (const item of items) {
      const previousStatus = existingByIdMap.get(item.taskId);
      if (previousStatus !== undefined && previousStatus !== item.status) {
        statusChanges.push({
          taskId: item.taskId,
          from: previousStatus,
          to: item.status,
        });
      }
    }

    // ── WIP policy enforcement for each column gaining tasks ──
    if (statusChanges.length > 0) {
      const [policies, userRole] = await Promise.all([
        loadPolicies(),
        getUserRole(session.user.id),
      ]);

      // Calculate net additions per target column
      const columnDeltas = new Map<string, string[]>();
      for (const change of statusChanges) {
        const list = columnDeltas.get(change.to) ?? [];
        list.push(change.taskId);
        columnDeltas.set(change.to, list);
      }

      // Get current counts per affected column, excluding the tasks being moved
      const movingTaskIds = new Set(statusChanges.map((c) => c.taskId));
      const affectedColumns = [...columnDeltas.keys()];

      const columnCounts = new Map<string, number>();
      for (const col of affectedColumns) {
        const count = await prisma.task.count({
          where: {
            status: col as TaskStatus,
            id: { notIn: [...movingTaskIds] },
          },
        });
        columnCounts.set(col, count);
      }

      // Check policy for each column gaining tasks
      const violations: Array<{
        column: string;
        policyResult: ReturnType<typeof checkWipPolicy>;
        taskIds: string[];
      }> = [];

      for (const [column, taskIdsMoving] of columnDeltas) {
        const baseCount = columnCounts.get(column) ?? 0;
        const projectedCount = baseCount + taskIdsMoving.length;

        const policyResult = checkWipPolicy({
          targetColumn: column as TaskStatus,
          currentColumnTaskCount: projectedCount,
          userRole,
          policies,
        });

        if (!policyResult.allowed || policyResult.requiresOverride) {
          violations.push({ column, policyResult, taskIds: taskIdsMoving });
        }
      }

      // If any column is blocked and user can't override, reject the whole batch
      const blocked = violations.filter((v) => !v.policyResult.allowed);
      if (blocked.length > 0) {
        return NextResponse.json(
          {
            error: "WIP limit exceeded",
            violations: blocked.map((v) => ({
              column: v.column,
              policy: v.policyResult,
            })),
          },
          { status: 409 }
        );
      }

      // If override required, demand reason
      const overrideNeeded = violations.filter((v) => v.policyResult.requiresOverride);
      if (overrideNeeded.length > 0) {
        if (!overrideReason) {
          return NextResponse.json(
            {
              error: "Override reason required",
              violations: overrideNeeded.map((v) => ({
                column: v.column,
                policy: v.policyResult,
              })),
            },
            { status: 409 }
          );
        }

        // Record overrides for each affected task
        for (const v of overrideNeeded) {
          for (const taskId of v.taskIds) {
            await recordPolicyOverride({
              taskId,
              action: "reorder",
              reason: overrideReason,
              actorId: session.user.id,
              actorName: session.user.name ?? undefined,
              actorRole: userRole,
              column: v.column,
              wipCount: v.policyResult.currentCount,
              wipLimit: v.policyResult.wipLimit,
            });
          }
        }
      }
    }

    // ── Perform the reorder transaction ──
    await prisma.$transaction(
      items.map((item) => {
        const previousStatus = existingByIdMap.get(item.taskId);
        const statusChanged =
          previousStatus !== undefined && previousStatus !== item.status;

        return prisma.task.update({
          where: { id: item.taskId },
          data: {
            status: item.status as never,
            columnOrder: item.columnOrder,
            completedOn:
              statusChanged && item.status === "DONE" ? new Date() : undefined,
          },
        });
      })
    );

    if (statusChanges.length > 0) {
      await prisma.statusHistory.createMany({
        data: statusChanges.map((change) => ({
          taskId: change.taskId,
          fromStatus: change.from as never,
          toStatus: change.to as never,
          changedBy: session.user.id,
        })),
      });
    }

    const doneChanges = statusChanges.filter((c) => c.to === "DONE");
    if (doneChanges.length > 0) {
      const doneTasks = await prisma.task.findMany({
        where: { id: { in: doneChanges.map((c) => c.taskId) } },
        include: {
          project: true,
          sprint: true,
          responsible: { select: { id: true, name: true } },
          accountable: { select: { id: true, name: true } },
        },
      });

      for (const task of doneTasks) {
        await prisma.logbookEntry.create({
          data: {
            taskId: task.id,
            taskTitle: task.title,
            taskNotes: task.notes,
            projectName: task.project?.name ?? null,
            sprintName: task.sprint?.name ?? null,
            priority: task.priority,
            status: task.status,
            responsible:
              task.responsible.map((u: { name: string | null }) => u.name).join(", ") || null,
            accountable:
              task.accountable.map((u: { name: string | null }) => u.name).join(", ") || null,
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
    }

    emitBoardEvent("task:reordered", { items });

    return NextResponse.json({ success: true, updated: items.length });
  } catch (error) {
    console.error("PATCH /api/tasks/reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder tasks" },
      { status: 500 }
    );
  }
}

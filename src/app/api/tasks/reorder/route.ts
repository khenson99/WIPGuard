import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emitBoardEvent } from "@/lib/socket-emit";

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

    const statusChanges: { taskId: string; from: string; to: string }[] = [];

    await prisma.$transaction(
      items.map((item) => {
        const previousStatus = existingByIdMap.get(item.taskId);
        const statusChanged =
          previousStatus !== undefined && previousStatus !== item.status;

        if (statusChanged) {
          statusChanges.push({
            taskId: item.taskId,
            from: previousStatus,
            to: item.status,
          });
        }

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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emitBoardEvent } from "@/lib/socket-emit";

const TASK_INCLUDE = {
  project: true,
  sprint: true,
  parent: { select: { id: true, title: true } },
  children: {
    select: { id: true, title: true, status: true, priority: true },
    orderBy: { createdAt: "asc" as const },
  },
  dependsOn: { select: { id: true, title: true, status: true } },
  dependedBy: { select: { id: true, title: true, status: true } },
  responsible: { select: { id: true, name: true, email: true, image: true } },
  accountable: { select: { id: true, name: true, email: true, image: true } },
  consulted: { select: { id: true, name: true, email: true, image: true } },
  informed: { select: { id: true, name: true, email: true, image: true } },
  statusHistory: { orderBy: { changedAt: "desc" as const } },
  logbookEntries: { orderBy: { archivedAt: "desc" as const } },
} as const;

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("GET /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

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

    const {
      responsibleIds,
      accountableIds,
      consultedIds,
      informedIds,
      dependsOnIds,
      startDate,
      dueDate,
      ...directFields
    } = body;

    const statusChanged =
      directFields.status && directFields.status !== existing.status;
    const movingToDone = statusChanged && directFields.status === "DONE";

    const data: Record<string, unknown> = { ...directFields };

    if (startDate !== undefined) {
      data.startDate = startDate ? new Date(startDate) : null;
    }
    if (dueDate !== undefined) {
      data.dueDate = dueDate ? new Date(dueDate) : null;
    }
    if (movingToDone) {
      data.completedOn = new Date();
    }

    if (responsibleIds) {
      data.responsible = {
        set: responsibleIds.map((rid: string) => ({ id: rid })),
      };
    }
    if (accountableIds) {
      data.accountable = {
        set: accountableIds.map((rid: string) => ({ id: rid })),
      };
    }
    if (consultedIds) {
      data.consulted = {
        set: consultedIds.map((rid: string) => ({ id: rid })),
      };
    }
    if (informedIds) {
      data.informed = {
        set: informedIds.map((rid: string) => ({ id: rid })),
      };
    }
    if (dependsOnIds) {
      data.dependsOn = {
        set: dependsOnIds.map((rid: string) => ({ id: rid })),
      };
    }

    const task = await prisma.task.update({
      where: { id },
      data,
      include: TASK_INCLUDE,
    });

    if (statusChanged) {
      await prisma.statusHistory.create({
        data: {
          taskId: id,
          fromStatus: existing.status,
          toStatus: directFields.status,
          changedBy: session.user.id,
        },
      });
    }

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

    emitBoardEvent("task:updated", task);

    return NextResponse.json(task);
  } catch (error) {
    console.error("PATCH /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.task.delete({ where: { id } });

    emitBoardEvent("task:deleted", { taskId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}

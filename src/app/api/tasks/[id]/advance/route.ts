import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TaskStatus } from "@/generated/prisma/client";

const STATUS_FLOW: Partial<Record<TaskStatus, TaskStatus>> = {
  BACKLOG: "QUEUED",
  QUEUED: "WORKING_ON_TODAY",
  WORKING_ON_TODAY: "ACTIVE",
  ACTIVE: "DONE",
};

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
  _request: NextRequest,
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

    const nextStatus: TaskStatus | undefined = STATUS_FLOW[existing.status];
    if (!nextStatus) {
      return NextResponse.json(
        {
          error: `Cannot advance task from status "${existing.status}". Task is already at a terminal status.`,
        },
        { status: 400 }
      );
    }

    const movingToDone = nextStatus === "DONE";

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: nextStatus,
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

    return NextResponse.json({
      task,
      advanced: { from: existing.status, to: nextStatus },
    });
  } catch (error) {
    console.error("POST /api/tasks/[id]/advance error:", error);
    return NextResponse.json(
      { error: "Failed to advance task" },
      { status: 500 }
    );
  }
}

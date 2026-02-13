import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emitBoardEvent } from "@/lib/socket-emit";

const TASK_INCLUDE = {
  project: true,
  sprint: true,
  parent: true,
  responsible: { select: { id: true, name: true, email: true, image: true } },
  accountable: { select: { id: true, name: true, email: true, image: true } },
  consulted: { select: { id: true, name: true, email: true, image: true } },
  informed: { select: { id: true, name: true, email: true, image: true } },
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const assignee = searchParams.get("assignee");
    const projectId = searchParams.get("project");
    const sprintId = searchParams.get("sprint");
    const priority = searchParams.get("priority");

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }
    if (projectId) {
      where.projectId = projectId;
    }
    if (sprintId) {
      where.sprintId = sprintId;
    }
    if (priority) {
      where.priority = priority;
    }
    if (assignee) {
      where.responsible = { some: { id: assignee } };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ columnOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      notes,
      status = "BACKLOG",
      priority = "P2",
      degreeOfDifficulty,
      startDate,
      dueDate,
      parentId,
      projectId,
      sprintId,
      responsibleIds = [],
      accountableIds = [],
      consultedIds = [],
      informedIds = [],
      unplanned,
      slackThread,
      dependsOnIds = [],
    } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.create({
      data: {
        title,
        notes,
        status,
        priority,
        degreeOfDifficulty,
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignedOn: responsibleIds.length > 0 ? new Date() : undefined,
        parentId,
        projectId,
        sprintId,
        unplanned: unplanned ?? false,
        slackThread,
        responsible: {
          connect: responsibleIds.map((id: string) => ({ id })),
        },
        accountable: {
          connect: accountableIds.map((id: string) => ({ id })),
        },
        consulted: {
          connect: consultedIds.map((id: string) => ({ id })),
        },
        informed: {
          connect: informedIds.map((id: string) => ({ id })),
        },
        dependsOn: {
          connect: dependsOnIds.map((id: string) => ({ id })),
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: status,
            changedBy: session.user.id,
          },
        },
      },
      include: TASK_INCLUDE,
    });

    emitBoardEvent("task:created", task);

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

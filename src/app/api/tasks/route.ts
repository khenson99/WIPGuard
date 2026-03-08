export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { invalidateHierarchy } from "@/lib/hierarchy-cache";
import { emitTaskCreated } from "@/lib/socket-emit";
import { getNextColumnOrder } from "@/lib/task-order";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

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
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: user.id,
      action: "task.read",
      request,
      targetType: "task",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
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
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: user.id,
      action: "task.write",
      request,
      targetType: "task",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
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
      unplannedReason,
      unplannedNote,
      planningSessionId,
      slackThread,
      dependsOnIds = [],
    } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const nextColumnOrder = await getNextColumnOrder(prisma, status);

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
        unplannedReason: unplanned ? unplannedReason : undefined,
        unplannedNote: unplanned ? unplannedNote : undefined,
        addedBy: user.id,
        planningSessionId,
        slackThread,
        columnOrder: nextColumnOrder,
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
            changedBy: user.id,
          },
        },
      },
      include: TASK_INCLUDE,
    });

    if (task.projectId) {
      emitTaskCreated(task.projectId, task);
    }

    invalidateHierarchy(user.id);

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

// GET: list all commitment snapshots for a sprint
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const sprint = await prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    const commitments = await prisma.sprintCommitment.findMany({
      where: { sprintId: id },
      orderBy: { snapshotAt: "asc" },
    });

    return NextResponse.json(commitments);
  } catch (error) {
    console.error("GET /api/sprints/[id]/commit error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sprint commitments" },
      { status: 500 },
    );
  }
}

// POST: create an immutable commitment snapshot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "sprint.write",
      request,
      targetType: "sprint",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const sprint = await prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    // Snapshot all tasks currently in this sprint
    const tasks = await prisma.task.findMany({
      where: { sprintId: id },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        projectId: true,
      },
    });

    const taskSnapshots = tasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      projectId: t.projectId,
    }));

    const commitment = await prisma.sprintCommitment.create({
      data: {
        sprintId: id,
        createdBy: session.user.id,
        taskSnapshots,
      },
    });

    return NextResponse.json(commitment, { status: 201 });
  } catch (error) {
    console.error("POST /api/sprints/[id]/commit error:", error);
    return NextResponse.json(
      { error: "Failed to create sprint commitment" },
      { status: 500 },
    );
  }
}

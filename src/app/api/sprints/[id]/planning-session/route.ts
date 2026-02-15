export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

// GET: list planning sessions for a sprint
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

    const sessions = await prisma.planningSession.findMany({
      where: { sprintId: id },
      include: {
        tasks: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("GET /api/sprints/[id]/planning-session error:", error);
    return NextResponse.json(
      { error: "Failed to fetch planning sessions" },
      { status: 500 },
    );
  }
}

// POST: create a new planning session
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

    const body = await request.json();
    const { notes, taskIds } = body;

    const planningSession = await prisma.planningSession.create({
      data: {
        sprintId: id,
        createdBy: session.user.id,
        notes,
        ...(taskIds?.length
          ? { tasks: { connect: taskIds.map((tid: string) => ({ id: tid })) } }
          : {}),
      },
      include: {
        tasks: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
    });

    return NextResponse.json(planningSession, { status: 201 });
  } catch (error) {
    console.error("POST /api/sprints/[id]/planning-session error:", error);
    return NextResponse.json(
      { error: "Failed to create planning session" },
      { status: 500 },
    );
  }
}

// PATCH: close a planning session (set completedAt) or update notes
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sprintId } = await params;

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "sprint.write",
      request,
      targetType: "sprint",
      targetId: sprintId,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = await request.json();
    const { sessionId, notes, complete } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const existing = await prisma.planningSession.findUnique({
      where: { id: sessionId },
    });
    if (!existing || existing.sprintId !== sprintId) {
      return NextResponse.json(
        { error: "Planning session not found in this sprint" },
        { status: 404 },
      );
    }

    const planningSession = await prisma.planningSession.update({
      where: { id: sessionId },
      data: {
        ...(notes !== undefined && { notes }),
        ...(complete && { completedAt: new Date() }),
      },
      include: {
        tasks: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
    });

    return NextResponse.json(planningSession);
  } catch (error) {
    console.error("PATCH /api/sprints/[id]/planning-session error:", error);
    return NextResponse.json(
      { error: "Failed to update planning session" },
      { status: 500 },
    );
  }
}

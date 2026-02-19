export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id } = await params;

    const goal = await prisma.financialGoal.findUnique({
      where: { id },
    });

    if (!goal || goal.userId !== userId) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    console.error("GET /api/financial-planning/goals/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch financial goal" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id } = await params;

    const existing = await prisma.financialGoal.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.metric !== undefined) {
      data.metric = body.metric;
    }
    if (body.targetValue !== undefined) {
      data.targetValue = Number(body.targetValue);
    }
    if (body.deadline !== undefined) {
      data.deadline = new Date(body.deadline);
    }
    if (body.status !== undefined) {
      data.status = body.status;
    }

    const goal = await prisma.financialGoal.update({
      where: { id },
      data,
    });

    return NextResponse.json(goal);
  } catch (error) {
    console.error("PATCH /api/financial-planning/goals/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update financial goal" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { id } = await params;

    const existing = await prisma.financialGoal.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    await prisma.financialGoal.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/financial-planning/goals/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete financial goal" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const VALID_METRICS = new Set([
  "MRR",
  "ARR",
  "RUNWAY",
  "BURN_RATE",
  "NET_CASH_FLOW",
  "REVENUE",
  "CUSTOMER_COUNT",
]);

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const goals = await prisma.financialGoal.findMany({
      where: { userId },
      orderBy: { deadline: "asc" },
    });

    return NextResponse.json(goals);
  } catch (error) {
    console.error("GET /api/financial-planning/goals error:", error);
    return NextResponse.json(
      { error: "Failed to fetch financial goals" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const body = await request.json();
    const { metric, targetValue, deadline } = body;

    if (!metric || targetValue === undefined || !deadline) {
      return NextResponse.json(
        { error: "metric, targetValue, and deadline are required" },
        { status: 400 },
      );
    }

    if (!VALID_METRICS.has(metric)) {
      return NextResponse.json(
        { error: `Invalid metric. Must be one of: ${[...VALID_METRICS].join(", ")}` },
        { status: 400 },
      );
    }

    const goal = await prisma.financialGoal.create({
      data: {
        userId,
        metric,
        targetValue: Number(targetValue),
        deadline: new Date(deadline),
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error("POST /api/financial-planning/goals error:", error);
    return NextResponse.json(
      { error: "Failed to create financial goal" },
      { status: 500 },
    );
  }
}

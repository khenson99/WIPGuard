export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const budgets = await prisma.budget.findMany({
      where: { userId },
      include: { lineItems: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(budgets);
  } catch (error) {
    console.error("GET /api/financial-planning/budgets error:", error);
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
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

    if (!body.name || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { error: "name, startDate, and endDate are required" },
        { status: 400 },
      );
    }

    const allowedPeriods = new Set(["MONTHLY", "QUARTERLY", "ANNUAL"]);
    if (body.period && !allowedPeriods.has(body.period)) {
      return NextResponse.json(
        { error: "period must be MONTHLY, QUARTERLY, or ANNUAL" },
        { status: 400 },
      );
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "startDate and endDate must be valid dates" },
        { status: 400 },
      );
    }
    if (endDate < startDate) {
      return NextResponse.json(
        { error: "endDate must be on or after startDate" },
        { status: 400 },
      );
    }

    const budget = await prisma.budget.create({
      data: {
        userId,
        name: body.name,
        period: body.period ?? "MONTHLY",
        startDate,
        endDate,
        lineItems: body.lineItems
          ? { create: body.lineItems }
          : undefined,
      },
      include: { lineItems: true },
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    console.error("POST /api/financial-planning/budgets error:", error);
    return NextResponse.json(
      { error: "Failed to create budget" },
      { status: 500 },
    );
  }
}

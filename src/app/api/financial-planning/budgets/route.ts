export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { endDateForPeriod, normalizeStoredBudgetEndDate } from "@/lib/analytics/budget-period";

const VALID_PERIODS = new Set(["MONTHLY", "QUARTERLY", "ANNUAL"]);

function computeEndDate(startDate: Date, period: string): Date {
  const inclusiveEnd = endDateForPeriod(
    startDate.toISOString().slice(0, 10),
    period as "MONTHLY" | "QUARTERLY" | "ANNUAL",
  );
  return new Date(`${inclusiveEnd}T00:00:00.000Z`);
}

export async function GET(): Promise<NextResponse> {
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

    return NextResponse.json(
      budgets.map((budget) => ({
        ...budget,
        endDate: normalizeStoredBudgetEndDate(
          budget.startDate.toISOString(),
          budget.endDate.toISOString(),
          budget.period as "MONTHLY" | "QUARTERLY" | "ANNUAL",
        ),
      })),
    );
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

    if (!body.name || !body.startDate) {
      return NextResponse.json(
        { error: "name and startDate are required" },
        { status: 400 },
      );
    }

    const period = body.period ?? "MONTHLY";
    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json(
        { error: "period must be MONTHLY, QUARTERLY, or ANNUAL" },
        { status: 400 },
      );
    }

    const startDate = new Date(body.startDate);
    if (!Number.isFinite(startDate.getTime())) {
      return NextResponse.json(
        { error: "startDate must be a valid date" },
        { status: 400 },
      );
    }

    const endDate = body.endDate
      ? new Date(body.endDate)
      : computeEndDate(startDate, period);
    if (!Number.isFinite(endDate.getTime())) {
      return NextResponse.json(
        { error: "endDate must be a valid date" },
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
        period,
        startDate,
        endDate,
        lineItems: body.lineItems
          ? { create: body.lineItems }
          : undefined,
      },
      include: { lineItems: true },
    });

    return NextResponse.json(
      {
        ...budget,
        endDate: normalizeStoredBudgetEndDate(
          budget.startDate.toISOString(),
          budget.endDate.toISOString(),
          budget.period as "MONTHLY" | "QUARTERLY" | "ANNUAL",
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/financial-planning/budgets error:", error);
    return NextResponse.json(
      { error: "Failed to create budget" },
      { status: 500 },
    );
  }
}

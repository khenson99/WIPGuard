export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { normalizeStoredBudgetEndDate } from "@/lib/analytics/budget-period";

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

    const budget = await prisma.budget.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!budget || budget.userId !== userId) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...budget,
      endDate: normalizeStoredBudgetEndDate(
        budget.startDate.toISOString(),
        budget.endDate.toISOString(),
        budget.period as "MONTHLY" | "QUARTERLY" | "ANNUAL",
      ),
    });
  } catch (error) {
    console.error("GET /api/financial-planning/budgets/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch budget" },
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

    const existing = await prisma.budget.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const body = await request.json();

    const updateFields: Record<string, unknown> = {};
    if (body.name !== undefined) updateFields.name = body.name;
    if (body.period !== undefined) updateFields.period = body.period;
    if (body.startDate !== undefined) updateFields.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) updateFields.endDate = new Date(body.endDate);

    if (body.lineItems) {
      const [, updated] = await prisma.$transaction([
        prisma.budgetLineItem.deleteMany({ where: { budgetId: id } }),
        prisma.budget.update({
          where: { id },
          data: {
            ...updateFields,
            lineItems: { create: body.lineItems },
          },
          include: { lineItems: true },
        }),
      ]);

      return NextResponse.json({
        ...updated,
        endDate: normalizeStoredBudgetEndDate(
          updated.startDate.toISOString(),
          updated.endDate.toISOString(),
          updated.period as "MONTHLY" | "QUARTERLY" | "ANNUAL",
        ),
      });
    }

    const updated = await prisma.budget.update({
      where: { id },
      data: updateFields,
      include: { lineItems: true },
    });

    return NextResponse.json({
      ...updated,
      endDate: normalizeStoredBudgetEndDate(
        updated.startDate.toISOString(),
        updated.endDate.toISOString(),
        updated.period as "MONTHLY" | "QUARTERLY" | "ANNUAL",
      ),
    });
  } catch (error) {
    console.error("PATCH /api/financial-planning/budgets/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update budget" },
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

    const existing = await prisma.budget.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    await prisma.budget.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/financial-planning/budgets/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete budget" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineItemId: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, lineItemId } = await params;

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "conference.write",
      request,
      targetType: "conference",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const existing = await prisma.conferenceBudgetLineItem.findUnique({
      where: { id: lineItemId },
      select: { id: true, budget: { select: { conferenceId: true } } },
    });

    if (!existing || existing.budget.conferenceId !== id) {
      return NextResponse.json({ error: "Line item not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.plannedAmount !== undefined) {
      const amount = typeof body.plannedAmount === "number" ? body.plannedAmount : Number(body.plannedAmount);
      if (!Number.isFinite(amount)) {
        return NextResponse.json({ error: "Invalid plannedAmount" }, { status: 400 });
      }
      data.plannedAmount = amount;
    }
    if (body.label !== undefined) {
      if (typeof body.label !== "string" || body.label.trim().length === 0) {
        return NextResponse.json({ error: "Invalid label" }, { status: 400 });
      }
      data.label = body.label.trim();
    }
    if (body.notes !== undefined) {
      data.notes = typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes : null;
    }

    const updated = await prisma.conferenceBudgetLineItem.update({
      where: { id: lineItemId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update conference budget line item:", error);
    return NextResponse.json(
      { error: "Failed to update budget line item" },
      { status: 500 },
    );
  }
}


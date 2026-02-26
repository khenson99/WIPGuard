export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import {
  ConferenceExpenseCategory,
  ConferenceReimbursementStatus,
} from "@/generated/prisma/client";

function parseDate(value: unknown): Date | null {
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return null;
}

function isCategory(value: unknown): value is (typeof ConferenceExpenseCategory)[keyof typeof ConferenceExpenseCategory] {
  return typeof value === "string" && Object.values(ConferenceExpenseCategory).includes(value as never);
}

function isReimbursementStatus(
  value: unknown
): value is (typeof ConferenceReimbursementStatus)[keyof typeof ConferenceReimbursementStatus] {
  return typeof value === "string" && Object.values(ConferenceReimbursementStatus).includes(value as never);
}

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
      action: "conference.write",
      request,
      targetType: "conference",
      targetId: id,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!isCategory(body.category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const incurredAt = parseDate(body.incurredAt);
    if (!incurredAt) {
      return NextResponse.json({ error: "incurredAt is required" }, { status: 400 });
    }

    const reimbursementStatus = body.reimbursementStatus;
    if (reimbursementStatus !== undefined && reimbursementStatus !== null && !isReimbursementStatus(reimbursementStatus)) {
      return NextResponse.json({ error: "Invalid reimbursementStatus" }, { status: 400 });
    }

    const created = await prisma.conferenceExpense.create({
      data: {
        conferenceId: id,
        category: body.category,
        amount,
        currency: typeof body.currency === "string" && body.currency.trim().length > 0 ? body.currency.trim() : "USD",
        incurredAt,
        vendor: typeof body.vendor === "string" && body.vendor.trim().length > 0 ? body.vendor.trim() : null,
        description: typeof body.description === "string" && body.description.trim().length > 0 ? body.description.trim() : null,
        receiptUrl: typeof body.receiptUrl === "string" && body.receiptUrl.trim().length > 0 ? body.receiptUrl.trim() : null,
        reimbursable: body.reimbursable === true,
        reimbursementStatus: isReimbursementStatus(reimbursementStatus) ? reimbursementStatus : undefined,
        paidByUserId: typeof body.paidByUserId === "string" && body.paidByUserId.trim().length > 0 ? body.paidByUserId.trim() : null,
        budgetLineItemId: typeof body.budgetLineItemId === "string" && body.budgetLineItemId.trim().length > 0 ? body.budgetLineItemId.trim() : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Failed to create conference expense:", error);
    return NextResponse.json(
      { error: "Failed to create expense" },
      { status: 500 },
    );
  }
}


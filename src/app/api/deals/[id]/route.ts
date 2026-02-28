export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { DealStage, DealSource } from "@/generated/prisma/client";

const USER_SELECT = { id: true, name: true, email: true, image: true } as const;

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

    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: USER_SELECT },
        contacts: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            title: true,
            companyId: true,
            company: { select: { id: true, name: true } },
          },
        },
        meetings: {
          include: {
            company: { select: { id: true, name: true } },
            _count: { select: { attendees: true } },
          },
          orderBy: { startAt: "desc" },
        },
        stageHistory: { orderBy: { changedAt: "desc" } },
        _count: { select: { meetings: true, contacts: true } },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json(deal);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch deal" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: session.user.id,
      action: "deals.write",
      request,
    });
    if (deniedResponse) return deniedResponse;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const existing = await prisma.deal.findUnique({ where: { id }, select: { stage: true } });
    if (!existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.amount === "number") data.amount = body.amount;
    if (typeof body.notes === "string") data.notes = body.notes || null;
    if (body.companyId !== undefined) data.companyId = body.companyId || null;
    if (body.ownerId !== undefined) data.ownerId = body.ownerId || null;
    if (body.expectedCloseDate !== undefined) {
      data.expectedCloseDate = body.expectedCloseDate ? new Date(body.expectedCloseDate) : null;
    }

    if (typeof body.stage === "string" && Object.values(DealStage).includes(body.stage as DealStage)) {
      data.stage = body.stage;
      if (body.stage === "CLOSED_WON" || body.stage === "CLOSED_LOST") {
        data.closedAt = new Date();
      }
    }

    if (typeof body.source === "string" && Object.values(DealSource).includes(body.source as DealSource)) {
      data.source = body.source;
    }

    if (Array.isArray(body.contactIds)) {
      data.contacts = { set: body.contactIds.map((cid: string) => ({ id: cid })) };
    }

    const deal = await prisma.deal.update({
      where: { id },
      data,
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: USER_SELECT },
        _count: { select: { meetings: true, contacts: true } },
      },
    });

    // Record stage change
    if (data.stage && data.stage !== existing.stage) {
      await prisma.dealStageHistory.create({
        data: {
          dealId: id,
          fromStage: existing.stage,
          toStage: data.stage as DealStage,
          changedBy: session.user.id,
        },
      });
    }

    return NextResponse.json(deal);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update deal" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: session.user.id,
      action: "deals.write",
      request,
    });
    if (deniedResponse) return deniedResponse;

    const { id } = await params;
    await prisma.deal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete deal" },
      { status: 500 },
    );
  }
}

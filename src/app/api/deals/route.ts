export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";
import { DealStage, DealSource } from "@/generated/prisma/client";
import { toDealsErrorResponse } from "@/lib/deals/schema-guard";

const USER_SELECT = { id: true, name: true, email: true, image: true } as const;

function getOptionalOrganizationId(session: unknown): string | null {
  const orgId = (session as { user?: { organizationId?: unknown } } | null | undefined)?.user
    ?.organizationId;
  return typeof orgId === "string" && orgId.trim() ? orgId : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: user.id,
      action: "deals.read",
      request,
      targetType: "deal",
    });
    if (deniedResponse) return deniedResponse;

    const url = new URL(request.url);
    const stage = url.searchParams.get("stage");
    const ownerId = url.searchParams.get("ownerId");
    const minAmount = url.searchParams.get("minAmount");
    const maxAmount = url.searchParams.get("maxAmount");
    const search = url.searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (stage && Object.values(DealStage).includes(stage as DealStage)) {
      where.stage = stage;
    }
    if (ownerId) where.ownerId = ownerId;
    if (minAmount || maxAmount) {
      where.amount = {};
      if (minAmount) (where.amount as Record<string, number>).gte = parseFloat(minAmount);
      if (maxAmount) (where.amount as Record<string, number>).lte = parseFloat(maxAmount);
    }
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const deals = await prisma.deal.findMany({
      where,
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
        meetings: { select: { startAt: true }, orderBy: { startAt: "desc" }, take: 1 },
        _count: { select: { meetings: true, contacts: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const enriched = deals.map((d) => ({
      ...d,
      lastMeetingAt: d.meetings[0]?.startAt?.toISOString() ?? null,
      meetings: undefined,
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to fetch deals");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: user.id,
      action: "deals.write",
      request,
    });
    if (deniedResponse) return deniedResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const stage =
      typeof body.stage === "string" && Object.values(DealStage).includes(body.stage as DealStage)
        ? (body.stage as DealStage)
        : DealStage.LEAD;

    const organizationId = getOptionalOrganizationId(session);
    const source =
      typeof body.source === "string" && Object.values(DealSource).includes(body.source as DealSource)
        ? (body.source as DealSource)
        : DealSource.OTHER;

    const deal = await prisma.deal.create({
      data: {
        organizationId: organizationId ?? undefined,
        name: body.name.trim(),
        stage,
        amount: typeof body.amount === "number" ? body.amount : 0,
        source,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
        notes: typeof body.notes === "string" ? body.notes : null,
        companyId: typeof body.companyId === "string" ? body.companyId : null,
        ownerId: typeof body.ownerId === "string" ? body.ownerId : user.id,
        contacts:
          Array.isArray(body.contactIds) && body.contactIds.length > 0
            ? { connect: body.contactIds.map((id: string) => ({ id })) }
            : undefined,
      },
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: USER_SELECT },
        _count: { select: { meetings: true, contacts: true } },
      },
    });

    // Record initial stage history
    await prisma.dealStageHistory.create({
      data: { dealId: deal.id, fromStage: null, toStage: stage, changedBy: user.id },
    });

    return NextResponse.json(deal, { status: 201 });
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to create deal");
  }
}

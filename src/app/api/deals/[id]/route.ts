import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealStage } from "@/generated/prisma/client";
import { validateStageTransition } from "@/lib/deals/stage-transitions";

function getOptionalOrganizationId(session: unknown): string | null {
  const orgId = (session as { user?: { organizationId?: unknown } } | null | undefined)?.user
    ?.organizationId;
  return typeof orgId === "string" && orgId.trim() ? orgId : null;
}

const USER_SELECT = { id: true, name: true, email: true } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params?.id) {
    return NextResponse.json({ error: "Deal id is required" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = getOptionalOrganizationId(session);
  const deal = await prisma.deal.findFirst({
    where: {
      id: params.id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      company: true,
      contacts: true,
      meetings: true,
      stageHistory: true,
      owner: { select: USER_SELECT },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json(deal);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params?.id) {
    return NextResponse.json({ error: "Deal id is required" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const organizationId = getOptionalOrganizationId(session);

  // Fetch the existing deal to validate stage transition
  const existingDeal = await prisma.deal.findFirst({
    where: {
      id: params.id,
      ...(organizationId ? { organizationId } : {}),
    },
  });

  if (!existingDeal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }

  if (typeof body.amount === "number" && body.amount >= 0) {
    data.amount = body.amount;
  }

  // Stage transition validation
  if (
    typeof body.stage === "string" &&
    Object.values(DealStage).includes(body.stage as DealStage)
  ) {
    const targetStage = body.stage as DealStage;
    const adminOverride = body.adminOverride === true && session.user.role === "admin";

    const transitionResult = validateStageTransition(
      existingDeal.stage,
      targetStage,
      adminOverride
    );

    if (!transitionResult.valid) {
      return NextResponse.json(
        {
          error: "Invalid stage transition",
          message: transitionResult.message,
          currentStage: existingDeal.stage,
          targetStage: targetStage,
          allowedTransitions: transitionResult.allowedTransitions,
        },
        { status: 422 }
      );
    }

    data.stage = targetStage;

    // Audit log for admin overrides
    if (adminOverride && existingDeal.stage !== targetStage) {
      console.warn(
        `[AUDIT] Admin override stage transition: Deal ${params.id} from ${existingDeal.stage} to ${targetStage} by user ${session.user.id} (${session.user.email})`
      );
    }
  }

  if (typeof body.companyId === "string") {
    data.companyId = body.companyId;
  }

  if (typeof body.ownerId === "string") {
    data.ownerId = body.ownerId;
  }

  if (typeof body.expectedCloseDate === "string") {
    data.expectedCloseDate = new Date(body.expectedCloseDate);
  }

  if (typeof body.notes === "string") {
    data.notes = body.notes;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
      );
  }

  if (organizationId) {
    const result = await prisma.deal.updateMany({
      where: { id: params.id, organizationId },
      data,
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
  } else {
    await prisma.deal.update({
      where: { id: params.id },
      data,
    });
  }

  const updatedDeal = await prisma.deal.findFirst({
    where: {
      id: params.id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      company: true,
      contacts: true,
      meetings: true,
      stageHistory: true,
      owner: { select: USER_SELECT },
    },
  });

  if (!updatedDeal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json(updatedDeal);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!params?.id) {
    return NextResponse.json({ error: "Deal id is required" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = getOptionalOrganizationId(session);
  const deal = await prisma.deal.findFirst({
    where: {
      id: params.id,
      ...(organizationId ? { organizationId } : {}),
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (organizationId) {
    const result = await prisma.deal.deleteMany({
      where: { id: params.id, organizationId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
  } else {
    await prisma.deal.delete({
      where: { id: params.id },
    });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealStage } from "@/generated/prisma/client";
import { validateStageTransition } from "@/lib/deals/stage-transitions";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
    },
    include: {
      contact: true,
      company: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Fetch the existing deal to validate stage transition
  const existingDeal = await prisma.deal.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
    },
  });

  if (!existingDeal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }

  if (typeof body.value === "number" && body.value >= 0) {
    data.value = body.value;
  }

  // Stage transition validation
  if (
    typeof body.stage === "string" &&
    Object.values(DealStage).includes(body.stage as DealStage)
  ) {
    const targetStage = body.stage as DealStage;
    const adminOverride = body.adminOverride === true && session.user.role === "ADMIN";

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

  if (typeof body.contactId === "string") {
    data.contactId = body.contactId;
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

  const updatedDeal = await prisma.deal.update({
    where: { id: params.id },
    data,
    include: {
      contact: true,
      company: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json(updatedDeal);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId,
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  await prisma.deal.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ success: true });
}

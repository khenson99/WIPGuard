import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealSource, DealStage } from "@/generated/prisma/client";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";
import { validateStageTransition } from "@/lib/deals/stage-transitions";
import { toDealsErrorResponse } from "@/lib/deals/schema-guard";

function getOptionalOrganizationId(session: unknown): string | null {
  const orgId = (session as { user?: { organizationId?: unknown } } | null | undefined)?.user
    ?.organizationId;
  return typeof orgId === "string" && orgId.trim() ? orgId : null;
}

const USER_SELECT = { id: true, name: true, email: true } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Deal id is required" }, { status: 400 });
    }

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
      targetId: id,
    });
    if (deniedResponse) {
      return deniedResponse;
    }

    const organizationId = getOptionalOrganizationId(session);
    const deal = await prisma.deal.findFirst({
      where: {
        id,
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
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to fetch deal");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Deal id is required" }, { status: 400 });
    }

    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: user.id,
      action: "deals.write",
      request,
      targetType: "deal",
      targetId: id,
    });
    if (deniedResponse) {
      return deniedResponse;
    }

    const body = await request.json();
    const organizationId = getOptionalOrganizationId(session);

    // Fetch the existing deal to validate stage transition
    const existingDeal = await prisma.deal.findFirst({
      where: {
        id,
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

    if (
      typeof body.source === "string" &&
      Object.values(DealSource).includes(body.source as DealSource)
    ) {
      data.source = body.source as DealSource;
    }

    // Stage transition validation
    if (
      typeof body.stage === "string" &&
      Object.values(DealStage).includes(body.stage as DealStage)
    ) {
      const targetStage = body.stage as DealStage;
      const adminOverride = body.adminOverride === true && user.role === "admin";

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
          `[AUDIT] Admin override stage transition: Deal ${id} from ${existingDeal.stage} to ${targetStage} by user ${user.id} (${user.email})`
        );
      }
    }

    if (typeof body.companyId === "string" || body.companyId === null) {
      data.companyId = body.companyId;
    }

    if (typeof body.ownerId === "string" || body.ownerId === null) {
      data.ownerId = body.ownerId;
    }

    if (typeof body.expectedCloseDate === "string") {
      data.expectedCloseDate = new Date(body.expectedCloseDate);
    } else if (body.expectedCloseDate === null) {
      data.expectedCloseDate = null;
    }

    if (typeof body.notes === "string" || body.notes === null) {
      data.notes = body.notes;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
        );
    }

    const nextStage = data.stage as DealStage | undefined;
    const stageChanged = nextStage !== undefined && nextStage !== existingDeal.stage;

    const updated = await prisma.$transaction(async (tx) => {
      if (organizationId) {
        const result = await tx.deal.updateMany({
          where: { id, organizationId },
          data,
        });
        if (result.count === 0) {
          return false;
        }
      } else {
        await tx.deal.update({
          where: { id },
          data,
        });
      }

      if (stageChanged) {
        await tx.dealStageHistory.create({
          data: {
            dealId: id,
            fromStage: existingDeal.stage,
            toStage: nextStage,
            changedBy: user.id,
          },
        });
      }

      return true;
    });

    if (!updated) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const updatedDeal = await prisma.deal.findFirst({
      where: {
        id,
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
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to update deal");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Deal id is required" }, { status: 400 });
    }

    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: user.id,
      action: "deals.write",
      request,
      targetType: "deal",
      targetId: id,
    });
    if (deniedResponse) {
      return deniedResponse;
    }

    const organizationId = getOptionalOrganizationId(session);
    const deal = await prisma.deal.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (organizationId) {
      const result = await prisma.deal.deleteMany({
        where: { id, organizationId },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      }
    } else {
      await prisma.deal.delete({
        where: { id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to delete deal");
  }
}

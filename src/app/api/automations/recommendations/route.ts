export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { AutomationRecommendationStatus } from "@/lib/automations/prisma-enums";
import { WorkflowScope, type Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { getAppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getAppRole(user.id);
    const mineOnly = request.nextUrl.searchParams.get("mine") === "true";
    const workflowId = request.nextUrl.searchParams.get("workflowId");
    const runId = request.nextUrl.searchParams.get("runId");
    const status = request.nextUrl.searchParams.get("status");
    const ownerOrParticipantFilters: Prisma.AutomationRecommendationWhereInput[] = [
      { workflow: { is: { ownerId: user.id } } },
      { requestedById: user.id },
      { approverId: user.id },
      { executedById: user.id },
    ];
    const visibilityFilter: Prisma.AutomationRecommendationWhereInput = mineOnly
      ? {
          OR: ownerOrParticipantFilters,
        }
      : role === "admin"
        ? {}
        : {
            OR: [
              { workflow: { is: { scope: WorkflowScope.SHARED } } },
              ...ownerOrParticipantFilters,
            ],
          };

    const recommendations = await prisma.automationRecommendation.findMany({
      where: {
        ...(workflowId ? { workflowId } : {}),
        ...(runId ? { runId } : {}),
        ...(status &&
        Object.values(AutomationRecommendationStatus).includes(
          status as AutomationRecommendationStatus
        )
          ? { status: status as AutomationRecommendationStatus }
          : {}),
        ...visibilityFilter,
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            operatorKey: true,
          },
        },
        run: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        artifact: {
          select: {
            id: true,
            artifactType: true,
            title: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        executedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      take: 250,
    });

    return NextResponse.json(recommendations);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch recommendations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

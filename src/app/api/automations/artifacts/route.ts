export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { WorkflowScope } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { normalizeAutomationOperatorKey } from "@/lib/automations/operators";
import { investorForbiddenResponse } from "@/lib/investor/api-guards";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/session-user";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const investorDenied = investorForbiddenResponse(user.role);
    if (investorDenied) return investorDenied;

    const workflowId = request.nextUrl.searchParams.get("workflowId");
    const runId = request.nextUrl.searchParams.get("runId");
    const operatorKey = normalizeAutomationOperatorKey(
      request.nextUrl.searchParams.get("operatorKey")
    );

    const artifacts = await prisma.automationArtifact.findMany({
      where: {
        ...(workflowId ? { workflowId } : {}),
        ...(runId ? { runId } : {}),
        ...(operatorKey ? { operatorKey } : {}),
        workflow: {
          OR: [{ ownerId: user.id }, { scope: WorkflowScope.SHARED }],
        },
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
        sourceDocument: {
          select: {
            id: true,
            documentType: true,
            title: true,
          },
        },
      },
      take: 200,
    });

    return NextResponse.json(artifacts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch artifacts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { WorkflowScope } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workflowId = request.nextUrl.searchParams.get("workflowId");
    const runId = request.nextUrl.searchParams.get("runId");
    const operatorKey = request.nextUrl.searchParams.get("operatorKey");

    const artifacts = await prisma.automationArtifact.findMany({
      where: {
        ...(workflowId ? { workflowId } : {}),
        ...(runId ? { runId } : {}),
        ...(operatorKey ? { operatorKey: operatorKey as never } : {}),
        workflow: {
          OR: [{ ownerId: session.user.id }, { scope: WorkflowScope.SHARED }],
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

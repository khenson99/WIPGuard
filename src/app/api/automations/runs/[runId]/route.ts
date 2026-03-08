export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCanViewWorkflow } from "@/lib/automations/service";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ runId: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;
    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
      include: {
        workflow: {
          select: {
            id: true,
            ownerId: true,
            scope: true,
          },
        },
        steps: {
          orderBy: { createdAt: "asc" },
        },
        sourceDocuments: {
          orderBy: { createdAt: "asc" },
        },
        artifacts: {
          orderBy: { createdAt: "asc" },
        },
        recommendations: {
          orderBy: { createdAt: "asc" },
        },
        aiJobs: {
          orderBy: { createdAt: "asc" },
        },
        approvals: {
          orderBy: { createdAt: "asc" },
          include: {
            approver: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    await assertCanViewWorkflow(session.user.id, run.workflowId);

    return NextResponse.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch run";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

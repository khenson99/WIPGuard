export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertCanViewWorkflow } from "@/lib/automations/service";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
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

    const { id } = await context.params;
    await assertCanViewWorkflow(session.user.id, id);

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: id },
      orderBy: { createdAt: "desc" },
      include: {
        steps: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            nodeKey: true,
            nodeType: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            error: true,
          },
        },
        approvals: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            nodeKey: true,
            status: true,
            approverId: true,
            timeoutAt: true,
            resolvedAt: true,
          },
        },
      },
      take: 100,
    });

    return NextResponse.json(runs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch workflow runs";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

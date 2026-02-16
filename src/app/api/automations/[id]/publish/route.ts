export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { WorkflowStatus } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { assertCanEditWorkflow } from "@/lib/automations/service";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    await assertCanEditWorkflow(session.user.id, id);

    const workflow = await prisma.workflowDefinition.update({
      where: { id },
      data: {
        status: WorkflowStatus.ACTIVE,
        graphVersion: { increment: 1 },
        lastPublishedAt: new Date(),
        lastError: null,
      },
      include: {
        nodes: true,
        edges: true,
      },
    });

    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish workflow";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

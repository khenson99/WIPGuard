export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationProvider,
  type Prisma,
  WorkflowRunStatus,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import {
  assertCanEditWorkflow,
  integrationProviderFromString,
} from "@/lib/automations/service";
import { executeWorkflowRun } from "@/lib/automations/runtime";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const workflow = await assertCanEditWorkflow(session.user.id, id);

    const body = asRecord(await request.json().catch(() => ({})));
    const provider =
      integrationProviderFromString(typeof body.provider === "string" ? body.provider : null) ??
      workflow.providers[0] ??
      IntegrationProvider.GOOGLE_WORKSPACE;

    const eventType =
      typeof body.eventType === "string" && body.eventType.trim().length > 0
        ? body.eventType.trim()
        : "manual.test";

    const payload = asRecord(body.payload);

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        requestedById: session.user.id,
        triggerProvider: provider,
        triggerType: eventType,
        triggerId: typeof body.externalId === "string" ? body.externalId : null,
        triggerPayload: payload as Prisma.InputJsonValue,
        status: WorkflowRunStatus.QUEUED,
      },
      select: { id: true },
    });

    await executeWorkflowRun(run.id);

    const hydrated = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: run.id },
      include: {
        steps: {
          orderBy: { createdAt: "asc" },
        },
        approvals: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json(hydrated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run workflow";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

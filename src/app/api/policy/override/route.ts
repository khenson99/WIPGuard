import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserRole, enforcePolicy, recordPolicyOverride } from "@/lib/policy-check";
import type { TaskStatus } from "@/generated/prisma/client";

interface OverrideInput {
  taskId: string;
  reason: string;
  action: string;
}

/**
 * POST /api/policy/override — records a policy override
 * Used when the client has already been told an override is needed and
 * the user provides a reason through a dialog.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: OverrideInput = await request.json();

    if (!body.taskId || !body.reason || !body.action) {
      return NextResponse.json(
        { error: "taskId, reason, and action are required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id: body.taskId },
      select: { id: true, status: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const userRole = await getUserRole(session.user.id);

    // Re-check policy to capture current state for the audit record
    const policyResult = await enforcePolicy(
      task.status as TaskStatus,
      userRole,
      task.id
    );

    const override = await recordPolicyOverride({
      taskId: body.taskId,
      action: body.action,
      reason: body.reason,
      actorId: session.user.id,
      actorName: session.user.name ?? undefined,
      actorRole: userRole,
      column: task.status,
      wipCount: policyResult.currentCount,
      wipLimit: policyResult.wipLimit,
    });

    return NextResponse.json(override, { status: 201 });
  } catch (error) {
    console.error("POST /api/policy/override error:", error);
    return NextResponse.json(
      { error: "Failed to record override" },
      { status: 500 }
    );
  }
}

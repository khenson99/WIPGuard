export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dispatchWorkflowTriggerEvents } from "@/lib/automations/runtime";
import { enforcePermission } from "@/lib/permissions";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "automation.write",
      request,
      targetType: "automation_dispatch",
      targetId: "dispatcher",
    });

    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(100, Math.trunc(body.limit)))
        : 25;

    const result = await dispatchWorkflowTriggerEvents(limit);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to dispatch workflow events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

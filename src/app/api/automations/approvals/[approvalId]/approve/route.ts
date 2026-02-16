export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveWorkflowApproval } from "@/lib/automations/runtime";

interface RouteParams {
  params: Promise<{ approvalId: string }>;
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

    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const { approvalId } = await context.params;

    await resolveWorkflowApproval({
      approvalId,
      actorUserId: session.user.id,
      decision: "approve",
      note: typeof body.note === "string" ? body.note : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to approve workflow step";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

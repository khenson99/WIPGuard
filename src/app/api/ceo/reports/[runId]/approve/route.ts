export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CeoOrganizationContextError, withCeoOrganizationContext } from "@/lib/ceo/api-context";
import { approveCeoReportRun } from "@/lib/ceo/service";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await context.params;
  const reportRunId = typeof runId === "string" ? runId.trim() : "";
  if (!reportRunId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const permission = await enforcePermission({
    userId: user.id,
    action: "board_final.approve",
    request,
    targetType: "ceo_report_run",
    targetId: reportRunId,
  });
  if (permission.deniedResponse) {
    return permission.deniedResponse;
  }

  const body = (await request.json().catch(() => null)) as { overrideReason?: unknown } | null;
  const overrideReason =
    typeof body?.overrideReason === "string" && body.overrideReason.trim()
      ? body.overrideReason.trim()
      : null;

  try {
    const approvedRun = await withCeoOrganizationContext(session, user, (organizationId) =>
      approveCeoReportRun({
        userId: user.id,
        organizationId,
        runId: reportRunId,
        overrideReason,
      }),
    );

    return NextResponse.json(approvedRun);
  } catch (error) {
    if (error instanceof CeoOrganizationContextError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Failed to approve CEO report run";
    const status = message === "CEO report run not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

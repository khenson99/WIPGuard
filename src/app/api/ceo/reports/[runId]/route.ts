export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CeoOrganizationContextError, withCeoOrganizationContext } from "@/lib/ceo/api-context";
import { getCeoReportRun } from "@/lib/ceo/service";
import { enforcePermission, normalizeRole } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;
    const permission = await enforcePermission({
      userId: user.id,
      action: "report.read",
      request,
      targetType: "ceo_report_run",
      targetId: runId,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }
    if (normalizeRole(user.role) === "investor") {
      return NextResponse.json(
        { error: "Investors must use the redacted investor board-pack endpoint" },
        { status: 403 },
      );
    }

    const run = await withCeoOrganizationContext(session, user, (organizationId) =>
      getCeoReportRun({
        userId: user.id,
        organizationId,
        runId,
      })
    );
    if (!run) {
      return NextResponse.json({ error: "Report run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error) {
    if (error instanceof CeoOrganizationContextError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/ceo/reports/[runId] error:", error);
    return NextResponse.json(
      { error: "Failed to load CEO report run" },
      { status: 500 }
    );
  }
}

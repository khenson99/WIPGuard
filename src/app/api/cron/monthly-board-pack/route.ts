export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createMonthlyInvestorReportRun } from "@/lib/ceo/service";
import { ensureIntegrationOwnerOrganizationId } from "@/lib/integrations/ownership";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SYNC_SECRET?.trim() || process.env.INTEGRATION_SYNC_SECRET?.trim();
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret")?.trim() ||
    request.headers.get("x-integration-sync-secret")?.trim() ||
    "";
  return Boolean(provided && provided === expected);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerUserId = process.env.INTEGRATION_OWNER_USER_ID?.trim();
  if (!ownerUserId) {
    return NextResponse.json(
      { error: "INTEGRATION_OWNER_USER_ID is required for monthly board-pack generation" },
      { status: 400 },
    );
  }

  try {
    const organizationId = await ensureIntegrationOwnerOrganizationId(ownerUserId);
    const result = await createMonthlyInvestorReportRun({
      userId: ownerUserId,
      organizationId,
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      run: {
        id: result.run.id,
        packSlug: result.run.packSlug,
        packName: result.run.packName,
        generatedAt: result.run.generatedAt,
        readiness: result.run.slideJson.readiness,
        boardFinal: result.run.boardFinal,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Monthly board-pack generation failed";
    console.error("POST /api/cron/monthly-board-pack error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

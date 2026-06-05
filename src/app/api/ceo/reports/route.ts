export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CeoOrganizationContextError, withCeoOrganizationContext } from "@/lib/ceo/api-context";
import { createCeoReportRun, listCeoReportPacks } from "@/lib/ceo/service";
import { enforcePermission, normalizeRole } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

async function getUser() {
  const session = await auth();
  return getAuthenticatedUser(session);
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: user.id,
      action: "report.read",
      request,
      targetType: "ceo_report_pack",
      targetId: "catalog",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const role = normalizeRole(user.role);
    const reportPacks = (await listCeoReportPacks()).filter((pack) =>
      role === "investor" ? pack.audience === "INVESTOR" : true,
    );
    return NextResponse.json({ reportPacks });
  } catch (error) {
    console.error("GET /api/ceo/reports error:", error);
    return NextResponse.json(
      { error: "Failed to load CEO report packs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: user.id,
      action: "report.write",
      request,
      targetType: "ceo_report_run",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const body = (await request.json().catch(() => null)) as { packSlug?: unknown } | null;
    const packSlug = typeof body?.packSlug === "string" ? body.packSlug.trim() : "";
    if (!packSlug) {
      return NextResponse.json({ error: "packSlug is required" }, { status: 400 });
    }

    const run = await withCeoOrganizationContext(null, user, (organizationId) =>
      createCeoReportRun({
        userId: user.id,
        organizationId,
        packSlug,
      })
    );

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    if (error instanceof CeoOrganizationContextError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Failed to create CEO report run";
    const status = message.startsWith("Unknown CEO report pack") ? 404 : 500;
    if (status >= 500) {
      console.error("POST /api/ceo/reports error:", error);
    }
    return NextResponse.json({ error: message }, { status });
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  resolveDashboardOrganizationId,
  tenantBypassEnabled,
} from "@/lib/platform/dashboard/context";
import { loadDashboardOverview } from "@/lib/platform/dashboard/overview";
import { runWithContextAsync } from "@/lib/request-context";
import { getAuthenticatedUser } from "@/lib/session-user";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    const sessionUser = getAuthenticatedUser(session);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = await resolveDashboardOrganizationId(session, sessionUser.id);
    if (!organizationId && !tenantBypassEnabled) {
      return NextResponse.json(
        { error: "Organization context required for dashboard overview" },
        { status: 403 },
      );
    }

    const loadOverview = () =>
      loadDashboardOverview({
        userId: sessionUser.id,
        organizationId,
      });

    const payload = organizationId
      ? await runWithContextAsync({ organizationId, userId: sessionUser.id }, loadOverview)
      : await loadOverview();

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard/overview error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard overview" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  resolveDashboardOrganizationId,
  tenantBypassEnabled,
} from "@/lib/platform/dashboard/context";
import { runWithContextAsync } from "@/lib/request-context";
import { getAuthenticatedUser } from "@/lib/session-user";
import { loadPersonalizedDashboard } from "@/lib/work/dashboard/personalized";

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
        { error: "Organization context required for personalized dashboard" },
        { status: 403 }
      );
    }

    const loadDashboard = async () => loadPersonalizedDashboard(sessionUser.id);
    const payload = organizationId
      ? await runWithContextAsync({ organizationId, userId: sessionUser.id }, loadDashboard)
      : await loadDashboard();

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard/personalized error:", error);
    return NextResponse.json(
      { error: "Failed to load personalized dashboard" },
      { status: 500 }
    );
  }
}

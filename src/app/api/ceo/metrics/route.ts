export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CeoOrganizationContextError, withCeoOrganizationContext } from "@/lib/ceo/api-context";
import { loadCeoMetricSnapshot } from "@/lib/ceo/service";
import { getAuthenticatedUser } from "@/lib/session-user";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await withCeoOrganizationContext(session, user, (organizationId) =>
      loadCeoMetricSnapshot({
        userId: user.id,
        organizationId,
        persist: false,
      })
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    if (error instanceof CeoOrganizationContextError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/ceo/metrics error:", error);
    return NextResponse.json(
      { error: "Failed to load CEO metrics" },
      { status: 500 }
    );
  }
}

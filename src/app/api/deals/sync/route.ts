export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { syncDealsFromHubSpot } from "@/lib/deals/hubspot-sync";
import { toDealsErrorResponse } from "@/lib/deals/schema-guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { deniedResponse } = await enforcePermission({
      userId: session.user.id,
      action: "deals.write",
      request,
    });
    if (deniedResponse) return deniedResponse;

    const result = await syncDealsFromHubSpot(session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    return toDealsErrorResponse(error, "Sync failed");
  }
}

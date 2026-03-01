export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import { syncDealsFromHubSpot } from "@/lib/deals/hubspot-sync";

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
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

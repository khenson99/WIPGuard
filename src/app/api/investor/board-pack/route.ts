export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadInvestorBoardPack } from "@/lib/investor/board-pack";
import { enforcePermission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/lib/session-user";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  const user = getAuthenticatedUser(session);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permission = await enforcePermission({
    userId: user.id,
    action: "investor.read",
    request,
    targetType: "investor_board_pack",
    targetId: "latest",
  });
  if (permission.deniedResponse) {
    return permission.deniedResponse;
  }

  const payload = await loadInvestorBoardPack({
    userId: user.id,
    organizationId: user.organizationId ?? null,
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
    },
  });
}

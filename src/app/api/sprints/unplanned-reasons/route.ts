export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UNPLANNED_REASON_TAXONOMY } from "@/lib/sprint-ledger";

/**
 * GET /api/sprints/unplanned-reasons
 *
 * Returns the unplanned reason taxonomy for UI dropdowns and reporting.
 * Each entry includes a machine-readable code, human-readable label,
 * and a description of when to use each reason.
 *
 * Response: Array<{ code, label, description }>
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(UNPLANNED_REASON_TAXONOMY);
  } catch (error) {
    console.error("GET /api/sprints/unplanned-reasons error:", error);
    return NextResponse.json(
      { error: "Failed to fetch unplanned reason taxonomy" },
      { status: 500 },
    );
  }
}

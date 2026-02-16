export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchSprintCommitmentReport } from "@/lib/sprint-ledger";

/**
 * GET /api/sprints/[id]/report
 *
 * Returns the full sprint commitment report including:
 * - Commitment change log (append-only audit trail)
 * - Planned vs unplanned throughput breakdown with daily deltas
 * - Planning session summaries
 * - Unplanned reason taxonomy reference
 *
 * This is the primary endpoint for sprint retrospective data.
 *
 * Response shape: SprintCommitmentReport
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const sprint = await prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    const report = await fetchSprintCommitmentReport(id);

    return NextResponse.json(report);
  } catch (error) {
    console.error("GET /api/sprints/[id]/report error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sprint commitment report" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchCommitmentChangeLog } from "@/lib/sprint-ledger";

/**
 * GET /api/sprints/[id]/commitment-log
 *
 * Returns the append-only commitment change log for a sprint.
 * Each entry shows diffs between consecutive commitment snapshots,
 * attributing additions and removals to the actor who created each snapshot.
 *
 * Response shape: CommitmentChangeLog
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

    const changeLog = await fetchCommitmentChangeLog(id);

    return NextResponse.json(changeLog);
  } catch (error) {
    console.error("GET /api/sprints/[id]/commitment-log error:", error);
    return NextResponse.json(
      { error: "Failed to fetch commitment change log" },
      { status: 500 },
    );
  }
}

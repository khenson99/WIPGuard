export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computePlannedVsUnplanned } from "@/lib/sprint-ledger";

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

    const result = await computePlannedVsUnplanned(id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/sprints/[id]/planned-vs-unplanned error:", error);
    return NextResponse.json(
      { error: "Failed to compute planned vs unplanned data" },
      { status: 500 },
    );
  }
}

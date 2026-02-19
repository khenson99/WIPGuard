export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProspectStats } from "@/lib/prospecting/job-runner";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.PROSPECTING_SECRET?.trim();
  if (!expected) return false;

  const header = request.headers.get("x-prospecting-secret")?.trim();
  return Boolean(header && header === expected);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId query param is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const stats = await getProspectStats(userId);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("GET /api/prospecting/status error:", error);
    return NextResponse.json(
      { error: "Failed to get prospect stats" },
      { status: 500 }
    );
  }
}

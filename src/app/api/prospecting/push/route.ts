export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runPushJob } from "@/lib/prospecting/job-runner";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.PROSPECTING_SECRET?.trim();
  if (!expected) return false;

  const header = request.headers.get("x-prospecting-secret")?.trim();
  return Boolean(header && header === expected);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId : null;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const limit = typeof body.limit === "number" ? body.limit : undefined;

    const result = await runPushJob(userId, { limit });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/prospecting/push error:", error);
    return NextResponse.json(
      { error: "Failed to push prospects to HubSpot" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchFunnelInput } from "@/lib/funnel-data";
import { computeFunnel } from "@/lib/funnel-analytics";
import type { FunnelResult } from "@/lib/funnel-analytics";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const projectId = searchParams.get("projectId") ?? undefined;

  if (!fromParam || !toParam) {
    return NextResponse.json(
      { error: "Missing required query parameters: from, to" },
      { status: 400 },
    );
  }

  const from = new Date(fromParam);
  const to = new Date(toParam);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json(
      { error: "Invalid date format. Use ISO 8601." },
      { status: 400 },
    );
  }

  if (from > to) {
    return NextResponse.json(
      { error: '"from" must be before or equal to "to"' },
      { status: 400 },
    );
  }

  try {
    const input = await fetchFunnelInput(prisma, { from, to, projectId });
    const funnel = computeFunnel(input);

    const result: FunnelResult = {
      ...funnel,
      dateRange: { from: from.toISOString(), to: to.toISOString() },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Funnel analytics error:", error);
    return NextResponse.json(
      { error: "Failed to compute funnel analytics" },
      { status: 500 },
    );
  }
}

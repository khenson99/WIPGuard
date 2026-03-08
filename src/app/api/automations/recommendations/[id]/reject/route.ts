export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAutomationRecommendation } from "@/lib/automations/recommendations";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const { id } = await context.params;

    const recommendation = await resolveAutomationRecommendation({
      recommendationId: id,
      actorUserId: session.user.id,
      decision: "reject",
      note: typeof body.note === "string" ? body.note : undefined,
    });

    return NextResponse.json(recommendation);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reject recommendation";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

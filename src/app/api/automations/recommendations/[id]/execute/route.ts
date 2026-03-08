export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MANUAL_EXECUTION_REQUIRED_MESSAGE } from "@/lib/automations/execution-policy";
import { executeAutomationRecommendation } from "@/lib/automations/recommendations";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  _request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const recommendation = await executeAutomationRecommendation({
      recommendationId: id,
      actorUserId: session.user.id,
    });

    return NextResponse.json(recommendation);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to execute recommendation";
    const status =
      message === "Forbidden"
        ? 403
        : message === MANUAL_EXECUTION_REQUIRED_MESSAGE
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

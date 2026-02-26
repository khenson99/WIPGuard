import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { InsightFeedbackAction } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_ACTIONS = new Set<string>(Object.values(InsightFeedbackAction));

type InsightFeedbackDelegateLike = {
  create(args: {
    data: {
      userId: string;
      insightId: string;
      action: InsightFeedbackAction;
    };
  }): Promise<{ id: string }>;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { insightId?: string; action?: string };
  const { insightId, action } = body;

  if (!insightId || typeof insightId !== "string") {
    return NextResponse.json({ error: "insightId is required" }, { status: 400 });
  }
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${[...VALID_ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }

  const insightFeedback = (prisma as unknown as { insightFeedback?: InsightFeedbackDelegateLike })
    .insightFeedback;
  if (!insightFeedback) {
    console.warn("[insights-feedback] Prisma client missing InsightFeedback delegate");
    return NextResponse.json(
      { error: "Insight feedback not available" },
      { status: 501 },
    );
  }

  const feedback = await insightFeedback.create({
    data: {
      userId,
      insightId,
      action: action as InsightFeedbackAction,
    },
  });

  return NextResponse.json({ id: feedback.id, ok: true });
}

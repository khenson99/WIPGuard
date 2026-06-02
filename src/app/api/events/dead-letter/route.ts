export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deadLetterOutboxEvents } from "@/lib/outbox-worker";

interface DeadLetterRequestBody {
  eventIds?: string[];
  reason?: string;
  statuses?: Array<"PENDING" | "FAILED">;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as DeadLetterRequestBody;
    const eventIds = asStringArray(body.eventIds);

    if (!eventIds.length) {
      return NextResponse.json(
        { error: "eventIds must contain at least one event id" },
        { status: 400 }
      );
    }

    const statuses = asStringArray(body.statuses).filter(
      (status): status is "PENDING" | "FAILED" =>
        status === "PENDING" || status === "FAILED"
    );

    const deadLettered = await deadLetterOutboxEvents(prisma, {
      eventIds,
      statuses,
      reason: body.reason,
    });

    return NextResponse.json({
      action: "dead-letter",
      deadLettered,
      eventIds,
      statuses: statuses.length ? statuses : ["PENDING", "FAILED"],
      deadLetteredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/events/dead-letter error:", error);
    return NextResponse.json(
      { error: "Failed to dead-letter outbox events" },
      { status: 500 }
    );
  }
}

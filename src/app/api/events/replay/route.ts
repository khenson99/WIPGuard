export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { replayEvents } from "@/lib/events/idempotency";

interface ReplayRequestBody {
  eventIds?: string[];
  statuses?: Array<"FAILED" | "DEAD_LETTER">;
  limit?: number;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/**
 * POST /api/events/replay
 *
 * Replay failed or dead-letter outbox events. Admin-only.
 * Resets selected events to PENDING so the worker re-processes them.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ReplayRequestBody;

    const eventIds = asStringArray(body.eventIds);
    const statuses = asStringArray(body.statuses).filter(
      (s): s is "FAILED" | "DEAD_LETTER" => s === "FAILED" || s === "DEAD_LETTER"
    );

    let limit: number | undefined;
    if (typeof body.limit !== "undefined") {
      if (!Number.isInteger(body.limit) || body.limit <= 0 || body.limit > 1000) {
        return NextResponse.json(
          { error: "limit must be an integer between 1 and 1000" },
          { status: 400 }
        );
      }
      limit = body.limit;
    }

    const result = await replayEvents(prisma, {
      eventIds,
      statuses,
      limit,
    });

    return NextResponse.json({
      replayed: result.replayed,
      eventIds: result.eventIds,
      statuses: statuses.length ? statuses : ["FAILED", "DEAD_LETTER"],
      limit: limit ?? 100,
      replayedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/events/replay error:", error);
    return NextResponse.json(
      { error: "Failed to replay outbox events" },
      { status: 500 }
    );
  }
}

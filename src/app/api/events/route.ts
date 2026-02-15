export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOutboxOperationalMetrics, replayOutboxEvents } from "@/lib/outbox-worker";

interface ReplayRequestBody {
  action?: string;
  eventIds?: string[];
  statuses?: Array<"FAILED" | "DEAD_LETTER">;
  limit?: number;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const metrics = await getOutboxOperationalMetrics(prisma);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      metrics,
    });
  } catch (error) {
    console.error("GET /api/events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch event bus metrics" },
      { status: 500 }
    );
  }
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

    const body = (await request.json().catch(() => ({}))) as ReplayRequestBody;
    if (body.action !== "replay") {
      return NextResponse.json(
        { error: "Unsupported action. Use action='replay'." },
        { status: 400 }
      );
    }

    const eventIds = asStringArray(body.eventIds);
    const statuses = asStringArray(body.statuses).filter(
      (status): status is "FAILED" | "DEAD_LETTER" =>
        status === "FAILED" || status === "DEAD_LETTER"
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

    const replayed = await replayOutboxEvents(prisma, {
      eventIds,
      statuses,
      limit,
    });

    return NextResponse.json({
      action: "replay",
      replayed,
      eventIds: eventIds.length ? eventIds : null,
      statuses: statuses.length ? statuses : ["FAILED", "DEAD_LETTER"],
      limit: limit ?? 100,
      replayedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/events error:", error);
    return NextResponse.json(
      { error: "Failed to replay outbox events" },
      { status: 500 }
    );
  }
}

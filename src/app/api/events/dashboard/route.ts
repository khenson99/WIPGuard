export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOutboxOperationalMetrics } from "@/lib/outbox-worker";

/**
 * GET /api/events/dashboard
 *
 * Returns operational metrics for the outbox event bus.
 * Shows counts by status, event lag, failure distribution,
 * and recent dead-letter events for investigation.
 */
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
    console.error("GET /api/events/dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch event bus metrics" },
      { status: 500 }
    );
  }
}

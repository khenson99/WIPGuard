export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCustomerSuccessActor } from "@/lib/customer-success/access";
import {
  buildRetentionDataset,
  materializeRetentionCurrent,
  syncRetentionSources,
} from "@/lib/retention/pipeline";

type RetentionSyncMode = "full" | "sync_sources" | "build_dataset" | "materialize";

const VALID_MODES = new Set<RetentionSyncMode>(["full", "sync_sources", "build_dataset", "materialize"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireCustomerSuccessActor(request, "analytics.write");
  if ("response" in authResult) {
    return authResult.response;
  }

  let mode: RetentionSyncMode = "full";
  try {
    const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
    if (typeof body.mode === "string" && VALID_MODES.has(body.mode as RetentionSyncMode)) {
      mode = body.mode as RetentionSyncMode;
    } else if (body.mode !== undefined) {
      return NextResponse.json({ error: "Invalid retention sync mode" }, { status: 400 });
    }

    const startedAt = Date.now();
    const completed: string[] = [];

    if (mode === "full" || mode === "sync_sources") {
      await syncRetentionSources(authResult.actor);
      completed.push("sync_sources");
    }

    if (mode === "full" || mode === "build_dataset") {
      await buildRetentionDataset(authResult.actor);
      completed.push("build_dataset");
    }

    if (mode === "full" || mode === "materialize") {
      await materializeRetentionCurrent(authResult.actor);
      completed.push("materialize");
    }

    return NextResponse.json({
      ok: true,
      mode,
      completed,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("POST /api/retention/sync error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Retention sync failed",
      },
      { status: 500 }
    );
  }
}

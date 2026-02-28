export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreatePylonIssueTaskSyncRule,
  patchPylonIssueTaskSyncRule,
  runPylonIssueTaskSync,
  serializePylonIssueTaskSyncRule,
  type PylonIssueTaskSyncConfig,
} from "@/lib/integrations/pylon-issue-task-sync";
import { withSyncObservability } from "@/lib/integrations/sync-observability";

interface PylonIssueTaskSyncRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<PylonIssueTaskSyncConfig>;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "profile.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.PYLON,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const rule = await getOrCreatePylonIssueTaskSyncRule(session.user.id);
    return NextResponse.json({
      rule: serializePylonIssueTaskSyncRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/pylon/issue-task-sync error:", error);
    return NextResponse.json(
      { error: "Failed to load Pylon issue task sync rule" },
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

    const body = (await request.json().catch(() => ({}))) as PylonIssueTaskSyncRequestBody;
    const action = body.action ?? "sync";

    const permission = await enforcePermission({
      userId: session.user.id,
      action: action === "configure" ? "profile.write" : "task.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.PYLON,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "configure") {
      const rule = await patchPylonIssueTaskSyncRule(session.user.id, {
        enabled: body.enabled,
        statusOverride: body.statusOverride,
        config: body.config,
      });

      return NextResponse.json({
        ok: true,
        action: "configure",
        rule,
      });
    }

    const result = await withSyncObservability(
      "pylon",
      "issue-task-sync",
      session.user.id,
      () => runPylonIssueTaskSync({ userId: session.user.id, dryRun: body.dryRun }),
      { dryRun: body.dryRun }
    );

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/pylon/issue-task-sync error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to run Pylon issue task sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


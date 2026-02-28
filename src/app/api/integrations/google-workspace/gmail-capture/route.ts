export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { IntegrationProvider } from "@/generated/prisma/client";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateGmailCaptureRule,
  patchGmailRule,
  runGmailCapture,
  serializeGmailRuleState,
  type GmailCaptureRuleConfig,
} from "@/lib/integrations/google-gmail-capture";
import { withSyncObservability } from "@/lib/integrations/sync-observability";

interface SyncRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<GmailCaptureRuleConfig>;
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
      targetId: IntegrationProvider.GOOGLE_WORKSPACE,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const rule = await getOrCreateGmailCaptureRule(session.user.id);
    return NextResponse.json({
      rule: serializeGmailRuleState(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/google-workspace/gmail-capture error:", error);
    return NextResponse.json(
      { error: "Failed to load Gmail capture rule" },
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

    const body = (await request.json().catch(() => ({}))) as SyncRequestBody;
    const action = body.action ?? "sync";

    const permission = await enforcePermission({
      userId: session.user.id,
      action: action === "configure" ? "profile.write" : "task.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.GOOGLE_WORKSPACE,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "configure") {
      const updatedRule = await patchGmailRule(session.user.id, {
        enabled: body.enabled,
        statusOverride: body.statusOverride,
        config: body.config,
      });

      return NextResponse.json({
        ok: true,
        action: "configure",
        rule: updatedRule,
      });
    }

    const result = await withSyncObservability(
      "google_gmail", "gmail-capture", session.user.id,
      () => runGmailCapture({ userId: session.user.id, dryRun: body.dryRun }),
      { dryRun: body.dryRun },
    );

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/google-workspace/gmail-capture error:", error);
    const message = error instanceof Error ? error.message : "Failed to run Gmail capture";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

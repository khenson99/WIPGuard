export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateGoogleDriveRule,
  patchGoogleDriveRule,
  runGoogleDriveCommentEscalation,
  serializeGoogleDriveRule,
  type GoogleDriveEscalationConfig,
} from "@/lib/integrations/google-drive-comment-escalation";
import { withSyncObservability } from "@/lib/integrations/sync-observability";

interface GoogleDriveRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<GoogleDriveEscalationConfig>;
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

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const rule = await getOrCreateGoogleDriveRule(ownerUserId);
    return NextResponse.json({
      rule: serializeGoogleDriveRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/google-workspace/drive-comment-escalation error:", error);
    return NextResponse.json(
      { error: "Failed to load Google Drive escalation rule" },
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

    const body = (await request.json().catch(() => ({}))) as GoogleDriveRequestBody;
    const action = body.action ?? "sync";
    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);

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
      const rule = await patchGoogleDriveRule(ownerUserId, {
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
      "google_drive", "drive-comment-escalation", ownerUserId,
      () => runGoogleDriveCommentEscalation({ userId: ownerUserId, dryRun: body.dryRun }),
      { dryRun: body.dryRun },
    );

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/google-workspace/drive-comment-escalation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to run Google Drive comment escalation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { enforcePermission } from "@/lib/permissions";
import {
  getOrCreateSlackUnansweredRule,
  patchSlackUnansweredRule,
  runSlackUnansweredDetector,
  serializeSlackUnansweredRule,
  type SlackUnansweredConfig,
} from "@/lib/integrations/slack-unanswered-requests";
import { withSyncObservability } from "@/lib/integrations/sync-observability";

interface SlackUnansweredRequestBody {
  action?: "sync" | "configure";
  dryRun?: boolean;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<SlackUnansweredConfig>;
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
      targetId: IntegrationProvider.SLACK,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const rule = await getOrCreateSlackUnansweredRule(ownerUserId);
    return NextResponse.json({
      rule: serializeSlackUnansweredRule(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/slack/unanswered-requests error:", error);
    return NextResponse.json(
      { error: "Failed to load Slack unanswered-request rule" },
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

    const body = (await request.json().catch(() => ({}))) as SlackUnansweredRequestBody;
    const action = body.action ?? "sync";
    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);

    const permission = await enforcePermission({
      userId: session.user.id,
      action: action === "configure" ? "profile.write" : "task.write",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.SLACK,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "configure") {
      const rule = await patchSlackUnansweredRule(ownerUserId, {
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
      "slack", "unanswered-requests", ownerUserId,
      () => runSlackUnansweredDetector({ userId: ownerUserId, dryRun: body.dryRun }),
      { dryRun: body.dryRun },
    );

    return NextResponse.json({
      ok: true,
      action: "sync",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/slack/unanswered-requests error:", error);
    const message = error instanceof Error ? error.message : "Failed to run Slack unanswered detector";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

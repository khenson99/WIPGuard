export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { enforcePermission } from "@/lib/permissions";
import {
  captureSlackThreadToTask,
  getOrCreateSlackThreadCaptureRule,
  patchSlackRule,
  serializeSlackRuleState,
  type SlackCaptureInput,
  type SlackThreadCaptureConfig,
} from "@/lib/integrations/slack-thread-capture";

interface SlackCaptureRequestBody {
  action?: "capture" | "configure";
  payload?: SlackCaptureInput;
  enabled?: boolean;
  statusOverride?: "QUEUED" | "ACTIVE" | "NOT_DONE" | null;
  config?: Partial<SlackThreadCaptureConfig>;
}

function isCapturePayload(value: unknown): value is SlackCaptureInput {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    (payload.triggerType === "reaction" || payload.triggerType === "shortcut") &&
    typeof payload.channelId === "string" &&
    payload.channelId.length > 0 &&
    typeof payload.threadTs === "string" &&
    payload.threadTs.length > 0
  );
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

    const rule = await getOrCreateSlackThreadCaptureRule(session.user.id);
    return NextResponse.json({
      rule: serializeSlackRuleState(rule),
    });
  } catch (error) {
    console.error("GET /api/integrations/slack/thread-capture error:", error);
    return NextResponse.json(
      { error: "Failed to load Slack thread capture rule" },
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

    const body = (await request.json().catch(() => ({}))) as SlackCaptureRequestBody;
    const action = body.action ?? "capture";

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
      const rule = await patchSlackRule(session.user.id, {
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

    if (!isCapturePayload(body.payload)) {
      return NextResponse.json(
        { error: "payload with triggerType/channelId/threadTs is required" },
        { status: 400 }
      );
    }

    const result = await captureSlackThreadToTask({
      userId: session.user.id,
      payload: body.payload,
    });

    return NextResponse.json({
      ok: true,
      action: "capture",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/slack/thread-capture error:", error);
    const message = error instanceof Error ? error.message : "Failed to capture Slack thread";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IntegrationProvider } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { resolveIntegrationOwnerUserId } from "@/lib/integrations/ownership";
import { enforcePermission } from "@/lib/permissions";
import {
  sendSlackNotification,
  sendBatchSlackNotifications,
  type SlackNotificationPayload,
  type ThrottleConfig,
} from "@/lib/integrations/slack-notifications";

interface NotificationRequestBody {
  action?: "send" | "batch";
  payload?: SlackNotificationPayload;
  payloads?: SlackNotificationPayload[];
  throttleConfig?: Partial<ThrottleConfig>;
  dryRun?: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as NotificationRequestBody;
    const action = body.action ?? "send";
    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "integration.manage",
      request,
      targetType: "integration",
      targetId: IntegrationProvider.SLACK,
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    if (action === "batch") {
      if (!body.payloads || body.payloads.length === 0) {
        return NextResponse.json(
          { error: "payloads array is required for batch action" },
          { status: 400 }
        );
      }

      if (body.payloads.length > 20) {
        return NextResponse.json(
          { error: "Maximum 20 notifications per batch" },
          { status: 400 }
        );
      }

      const results = await sendBatchSlackNotifications({
        userId: ownerUserId,
        payloads: body.payloads,
        dryRun: body.dryRun,
      });

      return NextResponse.json({
        ok: true,
        action: "batch",
        results,
        summary: {
          total: results.length,
          sent: results.filter((r) => r.sent).length,
          throttled: results.filter((r) => r.throttled).length,
          failed: results.filter((r) => !r.sent && !r.throttled).length,
        },
      });
    }

    // Single notification
    if (!body.payload) {
      return NextResponse.json(
        { error: "payload is required" },
        { status: 400 }
      );
    }

    if (!body.payload.channelId || !body.payload.alertId || !body.payload.title || !body.payload.type) {
      return NextResponse.json(
        { error: "payload must include channelId, alertId, title, and type" },
        { status: 400 }
      );
    }

    const result = await sendSlackNotification({
      userId: ownerUserId,
      payload: body.payload,
      dryRun: body.dryRun,
    });

    return NextResponse.json({
      ok: true,
      action: "send",
      result,
    });
  } catch (error) {
    console.error("POST /api/integrations/slack/notifications error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send Slack notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import {
  createTaskFromSlack,
  type SlackTaskTrigger,
} from "@/lib/integrations/slack-task-creation";
import { prisma } from "@/lib/prisma";
import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Slack Event API verification
// ---------------------------------------------------------------------------

function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.warn("SLACK_SIGNING_SECRET not configured; skipping signature verification");
    return true;
  }

  // Prevent replay attacks (5 min window)
  const requestTimestamp = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTimestamp) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const computedSignature = `v0=${createHmac("sha256", signingSecret)
    .update(sigBasestring, "utf8")
    .digest("hex")}`;

  return computedSignature === signature;
}

// ---------------------------------------------------------------------------
// Event type parsing
// ---------------------------------------------------------------------------

interface SlackEventPayload {
  type: string;
  token?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type: string;
    user?: string;
    reaction?: string;
    item?: {
      type: string;
      channel: string;
      ts: string;
    };
    channel?: string;
    ts?: string;
    thread_ts?: string;
    text?: string;
    trigger_id?: string;
  };
}

// ---------------------------------------------------------------------------
// Resolve WIPGuard user from Slack team + user ID
// ---------------------------------------------------------------------------

async function resolveWipguardUser(
  slackTeamId: string | undefined,
  slackUserId: string | undefined
): Promise<string | null> {
  if (!slackUserId) return null;

  // Find the IntegrationConnection that matches this Slack user
  const connection = await prisma.integrationConnection.findFirst({
    where: {
      provider: IntegrationProvider.SLACK,
      status: IntegrationConnectionStatus.CONNECTED,
      providerAccountId: slackUserId,
    },
    select: { userId: true },
  });

  return connection?.userId ?? null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await request.text();
    const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
    const signature = request.headers.get("x-slack-signature") ?? "";

    // Verify Slack signature
    if (!verifySlackSignature(rawBody, timestamp, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const payload = JSON.parse(rawBody) as SlackEventPayload;

    // Handle Slack URL verification challenge
    if (payload.type === "url_verification" && payload.challenge) {
      return NextResponse.json({ challenge: payload.challenge });
    }

    if (payload.type !== "event_callback" || !payload.event) {
      return NextResponse.json({ ok: true });
    }

    const event = payload.event;

    // Handle reaction_added events -> task creation
    if (event.type === "reaction_added" && event.item?.type === "message") {
      const userId = await resolveWipguardUser(payload.team_id, event.user);
      if (!userId) {
        console.info("integration.slack.events.no_user_match", {
          slackUserId: event.user,
          teamId: payload.team_id,
        });
        return NextResponse.json({ ok: true });
      }

      try {
        const result = await createTaskFromSlack({
          userId,
          payload: {
            triggerType: "reaction" as SlackTaskTrigger,
            channelId: event.item.channel,
            threadTs: event.item.ts,
            reaction: event.reaction,
            slackUserId: event.user,
          },
        });

        console.info("integration.slack.events.reaction_task_created", {
          taskId: result.taskId,
          deduped: result.deduped,
          reaction: event.reaction,
        });
      } catch (error) {
        console.error("integration.slack.events.reaction_task_failed", {
          error: error instanceof Error ? error.message : String(error),
          reaction: event.reaction,
          channel: event.item.channel,
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Handle message shortcut events -> task creation
    if (event.type === "message" && event.text?.startsWith("/wipguard")) {
      const userId = await resolveWipguardUser(payload.team_id, event.user);
      if (!userId) {
        return NextResponse.json({ ok: true });
      }

      try {
        const result = await createTaskFromSlack({
          userId,
          payload: {
            triggerType: "slash_command" as SlackTaskTrigger,
            channelId: event.channel ?? "",
            threadTs: event.thread_ts ?? event.ts ?? "",
            text: event.text,
            slackUserId: event.user,
          },
        });

        console.info("integration.slack.events.command_task_created", {
          taskId: result.taskId,
          deduped: result.deduped,
        });
      } catch (error) {
        console.error("integration.slack.events.command_task_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Acknowledge other events without action
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/integrations/slack/events error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

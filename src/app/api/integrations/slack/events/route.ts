export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

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
    console.error("SLACK_SIGNING_SECRET not configured; rejecting Slack event");
    return false;
  }

  // Prevent replay attacks (5 min window)
  const requestTimestamp = Number(timestamp);
  if (!Number.isFinite(requestTimestamp)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTimestamp) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const computedSignature = `v0=${createHmac("sha256", signingSecret)
    .update(sigBasestring, "utf8")
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(computedSignature);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
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

    // Task creation from Slack has been removed. Acknowledge legacy task-like events.
    if (event.type === "reaction_added" && event.item?.type === "message") {
      return NextResponse.json({ ok: true });
    }

    // Legacy slash-command task creation is also retired.
    if (event.type === "message" && event.text?.startsWith("/the-mother-node")) {
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

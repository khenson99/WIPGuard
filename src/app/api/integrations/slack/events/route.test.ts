import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTaskFromSlack = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findFirst: vi.fn(async () => ({ userId: "user_1" })),
    },
  },
}));

function signedSlackRequest(input: {
  url?: string;
  body: string;
  timestamp?: string;
  secret?: string;
}): NextRequest {
  const timestamp = input.timestamp ?? String(Math.floor(Date.now() / 1000));
  const secret = input.secret ?? "slack-signing-secret";
  const signature = `v0=${createHmac("sha256", secret)
    .update(`v0:${timestamp}:${input.body}`, "utf8")
    .digest("hex")}`;

  return new NextRequest(input.url ?? "http://localhost/api/integrations/slack/events", {
    method: "POST",
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body: input.body,
  });
}

describe("POST /api/integrations/slack/events", () => {
  const originalSecret = process.env.SLACK_SIGNING_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    process.env.SLACK_SIGNING_SECRET = "slack-signing-secret";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSecret == null) {
      delete process.env.SLACK_SIGNING_SECRET;
    } else {
      process.env.SLACK_SIGNING_SECRET = originalSecret;
    }
  });

  it("acknowledges signed task-like Slack reactions without creating local tasks", async () => {
    const { POST } = await import("@/app/api/integrations/slack/events/route");
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T1",
      event: {
        type: "reaction_added",
        user: "U1",
        reaction: "pushpin",
        item: {
          type: "message",
          channel: "C1",
          ts: "1770000000.000100",
        },
      },
    });
    const response = await POST(
      signedSlackRequest({ body }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(createTaskFromSlack).not.toHaveBeenCalled();
  });

  it("rejects Slack events when the signing secret is not configured", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const { POST } = await import("@/app/api/integrations/slack/events/route");
    const body = JSON.stringify({ type: "event_callback", event: { type: "message" } });

    const response = await POST(signedSlackRequest({ body }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
  });

  it("rejects Slack events with stale signed timestamps", async () => {
    const { POST } = await import("@/app/api/integrations/slack/events/route");
    const body = JSON.stringify({ type: "event_callback", event: { type: "message" } });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);

    const response = await POST(signedSlackRequest({ body, timestamp: staleTimestamp }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
  });
});

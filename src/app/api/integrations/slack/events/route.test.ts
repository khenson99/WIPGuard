import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("POST /api/integrations/slack/events", () => {
  it("acknowledges retired event callbacks without failing the external webhook", async () => {
    const { POST } = await import("@/app/api/integrations/slack/events/route");
    const response = await POST(
      new NextRequest("http://localhost/api/integrations/slack/events", {
        method: "POST",
        body: JSON.stringify({ type: "event_callback", event: { type: "message" } }),
        headers: { "content-type": "application/json" },
      })
    );
    const payload = (await response.json()) as { ok: boolean; retired: boolean };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, retired: true });
  });

  it("responds to Slack URL verification challenges", async () => {
    const { POST } = await import("@/app/api/integrations/slack/events/route");
    const response = await POST(
      new NextRequest("http://localhost/api/integrations/slack/events", {
        method: "POST",
        body: JSON.stringify({ type: "url_verification", challenge: "abc123" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ challenge: "abc123" });
  });
});

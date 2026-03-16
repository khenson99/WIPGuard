import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("POST /api/integrations/hubspot/webhook", () => {
  it("acknowledges retired webhook deliveries without failing HubSpot retries", async () => {
    const { POST } = await import("@/app/api/integrations/hubspot/webhook/route");
    const response = await POST(
      new NextRequest("http://localhost/api/integrations/hubspot/webhook", {
        method: "POST",
      })
    );
    const payload = (await response.json()) as {
      ok: boolean;
      processed: number;
      retired: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, processed: 0, retired: true });
  });
});

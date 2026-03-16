import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("POST /api/integrations/hubspot/webhook", () => {
  it("returns 410 because task-oriented HubSpot workflows are retired", async () => {
    const { POST } = await import("@/app/api/integrations/hubspot/webhook/route");
    const response = await POST(
      new NextRequest("http://localhost/api/integrations/hubspot/webhook", {
        method: "POST",
      })
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(410);
    expect(payload.error).toBe(
      "Task-oriented integration workflows have been retired with the Work section."
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/automations/runtime", () => ({
  processAutomationAiWebhook: vi.fn(),
}));

describe("POST /api/automations/openai/webhook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("returns handled webhook payloads", async () => {
    const { processAutomationAiWebhook } = await import("@/lib/automations/runtime");
    vi.mocked(processAutomationAiWebhook).mockResolvedValue({
      handled: true,
      responseId: "resp_123",
      eventType: "response.completed",
    });

    const { POST } = await import("@/app/api/automations/openai/webhook/route");
    const response = await POST(
      new NextRequest("http://localhost/api/automations/openai/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "response.completed" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      handled: true,
      responseId: "resp_123",
      eventType: "response.completed",
    });
  });

  it("maps invalid signature failures to 400", async () => {
    const { processAutomationAiWebhook } = await import("@/lib/automations/runtime");
    vi.mocked(processAutomationAiWebhook).mockRejectedValue(
      new Error("Invalid signature")
    );

    const { POST } = await import("@/app/api/automations/openai/webhook/route");
    const response = await POST(
      new NextRequest("http://localhost/api/automations/openai/webhook", {
        method: "POST",
        body: "{}",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid signature",
    });
  });
});

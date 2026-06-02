import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deal: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

function signHubSpotV3(input: {
  secret: string;
  method?: string;
  url: string;
  body: string;
  timestamp: string;
}): string {
  const source = `${input.method ?? "POST"}${input.url}${input.body}${input.timestamp}`;
  return createHmac("sha256", input.secret).update(source, "utf8").digest("base64");
}

describe("POST /api/webhooks/hubspot", () => {
  const originalSecret = process.env.HUBSPOT_CLIENT_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    process.env.HUBSPOT_CLIENT_SECRET = "hubspot-client-secret";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSecret == null) {
      delete process.env.HUBSPOT_CLIENT_SECRET;
    } else {
      process.env.HUBSPOT_CLIENT_SECRET = originalSecret;
    }
  });

  it("rejects HubSpot webhooks with an invalid v3 signature", async () => {
    const { POST } = await import("@/app/api/webhooks/hubspot/route");
    const body = JSON.stringify([
      {
        subscriptionType: "deal.creation",
        objectId: 123,
        eventId: 456,
        occurredAt: Date.now(),
        portalId: 789,
      },
    ]);

    const response = await POST(
      new NextRequest("https://app.example.com/api/webhooks/hubspot", {
        method: "POST",
        headers: {
          "x-hubspot-signature-v3": "invalid-signature",
          "x-hubspot-request-timestamp": String(Date.now()),
        },
        body,
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
  });

  it("processes HubSpot webhooks with a valid v3 signature", async () => {
    const { POST } = await import("@/app/api/webhooks/hubspot/route");
    const url = "https://app.example.com/api/webhooks/hubspot";
    const timestamp = String(Date.now());
    const body = JSON.stringify([
      {
        subscriptionType: "deal.creation",
        objectId: 123,
        eventId: 456,
        occurredAt: Date.now(),
        portalId: 789,
      },
    ]);

    const response = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: {
          "x-hubspot-signature-v3": signHubSpotV3({
            secret: "hubspot-client-secret",
            url,
            body,
            timestamp,
          }),
          "x-hubspot-request-timestamp": timestamp,
        },
        body,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      processed: 1,
      results: [
        {
          eventId: 456,
          status: "acknowledged",
        },
      ],
    });
  });

  it("rejects otherwise valid HubSpot signatures outside the replay window", async () => {
    const { POST } = await import("@/app/api/webhooks/hubspot/route");
    const url = "https://app.example.com/api/webhooks/hubspot";
    const timestamp = String(Date.now() - 6 * 60 * 1000);
    const body = JSON.stringify([
      {
        subscriptionType: "deal.creation",
        objectId: 123,
        eventId: 456,
        occurredAt: Date.now(),
        portalId: 789,
      },
    ]);

    const response = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: {
          "x-hubspot-signature-v3": signHubSpotV3({
            secret: "hubspot-client-secret",
            url,
            body,
            timestamp,
          }),
          "x-hubspot-request-timestamp": timestamp,
        },
        body,
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
  });
});

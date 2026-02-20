import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHubspotSearchUrl,
  enrichCodaLeadFunnelStatus,
  scoreCodaEngagedLeads,
} from "@/lib/analytics/coda-lead-intelligence";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("coda lead intelligence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("scores creators deterministically and sorts by engagement", () => {
    const scored = scoreCodaEngagedLeads({
      now: new Date("2026-02-18T00:00:00.000Z"),
      creators: [
        {
          creator: "Alice",
          email: "alice@example.com",
          cards30d: 18,
          cardsPrevious30d: 8,
          activeDays30d: 14,
          lastActivityAt: "2026-02-17T12:00:00.000Z",
        },
        {
          creator: "Bob",
          email: "bob@example.com",
          cards30d: 7,
          cardsPrevious30d: 8,
          activeDays30d: 6,
          lastActivityAt: "2026-02-05T08:00:00.000Z",
        },
      ],
    });

    expect(scored).toHaveLength(2);
    expect(scored[0]?.email).toBe("alice@example.com");
    expect(scored[0]?.engagementScore).toBeGreaterThan(scored[1]?.engagementScore ?? 0);
    expect(scored[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("matches candidates against HubSpot contacts", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ total: 1 }))
      .mockResolvedValueOnce(jsonResponse({ total: 0 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await enrichCodaLeadFunnelStatus({
      hubspotAccessToken: "token",
      candidates: [
        {
          creator: "Alice",
          email: "alice@example.com",
          cards30d: 10,
          activeDays30d: 5,
          lastActivityAt: "2026-02-18T00:00:00.000Z",
          trend30dVsPrevious30d: 12,
          engagementScore: 82.4,
          reasons: ["high 30d volume"],
          funnelStatus: "unknown",
          hubspotSearchUrl: buildHubspotSearchUrl("alice@example.com"),
        },
        {
          creator: "Bob",
          email: "bob@example.com",
          cards30d: 9,
          activeDays30d: 4,
          lastActivityAt: "2026-02-17T00:00:00.000Z",
          trend30dVsPrevious30d: -4,
          engagementScore: 60.1,
          reasons: ["solid baseline engagement"],
          funnelStatus: "unknown",
          hubspotSearchUrl: buildHubspotSearchUrl("bob@example.com"),
        },
      ],
    });

    expect(result.hubspotMatchingErrors).toBe(0);
    expect(result.candidates[0]?.funnelStatus).toBe("inFunnel");
    expect(result.candidates[1]?.funnelStatus).toBe("notInFunnel");
  });

  it("falls back to unknown funnel status when HubSpot lookup fails", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response("upstream unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await enrichCodaLeadFunnelStatus({
      hubspotAccessToken: "token",
      candidates: [
        {
          creator: "Alice",
          email: "alice@example.com",
          cards30d: 10,
          activeDays30d: 5,
          lastActivityAt: "2026-02-18T00:00:00.000Z",
          trend30dVsPrevious30d: 12,
          engagementScore: 82.4,
          reasons: ["high 30d volume"],
          funnelStatus: "unknown",
          hubspotSearchUrl: buildHubspotSearchUrl("alice@example.com"),
        },
      ],
    });

    expect(result.hubspotMatchingErrors).toBe(1);
    expect(result.candidates[0]?.funnelStatus).toBe("unknown");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { FunnelEventType } from "@/lib/analytics/prisma-funnel-enums";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/analytics/visitor-funnel", () => ({
  collectVisitorEvent: vi.fn(),
}));

vi.mock("@/lib/analytics/visitor-funnel-availability", () => ({
  hasVisitorFunnelPrismaModels: vi.fn(),
  VISITOR_FUNNEL_PRISMA_UNAVAILABLE_REASON:
    "Visitor funnel Prisma models are unavailable in this deployment.",
}));

describe("POST /api/analytics/funnel/collect", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("returns a disabled response when funnel Prisma models are unavailable", async () => {
    const { auth } = await import("@/lib/auth");
    const { collectVisitorEvent } = await import("@/lib/analytics/visitor-funnel");
    const { hasVisitorFunnelPrismaModels } = await import(
      "@/lib/analytics/visitor-funnel-availability"
    );

    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(hasVisitorFunnelPrismaModels).mockReturnValue(false);

    const { POST } = await import("@/app/api/analytics/funnel/collect/route");
    const request = new Request("http://localhost/api/analytics/funnel/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        anonymousId: "anon_1",
        eventType: FunnelEventType.PAGE_VIEW,
      }),
    }) as unknown as NextRequest;

    const response = await POST(request);
    const body = (await response.json()) as {
      accepted: number;
      disabled: boolean;
      reason: string;
    };

    expect(response.status).toBe(202);
    expect(body).toEqual({
      accepted: 0,
      disabled: true,
      reason: "Visitor funnel Prisma models are unavailable in this deployment.",
    });
    expect(collectVisitorEvent).not.toHaveBeenCalled();
  });
});

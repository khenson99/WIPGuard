import { describe, expect, it, vi } from "vitest";
import { FunnelEventType } from "@/generated/prisma/client";
import { collectVisitorEvent } from "@/lib/analytics/visitor-funnel";

describe("collectVisitorEvent", () => {
  it("upserts the visitor instead of racing through a create path", async () => {
    const visitorRecord = {
      id: "visitor-1",
      anonymousId: "anon-1",
      siteHost: "localhost",
      firstTouchSource: null,
      firstTouchChannel: "direct",
      firstTouchCampaign: null,
      firstTouchReferrer: null,
      firstTouchLandingPath: "/tasks",
      firstTouchLandingUrl: "http://localhost:3000/tasks",
      lastTouchSource: null,
      lastTouchChannel: "direct",
      lastTouchCampaign: null,
      lastTouchReferrer: null,
      lastTouchPath: "/tasks",
      lastTouchUrl: "http://localhost:3000/tasks",
      firstSeenAt: new Date("2026-03-08T00:00:00.000Z"),
      lastSeenAt: new Date("2026-03-08T00:00:00.000Z"),
      createdAt: new Date("2026-03-08T00:00:00.000Z"),
      updatedAt: new Date("2026-03-08T00:00:00.000Z"),
    };

    const prisma = {
      funnelVisitor: {
        upsert: vi.fn(async () => visitorRecord),
        create: vi.fn(() => {
          throw new Error("create should not be used for visitor writes");
        }),
        update: vi.fn(async ({ data }: { data: Partial<typeof visitorRecord> }) => ({
          ...visitorRecord,
          ...data,
        })),
      },
      funnelIdentityLink: {
        upsert: vi.fn(),
      },
      funnelEvent: {
        upsert: vi.fn(async () => ({})),
        create: vi.fn(async () => ({})),
      },
    } as const;

    const [first, second] = await Promise.all([
      collectVisitorEvent(
        prisma as never,
        {
          anonymousId: "anon-1",
          eventType: FunnelEventType.PAGE_VIEW,
          path: "/tasks",
          url: "http://localhost:3000/tasks",
          dedupeKey: "page_view:anon-1:/tasks",
        },
        { siteHost: "localhost" },
      ),
      collectVisitorEvent(
        prisma as never,
        {
          anonymousId: "anon-1",
          eventType: FunnelEventType.AUTH_COMPLETED,
          path: "/tasks",
          url: "http://localhost:3000/tasks",
          dedupeKey: "auth_completed:anon-1",
        },
        { siteHost: "localhost" },
      ),
    ]);

    expect(prisma.funnelVisitor.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.funnelVisitor.create).not.toHaveBeenCalled();
    expect(first).toEqual({ visitorId: "visitor-1", anonymousId: "anon-1" });
    expect(second).toEqual({ visitorId: "visitor-1", anonymousId: "anon-1" });
  });
});

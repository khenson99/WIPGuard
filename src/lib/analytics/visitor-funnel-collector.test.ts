import { describe, expect, it, vi } from "vitest";
import { FunnelEventType } from "@/lib/analytics/prisma-funnel-enums";
import { collectVisitorEvent, syncVisitorFunnelArtifacts } from "@/lib/analytics/visitor-funnel";

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

  it("syncs HubSpot collected forms into visitor funnel milestones", async () => {
    const visitorRecord = {
      id: "visitor-1",
      anonymousId: "anon-1",
      siteHost: null,
      firstTouchSource: "hubspot",
      firstTouchChannel: "lead-magnet",
      firstTouchCampaign: null,
      firstTouchReferrer: null,
      firstTouchLandingPath: "https://wipguard.example/kanban-generator",
      firstTouchLandingUrl: "https://wipguard.example/kanban-generator",
      lastTouchSource: "hubspot",
      lastTouchChannel: "lead-magnet",
      lastTouchCampaign: null,
      lastTouchReferrer: null,
      lastTouchPath: "https://wipguard.example/kanban-generator",
      lastTouchUrl: "https://wipguard.example/kanban-generator",
      firstSeenAt: new Date("2026-05-20T10:00:00.000Z"),
      lastSeenAt: new Date("2026-05-20T10:00:00.000Z"),
      createdAt: new Date("2026-05-20T10:00:00.000Z"),
      updatedAt: new Date("2026-05-20T10:00:00.000Z"),
    };
    const visitorById = new Map<string, typeof visitorRecord>();

    const prisma = {
      funnelVisitor: {
        upsert: vi.fn(async ({ create }: { create: typeof visitorRecord }) => {
          const created = { ...visitorRecord, ...create, id: `visitor-${visitorById.size + 1}` };
          visitorById.set(created.id, created);
          return created;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<typeof visitorRecord> }) => {
          const existing = visitorById.get(where.id) ?? visitorRecord;
          const updated = { ...existing, ...data };
          visitorById.set(where.id, updated);
          return updated;
        }),
        findMany: vi.fn(async () => []),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
      },
      funnelEvent: {
        upsert: vi.fn(async () => ({})),
        create: vi.fn(async () => ({})),
      },
    } as const;

    await syncVisitorFunnelArtifacts({
      prisma: prisma as never,
      stripeKey: null,
      from: new Date("2026-05-20T00:00:00.000Z"),
      to: new Date("2026-05-20T23:59:59.999Z"),
      analyticsData: {
        hubspot: {
          funnel: {
            totalDeals: 0,
            closedWon: 0,
            closedLost: 0,
            unlikely: 0,
            churn: 0,
            activeSubscriptions: 0,
            noShows: 0,
            demoScheduled: 0,
            demoFollowUp: 0,
            avgDealSize: 0,
            winRate: 0,
            effectiveWinRate: 0,
            noShowRate: 0,
            stages: [],
            dealsBySource: [],
          },
          contacts: {
            totalContacts: 0,
            recentContacts: 0,
            bySource: [],
          },
          collectedForms: {
            totalFormSubmissions: 2,
            leadMagnetSubmissions: 1,
            contactRequestSubmissions: 1,
            formSubmissions: [
              { formName: "Kanban Generator", count: 1, funnelCategory: "lead_magnet" },
              { formName: "Get in Touch", count: 1, funnelCategory: "contact_request" },
            ],
            submissions: [
              {
                id: "kanban-form:1779296400000:ops@example.com",
                formGuid: "kanban-form",
                formName: "Kanban Generator",
                funnelCategory: "lead_magnet",
                email: "ops@example.com",
                submittedAt: "2026-05-20T10:00:00.000Z",
                pageUrl: "https://wipguard.example/kanban-generator",
              },
              {
                id: "contact-form:1779300000000:buyer@example.com",
                formGuid: "contact-form",
                formName: "Get in Touch",
                funnelCategory: "contact_request",
                email: "buyer@example.com",
                submittedAt: "2026-05-20T11:00:00.000Z",
                pageUrl: "https://wipguard.example/contact",
              },
            ],
          },
          _meta: { fetchedAt: "2026-05-20", nextRefresh: "2026-05-20", source: "live" },
        },
      } as never,
    });

    expect(prisma.funnelEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: FunnelEventType.KANBAN_CARD_CREATED,
          dedupeKey: "hubspot_form:lead_magnet:kanban-form:1779271200000:ops@example.com",
        }),
      }),
    );
    expect(prisma.funnelEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: FunnelEventType.DEMO_BOOKED,
          dedupeKey: "hubspot_form:contact_request:contact-form:1779274800000:buyer@example.com",
        }),
      }),
    );
  });

  it("normalizes HubSpot deal stages before syncing demo milestones", async () => {
    const visitorRecord = {
      id: "visitor-1",
      anonymousId: "anon-1",
      siteHost: null,
      firstTouchSource: "hubspot",
      firstTouchChannel: "direct",
      firstTouchCampaign: null,
      firstTouchReferrer: null,
      firstTouchLandingPath: null,
      firstTouchLandingUrl: null,
      lastTouchSource: "hubspot",
      lastTouchChannel: "direct",
      lastTouchCampaign: null,
      lastTouchReferrer: null,
      lastTouchPath: null,
      lastTouchUrl: null,
      firstSeenAt: new Date("2026-05-21T10:00:00.000Z"),
      lastSeenAt: new Date("2026-05-21T10:00:00.000Z"),
      createdAt: new Date("2026-05-21T10:00:00.000Z"),
      updatedAt: new Date("2026-05-21T10:00:00.000Z"),
    };

    const prisma = {
      funnelVisitor: {
        upsert: vi.fn(async ({ create }: { create: typeof visitorRecord }) => ({
          ...visitorRecord,
          ...create,
        })),
        update: vi.fn(async ({ data }: { data: Partial<typeof visitorRecord> }) => ({
          ...visitorRecord,
          ...data,
        })),
        findMany: vi.fn(async () => []),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async () => ({})),
      },
      funnelEvent: {
        upsert: vi.fn(async () => ({})),
        create: vi.fn(async () => ({})),
      },
    } as const;

    await syncVisitorFunnelArtifacts({
      prisma: prisma as never,
      stripeKey: null,
      from: new Date("2026-05-21T00:00:00.000Z"),
      to: new Date("2026-05-21T23:59:59.999Z"),
      analyticsData: {
        hubspot: {
          funnel: {
            totalDeals: 1,
            closedWon: 1,
            closedLost: 0,
            unlikely: 0,
            churn: 0,
            activeSubscriptions: 0,
            noShows: 0,
            demoScheduled: 0,
            demoFollowUp: 0,
            avgDealSize: 5000,
            winRate: 100,
            effectiveWinRate: 100,
            noShowRate: 0,
            stages: [],
            dealsBySource: [],
          },
          contacts: {
            totalContacts: 1,
            recentContacts: 1,
            bySource: [],
          },
          deals: [
            {
              dealId: "deal-formatted-won",
              dealName: "Formatted Won",
              stageId: "closedwon",
              stageLabel: " closed won ",
              amount: 5000,
              source: "HubSpot",
              ownerId: null,
              updatedAt: "2026-05-21T12:00:00.000Z",
              createdAt: "2026-05-21T10:00:00.000Z",
              closedAt: "2026-05-21T12:00:00.000Z",
              stripeCustomerId: null,
              pipelineId: "default",
              contactIds: ["contact-1"],
              primaryContactId: "contact-1",
              primaryContactEmail: "buyer@example.com",
            },
            {
              dealId: "deal-demo-scheduled",
              dealName: "Demo Scheduled",
              stageId: "demo-scheduled",
              stageLabel: "demo-scheduled",
              amount: 3000,
              source: "HubSpot",
              ownerId: null,
              updatedAt: "2026-05-21T13:00:00.000Z",
              createdAt: "2026-05-21T11:00:00.000Z",
              closedAt: null,
              stripeCustomerId: null,
              pipelineId: "default",
              contactIds: ["contact-2"],
              primaryContactId: "contact-2",
              primaryContactEmail: "scheduled@example.com",
            },
          ],
          _meta: { fetchedAt: "2026-05-21", nextRefresh: "2026-05-21", source: "live" },
        },
      } as never,
    });

    expect(prisma.funnelEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: FunnelEventType.DEMO_BOOKED,
          dedupeKey: "demo_booked:deal-formatted-won",
          metadata: expect.objectContaining({
            stageLabel: "Closed Won",
          }),
        }),
      }),
    );
    expect(prisma.funnelEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: FunnelEventType.DEMO_BOOKED,
          dedupeKey: "demo_booked:deal-demo-scheduled",
          metadata: expect.objectContaining({
            stageLabel: "Demo Scheduled",
          }),
        }),
      }),
    );
  });
});

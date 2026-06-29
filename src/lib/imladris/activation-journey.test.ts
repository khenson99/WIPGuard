import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationProvider } from "@/generated/prisma/client";
import { buildActivationJourneyDashboard } from "@/lib/imladris/activation-journey";
import type { PrismaClientType } from "@/lib/prisma";

function posthogEvent(input: {
  id: string;
  event: string;
  distinctId?: string | null;
  properties?: Record<string, unknown>;
  occurredAt: string;
  provider?: string;
  objectType?: string;
}) {
  return {
    id: input.id,
    provider: input.provider ?? IntegrationProvider.POSTHOG,
    objectType: input.objectType ?? "event",
    externalId: input.id,
    scopeKey: "global",
    payload: {
      uuid: input.id,
      event: input.event,
      distinct_id: input.distinctId,
      timestamp: input.occurredAt,
      properties: input.properties ?? {},
    },
    occurredAt: new Date(input.occurredAt),
    sourceCreatedAt: new Date(input.occurredAt),
    sourceUpdatedAt: new Date(input.occurredAt),
    userId: null,
    organizationId: "org_1",
  };
}

function prismaWithPostHogRows(rows: unknown[]): PrismaClientType {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  } as unknown as PrismaClientType;
}

describe("buildActivationJourneyDashboard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("summarizes PostHog events into activation milestones and cohorts", async () => {
    vi.stubEnv("POSTHOG_PROJECT_ID", "12345");
    vi.stubEnv("POSTHOG_HOST", "https://us.i.posthog.com");

    const prisma = prismaWithPostHogRows([
      posthogEvent({
        id: "evt-1",
        event: "onboarding_tour_started",
        distinctId: "user-1",
        properties: { $session_id: "session-1" },
        occurredAt: "2026-06-20T10:00:00.000Z",
      }),
      posthogEvent({
        id: "evt-2",
        event: "walkthrough_video_completed",
        distinctId: "user-1",
        properties: { placement: "onboarding-tour" },
        occurredAt: "2026-06-20T10:05:00.000Z",
      }),
      posthogEvent({
        id: "evt-3",
        event: "item_created",
        distinctId: "user-1",
        occurredAt: "2026-06-20T10:30:00.000Z",
      }),
      posthogEvent({
        id: "evt-4",
        event: "card_printed",
        distinctId: "user-1",
        properties: { print_type: "card" },
        occurredAt: "2026-06-20T10:45:00.000Z",
      }),
      posthogEvent({
        id: "evt-5",
        event: "card_added_to_order_queue",
        distinctId: "user-1",
        occurredAt: "2026-06-20T11:00:00.000Z",
      }),
      posthogEvent({
        id: "evt-6",
        event: "card_fulfilled",
        distinctId: "user-1",
        occurredAt: "2026-06-20T11:45:00.000Z",
      }),
      posthogEvent({
        id: "evt-7",
        event: "cards_received",
        distinctId: "user-1",
        occurredAt: "2026-06-20T12:00:00.000Z",
      }),
      posthogEvent({
        id: "evt-8",
        event: "onboarding_tour_started",
        distinctId: "user-2",
        occurredAt: "2026-06-21T09:00:00.000Z",
      }),
      posthogEvent({
        id: "evt-9",
        event: "item_created",
        distinctId: "user-2",
        occurredAt: "2026-06-21T09:30:00.000Z",
      }),
      posthogEvent({
        id: "evt-10",
        event: "card_printed",
        distinctId: "user-2",
        properties: { print_type: "label" },
        occurredAt: "2026-06-21T10:00:00.000Z",
      }),
    ]);

    const dashboard = await buildActivationJourneyDashboard({
      prisma,
      context: { userId: "user_1", organizationId: "org_1" },
      now: new Date("2026-06-22T00:00:00.000Z"),
      days: 14,
    });

    expect(dashboard.summary).toMatchObject({
      totalEvents: 10,
      identifiedActors: 2,
      activatedActors: 1,
      activationRate: 50,
    });
    expect(dashboard.summary.medianHoursToActivation).toBe(2);

    const milestoneUsers = Object.fromEntries(
      dashboard.milestones.map((milestone) => [milestone.key, milestone.actors]),
    );
    expect(milestoneUsers).toMatchObject({
      tour_started: 2,
      video_completed: 1,
      item_created: 2,
      card_printed: 2,
      queue_added: 1,
      order_placed: 1,
      activation_completed: 1,
    });

    const queueAdded = dashboard.milestones.find((milestone) => milestone.key === "queue_added");
    expect(queueAdded?.conversionFromPrevious).toBe(50);
    expect(queueAdded?.dropoffFromPrevious).toBe(50);

    expect(dashboard.cohorts).toContainEqual({
      key: "tour_completed",
      label: "Tour completed",
      actors: 1,
      activatedActors: 1,
      activationRate: 100,
    });
    expect(dashboard.cohorts).toContainEqual({
      key: "tour_started_not_completed",
      label: "Tour started, not completed",
      actors: 1,
      activatedActors: 0,
      activationRate: 0,
    });

    expect(dashboard.paths[0]).toMatchObject({
      sequence: [
        "tour_started",
        "video_completed",
        "item_created",
        "card_printed",
        "queue_added",
        "order_placed",
        "activation_completed",
      ],
      actors: 1,
      activatedActors: 1,
      activationRate: 100,
    });

    expect(dashboard.actorSamples[0]).toMatchObject({
      actorId: "user-1",
      sessionReplayUrl: "https://us.posthog.com/project/12345/replay/session-1",
      identityUrl: "https://us.posthog.com/project/12345/person/user-1",
      analyticsUrl: "https://us.posthog.com/project/12345/events?distinct_id=user-1",
    });
  });

  it("maps previously-unmapped events into milestone sub-stages", async () => {
    const prisma = prismaWithPostHogRows([
      // Auth / onboarding sub-stages under tour_started.
      posthogEvent({
        id: "pv-1",
        event: "$pageview",
        distinctId: "user-1",
        properties: { $pathname: "/signup/" },
        occurredAt: "2026-06-20T09:00:00.000Z",
      }),
      posthogEvent({
        id: "su-1",
        event: "user_signed_up",
        distinctId: "user-1",
        occurredAt: "2026-06-20T09:01:00.000Z",
      }),
      posthogEvent({
        id: "rc-1",
        event: "$rageclick",
        distinctId: "user-1",
        properties: { $current_url: "https://app.arda.cards/create-free-kanban-cards?ref=x" },
        occurredAt: "2026-06-20T09:02:00.000Z",
      }),
      // Item-creation sub-stages under item_created.
      posthogEvent({
        id: "pv-2",
        event: "$pageview",
        distinctId: "user-1",
        properties: { $pathname: "/items" },
        occurredAt: "2026-06-20T09:10:00.000Z",
      }),
      posthogEvent({
        id: "fu-1",
        event: "item_file_uploaded",
        distinctId: "user-1",
        occurredAt: "2026-06-20T09:11:00.000Z",
      }),
      // A pageview on a page that belongs to no stage stays genuinely unmapped.
      posthogEvent({
        id: "pv-3",
        event: "$pageview",
        distinctId: "user-1",
        properties: { $pathname: "/pricing" },
        occurredAt: "2026-06-20T09:12:00.000Z",
      }),
    ]);

    const dashboard = await buildActivationJourneyDashboard({
      prisma,
      context: { userId: "user_1", organizationId: "org_1" },
      now: new Date("2026-06-22T00:00:00.000Z"),
      days: 14,
    });

    // 4 events found a sub-stage home; user_signed_up is now the `signup` MILESTONE's
    // primary event (no longer a sub-stage), and only the /pricing pageview is unmapped.
    expect(dashboard.source.subStageMappedEvents).toBe(4);
    expect(dashboard.source.unmappedEvents).toBe(1);

    // `signup` is now a first-class activation milestone (promoted from a tour_started sub-stage).
    const signup = dashboard.milestones.find((m) => m.key === "signup");
    expect(signup?.funnel).toBe("activation");
    expect(signup?.actors).toBe(1);
    expect(signup?.events).toBe(1);

    // The auth sub-stages moved from tour_started onto signup; tour_started now has none.
    const tourStarted = dashboard.milestones.find((m) => m.key === "tour_started");
    expect(tourStarted?.subStages).toHaveLength(0);
    const subStageCounts = Object.fromEntries(
      (signup?.subStages ?? []).map((sub) => [sub.key, sub.eventCount]),
    );
    expect(subStageCounts.auth_landing_pageview).toBe(1);
    // The sign_up sub-stage is gone — user_signed_up is the signup milestone's primary event now.
    expect(signup?.subStages.some((sub) => sub.key === "sign_up")).toBe(false);
    // Auth-only rageclick sub-stage — the fixture rageclick is on /create-free-kanban-cards
    // which routes to kanban_submitted's sub-stage, not signup's.
    expect(subStageCounts.onboarding_rageclick).toBe(0);
    // No $pageleave event in this fixture, so its drop-off sub-stage stays missing here.
    const pageleave = signup?.subStages.find((sub) => sub.key === "onboarding_pageleave");
    expect(pageleave?.status).toBe("missing");
    expect(pageleave?.eventCount).toBe(0);

    // The kanban-page rageclick is now attributed to the kanban_submitted milestone.
    const kanbanSubmitted = dashboard.milestones.find((m) => m.key === "kanban_submitted");
    const kanbanSubStageCounts = Object.fromEntries(
      (kanbanSubmitted?.subStages ?? []).map((sub) => [sub.key, sub.eventCount]),
    );
    expect(kanbanSubStageCounts.kanban_rageclick).toBe(1);

    const itemCreated = dashboard.milestones.find((m) => m.key === "item_created");
    const itemSubStages = Object.fromEntries(
      (itemCreated?.subStages ?? []).map((sub) => [sub.key, sub.eventCount]),
    );
    expect(itemSubStages.items_pageview).toBe(1);
    expect(itemSubStages.item_file_uploaded).toBe(1);

    // The shared $pageview event name feeds multiple sub-stages depending on page.
    const pageviewRow = dashboard.eventTaxonomy.find((row) => row.event === "$pageview");
    expect(pageviewRow?.mappedMilestone).toBeNull();
    expect(pageviewRow?.mappedSubStages).toEqual(
      expect.arrayContaining(["auth_landing_pageview", "items_pageview"]),
    );
    expect(pageviewRow?.mappedSubStages).not.toContain("receiving_pageview");
  });

  it("attributes engagement, experience, friction, and session events to stage sub-stages and excludes system events", async () => {
    const prisma = prismaWithPostHogRows([
      // Engagement: autocapture interactions on /items -> item_created.items_interactions
      posthogEvent({
        id: "ac-1",
        event: "$autocapture",
        distinctId: "user-1",
        properties: { $pathname: "/items" },
        occurredAt: "2026-06-20T09:00:00.000Z",
      }),
      // Experience: web vitals on /print-viewer -> card_printed.print_web_vitals
      posthogEvent({
        id: "wv-1",
        event: "$web_vitals",
        distinctId: "user-1",
        properties: { $current_url: "https://app.arda.cards/print-viewer" },
        occurredAt: "2026-06-20T09:01:00.000Z",
      }),
      // Friction: exception on /order-queue -> queue_added.order_queue_exceptions
      posthogEvent({
        id: "ex-1",
        event: "$exception",
        distinctId: "user-1",
        properties: { $pathname: "/order-queue" },
        occurredAt: "2026-06-20T09:02:00.000Z",
      }),
      // Friction: dead click on /receiving -> activation_completed.receiving_deadclick
      posthogEvent({
        id: "dc-1",
        event: "$dead_click",
        distinctId: "user-1",
        properties: { $pathname: "/receiving" },
        occurredAt: "2026-06-20T09:03:00.000Z",
      }),
      // Session: sign-out (page-agnostic) -> signup.sign_out
      posthogEvent({
        id: "so-1",
        event: "user_signed_out",
        distinctId: "user-1",
        occurredAt: "2026-06-20T09:04:00.000Z",
      }),
      // System events: excluded from attribution, counted separately.
      posthogEvent({
        id: "id-1",
        event: "$identify",
        distinctId: "user-1",
        occurredAt: "2026-06-20T09:05:00.000Z",
      }),
      posthogEvent({
        id: "set-1",
        event: "$set",
        distinctId: "user-1",
        occurredAt: "2026-06-20T09:06:00.000Z",
      }),
    ]);

    const dashboard = await buildActivationJourneyDashboard({
      prisma,
      context: { userId: "user_1", organizationId: "org_1" },
      now: new Date("2026-06-22T00:00:00.000Z"),
      days: 14,
    });

    // 5 events found a sub-stage home; the 2 system events are excluded, none unmapped.
    expect(dashboard.source.subStageMappedEvents).toBe(5);
    expect(dashboard.source.systemEvents).toBe(2);
    expect(dashboard.source.unmappedEvents).toBe(0);

    const countFor = (milestoneKey: string, subKey: string) =>
      dashboard.milestones
        .find((m) => m.key === milestoneKey)
        ?.subStages.find((sub) => sub.key === subKey)?.eventCount;

    expect(countFor("item_created", "items_interactions")).toBe(1);
    expect(countFor("card_printed", "print_web_vitals")).toBe(1);
    expect(countFor("queue_added", "order_queue_exceptions")).toBe(1);
    expect(countFor("activation_completed", "receiving_deadclick")).toBe(1);
    expect(countFor("signup", "sign_out")).toBe(1);

    // $autocapture is page-scoped: it feeds /items but not the receiving sub-stage.
    const autocaptureRow = dashboard.eventTaxonomy.find((row) => row.event === "$autocapture");
    expect(autocaptureRow?.mappedSubStages).toEqual(["items_interactions"]);
  });

  it("splits milestones into two funnels and computes the trial∪paid→signup bridge", async () => {
    const prisma = prismaWithPostHogRows([
      // userA: demo → trial → paid → signup (signup AFTER paid → post_paid)
      posthogEvent({ id: "a-demo", event: "marketing_demo_requested", distinctId: "userA", occurredAt: "2026-06-20T08:00:00.000Z" }),
      posthogEvent({ id: "a-trial", event: "trial_started", distinctId: "userA", occurredAt: "2026-06-20T09:00:00.000Z" }),
      posthogEvent({ id: "a-paid", event: "subscription_paid", distinctId: "userA", occurredAt: "2026-06-20T10:00:00.000Z" }),
      posthogEvent({ id: "a-signup", event: "user_signed_up", distinctId: "userA", occurredAt: "2026-06-20T11:00:00.000Z" }),
      // userB: trial → signup (signup AFTER trial, never paid → post_trial)
      posthogEvent({ id: "b-trial", event: "trial_started", distinctId: "userB", occurredAt: "2026-06-20T08:00:00.000Z" }),
      posthogEvent({ id: "b-signup", event: "user_signed_up", distinctId: "userB", occurredAt: "2026-06-20T09:00:00.000Z" }),
      // userC: signup only (no trial/paid → direct/free signup)
      posthogEvent({ id: "c-signup", event: "user_signed_up", distinctId: "userC", occurredAt: "2026-06-20T08:00:00.000Z" }),
      // userD: trial → paid, never signs up (commercial but does not enter the activation funnel)
      posthogEvent({ id: "d-trial", event: "trial_started", distinctId: "userD", occurredAt: "2026-06-20T08:00:00.000Z" }),
      posthogEvent({ id: "d-paid", event: "subscription_paid", distinctId: "userD", occurredAt: "2026-06-20T09:00:00.000Z" }),
    ]);

    const dashboard = await buildActivationJourneyDashboard({
      prisma,
      context: { userId: "user_1", organizationId: "org_1" },
      now: new Date("2026-06-22T00:00:00.000Z"),
      days: 14,
    });

    // Two funnels, each carrying its own ordered milestones.
    expect(dashboard.marketingFunnel.map((m) => m.key)).toEqual([
      "site_visited",
      "kanban_submitted",
      "cta_clicked",
      "demo",
      "trial",
      "paid",
    ]);
    expect(dashboard.activationFunnel.map((m) => m.key)).toEqual([
      "signup",
      "tour_started",
      "video_completed",
      "item_created",
      "card_printed",
      "queue_added",
      "order_placed",
      "activation_completed",
    ]);
    expect(dashboard.marketingFunnel.every((m) => m.funnel === "marketing")).toBe(true);
    expect(dashboard.activationFunnel.every((m) => m.funnel === "activation")).toBe(true);
    // `paid` is the terminal marketing milestone.
    expect(dashboard.marketingFunnel.at(-1)?.key).toBe("paid");

    // THE KEY INVARIANT: signup is the first activation milestone and must NOT be
    // divided by `paid` across the funnel boundary — its conversion is null (entry).
    const signup = dashboard.activationFunnel[0];
    expect(signup.key).toBe("signup");
    expect(signup.conversionFromPrevious).toBeNull();
    // site_visited (first marketing milestone) is likewise an entry point.
    expect(dashboard.marketingFunnel[0].conversionFromPrevious).toBeNull();

    // Bridge: trial ∪ paid → signup, with timestamp-based attribution.
    expect(dashboard.bridge.commercialActors).toBe(3); // A, B, D have trial or paid
    expect(dashboard.bridge.signedUpActors).toBe(2); // A, B are commercial AND signed up
    expect(dashboard.bridge.conversionRate).toBe(66.67); // 2 / 3
    expect(dashboard.bridge.signupAttribution).toEqual({
      postPaid: 1, // A
      postTrial: 1, // B
      direct: 1, // C
      total: 3, // A, B, C
    });
  });

  it("queries the PostHog raw-event window in the caller scope", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      imladrisRawSourceRecord: { findMany },
    } as unknown as PrismaClientType;

    await buildActivationJourneyDashboard({
      prisma,
      context: { userId: "user_1", organizationId: "org_1" },
      now: new Date("2026-06-22T00:00:00.000Z"),
      days: 7,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: IntegrationProvider.POSTHOG,
          objectType: "event",
          occurredAt: {
            gte: new Date("2026-06-15T00:00:00.000Z"),
            lte: new Date("2026-06-22T00:00:00.000Z"),
          },
        }),
        orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
      }),
    );
  });

  it("supports an explicit from/to custom window (overrides days)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { imladrisRawSourceRecord: { findMany } } as unknown as PrismaClientType;
    await buildActivationJourneyDashboard({
      prisma,
      context: { userId: "user_1", organizationId: "org_1" },
      now: new Date("2026-06-22T00:00:00.000Z"),
      days: 7, // should be ignored when from/to are given
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          occurredAt: {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lte: new Date("2026-03-31T23:59:59.999Z"),
          },
        }),
      }),
    );
  });

  it("all=true queries from epoch and reports the earliest event as window.from", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { imladrisRawSourceRecord: { findMany } } as unknown as PrismaClientType;
    await buildActivationJourneyDashboard({
      prisma,
      context: { userId: "user_1", organizationId: "org_1" },
      now: new Date("2026-06-22T00:00:00.000Z"),
      all: true,
    });
    const call = findMany.mock.calls[0][0];
    expect(call.where.occurredAt.gte).toEqual(new Date(0));
    expect(call.where.occurredAt.lte).toEqual(new Date("2026-06-22T00:00:00.000Z"));

    // With real events, window.from reflects the earliest event (not epoch 0).
    const prisma2 = prismaWithPostHogRows([
      posthogEvent({ id: "e1", event: "user_signed_up", distinctId: "u1", occurredAt: "2025-09-15T10:00:00.000Z" }),
      posthogEvent({ id: "e2", event: "user_signed_up", distinctId: "u2", occurredAt: "2026-05-01T10:00:00.000Z" }),
    ]);
    const dash = await buildActivationJourneyDashboard({
      prisma: prisma2,
      context: { userId: "user_1", organizationId: "org_1" },
      now: new Date("2026-06-22T00:00:00.000Z"),
      all: true,
    });
    expect(dash.window.from).toBe("2025-09-15T10:00:00.000Z");
  });
});

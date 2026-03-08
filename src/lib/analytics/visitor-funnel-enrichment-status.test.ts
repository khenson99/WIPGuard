import { afterEach, describe, expect, it } from "vitest";
import { buildVisitorFunnelEnrichmentStatus } from "@/lib/analytics/visitor-funnel";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("buildVisitorFunnelEnrichmentStatus", () => {
  it("summarizes provider health and configuration state", async () => {
    process.env.VISITOR_FUNNEL_ENRICH_SECRET = "shared-secret";
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";

    const prisma = {
      funnelEnrichmentSignal: {
        count: async ({ where }: { where: { provider: string; accepted?: boolean } }) => {
          if (where.provider === "UNIFY") return where.accepted ? 8 : 10;
          if (where.provider === "CLAY") return where.accepted ? 2 : 3;
          if (where.provider === "RB2B") return where.accepted ? 0 : 0;
          return 0;
        },
        findFirst: async ({
          where,
        }: {
          where: { provider: string; accepted?: boolean };
          orderBy: Array<Record<string, "desc">>;
          select: { occurredAt: boolean; createdAt: boolean };
        }) => {
          if (where.provider === "UNIFY" && where.accepted) {
            return {
              occurredAt: new Date("2026-03-08T12:00:00.000Z"),
              createdAt: new Date("2026-03-08T12:00:00.000Z"),
            };
          }
          if (where.provider === "UNIFY") {
            return {
              occurredAt: new Date("2026-03-08T12:15:00.000Z"),
              createdAt: new Date("2026-03-08T12:15:00.000Z"),
            };
          }
          if (where.provider === "CLAY" && where.accepted) {
            return {
              occurredAt: new Date("2026-03-05T18:00:00.000Z"),
              createdAt: new Date("2026-03-05T18:00:00.000Z"),
            };
          }
          if (where.provider === "CLAY") {
            return {
              occurredAt: new Date("2026-03-05T18:15:00.000Z"),
              createdAt: new Date("2026-03-05T18:15:00.000Z"),
            };
          }
          return null;
        },
      },
    } as never;

    const statuses = await buildVisitorFunnelEnrichmentStatus(
      prisma,
      new Date("2026-03-08T13:00:00.000Z"),
    );

    expect(statuses).toHaveLength(3);
    expect(statuses[0]).toMatchObject({
      provider: "unify",
      deliveryMode: "cron_pull",
      authConfigured: true,
      syncConfigured: true,
      syncEnabled: true,
      totalSignals: 10,
      acceptedSignals: 8,
      acceptedRate: 80,
      stale: false,
    });
    expect(statuses[1]).toMatchObject({
      provider: "clay",
      deliveryMode: "webhook_push",
      authConfigured: true,
      syncConfigured: true,
      totalSignals: 3,
      acceptedSignals: 2,
      acceptedRate: 66.7,
      stale: false,
    });
    expect(statuses[2]).toMatchObject({
      provider: "rb2b",
      deliveryMode: "webhook_push",
      authConfigured: true,
      syncConfigured: true,
      totalSignals: 0,
      acceptedSignals: 0,
      acceptedRate: null,
      lastSignalAt: null,
      lastAcceptedAt: null,
    });
  });

  it("marks stale or missing provider configuration correctly", async () => {
    delete process.env.VISITOR_FUNNEL_ENRICH_SECRET;
    delete process.env.UNIFY_DATA_API_KEY;
    delete process.env.UNIFY_FUNNEL_OBJECT_NAME;
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "false";

    const prisma = {
      funnelEnrichmentSignal: {
        count: async () => 1,
        findFirst: async () => ({
          occurredAt: new Date("2026-02-20T12:00:00.000Z"),
          createdAt: new Date("2026-02-20T12:00:00.000Z"),
        }),
      },
    } as never;

    const statuses = await buildVisitorFunnelEnrichmentStatus(
      prisma,
      new Date("2026-03-08T13:00:00.000Z"),
    );

    expect(statuses[0]).toMatchObject({
      provider: "unify",
      syncConfigured: false,
      syncEnabled: false,
      stale: false,
    });
    expect(statuses[1]).toMatchObject({
      provider: "clay",
      authConfigured: false,
      syncConfigured: false,
      stale: false,
    });
  });
});

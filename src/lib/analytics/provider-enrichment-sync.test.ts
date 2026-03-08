import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeIncrementalCursor,
  computeInitialLookbackCursor,
  resolveUnifyPullRequest,
  runVisitorFunnelEnrichmentSyncs,
} from "@/lib/analytics/provider-enrichment-sync";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("provider-enrichment-sync helpers", () => {
  it("computes the initial lookback cursor from the configured time horizon", () => {
    const now = new Date("2026-03-08T12:00:00.000Z");
    expect(computeInitialLookbackCursor(now, 24)).toBe("2026-03-07T12:00:00.000Z");
  });

  it("uses an overlap window when continuing from an existing cursor", () => {
    const latest = new Date("2026-03-08T10:30:00.000Z");
    const now = new Date("2026-03-08T12:00:00.000Z");
    expect(computeIncrementalCursor(latest, now, 168, 60)).toBe("2026-03-08T09:30:00.000Z");
  });

  it("derives Unify pull configuration from env", () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";
    process.env.UNIFY_FUNNEL_INITIAL_LOOKBACK_HOURS = "24";
    process.env.UNIFY_FUNNEL_MAX_RECORDS = "250";

    const config = resolveUnifyPullRequest(new Date("2026-03-08T12:00:00.000Z"));
    expect(config).toMatchObject({
      apiKey: "unify-key",
      objectName: "website_visitors",
      enabled: true,
      updatedAfter: "2026-03-07T12:00:00.000Z",
      maxRecords: 250,
    });
  });
});

describe("runVisitorFunnelEnrichmentSyncs", () => {
  it("returns push-only statuses when Unify sync is disabled", async () => {
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "false";

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma: {
        funnelEnrichmentSignal: {
          findFirst: vi.fn(),
        },
      } as never,
    });

    expect(results[0]).toMatchObject({
      provider: "unify",
      skipped: true,
      ok: true,
    });
    expect(results[1]).toMatchObject({ provider: "clay", mode: "push_only" });
    expect(results[2]).toMatchObject({ provider: "rb2b", mode: "push_only" });
  });

  it("pulls Unify records with a cursor and ingests them", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";
    process.env.UNIFY_FUNNEL_CURSOR_OVERLAP_MINUTES = "30";

    const prisma = {
      funnelEnrichmentSignal: {
        findFirst: vi.fn().mockResolvedValue({
          occurredAt: new Date("2026-03-08T10:00:00.000Z"),
          createdAt: new Date("2026-03-08T10:05:00.000Z"),
        }),
      },
    } as never;

    const pullUnify = vi.fn().mockResolvedValue([
      {
        signalKey: "rec_1",
        email: "founder@example.com",
        domain: "example.com",
        confidence: 0.93,
      },
    ]);
    const ingestSignals = vi.fn().mockResolvedValue({
      accepted: 1,
      stored: 1,
    });

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify,
      ingestSignals,
    });

    expect(pullUnify).toHaveBeenCalledWith({
      apiKey: "unify-key",
      objectName: "website_visitors",
      updatedAfter: "2026-03-08T09:30:00.000Z",
      maxRecords: 500,
    });
    expect(ingestSignals).toHaveBeenCalledWith(prisma, "unify", [
      {
        signalKey: "rec_1",
        email: "founder@example.com",
        domain: "example.com",
        confidence: 0.93,
      },
    ]);
    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: true,
      skipped: false,
      pulled: 1,
      stored: 1,
      accepted: 1,
      updatedAfter: "2026-03-08T09:30:00.000Z",
    });
  });
});

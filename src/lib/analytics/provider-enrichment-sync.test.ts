import { afterEach, describe, expect, it, vi } from "vitest";
import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
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
        funnelVisitor: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          upsert: vi.fn(),
          update: vi.fn(),
        },
        funnelEvent: {
          create: vi.fn(),
          upsert: vi.fn(),
        },
        funnelIdentityLink: {
          findFirst: vi.fn(),
          upsert: vi.fn(),
        },
        funnelEnrichmentSignal: {
          findFirst: vi.fn(),
          count: vi.fn(),
          upsert: vi.fn(),
          update: vi.fn(),
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

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          occurredAt: new Date("2026-03-08T10:00:00.000Z"),
          createdAt: new Date("2026-03-08T10:05:00.000Z"),
        }),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
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
    const ingestRawRecords = vi.fn().mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify,
      ingestSignals,
      ingestRawRecords,
    });

    expect(pullUnify).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "unify-key",
      objectName: "website_visitors",
      updatedAfter: "2026-03-08T09:30:00.000Z",
      maxRecords: 500,
    }));
    expect(ingestSignals).toHaveBeenCalledWith(prisma, "unify", [
      {
        signalKey: "rec_1",
        email: "founder@example.com",
        domain: "example.com",
        confidence: 0.93,
      },
    ]);
    expect(ingestRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      prisma,
      provider: IntegrationProvider.UNIFY,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      mode: "incremental",
      windowStart: new Date("2026-03-08T09:30:00.000Z"),
      windowEnd: new Date("2026-03-08T12:00:00.000Z"),
      checkpoint: expect.objectContaining({
        providerKey: "unify",
        objectName: "website_visitors",
        updatedAfter: "2026-03-08T09:30:00.000Z",
      }),
      records: expect.arrayContaining([
        expect.objectContaining({
          objectType: "signal",
          externalId: "unify:signal:rec_1",
          payload: expect.objectContaining({
            signalKey: "rec_1",
            domain: "example.com",
            sourcePath: "signals",
            snapshotKey: "unify",
          }),
        }),
      ]),
    }));
    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: true,
      skipped: false,
      pulled: 1,
      stored: 1,
      accepted: 1,
      updatedAfter: "2026-03-08T09:30:00.000Z",
    });
    expect(integrationConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        provider: IntegrationProvider.UNIFY,
        userId: "user_1",
      },
      data: {
        status: IntegrationConnectionStatus.CONNECTED,
        lastSyncedAt: new Date("2026-03-08T12:00:00.000Z"),
        lastError: null,
      },
    });
  });

  it("creates a missing Unify connection row after a successful scheduled pull", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const integrationConnectionUpsert = vi.fn().mockResolvedValue({});
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
        upsert: integrationConnectionUpsert,
      },
    } as never;

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify: vi.fn().mockResolvedValue([
        {
          signalKey: "rec_create_1",
          email: "founder@example.com",
          domain: "example.com",
          confidence: 0.93,
        },
      ]),
      ingestSignals: vi.fn().mockResolvedValue({
        accepted: 1,
        stored: 1,
      }),
      ingestRawRecords: vi.fn().mockResolvedValue({
        syncRunId: "sync_create",
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 2,
        errorCount: 0,
      }),
    });

    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: true,
      skipped: false,
      pulled: 1,
      stored: 1,
      accepted: 1,
      statusPersistenceErrors: [],
    });
    expect(integrationConnectionUpsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user_1",
          provider: IntegrationProvider.UNIFY,
        },
      },
      update: {
        status: IntegrationConnectionStatus.CONNECTED,
        lastSyncedAt: new Date("2026-03-08T12:00:00.000Z"),
        lastError: null,
      },
      create: {
        userId: "user_1",
        provider: IntegrationProvider.UNIFY,
        status: IntegrationConnectionStatus.CONNECTED,
        lastSyncedAt: new Date("2026-03-08T12:00:00.000Z"),
        lastError: null,
      },
    });
  });

  it("retries transient Unify pull failures before persisting records", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";
    process.env.UNIFY_FUNNEL_RETRY_BASE_MS = "0";

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
      },
    } as never;
    const pullUnify = vi.fn()
      .mockRejectedValueOnce(new Error("Unify 503 temporarily unavailable"))
      .mockResolvedValueOnce([
        {
          signalKey: "rec_retry_1",
          email: "buyer@example.com",
          domain: "example.com",
          occurredAt: "2026-03-08T11:00:00.000Z",
        },
      ]);
    const ingestSignals = vi.fn().mockResolvedValue({
      accepted: 1,
      stored: 1,
    });
    const ingestRawRecords = vi.fn().mockResolvedValue({
      syncRunId: "sync_retry",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify,
      ingestSignals,
      ingestRawRecords,
    });

    expect(pullUnify).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: true,
      skipped: false,
      pulled: 1,
      stored: 1,
      accepted: 1,
    });
    expect(ingestRawRecords).toHaveBeenCalledWith(expect.objectContaining({
      provider: IntegrationProvider.UNIFY,
      records: expect.arrayContaining([
        expect.objectContaining({
          externalId: "unify:signal:rec_retry_1",
        }),
      ]),
    }));
    expect(integrationConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        provider: IntegrationProvider.UNIFY,
        userId: "user_1",
      },
      data: {
        status: IntegrationConnectionStatus.CONNECTED,
        lastSyncedAt: new Date("2026-03-08T12:00:00.000Z"),
        lastError: null,
      },
    });
  });

  it("returns a degraded result when Unify connection freshness persistence fails", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";

    const integrationConnectionUpdateMany = vi
      .fn()
      .mockRejectedValue(new Error("connection status db unavailable"));
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
      },
    } as never;

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify: vi.fn().mockResolvedValue([
        {
          signalKey: "rec_1",
          domain: "example.com",
        },
      ]),
      ingestSignals: vi.fn().mockResolvedValue({
        accepted: 1,
        stored: 1,
      }),
      ingestRawRecords: vi.fn().mockResolvedValue({
        syncRunId: "sync_1",
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 2,
        errorCount: 0,
      }),
    });

    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: false,
      skipped: false,
      reason: "integrationConnection status persistence failed: connection status db unavailable",
      pulled: 1,
      stored: 1,
      accepted: 1,
      statusPersistenceErrors: [
        "integrationConnection status persistence failed: connection status db unavailable",
      ],
    });
    expect(integrationConnectionUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("returns a degraded result when Unify raw ingestion status persistence fails", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
      },
    } as never;

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify: vi.fn().mockResolvedValue([
        {
          signalKey: "rec_1",
          domain: "example.com",
        },
      ]),
      ingestSignals: vi.fn().mockResolvedValue({
        accepted: 1,
        stored: 1,
      }),
      ingestRawRecords: vi.fn().mockResolvedValue({
        syncRunId: "sync_1",
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 2,
        errorCount: 0,
        statusPersistenceErrors: [
          "imladrisSourceSyncRun status persistence failed: sync run update unavailable",
        ],
      }),
    });

    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: false,
      skipped: false,
      reason: "imladrisSourceSyncRun status persistence failed: sync run update unavailable",
      pulled: 1,
      stored: 1,
      accepted: 1,
      statusPersistenceErrors: [
        "imladrisSourceSyncRun status persistence failed: sync run update unavailable",
      ],
    });
    expect(integrationConnectionUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("does not update all Unify connections when Imladris user context is missing", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
      },
    } as never;

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify: vi.fn().mockResolvedValue([
        {
          signalKey: "rec_1",
          domain: "example.com",
        },
      ]),
      ingestSignals: vi.fn().mockResolvedValue({
        accepted: 1,
        stored: 1,
      }),
      ingestRawRecords: vi.fn().mockResolvedValue({
        syncRunId: "sync_1",
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 2,
        errorCount: 0,
      }),
    });

    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: false,
      skipped: false,
      reason: "integrationConnection status persistence failed: missing userId for Unify connection status update",
      pulled: 1,
      stored: 1,
      accepted: 1,
      statusPersistenceErrors: [
        "integrationConnection status persistence failed: missing userId for Unify connection status update",
      ],
    });
    expect(integrationConnectionUpdateMany).not.toHaveBeenCalled();
  });

  it("marks Unify sync failed when Imladris raw ingestion is partial", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
      },
    } as never;

    const ingestSignals = vi.fn().mockResolvedValue({
      accepted: 1,
      stored: 1,
    });

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify: vi.fn().mockResolvedValue([
        {
          signalKey: "rec_1",
          domain: "example.com",
        },
      ]),
      ingestSignals,
      ingestRawRecords: vi.fn().mockResolvedValue({
        syncRunId: "sync_partial",
        status: "PARTIAL",
        recordCount: 2,
        acceptedCount: 1,
        errorCount: 1,
      }),
    });

    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: false,
      skipped: false,
      reason: "Imladris raw ingestion partially succeeded for Unify: 1/2 records accepted.",
    });
    expect(ingestSignals).not.toHaveBeenCalled();
    expect(integrationConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        provider: IntegrationProvider.UNIFY,
        userId: "user_1",
      },
      data: {
        status: IntegrationConnectionStatus.ERROR,
        lastSyncedAt: null,
        lastError: "Imladris raw ingestion partially succeeded for Unify: 1/2 records accepted.",
      },
    });
  });

  it("creates a missing Unify connection row when scheduled raw ingestion fails", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const integrationConnectionUpsert = vi.fn().mockResolvedValue({});
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
        upsert: integrationConnectionUpsert,
      },
    } as never;

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify: vi.fn().mockResolvedValue([
        {
          signalKey: "rec_failed_create_1",
          domain: "example.com",
        },
      ]),
      ingestSignals: vi.fn(),
      ingestRawRecords: vi.fn().mockResolvedValue({
        syncRunId: "sync_error_create",
        status: "ERROR",
        recordCount: 2,
        acceptedCount: 0,
        errorCount: 2,
      }),
    });

    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: false,
      skipped: false,
      reason: "Imladris raw ingestion failed for Unify: 0/2 records accepted.",
      statusPersistenceErrors: [],
    });
    expect(integrationConnectionUpsert).toHaveBeenCalledWith({
      where: {
        userId_provider: {
          userId: "user_1",
          provider: IntegrationProvider.UNIFY,
        },
      },
      update: {
        status: IntegrationConnectionStatus.ERROR,
        lastSyncedAt: null,
        lastError: "Imladris raw ingestion failed for Unify: 0/2 records accepted.",
      },
      create: {
        userId: "user_1",
        provider: IntegrationProvider.UNIFY,
        status: IntegrationConnectionStatus.ERROR,
        lastSyncedAt: null,
        lastError: "Imladris raw ingestion failed for Unify: 0/2 records accepted.",
      },
    });
  });

  it("marks the Unify connection errored when a configured pull fails", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
      },
    } as never;

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify: vi.fn().mockRejectedValue(new Error("Unify API 401 unauthorized")),
      ingestSignals: vi.fn(),
      ingestRawRecords: vi.fn(),
    });

    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: false,
      skipped: false,
      reason: "Unify API 401 unauthorized",
      pulled: 0,
      stored: 0,
      accepted: 0,
    });
    expect(integrationConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        provider: IntegrationProvider.UNIFY,
        userId: "user_1",
      },
      data: {
        status: IntegrationConnectionStatus.ERROR,
        lastSyncedAt: null,
        lastError: "Unify API 401 unauthorized",
      },
    });
  });

  it("refuses to persist truncated Unify pulls", async () => {
    process.env.UNIFY_DATA_API_KEY = "unify-key";
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "website_visitors";
    process.env.UNIFY_FUNNEL_SYNC_ENABLED = "true";
    process.env.UNIFY_FUNNEL_MAX_RECORDS = "1";

    const integrationConnectionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      funnelVisitor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      funnelEvent: {
        create: vi.fn(),
        upsert: vi.fn(),
      },
      funnelIdentityLink: {
        findFirst: vi.fn(),
        upsert: vi.fn(),
      },
      funnelEnrichmentSignal: {
        count: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      integrationConnection: {
        updateMany: integrationConnectionUpdateMany,
      },
    } as never;
    const ingestSignals = vi.fn().mockResolvedValue({
      accepted: 1,
      stored: 1,
    });
    const ingestRawRecords = vi.fn().mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });

    const results = await runVisitorFunnelEnrichmentSyncs({
      prisma,
      imladrisContext: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-03-08T12:00:00.000Z"),
      pullUnify: vi.fn().mockResolvedValue({
        signals: [
          {
            signalKey: "rec_1",
            domain: "example.com",
          },
        ],
        truncated: true,
        totalFiltered: 2,
        returned: 1,
        maxRecords: 1,
      }),
      ingestSignals,
      ingestRawRecords,
    });

    expect(ingestSignals).not.toHaveBeenCalled();
    expect(ingestRawRecords).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({
      provider: "unify",
      ok: false,
      skipped: false,
      reason: "Unify pull returned 1/2 filtered records; refusing to persist truncated enrichment data.",
      pulled: 0,
      stored: 0,
      accepted: 0,
    });
    expect(integrationConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        provider: IntegrationProvider.UNIFY,
        userId: "user_1",
      },
      data: {
        status: IntegrationConnectionStatus.ERROR,
        lastSyncedAt: null,
        lastError: "Unify pull returned 1/2 filtered records; refusing to persist truncated enrichment data.",
      },
    });
  });
});

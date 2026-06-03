import { describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import {
  getImladrisHistoricalWindow,
  ingestImladrisRawRecords,
} from "@/lib/imladris/ingestion";

function createPrismaMock() {
  const syncRun = {
    id: "sync_1",
    provider: IntegrationProvider.LINEAR,
  };

  return {
    syncRun,
    prisma: {
      imladrisSourceSyncRun: {
        create: vi.fn(async () => syncRun),
        update: vi.fn(async ({ data }) => ({ ...syncRun, ...data })),
      },
      imladrisRawSourceRecord: {
        upsert: vi.fn(async ({ create }) => create),
      },
    },
  };
}

describe("Imladris raw ingestion", () => {
  it("uses a 13-month historical window by default", () => {
    expect(getImladrisHistoricalWindow(new Date("2026-05-29T12:00:00.000Z"))).toEqual({
      windowStart: new Date("2025-04-29T12:00:00.000Z"),
      windowEnd: new Date("2026-05-29T12:00:00.000Z"),
    });
  });

  it("persists raw provider records with audit metadata and completes the sync run", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      mode: "historical",
      windowStart: new Date("2025-04-29T00:00:00.000Z"),
      windowEnd: new Date("2026-05-29T00:00:00.000Z"),
      records: [
        {
          objectType: "issue",
          externalId: "LIN-42",
          sourceCreatedAt: new Date("2026-05-01T09:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-05-20T10:00:00.000Z"),
          occurredAt: new Date("2026-05-20T10:00:00.000Z"),
          payload: {
            id: "LIN-42",
            title: "Ship activation instrumentation",
            state: "Done",
          },
        },
      ],
    });

    expect(result).toEqual({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
      statusPersistenceErrors: [],
    });
    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: IntegrationProvider.LINEAR,
        status: "ERROR",
        mode: "historical",
        windowStart: new Date("2025-04-29T00:00:00.000Z"),
        windowEnd: new Date("2026-05-29T00:00:00.000Z"),
        userId: "user_1",
        organizationId: "org_1",
      }),
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith({
      where: {
        provider_objectType_externalId_scopeKey: {
          provider: IntegrationProvider.LINEAR,
          objectType: "issue",
          externalId: "LIN-42",
          scopeKey: "org:org_1",
        },
      },
      create: expect.objectContaining({
        syncRunId: "sync_1",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-42",
        scopeKey: "org:org_1",
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userId: "user_1",
        organizationId: "org_1",
      }),
      update: expect.objectContaining({
        syncRunId: "sync_1",
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "SUCCESS",
        recordCount: 1,
        acceptedCount: 1,
        errorCount: 0,
        completedAt: expect.any(Date),
      }),
    });
  });

  it("uses the injected clock for sync-run completion metadata", async () => {
    const { prisma } = createPrismaMock();
    const now = new Date("2026-05-29T12:34:56.000Z");

    await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now,
      records: [
        {
          objectType: "issue",
          externalId: "LIN-CLOCK",
          payload: { id: "LIN-CLOCK", title: "Deterministic sync run timestamps" },
        },
      ],
    });

    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startedAt: now,
      }),
    });
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        completedAt: now,
      }),
    });
  });

  it("normalizes sync-run mode metadata before creating sync runs", async () => {
    const formattedMode = createPrismaMock();

    await ingestImladrisRawRecords({
      prisma: formattedMode.prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      mode: " Historical Backfill ",
      records: [
        {
          objectType: "issue",
          externalId: "LIN-MODE-FORMATTED",
          payload: { id: "LIN-MODE-FORMATTED" },
        },
      ],
    });

    expect(formattedMode.prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: "historical_backfill",
      }),
    });

    const blankMode = createPrismaMock();

    await ingestImladrisRawRecords({
      prisma: blankMode.prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      mode: "   ",
      records: [
        {
          objectType: "issue",
          externalId: "LIN-MODE-BLANK",
          payload: { id: "LIN-MODE-BLANK" },
        },
      ],
    });

    expect(blankMode.prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: "incremental",
      }),
    });
  });

  it("records completion time after raw record processing when no clock is injected", async () => {
    vi.useFakeTimers();
    try {
      const startedAt = new Date("2026-05-29T12:00:00.000Z");
      const completedAt = new Date("2026-05-29T12:00:05.000Z");
      vi.setSystemTime(startedAt);
      const { prisma } = createPrismaMock();
      prisma.imladrisRawSourceRecord.upsert.mockImplementationOnce(async ({ create }) => {
        vi.setSystemTime(completedAt);
        return create;
      });

      await ingestImladrisRawRecords({
        prisma: prisma as never,
        provider: IntegrationProvider.LINEAR,
        context: {
          userId: "user_1",
          organizationId: "org_1",
        },
        records: [
          {
            objectType: "issue",
            externalId: "LIN-CLOCK-ADVANCE",
            payload: { id: "LIN-CLOCK-ADVANCE" },
          },
        ],
      });

      expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          startedAt,
        }),
      });
      expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
        where: { id: "sync_1" },
        data: expect.objectContaining({
          completedAt,
        }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops non-JSON checkpoint metadata instead of poisoning sync-run creation", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: {
        cursor: BigInt(42),
      },
      records: [
        {
          objectType: "issue",
          externalId: "LIN-CHECKPOINT",
          payload: { id: "LIN-CHECKPOINT", title: "Checkpoint should not block ingestion" },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: IntegrationProvider.LINEAR,
        checkpoint: undefined,
      }),
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
  });

  it("drops lossy checkpoint containers instead of serializing them as empty objects", async () => {
    const { prisma } = createPrismaMock();

    await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      checkpoint: {
        seenIds: new Set(["LIN-1", "LIN-2"]),
      },
      records: [
        {
          objectType: "issue",
          externalId: "LIN-CHECKPOINT-CONTAINER",
          payload: { id: "LIN-CHECKPOINT-CONTAINER" },
        },
      ],
    });

    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checkpoint: undefined,
      }),
    });
  });

  it("falls back to the historical sync window when supplied window dates are invalid or inverted", async () => {
    const { prisma } = createPrismaMock();
    const now = new Date("2026-05-29T12:00:00.000Z");

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now,
      windowStart: new Date("not-a-date") as never,
      windowEnd: new Date("2025-01-01T00:00:00.000Z"),
      records: [
        {
          objectType: "issue",
          externalId: "LIN-WINDOW",
          payload: { id: "LIN-WINDOW", title: "Window metadata should be safe" },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        windowStart: new Date("2025-04-29T12:00:00.000Z"),
        windowEnd: new Date("2026-05-29T12:00:00.000Z"),
      }),
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
  });

  it("preserves valid partial sync windows while defaulting the missing side", async () => {
    const { prisma } = createPrismaMock();
    const now = new Date("2026-05-29T12:00:00.000Z");

    await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now,
      windowStart: new Date("2026-01-01T00:00:00.000Z"),
      records: [
        {
          objectType: "issue",
          externalId: "LIN-PARTIAL-WINDOW",
          payload: { id: "LIN-PARTIAL-WINDOW" },
        },
      ],
    });

    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        windowStart: new Date("2026-01-01T00:00:00.000Z"),
        windowEnd: new Date("2026-05-29T12:00:00.000Z"),
      }),
    });
  });

  it("caps future sync window ends at the ingestion clock", async () => {
    const { prisma } = createPrismaMock();
    const now = new Date("2026-05-29T12:00:00.000Z");

    await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now,
      windowStart: new Date("2026-05-01T00:00:00.000Z"),
      windowEnd: new Date("2099-01-01T00:00:00.000Z"),
      records: [
        {
          objectType: "issue",
          externalId: "LIN-FUTURE-WINDOW",
          payload: { id: "LIN-FUTURE-WINDOW" },
        },
      ],
    });

    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        windowStart: new Date("2026-05-01T00:00:00.000Z"),
        windowEnd: now,
      }),
    });
  });

  it("marks partial sync runs when an individual raw record cannot be persisted", async () => {
    const { prisma } = createPrismaMock();
    vi.mocked(prisma.imladrisRawSourceRecord.upsert)
      .mockResolvedValueOnce({ id: "raw_1" })
      .mockRejectedValueOnce(new Error("unique constraint unavailable"));

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.GITHUB,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "pull_request",
          externalId: "repo/pull/7",
          payload: { id: 7, merged: true },
        },
        {
          objectType: "pull_request",
          externalId: "repo/pull/8",
          payload: { id: 8, merged: false },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "PARTIAL",
      recordCount: 2,
      acceptedCount: 1,
      errorCount: 1,
    });
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "PARTIAL",
        recordCount: 2,
        acceptedCount: 1,
        errorCount: 1,
        lastError: "unique constraint unavailable",
      }),
    });
  });

  it("rejects raw records with blank identities without writing ambiguous upserts", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        { objectType: "", externalId: "LIN-42", payload: { title: "No object type" } },
        { objectType: "issue", externalId: "   ", payload: { title: "No external ID" } },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "ERROR",
      recordCount: 2,
      acceptedCount: 0,
      errorCount: 2,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).not.toHaveBeenCalled();
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "ERROR",
        recordCount: 2,
        acceptedCount: 0,
        errorCount: 2,
        lastError: "raw record 2 rejected: externalId is required",
      }),
    });
  });

  it("rejects non-string raw record identities with precise per-record errors", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.HUBSPOT,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: 42,
          externalId: "deal_1",
          payload: { amount: 12_000 },
        },
        {
          objectType: "deal",
          externalId: { id: "deal_2" },
          payload: { amount: 24_000 },
        },
      ] as never,
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "ERROR",
      recordCount: 2,
      acceptedCount: 0,
      errorCount: 2,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).not.toHaveBeenCalled();
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "ERROR",
        recordCount: 2,
        acceptedCount: 0,
        errorCount: 2,
        lastError: "raw record 2 rejected: externalId must be a string",
      }),
    });
  });

  it("isolates non-JSON provider payload failures to the offending raw record", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.STRIPE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "subscription",
          externalId: "sub_valid",
          payload: { id: "sub_valid", monthlyRecurringRevenue: 1200 },
        },
        {
          objectType: "subscription",
          externalId: "sub_bigint",
          payload: { id: "sub_bigint", monthlyRecurringRevenue: BigInt(1200) },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "PARTIAL",
      recordCount: 2,
      acceptedCount: 1,
      errorCount: 1,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_valid",
            scopeKey: "org:org_1",
          },
        },
      }),
    );
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "PARTIAL",
        recordCount: 2,
        acceptedCount: 1,
        errorCount: 1,
        lastError: "raw record 2 rejected: payload must be JSON-serializable",
      }),
    });
  });

  it("rejects lossy provider payload containers instead of persisting empty objects", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.STRIPE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "subscription",
          externalId: "sub_valid",
          payload: { id: "sub_valid", monthlyRecurringRevenue: 1200 },
        },
        {
          objectType: "subscription",
          externalId: "sub_map",
          payload: {
            id: "sub_map",
            metadata: new Map([["plan", "enterprise"]]),
          },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "PARTIAL",
      recordCount: 2,
      acceptedCount: 1,
      errorCount: 1,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_valid",
            scopeKey: "org:org_1",
          },
        },
      }),
    );
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "PARTIAL",
        recordCount: 2,
        acceptedCount: 1,
        errorCount: 1,
        lastError: "raw record 2 rejected: payload must be JSON-serializable",
      }),
    });
  });

  it("rejects non-finite provider numbers instead of silently coercing them to null", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.GOOGLE_ADS,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "campaign_metric",
          externalId: "campaign_valid",
          payload: { campaignId: "campaign_valid", spend: 1200, clicks: 42 },
        },
        {
          objectType: "campaign_metric",
          externalId: "campaign_nan",
          payload: { campaignId: "campaign_nan", spend: Number.NaN, clicks: 7 },
        },
        {
          objectType: "campaign_metric",
          externalId: "campaign_infinity",
          payload: { campaignId: "campaign_infinity", spend: Infinity, clicks: 9 },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "PARTIAL",
      recordCount: 3,
      acceptedCount: 1,
      errorCount: 2,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "campaign_valid",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          payload: { campaignId: "campaign_valid", clicks: 42, spend: 1200 },
        }),
      }),
    );
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "PARTIAL",
        recordCount: 3,
        acceptedCount: 1,
        errorCount: 2,
        lastError: "raw record 3 rejected: payload must be JSON-serializable",
      }),
    });
  });

  it("normalizes undefined array entries to null before raw persistence", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.POSTHOG,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "event",
          externalId: "evt_sparse_array",
          payload: {
            event: "activation_completed",
            samples: [1, undefined, null, { keep: true, drop: undefined }],
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: {
            event: "activation_completed",
            samples: [1, null, null, { keep: true }],
          },
        }),
        update: expect.objectContaining({
          payload: {
            event: "activation_completed",
            samples: [1, null, null, { keep: true }],
          },
        }),
      }),
    );
  });

  it("normalizes sparse array holes to null before raw persistence", async () => {
    const { prisma } = createPrismaMock();
    const samples = Array(3);
    samples[0] = "first";
    samples[2] = "third";

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.POSTHOG,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "event",
          externalId: "evt_sparse_hole",
          payload: {
            event: "activation_completed",
            samples,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: {
            event: "activation_completed",
            samples: ["first", null, "third"],
          },
        }),
        update: expect.objectContaining({
          payload: {
            event: "activation_completed",
            samples: ["first", null, "third"],
          },
        }),
      }),
    );
  });

  it("nulls invalid provider date fields instead of poisoning raw record persistence", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.PYLON,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "conversation",
          externalId: "conv_1",
          sourceCreatedAt: "not-a-date",
          sourceUpdatedAt: "999999999999999999999999",
          occurredAt: "2026-05-20T10:00:00.000Z",
          payload: {
            id: "conv_1",
            subject: "Provider returned malformed timestamps",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceCreatedAt: null,
          sourceUpdatedAt: null,
          occurredAt: new Date("2026-05-20T10:00:00.000Z"),
        }),
        update: expect.objectContaining({
          sourceCreatedAt: null,
          sourceUpdatedAt: null,
          occurredAt: new Date("2026-05-20T10:00:00.000Z"),
        }),
      }),
    );
  });

  it("normalizes Unix timestamp record dates and sync windows before raw persistence", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.STRIPE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      windowStart: "1769904000" as never,
      windowEnd: "1772236800000" as never,
      records: [
        {
          objectType: "subscription",
          externalId: "sub_unix_dates",
          sourceCreatedAt: 1770800400 as never,
          sourceUpdatedAt: "1770800400000",
          occurredAt: "1770800400",
          payload: {
            id: "sub_unix_dates",
            status: "active",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        windowStart: new Date("2026-02-01T00:00:00.000Z"),
        windowEnd: new Date("2026-02-28T00:00:00.000Z"),
      }),
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceCreatedAt: new Date("2026-02-11T09:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
          occurredAt: new Date("2026-02-11T09:00:00.000Z"),
        }),
        update: expect.objectContaining({
          sourceCreatedAt: new Date("2026-02-11T09:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
          occurredAt: new Date("2026-02-11T09:00:00.000Z"),
        }),
      }),
    );
  });

  it("normalizes decimal Unix timestamp strings before raw persistence", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.POSTHOG,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      windowStart: "1769904000.25" as never,
      windowEnd: "1772236800.5" as never,
      records: [
        {
          objectType: "event",
          externalId: "evt_decimal_unix_dates",
          sourceCreatedAt: "1770800400.25",
          sourceUpdatedAt: "1770800400.5",
          occurredAt: "1770800400.75",
          payload: {
            event: "activation_completed",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        windowStart: new Date("2026-02-01T00:00:00.250Z"),
        windowEnd: new Date("2026-02-28T00:00:00.500Z"),
      }),
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceCreatedAt: new Date("2026-02-11T09:00:00.250Z"),
          sourceUpdatedAt: new Date("2026-02-11T09:00:00.500Z"),
          occurredAt: new Date("2026-02-11T09:00:00.750Z"),
        }),
        update: expect.objectContaining({
          sourceCreatedAt: new Date("2026-02-11T09:00:00.250Z"),
          sourceUpdatedAt: new Date("2026-02-11T09:00:00.500Z"),
          occurredAt: new Date("2026-02-11T09:00:00.750Z"),
        }),
      }),
    );
  });

  it("persists only the freshest duplicate raw input in a single sync run", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.HUBSPOT,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "deal",
          externalId: "deal_duplicate",
          sourceCreatedAt: "2026-05-01T09:00:00.000Z",
          sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
          occurredAt: "2026-05-01T09:00:00.000Z",
          payload: {
            id: "deal_duplicate",
            amount: 42_000,
          },
        },
        {
          objectType: "deal",
          externalId: "deal_duplicate",
          sourceCreatedAt: "2026-05-01T09:00:00.000Z",
          sourceUpdatedAt: "2026-05-01T10:00:00.000Z",
          occurredAt: "2026-05-01T09:00:00.000Z",
          payload: {
            id: "deal_duplicate",
            amount: 12_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceUpdatedAt: new Date("2026-05-31T10:00:00.000Z"),
          payload: {
            amount: 42_000,
            id: "deal_duplicate",
          },
        }),
        update: expect.objectContaining({
          sourceUpdatedAt: new Date("2026-05-31T10:00:00.000Z"),
          payload: {
            amount: 42_000,
            id: "deal_duplicate",
          },
        }),
      }),
    );
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 1,
        errorCount: 0,
      }),
    });
  });

  it("canonicalizes raw object types before deduping batch inputs", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.STRIPE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "SubscriptionItem",
          externalId: "si_duplicate",
          sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
          payload: {
            id: "si_duplicate",
            amount: 42_000,
          },
        },
        {
          objectType: " subscription_item ",
          externalId: "si_duplicate",
          sourceUpdatedAt: "2026-05-01T10:00:00.000Z",
          payload: {
            id: "si_duplicate",
            amount: 12_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription_item",
            externalId: "si_duplicate",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          objectType: "subscription_item",
          sourceUpdatedAt: new Date("2026-05-31T10:00:00.000Z"),
          payload: {
            amount: 42_000,
            id: "si_duplicate",
          },
        }),
        update: expect.objectContaining({
          sourceUpdatedAt: new Date("2026-05-31T10:00:00.000Z"),
          payload: {
            amount: 42_000,
            id: "si_duplicate",
          },
        }),
      }),
    );
  });

  it("does not let future provider timestamps win duplicate freshness ranking", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.HUBSPOT,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-05-29T10:00:00.000Z"),
      records: [
        {
          objectType: "deal",
          externalId: "deal_future_skew",
          sourceUpdatedAt: "2026-05-29T09:45:00.000Z",
          payload: {
            id: "deal_future_skew",
            amount: 42_000,
            stage: "contract_sent",
          },
        },
        {
          objectType: "deal",
          externalId: "deal_future_skew",
          sourceUpdatedAt: "2099-01-01T00:00:00.000Z",
          occurredAt: "2026-05-01T00:00:00.000Z",
          payload: {
            id: "deal_future_skew",
            amount: 12_000,
            stage: "old_stage_with_bad_clock",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceUpdatedAt: new Date("2026-05-29T09:45:00.000Z"),
          payload: {
            amount: 42_000,
            id: "deal_future_skew",
            stage: "contract_sent",
          },
        }),
        update: expect.objectContaining({
          sourceUpdatedAt: new Date("2026-05-29T09:45:00.000Z"),
          payload: {
            amount: 42_000,
            id: "deal_future_skew",
            stage: "contract_sent",
          },
        }),
      }),
    );
  });

  it("keeps an undated duplicate when the competing duplicate is only future-dated", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.HUBSPOT,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-05-29T10:00:00.000Z"),
      records: [
        {
          objectType: "deal",
          externalId: "deal_future_only_tie",
          payload: {
            id: "deal_future_only_tie",
            amount: 42_000,
            stage: "contract_sent",
          },
        },
        {
          objectType: "deal",
          externalId: "deal_future_only_tie",
          sourceUpdatedAt: "2099-01-01T00:00:00.000Z",
          payload: {
            id: "deal_future_only_tie",
            amount: 12_000,
            stage: "bad_future_clock",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceUpdatedAt: null,
          payload: {
            amount: 42_000,
            id: "deal_future_only_tie",
            stage: "contract_sent",
          },
        }),
        update: expect.objectContaining({
          sourceUpdatedAt: null,
          payload: {
            amount: 42_000,
            id: "deal_future_only_tie",
            stage: "contract_sent",
          },
        }),
      }),
    );
  });

  it("returns accepted raw records with a persistence warning when the final sync-run status update fails", async () => {
    const { prisma } = createPrismaMock();
    vi.mocked(prisma.imladrisSourceSyncRun.update).mockRejectedValueOnce(
      new Error("sync run update unavailable"),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "issue",
          externalId: "LIN-42",
          payload: { id: "LIN-42", title: "Persisted before metadata failure" },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
      statusPersistenceErrors: [
        "imladrisSourceSyncRun status persistence failed: sync run update unavailable",
      ],
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "imladris_raw_ingestion.sync_run_status_persist_failed",
      expect.objectContaining({
        provider: IntegrationProvider.LINEAR,
        syncRunId: "sync_1",
        persistenceError: "sync run update unavailable",
      }),
    );
    consoleError.mockRestore();
  });

  it("partitions raw upserts by organization or user scope to avoid cross-tenant overwrites", async () => {
    const { prisma } = createPrismaMock();

    await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [{ objectType: "issue", externalId: "LIN-42", payload: { title: "Org 1" } }],
    });
    await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_2",
        organizationId: "org_2",
      },
      records: [{ objectType: "issue", externalId: "LIN-42", payload: { title: "Org 2" } }],
    });
    await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: "user_3",
        organizationId: null,
      },
      records: [{ objectType: "issue", externalId: "LIN-42", payload: { title: "User 3" } }],
    });

    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.LINEAR,
            objectType: "issue",
            externalId: "LIN-42",
            scopeKey: "org:org_1",
          },
        },
      }),
    );
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.LINEAR,
            objectType: "issue",
            externalId: "LIN-42",
            scopeKey: "org:org_2",
          },
        },
      }),
    );
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.LINEAR,
            objectType: "issue",
            externalId: "LIN-42",
            scopeKey: "user:user_3",
          },
        },
      }),
    );
  });

  it("normalizes blank tenant context before creating sync runs and raw scopes", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.LINEAR,
      context: {
        userId: " user_1 ",
        organizationId: "   ",
      },
      records: [{ objectType: "issue", externalId: "LIN-CONTEXT", payload: { title: "Scoped" } }],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisSourceSyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        organizationId: null,
      }),
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith({
      where: {
        provider_objectType_externalId_scopeKey: {
          provider: IntegrationProvider.LINEAR,
          objectType: "issue",
          externalId: "LIN-CONTEXT",
          scopeKey: "user:user_1",
        },
      },
      create: expect.objectContaining({
        scopeKey: "user:user_1",
        userId: "user_1",
        organizationId: null,
      }),
      update: expect.objectContaining({
        userId: "user_1",
        organizationId: null,
      }),
    });
  });
});

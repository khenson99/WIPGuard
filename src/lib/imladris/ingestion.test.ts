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

  it("normalizes checkpoint containers instead of serializing them as empty objects", async () => {
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
        checkpoint: {
          seenIds: ["LIN-1", "LIN-2"],
        },
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

  it("normalizes numeric external identifiers before raw persistence", async () => {
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
          externalId: 1234567890,
          payload: {
            campaignId: 1234567890,
            spend: "1,250.00",
          },
        },
      ] as never,
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "1234567890",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          externalId: "1234567890",
        }),
        update: expect.objectContaining({
          payload: {
            campaignId: 1234567890,
            spend: "1,250.00",
          },
        }),
      }),
    );
  });

  it("unwraps scalar record identity envelopes before raw persistence", async () => {
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
          objectType: { value: " SubscriptionItem " },
          externalId: { data: { attributes: { value: "si_wrapped_identity" } } },
          payload: { id: "si_wrapped_identity" },
        },
      ] as never,
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription_item",
            externalId: "si_wrapped_identity",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          objectType: "subscription_item",
          externalId: "si_wrapped_identity",
        }),
      }),
    );
  });

  it("unwraps JSON API record identity envelopes before raw persistence", async () => {
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
          objectType: {
            data: {
              type: "SubscriptionItem",
              id: "ignored_for_object_type",
            },
          },
          externalId: {
            data: {
              type: "subscription_items",
              id: "si_json_api_identity",
            },
          },
          payload: { id: "si_json_api_identity" },
        },
      ] as never,
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription_item",
            externalId: "si_json_api_identity",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          objectType: "subscription_item",
          externalId: "si_json_api_identity",
        }),
      }),
    );
  });

  it("unwraps provider SDK id envelopes before raw persistence", async () => {
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
          externalId: { id: "deal_wrapped_id" },
          payload: { id: "deal_wrapped_id", amount: 24_000 },
        },
      ] as never,
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_wrapped_id",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          objectType: "deal",
          externalId: "deal_wrapped_id",
        }),
      }),
    );
  });

  it("rejects ambiguous numeric external identifiers before raw persistence", async () => {
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
          externalId: 1234567890,
          payload: { campaignId: 1234567890 },
        },
        {
          objectType: "campaign_metric",
          externalId: 123.45,
          payload: { campaignId: 123.45 },
        },
        {
          objectType: "campaign_metric",
          externalId: Number.MAX_SAFE_INTEGER + 1,
          payload: { campaignId: Number.MAX_SAFE_INTEGER + 1 },
        },
      ] as never,
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
            externalId: "1234567890",
            scopeKey: "org:org_1",
          },
        },
      }),
    );
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "PARTIAL",
        recordCount: 3,
        acceptedCount: 1,
        errorCount: 2,
        lastError: "raw record 3 rejected: externalId must be a string or safe integer",
      }),
    });
  });

  it("rejects invalid raw record identities with precise per-record errors", async () => {
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
          externalId: { identifiers: ["deal_2"] },
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
        lastError: "raw record 2 rejected: externalId must be a string or safe integer",
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

  it("normalizes Map and Set provider payload containers instead of persisting empty objects", async () => {
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
            tags: new Set(["annual", "priority"]),
          },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenNthCalledWith(
      1,
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
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_map",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          payload: {
            id: "sub_map",
            metadata: {
              plan: "enterprise",
            },
            tags: ["annual", "priority"],
          },
        }),
        update: expect.objectContaining({
          payload: {
            id: "sub_map",
            metadata: {
              plan: "enterprise",
            },
            tags: ["annual", "priority"],
          },
        }),
      }),
    );
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 2,
        errorCount: 0,
        lastError: null,
      }),
    });
  });

  it("normalizes object-shaped Map keys without collapsing distinct provider payload entries", async () => {
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
          externalId: "sub_object_key_map",
          payload: {
            id: "sub_object_key_map",
            usageByPrice: new Map([
              [{ priceId: "price_enterprise", dimension: "seats" }, 42],
              [{ priceId: "price_enterprise", dimension: "api_calls" }, 12_000],
            ]),
          },
        },
      ],
    });

    const expectedUsageByPrice = {
      'object:{"dimension":"api_calls","priceId":"price_enterprise"}': 12_000,
      'object:{"dimension":"seats","priceId":"price_enterprise"}': 42,
    };

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
            id: "sub_object_key_map",
            usageByPrice: expectedUsageByPrice,
          },
        }),
        update: expect.objectContaining({
          payload: {
            id: "sub_object_key_map",
            usageByPrice: expectedUsageByPrice,
          },
        }),
      }),
    );
  });

  it("preserves Map payloads with keys that would collide after string coercion", async () => {
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
          externalId: "sub_colliding_map_key",
          payload: {
            id: "sub_colliding_map_key",
            usageByTier: new Map<unknown, unknown>([
              ["1", "string-key-tier"],
              [1, "numeric-key-tier"],
              ["boolean:true", "string-boolean-tier"],
              [true, "boolean-tier"],
            ]),
          },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledTimes(2);
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
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_colliding_map_key",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          payload: {
            id: "sub_colliding_map_key",
            usageByTier: {
              "1": "string-key-tier",
              "number:1": "numeric-key-tier",
              "boolean:true": "boolean-tier",
              "string:boolean:true": "string-boolean-tier",
            },
          },
        }),
        update: expect.objectContaining({
          payload: {
            id: "sub_colliding_map_key",
            usageByTier: {
              "1": "string-key-tier",
              "number:1": "numeric-key-tier",
              "boolean:true": "boolean-tier",
              "string:boolean:true": "string-boolean-tier",
            },
          },
        }),
      }),
    );
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 2,
        errorCount: 0,
        lastError: null,
      }),
    });
  });

  it("preserves bigint Map keys as typed labels during raw persistence", async () => {
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
          externalId: "sub_bigint_map_key",
          payload: {
            id: "sub_bigint_map_key",
            usageByTier: new Map<unknown, unknown>([
              [BigInt(1), "bigint-tier"],
              ["bigint:1", "string-bigint-label"],
            ]),
          },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: {
            id: "sub_bigint_map_key",
            usageByTier: {
              "bigint:1": "bigint-tier",
              "string:bigint:1": "string-bigint-label",
            },
          },
        }),
        update: expect.objectContaining({
          payload: {
            id: "sub_bigint_map_key",
            usageByTier: {
              "bigint:1": "bigint-tier",
              "string:bigint:1": "string-bigint-label",
            },
          },
        }),
      }),
    );
  });

  it("does not treat dropped Map entries as duplicate normalized keys", async () => {
    const { prisma } = createPrismaMock();
    class OptionalProviderValue {
      toJSON() {
        return undefined;
      }
    }

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
          externalId: "sub_dropped_map_key",
          payload: {
            id: "sub_dropped_map_key",
            usageByTier: new Map<unknown, unknown>([
              ["1", new OptionalProviderValue()],
              [1, "numeric-key-tier"],
            ]),
          },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: {
            id: "sub_dropped_map_key",
            usageByTier: {
              "number:1": "numeric-key-tier",
            },
          },
        }),
        update: expect.objectContaining({
          payload: {
            id: "sub_dropped_map_key",
            usageByTier: {
              "number:1": "numeric-key-tier",
            },
          },
        }),
      }),
    );
  });

  it("does not reject dropped Map entries with non-serializable keys", async () => {
    const { prisma } = createPrismaMock();
    class OptionalProviderValue {
      toJSON() {
        return undefined;
      }
    }

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
          externalId: "sub_dropped_bad_map_key",
          payload: {
            id: "sub_dropped_bad_map_key",
            usageByTier: new Map<unknown, unknown>([
              [Symbol("optional-provider-key"), new OptionalProviderValue()],
              ["1", "string-key-tier"],
            ]),
          },
        },
      ],
    });

    expect(result).toMatchObject({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 1,
      acceptedCount: 1,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: {
            id: "sub_dropped_bad_map_key",
            usageByTier: {
              "1": "string-key-tier",
            },
          },
        }),
        update: expect.objectContaining({
          payload: {
            id: "sub_dropped_bad_map_key",
            usageByTier: {
              "1": "string-key-tier",
            },
          },
        }),
      }),
    );
  });

  it("normalizes provider SDK payload objects with toJSON before raw persistence", async () => {
    const { prisma } = createPrismaMock();
    class ProviderAmount {
      constructor(private readonly cents: number) {}

      toJSON() {
        return {
          amount_cents: this.cents,
          currency: "usd",
        };
      }
    }

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.STRIPE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "charge",
          externalId: "ch_sdk_to_json",
          payload: {
            id: "ch_sdk_to_json",
            amount: new ProviderAmount(125_000),
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
            amount: {
              amount_cents: 125_000,
              currency: "usd",
            },
            id: "ch_sdk_to_json",
          },
        }),
        update: expect.objectContaining({
          payload: {
            amount: {
              amount_cents: 125_000,
              currency: "usd",
            },
            id: "ch_sdk_to_json",
          },
        }),
      }),
    );
  });

  it("drops optional provider SDK payload fields whose toJSON returns undefined", async () => {
    const { prisma } = createPrismaMock();
    class ProviderValue {
      constructor(private readonly value: unknown) {}

      toJSON() {
        return this.value;
      }
    }

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.STRIPE,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      records: [
        {
          objectType: "charge",
          externalId: "ch_optional_sdk_to_json",
          payload: {
            id: "ch_optional_sdk_to_json",
            amount: new ProviderValue(125_000),
            optionalMetadata: new ProviderValue(undefined),
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
            amount: 125_000,
            id: "ch_optional_sdk_to_json",
          },
        }),
        update: expect.objectContaining({
          payload: {
            amount: 125_000,
            id: "ch_optional_sdk_to_json",
          },
        }),
      }),
    );
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

  it("unwraps provider timestamp envelopes before sync-window and raw timestamp persistence", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.POSTHOG,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      windowStart: { value: "2026-02-01T00:00:00.000Z" } as never,
      windowEnd: { data: { value: "2026-02-28T00:00:00.000Z" } } as never,
      records: [
        {
          objectType: "event",
          externalId: "evt_wrapped_dates",
          sourceCreatedAt: { value: "2026-02-11T09:00:00.000Z" } as never,
          sourceUpdatedAt: { data: { attributes: { value: "2026-02-11T09:01:00.000Z" } } } as never,
          occurredAt: { values: { value: "1770800520" } } as never,
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
        windowStart: new Date("2026-02-01T00:00:00.000Z"),
        windowEnd: new Date("2026-02-28T00:00:00.000Z"),
      }),
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceCreatedAt: new Date("2026-02-11T09:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-02-11T09:01:00.000Z"),
          occurredAt: new Date("2026-02-11T09:02:00.000Z"),
        }),
        update: expect.objectContaining({
          sourceCreatedAt: new Date("2026-02-11T09:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-02-11T09:01:00.000Z"),
          occurredAt: new Date("2026-02-11T09:02:00.000Z"),
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
      acceptedCount: 2,
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
        acceptedCount: 2,
        errorCount: 0,
      }),
    });
  });

  it("counts deduplicated raw inputs as accepted sync-run records", async () => {
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
          externalId: "deal_duplicate_counted",
          sourceUpdatedAt: "2026-05-31T10:00:00.000Z",
          payload: {
            id: "deal_duplicate_counted",
            amount: 42_000,
          },
        },
        {
          objectType: "deal",
          externalId: "deal_duplicate_counted",
          sourceUpdatedAt: "2026-05-01T10:00:00.000Z",
          payload: {
            id: "deal_duplicate_counted",
            amount: 12_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisSourceSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync_1" },
      data: expect.objectContaining({
        status: "SUCCESS",
        recordCount: 2,
        acceptedCount: 2,
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
      acceptedCount: 2,
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
      acceptedCount: 2,
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
      acceptedCount: 2,
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

  it("does not let future-skewed duplicate metadata beat a clean freshness tie", async () => {
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
          externalId: "deal_future_metadata_tie",
          sourceUpdatedAt: "2026-05-29T09:45:00.000Z",
          payload: {
            id: "deal_future_metadata_tie",
            amount: 42_000,
            stage: "contract_sent",
          },
        },
        {
          objectType: "deal",
          externalId: "deal_future_metadata_tie",
          sourceUpdatedAt: "2026-05-29T09:45:00.000Z",
          occurredAt: "2099-01-01T00:00:00.000Z",
          payload: {
            id: "deal_future_metadata_tie",
            amount: 12_000,
            primaryContactEmail: "future-skew@example.com",
            stage: "bad_future_clock",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceUpdatedAt: new Date("2026-05-29T09:45:00.000Z"),
          occurredAt: null,
          payload: {
            amount: 42_000,
            id: "deal_future_metadata_tie",
            stage: "contract_sent",
          },
        }),
        update: expect.objectContaining({
          sourceUpdatedAt: new Date("2026-05-29T09:45:00.000Z"),
          occurredAt: null,
          payload: {
            amount: 42_000,
            id: "deal_future_metadata_tie",
            stage: "contract_sent",
          },
        }),
      }),
    );
  });

  it("keeps the more complete duplicate when provider freshness ties", async () => {
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
          externalId: "deal_tie_complete",
          sourceUpdatedAt: "2026-05-29T09:45:00.000Z",
          payload: {
            id: "deal_tie_complete",
            amount: 42_000,
            stage: "contract_sent",
            primaryContactEmail: "buyer@example.com",
          },
        },
        {
          objectType: "deal",
          externalId: "deal_tie_complete",
          sourceUpdatedAt: "2026-05-29T09:45:00.000Z",
          payload: {
            id: "deal_tie_complete",
            amount: 42_000,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledOnce();
    expect(prisma.imladrisRawSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: {
            amount: 42_000,
            id: "deal_tie_complete",
            primaryContactEmail: "buyer@example.com",
            stage: "contract_sent",
          },
        }),
        update: expect.objectContaining({
          payload: {
            amount: 42_000,
            id: "deal_tie_complete",
            primaryContactEmail: "buyer@example.com",
            stage: "contract_sent",
          },
        }),
      }),
    );
  });

  it("nulls future provider timestamps before raw persistence", async () => {
    const { prisma } = createPrismaMock();

    const result = await ingestImladrisRawRecords({
      prisma: prisma as never,
      provider: IntegrationProvider.GITHUB,
      context: {
        userId: "user_1",
        organizationId: "org_1",
      },
      now: new Date("2026-05-29T10:00:00.000Z"),
      records: [
        {
          objectType: "pull_request",
          externalId: "repo/pull/future-skew",
          sourceCreatedAt: "2099-01-01T00:00:00.000Z",
          sourceUpdatedAt: "2099-01-02T00:00:00.000Z",
          occurredAt: "2099-01-03T00:00:00.000Z",
          payload: {
            id: 42,
            merged: true,
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
          occurredAt: null,
        }),
        update: expect.objectContaining({
          sourceCreatedAt: null,
          sourceUpdatedAt: null,
          occurredAt: null,
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

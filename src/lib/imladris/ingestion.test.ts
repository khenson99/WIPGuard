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

  it("singularizes plural raw object types before persistence", async () => {
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
          objectType: "subscriptions",
          externalId: "sub_plural",
          payload: {
            id: "sub_plural",
            monthlyRecurringRevenue: 42_000,
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
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_plural",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          objectType: "subscription",
        }),
      }),
    );
  });

  it("preserves singular raw object types that already end in s", async () => {
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
          objectType: "business",
          externalId: "business_1",
          payload: {
            id: "business_1",
            name: "Imladris Metrics LLC",
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
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: IntegrationProvider.HUBSPOT,
            objectType: "business",
            externalId: "business_1",
            scopeKey: "org:org_1",
          },
        },
        create: expect.objectContaining({
          objectType: "business",
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
});

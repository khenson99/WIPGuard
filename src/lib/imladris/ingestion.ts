import { createHash } from "node:crypto";
import { ImladrisSyncStatus, type IntegrationProvider } from "@/generated/prisma/client";
import type { PrismaClientType } from "@/lib/prisma";

interface ImladrisActorContext {
  userId: string | null;
  organizationId: string | null;
}

export interface ImladrisRawRecordInput {
  objectType: string;
  externalId: string;
  sourceCreatedAt?: Date | string | null;
  sourceUpdatedAt?: Date | string | null;
  occurredAt?: Date | string | null;
  payload: unknown;
}

export interface IngestImladrisRawRecordsInput {
  prisma: PrismaClientType;
  provider: IntegrationProvider;
  context: ImladrisActorContext;
  records: ImladrisRawRecordInput[];
  mode?: "incremental" | "historical" | string;
  windowStart?: Date | null;
  windowEnd?: Date | null;
  checkpoint?: unknown;
  now?: Date;
}

export interface IngestImladrisRawRecordsResult {
  syncRunId: string;
  status: keyof typeof ImladrisSyncStatus;
  recordCount: number;
  acceptedCount: number;
  errorCount: number;
  statusPersistenceErrors?: string[];
}

type SourceSyncRunDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
};

type RawSourceRecordDelegate = {
  upsert(args: {
    where: {
      provider_objectType_externalId_scopeKey: {
        provider: IntegrationProvider;
        objectType: string;
        externalId: string;
        scopeKey: string;
      };
    };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeJson(entryValue)]),
  );
}

function payloadHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizeJson(payload)))
    .digest("hex");
}

function scopeKey(context: ImladrisActorContext): string {
  if (context.organizationId) return `org:${context.organizationId}`;
  if (context.userId) return `user:${context.userId}`;
  return "global";
}

function singularizeObjectType(value: string): string {
  if (value.endsWith("status")) return value;
  if (value.endsWith("ss")) return value;
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("ses")) return value.slice(0, -2);
  if (value.endsWith("s")) return value.slice(0, -1);
  return value;
}

function normalizeObjectType(value: string): string {
  return singularizeObjectType(
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase(),
  );
}

export function getImladrisHistoricalWindow(now = new Date()): {
  windowStart: Date;
  windowEnd: Date;
} {
  const windowEnd = new Date(now);
  const windowStart = new Date(now);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - 13);
  return { windowStart, windowEnd };
}

export async function ingestImladrisRawRecords(
  input: IngestImladrisRawRecordsInput,
): Promise<IngestImladrisRawRecordsResult> {
  const startedAt = input.now ?? new Date();
  const historicalWindow = getImladrisHistoricalWindow(startedAt);
  const syncRuns = input.prisma.imladrisSourceSyncRun as SourceSyncRunDelegate;
  const rawRecords = input.prisma.imladrisRawSourceRecord as RawSourceRecordDelegate;
  const rawRecordScopeKey = scopeKey(input.context);
  const syncRun = await syncRuns.create({
    data: {
      provider: input.provider,
      status: ImladrisSyncStatus.SUCCESS,
      mode: input.mode ?? "incremental",
      windowStart: input.windowStart ?? historicalWindow.windowStart,
      windowEnd: input.windowEnd ?? historicalWindow.windowEnd,
      checkpoint: input.checkpoint ?? undefined,
      userId: input.context.userId,
      organizationId: input.context.organizationId,
      startedAt,
      recordCount: input.records.length,
    },
  });

  let acceptedCount = 0;
  let errorCount = 0;
  let lastError: string | null = null;

  for (const record of input.records) {
    const objectType = normalizeObjectType(record.objectType);
    const hash = payloadHash(record.payload);
    const sourceCreatedAt = asDate(record.sourceCreatedAt);
    const sourceUpdatedAt = asDate(record.sourceUpdatedAt);
    const occurredAt = asDate(record.occurredAt);

    try {
      await rawRecords.upsert({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: input.provider,
            objectType,
            externalId: record.externalId,
            scopeKey: rawRecordScopeKey,
          },
        },
        create: {
          syncRunId: syncRun.id,
          provider: input.provider,
          objectType,
          externalId: record.externalId,
          scopeKey: rawRecordScopeKey,
          sourceCreatedAt,
          sourceUpdatedAt,
          occurredAt,
          payload: normalizeJson(record.payload),
          payloadHash: hash,
          userId: input.context.userId,
          organizationId: input.context.organizationId,
        },
        update: {
          syncRunId: syncRun.id,
          sourceCreatedAt,
          sourceUpdatedAt,
          occurredAt,
          payload: normalizeJson(record.payload),
          payloadHash: hash,
          userId: input.context.userId,
          organizationId: input.context.organizationId,
        },
      });
      acceptedCount += 1;
    } catch (error) {
      errorCount += 1;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  const status =
    errorCount === 0
      ? ImladrisSyncStatus.SUCCESS
      : acceptedCount > 0
        ? ImladrisSyncStatus.PARTIAL
        : ImladrisSyncStatus.ERROR;
  const statusPersistenceErrors: string[] = [];

  try {
    await syncRuns.update({
      where: { id: syncRun.id },
      data: {
        status,
        recordCount: input.records.length,
        acceptedCount,
        errorCount,
        completedAt: new Date(),
        lastError,
      },
    });
  } catch (error) {
    const persistenceError = error instanceof Error ? error.message : String(error);
    statusPersistenceErrors.push(
      `imladrisSourceSyncRun status persistence failed: ${persistenceError}`,
    );
    console.error("imladris_raw_ingestion.sync_run_status_persist_failed", {
      provider: input.provider,
      syncRunId: syncRun.id,
      persistenceError,
    });
  }

  return {
    syncRunId: syncRun.id,
    status,
    recordCount: input.records.length,
    acceptedCount,
    errorCount,
    statusPersistenceErrors,
  };
}

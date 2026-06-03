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
  sourceCreatedAt?: Date | string | number | null;
  sourceUpdatedAt?: Date | string | number | null;
  occurredAt?: Date | string | number | null;
  payload: unknown;
}

export interface IngestImladrisRawRecordsInput {
  prisma: PrismaClientType;
  provider: IntegrationProvider;
  context: ImladrisActorContext;
  records: ImladrisRawRecordInput[];
  mode?: "incremental" | "historical" | string;
  windowStart?: Date | string | number | null;
  windowEnd?: Date | string | number | null;
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

type NormalizedRawRecord = {
  objectType: string;
  externalId: string;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  occurredAt: Date | null;
  payload: unknown;
  payloadHash: string;
};

function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const timestampMs = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const timestamp = Number(normalized);
      if (Number.isFinite(timestamp) && timestamp > 0) {
        const timestampMs = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
        const date = new Date(timestampMs);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function normalizeJson(
  value: unknown,
  seen = new WeakSet<object>(),
  options: { isRoot?: boolean; arrayItem?: boolean } = { isRoot: true },
): unknown {
  if (value === undefined) {
    if (options.isRoot) {
      throw new Error("payload must be JSON-serializable");
    }
    return options.arrayItem ? null : undefined;
  }
  if (
    typeof value === "bigint" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new Error("payload must be JSON-serializable");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("payload must be JSON-serializable");
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error("payload must be JSON-serializable");
    }
    seen.add(value);
    const normalizedArray = Array.from(value, (item) =>
      normalizeJson(item, seen, { arrayItem: true }),
    );
    seen.delete(value);
    return normalizedArray;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) {
    throw new Error("payload must be JSON-serializable");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("payload must be JSON-serializable");
  }
  seen.add(value);

  const normalizedRecord = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeJson(entryValue, seen)]),
  );
  seen.delete(value);
  return normalizedRecord;
}

function payloadHash(normalizedPayload: unknown): string {
  const serializedPayload = JSON.stringify(normalizedPayload);
  if (serializedPayload === undefined) {
    throw new Error("payload must be JSON-serializable");
  }
  return createHash("sha256")
    .update(serializedPayload)
    .digest("hex");
}

function scopeKey(context: ImladrisActorContext): string {
  if (context.organizationId) return `org:${context.organizationId}`;
  if (context.userId) return `user:${context.userId}`;
  return "global";
}

function normalizeTenantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeContext(context: ImladrisActorContext): ImladrisActorContext {
  return {
    userId: normalizeTenantId(context.userId),
    organizationId: normalizeTenantId(context.organizationId),
  };
}

function normalizeSyncMode(mode: unknown): string {
  if (typeof mode !== "string") return "incremental";
  const normalized = mode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "incremental";
}

function recordRejection(index: number, reason: string): Error {
  return new Error(`raw record ${index + 1} rejected: ${reason}`);
}

function requiredRecordIdentity(
  value: unknown,
  field: "objectType" | "externalId",
  index: number,
): string {
  if (typeof value !== "string") {
    throw recordRejection(index, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw recordRejection(index, `${field} is required`);
  }
  return normalized;
}

function requiredObjectType(value: unknown, index: number): string {
  const normalized = requiredRecordIdentity(value, "objectType", index)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!normalized) {
    throw recordRejection(index, "objectType is required");
  }
  return normalized;
}

function normalizeRecordPayload(payload: unknown, index: number): unknown {
  try {
    return normalizeJson(payload);
  } catch {
    throw recordRejection(index, "payload must be JSON-serializable");
  }
}

function normalizeCheckpoint(checkpoint: unknown): unknown {
  if (checkpoint === undefined || checkpoint === null) return undefined;
  try {
    return normalizeJson(checkpoint);
  } catch {
    return undefined;
  }
}

function normalizeSyncWindow(
  windowStart: Date | string | number | null | undefined,
  windowEnd: Date | string | number | null | undefined,
  fallback: { windowStart: Date; windowEnd: Date },
): { windowStart: Date; windowEnd: Date } {
  const normalizedWindowStart = asDate(windowStart) ?? fallback.windowStart;
  const parsedWindowEnd = asDate(windowEnd) ?? fallback.windowEnd;
  const normalizedWindowEnd =
    parsedWindowEnd.getTime() > fallback.windowEnd.getTime()
      ? fallback.windowEnd
      : parsedWindowEnd;
  if (normalizedWindowStart.getTime() > normalizedWindowEnd.getTime()) {
    return fallback;
  }
  return {
    windowStart: normalizedWindowStart,
    windowEnd: normalizedWindowEnd,
  };
}

function freshnessTimestamp(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return date.getTime() <= now.getTime() ? date.getTime() : null;
}

function rawRecordFreshness(record: NormalizedRawRecord, now: Date): number {
  return (
    freshnessTimestamp(record.sourceUpdatedAt, now) ??
    freshnessTimestamp(record.occurredAt, now) ??
    freshnessTimestamp(record.sourceCreatedAt, now) ??
    0
  );
}

function hasFutureTimestamp(record: NormalizedRawRecord, now: Date): boolean {
  return [record.sourceUpdatedAt, record.occurredAt, record.sourceCreatedAt].some(
    (date) => date !== null && date.getTime() > now.getTime(),
  );
}

function preferRawRecord(
  current: NormalizedRawRecord | undefined,
  candidate: NormalizedRawRecord,
  now: Date,
): NormalizedRawRecord {
  if (!current) return candidate;
  const candidateFreshness = rawRecordFreshness(candidate, now);
  const currentFreshness = rawRecordFreshness(current, now);
  if (candidateFreshness !== currentFreshness) {
    return candidateFreshness > currentFreshness ? candidate : current;
  }
  if (candidateFreshness === 0) {
    const candidateHasFutureTimestamp = hasFutureTimestamp(candidate, now);
    const currentHasFutureTimestamp = hasFutureTimestamp(current, now);
    if (candidateHasFutureTimestamp !== currentHasFutureTimestamp) {
      return candidateHasFutureTimestamp ? current : candidate;
    }
  }
  return candidate;
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
  const context = normalizeContext(input.context);
  const rawRecordScopeKey = scopeKey(context);
  const checkpoint = normalizeCheckpoint(input.checkpoint);
  const syncWindow = normalizeSyncWindow(input.windowStart, input.windowEnd, historicalWindow);
  const syncRun = await syncRuns.create({
    data: {
      provider: input.provider,
      status: ImladrisSyncStatus.ERROR,
      mode: normalizeSyncMode(input.mode),
      windowStart: syncWindow.windowStart,
      windowEnd: syncWindow.windowEnd,
      checkpoint,
      userId: context.userId,
      organizationId: context.organizationId,
      startedAt,
      recordCount: input.records.length,
    },
  });

  let errorCount = 0;
  let lastError: string | null = null;
  const normalizedRecords = new Map<string, NormalizedRawRecord>();

  for (const [recordIndex, record] of input.records.entries()) {
    try {
      const objectType = requiredObjectType(record.objectType, recordIndex);
      const externalId = requiredRecordIdentity(record.externalId, "externalId", recordIndex);
      const normalizedPayload = normalizeRecordPayload(record.payload, recordIndex);
      const hash = payloadHash(normalizedPayload);
      const sourceCreatedAt = asDate(record.sourceCreatedAt);
      const sourceUpdatedAt = asDate(record.sourceUpdatedAt);
      const occurredAt = asDate(record.occurredAt);
      const normalizedRecord: NormalizedRawRecord = {
        objectType,
        externalId,
        sourceCreatedAt,
        sourceUpdatedAt,
        occurredAt,
        payload: normalizedPayload,
        payloadHash: hash,
      };
      const dedupeKey = `${objectType}:${externalId}:${rawRecordScopeKey}`;
      normalizedRecords.set(
        dedupeKey,
        preferRawRecord(normalizedRecords.get(dedupeKey), normalizedRecord, startedAt),
      );
    } catch (error) {
      errorCount += 1;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  let acceptedCount = 0;
  for (const record of normalizedRecords.values()) {
    try {
      await rawRecords.upsert({
        where: {
          provider_objectType_externalId_scopeKey: {
            provider: input.provider,
            objectType: record.objectType,
            externalId: record.externalId,
            scopeKey: rawRecordScopeKey,
          },
        },
        create: {
          syncRunId: syncRun.id,
          provider: input.provider,
          objectType: record.objectType,
          externalId: record.externalId,
          scopeKey: rawRecordScopeKey,
          sourceCreatedAt: record.sourceCreatedAt,
          sourceUpdatedAt: record.sourceUpdatedAt,
          occurredAt: record.occurredAt,
          payload: record.payload,
          payloadHash: record.payloadHash,
          userId: context.userId,
          organizationId: context.organizationId,
        },
        update: {
          syncRunId: syncRun.id,
          sourceCreatedAt: record.sourceCreatedAt,
          sourceUpdatedAt: record.sourceUpdatedAt,
          occurredAt: record.occurredAt,
          payload: record.payload,
          payloadHash: record.payloadHash,
          userId: context.userId,
          organizationId: context.organizationId,
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
  const completedAt = input.now ?? new Date();
  const statusPersistenceErrors: string[] = [];

  try {
    await syncRuns.update({
      where: { id: syncRun.id },
      data: {
        status,
        recordCount: input.records.length,
        acceptedCount,
        errorCount,
        completedAt,
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

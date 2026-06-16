import { createHash } from "node:crypto";
import { ImladrisSyncStatus, type IntegrationProvider } from "@/generated/prisma/client";
import { normalizeImladrisObjectType } from "@/lib/imladris/object-types";
import type { PrismaClientType } from "@/lib/prisma";

interface ImladrisActorContext {
  userId: string | null;
  organizationId: string | null;
}

export interface ImladrisRawRecordInput {
  objectType: string;
  externalId: string | number;
  sourceCreatedAt?: unknown;
  sourceUpdatedAt?: unknown;
  occurredAt?: unknown;
  payload: unknown;
}

export interface IngestImladrisRawRecordsInput {
  prisma: PrismaClientType;
  provider: IntegrationProvider;
  context: ImladrisActorContext;
  records: ImladrisRawRecordInput[];
  mode?: "incremental" | "historical" | string;
  windowStart?: unknown;
  windowEnd?: unknown;
  checkpoint?: unknown;
  now?: Date;
}

export interface IngestImladrisRawRecordsResult {
  syncRunId: string;
  status: keyof typeof ImladrisSyncStatus;
  recordCount: number;
  acceptedCount: number;
  errorCount: number;
  /**
   * Number of distinct records whose payload was byte-for-byte identical to the
   * stored row (matched by `payloadHash`) and therefore skipped the write. These
   * still count toward `acceptedCount` — they are reported separately only for
   * observability into how much write churn the hash-skip avoids.
   */
  unchangedCount?: number;
  statusPersistenceErrors?: string[];
}

type SourceSyncRunDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
};

type RawSourceRecordDelegate = {
  findMany(args: {
    where: {
      provider: IntegrationProvider;
      scopeKey: string;
      objectType?: { in: string[] };
      externalId?: { in: string[] };
    };
    select: { objectType: true; externalId: true; payloadHash: true };
  }): Promise<Array<{ objectType: string; externalId: string; payloadHash: string }>>;
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

type NormalizedRawRecordGroup = {
  record: NormalizedRawRecord;
  inputCount: number;
};

function scalarDateValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarDateValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : {};
  const dataAttributes =
    data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes)
      ? (data.attributes as Record<string, unknown>)
      : {};
  const candidates = [
    record.value,
    record.date,
    record.timestamp,
    record.time,
    record.iso,
    record.isoString,
    record.iso_string,
    record.milliseconds,
    record.millis,
    record.seconds,
    dataAttributes.value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];

  for (const candidate of candidates) {
    const normalized = scalarDateValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
    if (normalized instanceof Date) return normalized;
  }

  return value;
}

function asDate(value: unknown): Date | null {
  const normalizedValue = scalarDateValue(value);
  if (normalizedValue === null || normalizedValue === undefined) return null;
  if (normalizedValue instanceof Date) {
    return Number.isNaN(normalizedValue.getTime()) ? null : normalizedValue;
  }
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue) && normalizedValue > 0) {
    const timestampMs = normalizedValue < 10_000_000_000 ? normalizedValue * 1000 : normalizedValue;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof normalizedValue === "string") {
    const normalized = normalizedValue.trim();
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
  if (value instanceof Map) {
    if (seen.has(value)) {
      throw new Error("payload must be JSON-serializable");
    }
    seen.add(value);
    const normalizedEntries: Array<{ key: string; typedKey: string; value: unknown }> = [];
    for (const [key, entryValue] of value.entries()) {
      if (entryValue === undefined) continue;
      const normalizedValue = normalizeJson(entryValue, seen, {});
      if (normalizedValue === undefined) continue;
      const normalizedKey = normalizeMapKey(key, seen);
      normalizedEntries.push({
        key: normalizedKey,
        typedKey: typedMapKey(key, seen),
        value: normalizedValue,
      });
    }
    const keyCounts = normalizedEntries.reduce((counts, entry) => {
      counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const normalizedMap = Object.fromEntries(
      normalizedEntries
        .map((entry) => [
          (keyCounts.get(entry.key) ?? 0) > 1 ? entry.typedKey : entry.key,
          entry.value,
        ] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    seen.delete(value);
    return normalizedMap;
  }
  if (value instanceof Set) {
    if (seen.has(value)) {
      throw new Error("payload must be JSON-serializable");
    }
    seen.add(value);
    const normalizedSet = Array.from(value.values(), (item) => {
      const normalizedItem = normalizeJson(item, seen, { arrayItem: true });
      return normalizedItem === undefined ? null : normalizedItem;
    }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    seen.delete(value);
    return normalizedSet;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) {
    throw new Error("payload must be JSON-serializable");
  }
  const jsonValue = (value as { toJSON?: unknown }).toJSON;
  if (typeof jsonValue === "function") {
    seen.add(value);
    const normalizedJsonValue = normalizeJson(jsonValue.call(value), seen, options);
    seen.delete(value);
    return normalizedJsonValue;
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
      .map(([key, entryValue]) => [key, normalizeJson(entryValue, seen, {})] as const)
      .filter(([, entryValue]) => entryValue !== undefined),
  );
  seen.delete(value);
  return normalizedRecord;
}

function normalizeMapKey(key: unknown, seen: WeakSet<object>): string {
  if (typeof key === "string") return key;
  if (key === null) return "null:null";
  if (typeof key === "number") {
    if (!Number.isFinite(key)) {
      throw new Error("payload must be JSON-serializable");
    }
    return `number:${String(key)}`;
  }
  if (typeof key === "boolean") {
    return `boolean:${String(key)}`;
  }
  if (typeof key === "bigint") {
    return `bigint:${String(key)}`;
  }
  if (key === undefined || typeof key === "function" || typeof key === "symbol") {
    throw new Error("payload must be JSON-serializable");
  }

  const normalizedKey = normalizeJson(key, seen, {});
  const serializedKey = JSON.stringify(normalizedKey);
  if (serializedKey === undefined) {
    throw new Error("payload must be JSON-serializable");
  }
  return `object:${serializedKey}`;
}

function typedMapKey(key: unknown, seen: WeakSet<object>): string {
  if (typeof key === "string") return `string:${key}`;
  return normalizeMapKey(key, seen);
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

function scalarIdentityValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalizedArrayValue = value.length === 1 ? scalarIdentityValue(value[0], seen) : null;
    seen.delete(value);
    return normalizedArrayValue;
  }

  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : {};
  const dataAttributes =
    data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes)
      ? (data.attributes as Record<string, unknown>)
      : {};
  const candidates = [
    record.value,
    record.text,
    record.label,
    record.name,
    dataAttributes.value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];

  for (const candidate of candidates) {
    const normalized = scalarIdentityValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return value;
}

function fieldSpecificIdentityValue(
  value: unknown,
  field: "objectType" | "externalId",
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined || typeof value !== "object") return null;
  if (value instanceof Date) return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalizedArrayValue = value.length === 1 ? fieldSpecificIdentityValue(value[0], field, seen) : null;
    seen.delete(value);
    return normalizedArrayValue;
  }

  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : {};
  const dataAttributes =
    data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes)
      ? (data.attributes as Record<string, unknown>)
      : {};
  const candidates = field === "objectType"
    ? [
        record.objectType,
        record.object_type,
        record.type,
        data.objectType,
        data.object_type,
        data.type,
        dataAttributes.objectType,
        dataAttributes.object_type,
        dataAttributes.type,
      ]
    : [
        record.externalId,
        record.external_id,
        record.id,
        data.externalId,
        data.external_id,
        data.id,
        dataAttributes.externalId,
        dataAttributes.external_id,
        dataAttributes.id,
      ];

  for (const candidate of candidates) {
    const normalized = scalarIdentityValue(candidate);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function recordRejection(index: number, reason: string): Error {
  return new Error(`raw record ${index + 1} rejected: ${reason}`);
}

function requiredRecordIdentity(
  value: unknown,
  field: "objectType" | "externalId",
  index: number,
): string {
  const fieldValue = fieldSpecificIdentityValue(value, field);
  const normalizedValue =
    fieldValue !== null && fieldValue !== undefined ? fieldValue : scalarIdentityValue(value);
  if (typeof normalizedValue !== "string") {
    throw recordRejection(index, `${field} must be a string`);
  }
  const normalized = normalizedValue.trim();
  if (!normalized) {
    throw recordRejection(index, `${field} is required`);
  }
  return normalized;
}

function requiredExternalId(value: unknown, index: number): string {
  const fieldValue = fieldSpecificIdentityValue(value, "externalId");
  const normalizedValue =
    fieldValue !== null && fieldValue !== undefined ? fieldValue : scalarIdentityValue(value);
  if (typeof normalizedValue === "number") {
    if (!Number.isSafeInteger(normalizedValue)) {
      throw recordRejection(index, "externalId must be a string or safe integer");
    }
    return String(normalizedValue);
  }
  if (typeof normalizedValue !== "string") {
    throw recordRejection(index, "externalId must be a string or safe integer");
  }
  const normalized = normalizedValue.trim();
  if (!normalized) {
    throw recordRejection(index, "externalId is required");
  }
  return normalized;
}

function requiredObjectType(value: unknown, index: number): string {
  const objectType = normalizeImladrisObjectType(requiredRecordIdentity(value, "objectType", index));
  if (!objectType) {
    throw recordRejection(index, "objectType is required");
  }
  return objectType;
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
  windowStart: unknown,
  windowEnd: unknown,
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

function payloadCompleteness(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string" && value.trim().length === 0) return 0;
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + payloadCompleteness(item), 0);
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce(
      (sum, [, entryValue]) => {
        const entryCompleteness = payloadCompleteness(entryValue);
        return entryCompleteness === 0 ? sum : sum + 1 + entryCompleteness;
      },
      0,
    );
  }
  return 1;
}

function hasFutureTimestamp(record: NormalizedRawRecord, now: Date): boolean {
  return [record.sourceUpdatedAt, record.occurredAt, record.sourceCreatedAt].some(
    (date) => date !== null && date.getTime() > now.getTime(),
  );
}

function observableDate(date: Date | null, now: Date): Date | null {
  return date !== null && date.getTime() <= now.getTime() ? date : null;
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
  const candidateHasFutureTimestamp = hasFutureTimestamp(candidate, now);
  const currentHasFutureTimestamp = hasFutureTimestamp(current, now);
  if (candidateHasFutureTimestamp !== currentHasFutureTimestamp) {
    return candidateHasFutureTimestamp ? current : candidate;
  }
  const completenessDelta =
    payloadCompleteness(candidate.payload) - payloadCompleteness(current.payload);
  if (completenessDelta !== 0) {
    return completenessDelta > 0 ? candidate : current;
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
  const normalizedRecords = new Map<string, NormalizedRawRecordGroup>();

  for (const [recordIndex, record] of input.records.entries()) {
    try {
      const objectType = requiredObjectType(record.objectType, recordIndex);
      const externalId = requiredExternalId(record.externalId, recordIndex);
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
      const currentGroup = normalizedRecords.get(dedupeKey);
      normalizedRecords.set(dedupeKey, {
        record: preferRawRecord(currentGroup?.record, normalizedRecord, startedAt),
        inputCount: (currentGroup?.inputCount ?? 0) + 1,
      });
    } catch (error) {
      errorCount += 1;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  // Hash-based write-skipping: batch-fetch the payloadHash of every row we are
  // about to write so we can skip the upsert entirely when nothing changed.
  // Without this, every cron cycle rewrites identical JSONB payloads and leaves
  // a trail of dead tuples on this (large, JSONB-heavy) table.
  const existingHashByKey = new Map<string, string>();
  if (normalizedRecords.size > 0) {
    try {
      const groups = [...normalizedRecords.values()];
      const existing = await rawRecords.findMany({
        where: {
          provider: input.provider,
          scopeKey: rawRecordScopeKey,
          objectType: { in: [...new Set(groups.map((group) => group.record.objectType))] },
          externalId: { in: [...new Set(groups.map((group) => group.record.externalId))] },
        },
        select: { objectType: true, externalId: true, payloadHash: true },
      });
      for (const row of existing) {
        existingHashByKey.set(`${row.objectType}:${row.externalId}`, row.payloadHash);
      }
    } catch (error) {
      // A failed lookup is non-fatal: fall back to always upserting (prior
      // behaviour), just without the write-skip optimization.
      console.warn("imladris_raw_ingestion.hash_prefetch_failed", {
        provider: input.provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let acceptedCount = 0;
  let unchangedCount = 0;
  for (const { record, inputCount } of normalizedRecords.values()) {
    try {
      if (existingHashByKey.get(`${record.objectType}:${record.externalId}`) === record.payloadHash) {
        // Stored payload is identical — skip the write but still count the
        // record as accepted so ImladrisSourceSyncRun stats stay truthful.
        acceptedCount += inputCount;
        unchangedCount += 1;
        continue;
      }
      const sourceCreatedAt = observableDate(record.sourceCreatedAt, startedAt);
      const sourceUpdatedAt = observableDate(record.sourceUpdatedAt, startedAt);
      const occurredAt = observableDate(record.occurredAt, startedAt);
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
          sourceCreatedAt,
          sourceUpdatedAt,
          occurredAt,
          payload: record.payload,
          payloadHash: record.payloadHash,
          userId: context.userId,
          organizationId: context.organizationId,
        },
        update: {
          syncRunId: syncRun.id,
          sourceCreatedAt,
          sourceUpdatedAt,
          occurredAt,
          payload: record.payload,
          payloadHash: record.payloadHash,
          userId: context.userId,
          organizationId: context.organizationId,
        },
      });
      acceptedCount += inputCount;
    } catch (error) {
      errorCount += inputCount;
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
    // Omit when zero so callers/tests that assert the prior result shape are
    // unaffected; present only when the hash-skip actually avoided writes.
    ...(unchangedCount > 0 ? { unchangedCount } : {}),
    statusPersistenceErrors,
  };
}

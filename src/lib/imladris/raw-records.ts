import { createHash } from "node:crypto";
import { type IntegrationProvider } from "@/generated/prisma/client";
import { type ImladrisRawRecordInput } from "@/lib/imladris/ingestion";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function serializableValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const serialized = value.map((item) => {
      const serializedItem = serializableValue(item, seen);
      return serializedItem === undefined ? null : serializedItem;
    });
    seen.delete(value);
    return serialized;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return undefined;

  seen.add(value);
  const serialized = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, serializableValue(entryValue, seen)] as const)
      .filter(([, entryValue]) => entryValue !== undefined),
  );
  seen.delete(value);
  return serialized;
}

function serializableRecord(value: Record<string, unknown>): Record<string, unknown> {
  return asRecord(serializableValue(value));
}

function providerFieldRecords(record: Record<string, unknown>): Record<string, unknown>[] {
  const properties = asRecord(record.properties);
  return Object.keys(properties).length > 0 ? [record, properties] : [record];
}

function stableJson(value: unknown, seen = new WeakSet<object>()): string {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return "null";
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value === "number" && !Number.isFinite(value)) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    if (seen.has(value)) return JSON.stringify("[Circular]");
    seen.add(value);
    const serialized = `[${value.map((item) => stableJson(item, seen)).join(",")}]`;
    seen.delete(value);
    return serialized;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return JSON.stringify("[Circular]");
    seen.add(value);
    const serialized = `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue, seen)}`)
      .join(",")}}`;
    seen.delete(value);
    return serialized;
  }
  return JSON.stringify(value);
}

function shortHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 16);
}

function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function singularize(value: string): string {
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("ses")) return value.slice(0, -2);
  if (value.endsWith("s")) return value.slice(0, -1);
  return value;
}

function objectTypeForObject(path: string[]): string {
  const base = singularize(snakeCase(path.at(-1) ?? "object"));
  return `${base}_summary`;
}

function objectTypeForArray(path: string[], snapshotKey: string): string {
  const sourcePath = path.join(".");
  if (snapshotKey === "mercury" && sourcePath === "accounts") {
    return "account_balance";
  }
  return singularize(snakeCase(path.at(-1) ?? "record"));
}

function externalIdForRecord(input: {
  snapshotKey: string;
  objectType: string;
  record: Record<string, unknown>;
  index: number;
  from: string;
  to: string;
  parentExternalId?: string;
}): string {
  const providerId = providerExternalIdForRecord(input);
  if (providerId) {
    return providerId;
  }

  if (input.parentExternalId) {
    return `${input.snapshotKey}:${input.objectType}:${input.parentExternalId}:${input.index}:${shortHash(input.record)}`;
  }
  return `${input.snapshotKey}:${input.objectType}:${input.from}:${input.to}:${input.index}:${shortHash(input.record)}`;
}

function providerExternalIdForRecord(input: {
  snapshotKey: string;
  objectType: string;
  record: Record<string, unknown>;
  parentExternalId?: string;
}): string | null {
  for (const key of [
    "id",
    "uuid",
    "objectId",
    "object_id",
    "hs_object_id",
    "dealId",
    "deal_id",
    "contactId",
    "contact_id",
    "eventId",
    "event_id",
    "threadId",
    "thread_id",
    "fileId",
    "file_id",
    "messageId",
    "message_id",
    "ts",
    "channelId",
    "channel_id",
    "userId",
    "user_id",
    "query",
    "page",
    "device",
    "country",
    "customerId",
    "customer_id",
    "customer",
    "subscriptionId",
    "subscription_id",
    "invoiceId",
    "invoice_id",
    "paymentIntentId",
    "payment_intent_id",
    "paymentId",
    "payment_id",
    "accountId",
    "account_id",
    "transactionId",
    "transaction_id",
    "chargeId",
    "charge_id",
    "conversationId",
    "conversation_id",
    "campaignId",
    "campaign_id",
    "adId",
    "ad_id",
    "signalKey",
    "signal_key",
    "formGuid",
    "form_guid",
    "date",
    "month",
  ]) {
    for (const record of providerFieldRecords(input.record)) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        if (input.parentExternalId) {
          return `${input.snapshotKey}:${input.objectType}:${input.parentExternalId}:${value.trim()}`;
        }
        return `${input.snapshotKey}:${input.objectType}:${value.trim()}`;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        if (input.parentExternalId) {
          return `${input.snapshotKey}:${input.objectType}:${input.parentExternalId}:${value}`;
        }
        return `${input.snapshotKey}:${input.objectType}:${value}`;
      }
    }
  }

  return null;
}

function fallbackObjectExternalId(input: {
  snapshotKey: string;
  objectType: string;
  from: string;
  to: string;
  parentExternalId?: string;
}): string {
  if (input.parentExternalId) {
    return `${input.snapshotKey}:${input.objectType}:${input.parentExternalId}:${input.from}:${input.to}`;
  }
  return `${input.snapshotKey}:${input.objectType}:${input.from}:${input.to}`;
}

function isoFromTimestampValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim();
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const numericValue = Number(normalized);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        const millis = numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue;
        const parsed = new Date(millis);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
    }
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function timestampFromRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    for (const sourceRecord of providerFieldRecords(record)) {
      const iso = isoFromTimestampValue(sourceRecord[key]);
      if (iso) return iso;
    }
  }
  return null;
}

function recordOccurredAt(record: Record<string, unknown>): string | null {
  return timestampFromRecord(record, [
    "occurredAt",
    "occurred_at",
    "timestamp",
    "created",
    "postedAt",
    "posted_at",
    "createdAt",
    "created_at",
    "createdOn",
    "created_on",
    "createdate",
    "updatedAt",
    "updated_at",
    "updatedOn",
    "updated_on",
    "canceledAt",
    "canceled_at",
    "closedAt",
    "closed_at",
    "date",
    "day",
    "month",
  ]);
}

function recordSourceCreatedAt(record: Record<string, unknown>): string | null {
  return timestampFromRecord(record, [
    "sourceCreatedAt",
    "source_created_at",
    "created",
    "createdAt",
    "created_at",
    "createdOn",
    "created_on",
    "createdate",
  ]);
}

function recordSourceUpdatedAt(record: Record<string, unknown>): string | null {
  return timestampFromRecord(record, [
    "sourceUpdatedAt",
    "source_updated_at",
    "updatedAt",
    "updated_at",
    "updatedOn",
    "updated_on",
    "lastUpdated",
    "last_updated",
    "lastUpdatedAt",
    "last_updated_at",
    "modifiedAt",
    "modified_at",
    "lastModifiedAt",
    "last_modified_at",
    "lastModified",
    "last_modified",
    "hs_lastmodifieddate",
  ]);
}

function rawRecordFreshnessTimestamp(value: unknown, asOf: Date): number | null {
  const iso = isoFromTimestampValue(value);
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  return timestamp <= asOf.getTime() ? timestamp : null;
}

function rawRecordFreshness(record: ImladrisRawRecordInput, asOf: Date): number {
  return (
    rawRecordFreshnessTimestamp(record.sourceUpdatedAt, asOf) ??
    rawRecordFreshnessTimestamp(record.occurredAt, asOf) ??
    rawRecordFreshnessTimestamp(record.sourceCreatedAt, asOf) ??
    0
  );
}

function rawRecordHasObservableTimestamp(record: ImladrisRawRecordInput, asOf: Date): boolean {
  return (
    rawRecordFreshnessTimestamp(record.sourceUpdatedAt, asOf) !== null ||
    rawRecordFreshnessTimestamp(record.occurredAt, asOf) !== null ||
    rawRecordFreshnessTimestamp(record.sourceCreatedAt, asOf) !== null
  );
}

function rawRecordFreshnessRank(
  record: ImladrisRawRecordInput,
  freshnessRanks: WeakMap<ImladrisRawRecordInput, number>,
  asOf: Date,
): number {
  const rank = freshnessRanks.get(record) ?? 0;
  return rank > 0 && !rawRecordHasObservableTimestamp(record, asOf) ? 0 : rank;
}

function preferRawRecord(
  current: ImladrisRawRecordInput | undefined,
  candidate: ImladrisRawRecordInput,
  freshnessRanks: WeakMap<ImladrisRawRecordInput, number>,
  asOf: Date,
): ImladrisRawRecordInput {
  if (!current) return candidate;
  const rankDelta =
    rawRecordFreshnessRank(candidate, freshnessRanks, asOf) -
    rawRecordFreshnessRank(current, freshnessRanks, asOf);
  if (rankDelta !== 0) return rankDelta > 0 ? candidate : current;
  return rawRecordFreshness(candidate, asOf) >= rawRecordFreshness(current, asOf) ? candidate : current;
}

function rangeEndTimestamp(input: { to: string; capturedAt: Date }): string {
  const requestedEnd = isoFromTimestampValue(input.to);
  if (!requestedEnd) return input.capturedAt.toISOString();
  const requestedEndMs = Date.parse(requestedEnd);
  return requestedEndMs <= input.capturedAt.getTime()
    ? requestedEnd
    : input.capturedAt.toISOString();
}

export function buildImladrisRawRecordsFromPayload(input: {
  provider: IntegrationProvider;
  snapshotKey: string;
  payload: unknown;
  from: string;
  to: string;
  capturedAt: Date;
}): ImladrisRawRecordInput[] {
  const payloadRecord = asRecord(input.payload);
  const snapshotPayload = Array.isArray(input.payload)
    ? { records: input.payload }
    : payloadRecord;
  const fallbackTimestamp = rangeEndTimestamp(input);
  const records: ImladrisRawRecordInput[] = [];
  const freshnessRanks = new WeakMap<ImladrisRawRecordInput, number>();
  const pushRecord = (record: ImladrisRawRecordInput, freshnessRank: number) => {
    freshnessRanks.set(record, freshnessRank);
    records.push(record);
  };

  pushRecord({
    objectType: "snapshot",
    externalId: `${input.snapshotKey}:snapshot:${input.from}:${input.to}`,
    occurredAt: fallbackTimestamp,
    sourceUpdatedAt: fallbackTimestamp,
    payload: {
      ...serializableRecord(snapshotPayload),
      snapshotKey: input.snapshotKey,
      provider: input.provider,
      from: input.from,
      to: input.to,
    },
  }, 0);

  const visit = (
    value: unknown,
    path: string[],
    parentExternalId?: string,
    seen = new WeakSet<object>(),
  ): void => {
    if (path.length > 5) return;
    if (Array.isArray(value)) {
      if (seen.has(value)) return;
      seen.add(value);
      const objectType = objectTypeForArray(path, input.snapshotKey);
      value.forEach((entry, index) => {
        if (entry && typeof entry === "object" && seen.has(entry)) return;
        const entryRecord = asRecord(entry);
        if (Object.keys(entryRecord).length === 0) return;
        if (entry && typeof entry === "object") {
          seen.add(entry);
        }
        const occurredAt = recordOccurredAt(entryRecord);
        const sourceCreatedAt = recordSourceCreatedAt(entryRecord);
        const sourceUpdatedAt = recordSourceUpdatedAt(entryRecord) ?? occurredAt;
        const externalId = externalIdForRecord({
          snapshotKey: input.snapshotKey,
          objectType,
          record: entryRecord,
          index,
          from: input.from,
          to: input.to,
          parentExternalId,
        });
        pushRecord({
          objectType,
          externalId,
          sourceCreatedAt,
          occurredAt: occurredAt ?? fallbackTimestamp,
          sourceUpdatedAt: sourceUpdatedAt ?? fallbackTimestamp,
          payload: {
            ...serializableRecord(entryRecord),
            sourcePath: path.join("."),
            ...(parentExternalId ? { sourceParentExternalId: parentExternalId } : {}),
            snapshotKey: input.snapshotKey,
          },
        }, sourceUpdatedAt || occurredAt || sourceCreatedAt ? 1 : 0);

        for (const [key, child] of Object.entries(entryRecord)) {
          if (key.startsWith("_")) continue;
          if (child && typeof child === "object") {
            visit(child, [...path, key], externalId, seen);
          }
        }
        if (entry && typeof entry === "object") {
          seen.delete(entry);
        }
      });
      seen.delete(value);
      return;
    }

    if (value && typeof value === "object") {
      if (seen.has(value)) return;
      seen.add(value);
    }
    const record = asRecord(value);
    if (Object.keys(record).length === 0) {
      if (value && typeof value === "object") seen.delete(value);
      return;
    }

    let currentExternalId = parentExternalId;
    if (path.length > 0 && !path.at(-1)?.startsWith("_")) {
      const objectType = objectTypeForObject(path);
      const occurredAt = recordOccurredAt(record);
      const sourceCreatedAt = recordSourceCreatedAt(record);
      const sourceUpdatedAt = recordSourceUpdatedAt(record) ?? occurredAt;
      const providerExternalId = providerExternalIdForRecord({
        snapshotKey: input.snapshotKey,
        objectType,
        record,
        parentExternalId,
      });
      const externalId =
        providerExternalId ??
        fallbackObjectExternalId({
          snapshotKey: input.snapshotKey,
          objectType,
          from: input.from,
          to: input.to,
          parentExternalId,
        });
      currentExternalId = externalId;
      pushRecord({
        objectType,
        externalId,
        sourceCreatedAt,
        occurredAt: occurredAt ?? fallbackTimestamp,
        sourceUpdatedAt: sourceUpdatedAt ?? fallbackTimestamp,
        payload: {
          ...serializableRecord(record),
          sourcePath: path.join("."),
          ...(parentExternalId ? { sourceParentExternalId: parentExternalId } : {}),
          snapshotKey: input.snapshotKey,
        },
      }, sourceUpdatedAt || occurredAt || sourceCreatedAt ? 1 : 0);
    }

    for (const [key, child] of Object.entries(record)) {
      if (key.startsWith("_")) continue;
      if (child && typeof child === "object") {
        visit(child, [...path, key], currentExternalId, seen);
      }
    }
    if (value && typeof value === "object") seen.delete(value);
  };

  visit(input.payload, []);

  const deduped = new Map<string, ImladrisRawRecordInput>();
  for (const record of records) {
    const key = `${record.objectType}:${record.externalId}`;
    deduped.set(key, preferRawRecord(deduped.get(key), record, freshnessRanks, input.capturedAt));
  }
  return [...deduped.values()];
}

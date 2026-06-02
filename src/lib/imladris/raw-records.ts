import { createHash } from "node:crypto";
import { type IntegrationProvider } from "@/generated/prisma/client";
import { type ImladrisRawRecordInput } from "@/lib/imladris/ingestion";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(",")}}`;
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
    const value = input.record[key];
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
    if (/^\d+$/.test(normalized)) {
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
    const iso = isoFromTimestampValue(record[key]);
    if (iso) return iso;
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

export function buildImladrisRawRecordsFromPayload(input: {
  provider: IntegrationProvider;
  snapshotKey: string;
  payload: unknown;
  from: string;
  to: string;
  capturedAt: Date;
}): ImladrisRawRecordInput[] {
  const payloadRecord = asRecord(input.payload);
  const records: ImladrisRawRecordInput[] = [
    {
      objectType: "snapshot",
      externalId: `${input.snapshotKey}:snapshot:${input.from}:${input.to}`,
      occurredAt: input.capturedAt,
      sourceUpdatedAt: input.capturedAt,
      payload: {
        ...payloadRecord,
        snapshotKey: input.snapshotKey,
        provider: input.provider,
        from: input.from,
        to: input.to,
      },
    },
  ];

  const visit = (value: unknown, path: string[], parentExternalId?: string): void => {
    if (path.length > 5) return;
    if (Array.isArray(value)) {
      const objectType = objectTypeForArray(path, input.snapshotKey);
      value.forEach((entry, index) => {
        const entryRecord = asRecord(entry);
        if (Object.keys(entryRecord).length === 0) return;
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
        records.push({
          objectType,
          externalId,
          sourceCreatedAt,
          occurredAt,
          sourceUpdatedAt: sourceUpdatedAt ?? input.capturedAt,
          payload: {
            ...entryRecord,
            sourcePath: path.join("."),
            ...(parentExternalId ? { sourceParentExternalId: parentExternalId } : {}),
            snapshotKey: input.snapshotKey,
          },
        });

        for (const [key, child] of Object.entries(entryRecord)) {
          if (key.startsWith("_")) continue;
          if (child && typeof child === "object") {
            visit(child, [...path, key], externalId);
          }
        }
      });
      return;
    }

    const record = asRecord(value);
    if (Object.keys(record).length === 0) return;

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
      records.push({
        objectType,
        externalId,
        sourceCreatedAt,
        occurredAt: occurredAt ?? input.capturedAt,
        sourceUpdatedAt: sourceUpdatedAt ?? input.capturedAt,
        payload: {
          ...record,
          sourcePath: path.join("."),
          ...(parentExternalId ? { sourceParentExternalId: parentExternalId } : {}),
          snapshotKey: input.snapshotKey,
        },
      });
    }

    for (const [key, child] of Object.entries(record)) {
      if (key.startsWith("_")) continue;
      if (child && typeof child === "object") {
        visit(child, [...path, key], currentExternalId);
      }
    }
  };

  visit(payloadRecord, []);

  const deduped = new Map<string, ImladrisRawRecordInput>();
  for (const record of records) {
    deduped.set(`${record.objectType}:${record.externalId}`, record);
  }
  return [...deduped.values()];
}

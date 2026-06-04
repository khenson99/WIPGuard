import { createHash } from "node:crypto";
import { type IntegrationProvider } from "@/generated/prisma/client";
import { type ImladrisRawRecordInput } from "@/lib/imladris/ingestion";

function asRecord(value: unknown, seen = new WeakSet<object>()): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  if (seen.has(value)) return {};
  const jsonValue = (value as { toJSON?: unknown }).toJSON;
  if (typeof jsonValue === "function") {
    seen.add(value);
    const record = asRecord(jsonValue.call(value), seen);
    seen.delete(value);
    return record;
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function scalarProviderIdValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarProviderIdValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = wrapperFieldRecord(record.data);
  const candidates = [
    record.value,
    record.metricValue,
    record.metric_value,
    wrapperFieldRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];

  for (const candidate of candidates) {
    const normalized = scalarProviderIdValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
  }

  return value;
}

function safeProviderIdValue(value: unknown): string | number | null {
  const normalizedValue = scalarProviderIdValue(value);
  const trimmed = asTrimmedString(normalizedValue);
  if (trimmed) return trimmed;
  if (typeof normalizedValue === "number" && Number.isSafeInteger(normalizedValue)) return normalizedValue;
  return null;
}

function providerTextValue(value: unknown): string | null {
  const providerId = safeProviderIdValue(value);
  if (providerId === null) return null;
  return String(providerId);
}

function providerArrayItems(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const record = wrapperFieldRecord(value);
  const candidates = [
    record.data,
    record.value,
    record.values,
    record.items,
    record.elements,
    record.records,
    record.attributes,
    record.fields,
  ];
  for (const candidate of candidates) {
    const items = providerArrayItems(candidate, seen);
    if (items.length > 0) {
      seen.delete(value);
      return items;
    }
  }

  seen.delete(value);
  return [];
}

function serializableMapKey(key: unknown): string {
  if (typeof key === "string") return key;
  if (key === null) return "null:null";
  if (typeof key === "number") return `number:${String(key)}`;
  if (typeof key === "boolean") return `boolean:${String(key)}`;
  if (typeof key === "bigint") return `bigint:${String(key)}`;
  if (typeof key === "symbol") return `symbol:${String(key)}`;
  if (key && typeof key === "object") return `object:${stableJson(key)}`;
  return `${typeof key}:${String(key)}`;
}

function typedSerializableMapKey(key: unknown): string {
  if (typeof key === "string") return `string:${key}`;
  return serializableMapKey(key);
}

function disambiguatedMapEntries(entries: Array<{ key: string; typedKey: string; value: unknown }>): Array<[string, unknown]> {
  const keyCounts = entries.reduce((counts, entry) => {
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  return entries
    .map((entry): [string, unknown] => [
      (keyCounts.get(entry.key) ?? 0) > 1 ? entry.typedKey : entry.key,
      entry.value,
    ])
    .sort(([left], [right]) => left.localeCompare(right));
}

function serializableMapEntries(value: Map<unknown, unknown>): Array<[string, unknown]> {
  return disambiguatedMapEntries(
    Array.from(value.entries())
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => ({
        key: serializableMapKey(key),
        typedKey: typedSerializableMapKey(key),
        value: entryValue,
      })),
  );
}

function sortedSetValues(value: Set<unknown>, seen: WeakSet<object>): unknown[] {
  return Array.from(value.values()).sort((left, right) =>
    stableJson(left, seen).localeCompare(stableJson(right, seen)),
  );
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
  if (value instanceof Map) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const serialized = Object.fromEntries(
      disambiguatedMapEntries(
        Array.from(value.entries()).flatMap(([key, entryValue]) => {
          const serializedEntryValue = serializableValue(entryValue, seen);
          if (serializedEntryValue === undefined) return [];
          return [{
            key: serializableMapKey(key),
            typedKey: typedSerializableMapKey(key),
            value: serializedEntryValue,
          }];
        }),
      ),
    );
    seen.delete(value);
    return serialized;
  }
  if (value instanceof Set) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const serialized = sortedSetValues(value, seen).map((item) => {
      const serializedItem = serializableValue(item, seen);
      return serializedItem === undefined ? null : serializedItem;
    });
    seen.delete(value);
    return serialized;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return undefined;
  const jsonValue = (value as { toJSON?: unknown }).toJSON;
  if (typeof jsonValue === "function") {
    seen.add(value);
    const serialized = serializableValue(jsonValue.call(value), seen);
    seen.delete(value);
    return serialized;
  }

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

function wrapperFieldRecord(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(serializableMapEntries(value));
  }
  return asRecord(value);
}

function expandSingleValueSource(source: Record<string, unknown>): Record<string, unknown>[] {
  const entries = Object.entries(source);
  if (entries.length !== 1) return [source];

  const [key, value] = entries[0];
  const nestedValue = wrapperFieldRecord(value);
  if (!["value", "metricValue", "metric_value"].includes(key) || Object.keys(nestedValue).length === 0) {
    return [source];
  }

  return [nestedValue, source];
}

function providerFieldRecords(record: Record<string, unknown>): Record<string, unknown>[] {
  const wrappers: Record<string, unknown>[] = [];
  const appendWrapper = (value: unknown) => {
    const wrapper = wrapperFieldRecord(value);
    if (Object.keys(wrapper).length > 0) {
      wrappers.push(wrapper);
    }
    return wrapper;
  };

  appendWrapper(record.properties);
  appendWrapper(record.attributes);
  appendWrapper(record.fields);
  appendWrapper(record.values);
  appendWrapper(record.relationships);

  const dataRecord = appendWrapper(record.data);
  appendWrapper(dataRecord.properties);
  appendWrapper(dataRecord.attributes);
  appendWrapper(dataRecord.fields);
  appendWrapper(dataRecord.values);
  appendWrapper(dataRecord.relationships);

  return (wrappers.length > 0 ? [record, ...wrappers] : [record]).flatMap(expandSingleValueSource);
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
  if (value instanceof Map) {
    if (seen.has(value)) return JSON.stringify("[Circular]");
    seen.add(value);
    const serialized = `{${serializableMapEntries(value)
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue, seen)}`)
      .join(",")}}`;
    seen.delete(value);
    return serialized;
  }
  if (value instanceof Set) {
    if (seen.has(value)) return JSON.stringify("[Circular]");
    seen.add(value);
    const serialized = `[${sortedSetValues(value, seen).map((item) => stableJson(item, seen)).join(",")}]`;
    seen.delete(value);
    return serialized;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return JSON.stringify("[Circular]");
    const jsonValue = (value as { toJSON?: unknown }).toJSON;
    if (typeof jsonValue === "function") {
      seen.add(value);
      const serializedJsonValue = stableJson(jsonValue.call(value), seen);
      seen.delete(value);
      return serializedJsonValue;
    }
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
  return createHash("sha256").update(stableJson(serializableValue(value))).digest("hex").slice(0, 16);
}

function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function singularize(value: string): string {
  if (value.endsWith("status")) return value;
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

function jsonApiObjectTypeForArrayEntry(path: string[], record: Record<string, unknown>): string | null {
  if (path.at(-1) !== "data" && path.at(-1) !== "included") return null;
  const type = providerTextValue(record.type);
  if (!type) return null;
  const normalized = singularize(snakeCase(type));
  return normalized || null;
}

function jsonApiObjectTypeForObject(
  path: string[],
  record: Record<string, unknown>,
  parentExternalId?: string,
): string | null {
  if (parentExternalId || path.length !== 1 || path[0] !== "data") return null;
  const type = providerTextValue(record.type);
  if (!type) return null;
  const normalized = singularize(snakeCase(type));
  return normalized || null;
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
  const providerSpecificValue = providerSpecificExternalIdValue(input);
  if (providerSpecificValue !== null) {
    if (input.parentExternalId) {
      return `${input.snapshotKey}:${input.objectType}:${input.parentExternalId}:${providerSpecificValue}`;
    }
    return `${input.snapshotKey}:${input.objectType}:${providerSpecificValue}`;
  }

  for (const key of [
    "id",
    "uuid",
    "objectId",
    "object_id",
    "externalId",
    "external_id",
    "hs_object_id",
    "dealId",
    "deal_id",
    "hubspotDealId",
    "hubspot_deal_id",
    "deal",
    "companyId",
    "company_id",
    "hubspotCompanyId",
    "hubspot_company_id",
    "company",
    "contactId",
    "contact_id",
    "hubspotContactId",
    "hubspot_contact_id",
    "contact",
    "eventId",
    "event_id",
    "issueId",
    "issue_id",
    "threadId",
    "thread_id",
    "thread",
    "fileId",
    "file_id",
    "file",
    "messageId",
    "message_id",
    "message",
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
    "subscription",
    "invoiceId",
    "invoice_id",
    "invoice",
    "paymentIntentId",
    "payment_intent_id",
    "paymentIntent",
    "payment_intent",
    "paymentId",
    "payment_id",
    "payment",
    "accountId",
    "account_id",
    "account",
    "transactionId",
    "transaction_id",
    "transaction",
    "chargeId",
    "charge_id",
    "charge",
    "conversationId",
    "conversation_id",
    "conversation",
    "campaignId",
    "campaign_id",
    "campaign",
    "adGroupId",
    "ad_group_id",
    "adGroup",
    "ad_group",
    "adSetId",
    "ad_set_id",
    "adsetId",
    "adset_id",
    "adSet",
    "ad_set",
    "adset",
    "keywordId",
    "keyword_id",
    "keyword",
    "criterionId",
    "criterion_id",
    "criterion",
    "adId",
    "ad_id",
    "ad",
    "signalKey",
    "signal_key",
    "formGuid",
    "form_guid",
    "formName",
    "form_name",
    "date",
    "month",
  ]) {
    for (const record of providerFieldRecords(input.record)) {
      const value = providerExternalIdValue(record, key);
      if (value !== null) {
        if (input.parentExternalId) {
          return `${input.snapshotKey}:${input.objectType}:${input.parentExternalId}:${value}`;
        }
        return `${input.snapshotKey}:${input.objectType}:${value}`;
      }
    }
  }

  if (input.snapshotKey === "linear") {
    for (const key of [
      "identifier",
      "issueIdentifier",
      "issue_identifier",
      "projectIdentifier",
      "project_identifier",
    ]) {
      for (const record of providerFieldRecords(input.record)) {
        const value = providerExternalIdValue(record, key);
        if (value !== null) {
          if (input.parentExternalId) {
            return `${input.snapshotKey}:${input.objectType}:${input.parentExternalId}:${value}`;
          }
          return `${input.snapshotKey}:${input.objectType}:${value}`;
        }
      }
    }
  }

  if (input.snapshotKey === "stripe") {
    for (const key of [
      "priceId",
      "price_id",
      "price",
      "pricing",
      "productId",
      "product_id",
      "product",
      "planId",
      "plan_id",
      "plan",
    ]) {
      for (const record of providerFieldRecords(input.record)) {
        const value = providerExternalIdValue(record, key);
        if (value !== null) {
          if (input.parentExternalId) {
            return `${input.snapshotKey}:${input.objectType}:${input.parentExternalId}:${value}`;
          }
          return `${input.snapshotKey}:${input.objectType}:${value}`;
        }
      }
    }
  }

  return null;
}

function providerSpecificExternalIdValue(input: {
  snapshotKey: string;
  objectType: string;
  record: Record<string, unknown>;
}): string | number | null {
  if (input.snapshotKey === "github" && input.objectType === "pull_request") {
    return githubPullRequestExternalIdValue(input.record);
  }
  if (input.snapshotKey === "github" && input.objectType === "commit") {
    for (const key of ["sha", "commitSha", "commit_sha"]) {
      for (const record of providerFieldRecords(input.record)) {
        const value = providerExternalIdValue(record, key);
        if (value !== null) return value;
      }
    }
  }
  if (input.snapshotKey === "googleSearchConsole") {
    return googleSearchConsoleExternalIdValue(input.record);
  }
  if (input.snapshotKey === "semrush" && input.objectType === "organic_competitor") {
    return semrushCompetitorExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "cards_by_status") {
    return codaStatusExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "top_drop_off_status") {
    return codaStatusExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "recent_submitter") {
    return codaRecentSubmitterExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "creator_window") {
    return codaCreatorWindowExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "by_creator") {
    return codaCreatorBreakdownExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "engaged_lead_candidate") {
    return codaEmailExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "new_creator_feed") {
    return codaEmailExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "stage") {
    return codaStageExternalIdValue(input.record);
  }
  if (input.snapshotKey === "coda" && input.objectType === "conversion") {
    return codaConversionExternalIdValue(input.record);
  }
  return null;
}

function codaStageExternalIdValue(record: Record<string, unknown>): string | number | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    const value = providerExternalIdValue(sourceRecord, "key");
    if (value !== null) return value;
  }
  return null;
}

function codaConversionExternalIdValue(record: Record<string, unknown>): string | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    const from = providerExternalIdValue(sourceRecord, "from");
    const to = providerExternalIdValue(sourceRecord, "to");
    if (from !== null && to !== null) return `${from}:${to}`;
  }
  return null;
}

function codaCreatorBreakdownExternalIdValue(record: Record<string, unknown>): string | null {
  return codaEmailExternalIdValue(record) ?? codaCreatorExternalIdValue(record);
}

function codaCreatorWindowExternalIdValue(record: Record<string, unknown>): string | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    const windowDays =
      providerExternalIdValue(sourceRecord, "windowDays") ??
      providerExternalIdValue(sourceRecord, "window_days");
    if (windowDays !== null) return `${windowDays}d`;
  }
  return null;
}

function codaRecentSubmitterExternalIdValue(record: Record<string, unknown>): string | null {
  return codaEmailExternalIdValue(record);
}

function codaEmailExternalIdValue(record: Record<string, unknown>): string | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    const email =
      providerTextValue(sourceRecord.email) ??
      providerTextValue(sourceRecord.creatorEmail) ??
      providerTextValue(sourceRecord.creator_email);
    if (email) return email.toLowerCase();
  }
  return null;
}

function codaCreatorExternalIdValue(record: Record<string, unknown>): string | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    const creator = providerTextValue(sourceRecord.creator);
    if (creator) return creator.toLowerCase();
  }
  return null;
}

function codaStatusExternalIdValue(record: Record<string, unknown>): string | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    const status =
      providerTextValue(sourceRecord.status) ??
      providerTextValue(sourceRecord.statusName) ??
      providerTextValue(sourceRecord.status_name);
    if (status) return status;
  }
  return null;
}

function semrushCompetitorExternalIdValue(record: Record<string, unknown>): string | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    const domain =
      providerTextValue(sourceRecord.domain) ??
      providerTextValue(sourceRecord.competitorDomain) ??
      providerTextValue(sourceRecord.competitor_domain);
    if (domain) return domain;
  }
  return null;
}

function googleSearchConsoleExternalIdValue(record: Record<string, unknown>): string | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    for (const key of ["keys", "dimensions", "dimensionValues", "dimension_values"]) {
      const dimensions = providerArrayItems(sourceRecord[key]);
      if (dimensions.length === 0) continue;
      const parts = dimensions
        .map((dimension) => providerTextValue(dimension))
        .filter((dimension): dimension is string => dimension !== null);
      if (parts.length > 0) return parts.join(":");
    }
  }
  return null;
}

function githubPullRequestExternalIdValue(record: Record<string, unknown>): string | null {
  const pullRequestNumber = providerFieldRecords(record)
    .map((sourceRecord) => providerExternalIdValue(sourceRecord, "number"))
    .find((value) => value !== null) ?? null;
  const repositoryFullName = githubRepositoryFullName(record);
  if (pullRequestNumber === null || !repositoryFullName) return null;
  return `${repositoryFullName}/pull/${pullRequestNumber}`;
}

function githubRepositoryFullName(record: Record<string, unknown>): string | null {
  for (const sourceRecord of providerFieldRecords(record)) {
    const repository = wrapperFieldRecord(sourceRecord.repository);
    const explicit =
      providerTextValue(repository.full_name) ??
      providerTextValue(repository.fullName) ??
      providerTextValue(sourceRecord.repositoryFullName) ??
      providerTextValue(sourceRecord.repository_full_name) ??
      providerTextValue(sourceRecord.full_name) ??
      providerTextValue(sourceRecord.fullName);
    if (explicit?.includes("/")) return explicit;

    const htmlUrl = providerTextValue(sourceRecord.html_url) ?? providerTextValue(sourceRecord.htmlUrl);
    const htmlUrlMatch = htmlUrl?.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+(?:[/?#].*)?$/);
    if (htmlUrlMatch?.[1]) return htmlUrlMatch[1];

    const repositoryUrl =
      providerTextValue(sourceRecord.repository_url) ??
      providerTextValue(sourceRecord.repositoryUrl) ??
      providerTextValue(sourceRecord.url);
    const repositoryUrlMatch = repositoryUrl?.match(/\/repos\/([^/]+\/[^/?#]+)(?:[/?#].*)?$/);
    if (repositoryUrlMatch?.[1]) return repositoryUrlMatch[1];
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

function nestedProviderObjectId(value: unknown): string | number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedId = nestedProviderObjectId(item);
      if (nestedId !== null) return nestedId;
    }
    return null;
  }

  const nestedRecord = wrapperFieldRecord(value);
  for (const sourceRecord of providerFieldRecords(nestedRecord)) {
    const nestedId = safeProviderIdValue(sourceRecord.id);
    if (nestedId !== null) return nestedId;
    if (Array.isArray(sourceRecord.data)) {
      const dataNestedId = nestedProviderObjectId(sourceRecord.data);
      if (dataNestedId !== null) return dataNestedId;
    }
  }
  return null;
}

function nestedPricingProviderObjectId(value: unknown): string | number | null {
  const pricingRecord = wrapperFieldRecord(value);
  for (const sourceRecord of providerFieldRecords(pricingRecord)) {
    for (const detailKey of ["price_details", "priceDetails"]) {
      const detailRecord = wrapperFieldRecord(sourceRecord[detailKey]);
      for (const detailSource of providerFieldRecords(detailRecord)) {
        for (const key of ["price", "priceId", "price_id", "product", "productId", "product_id"]) {
          const detailId = providerExternalIdValue(detailSource, key);
          if (detailId !== null) return detailId;
        }
      }
    }
  }
  return null;
}

function providerExternalIdValue(record: Record<string, unknown>, key: string): string | number | null {
  const value = record[key];
  const safeValue = safeProviderIdValue(value);
  if (safeValue !== null) return safeValue;
  if (key === "pricing") {
    return nestedProviderObjectId(value) ?? nestedPricingProviderObjectId(value);
  }
  if (
    key === "customer" ||
    key === "account" ||
    key === "company" ||
    key === "deal" ||
    key === "contact" ||
    key === "price" ||
    key === "product" ||
    key === "plan" ||
    key === "subscription" ||
    key === "invoice" ||
    key === "paymentIntent" ||
    key === "payment_intent" ||
    key === "payment" ||
    key === "transaction" ||
    key === "charge" ||
    key === "conversation" ||
    key === "message" ||
    key === "thread" ||
    key === "file" ||
    key === "campaign" ||
    key === "adGroup" ||
    key === "ad_group" ||
    key === "adSet" ||
    key === "ad_set" ||
    key === "adset" ||
    key === "keyword" ||
    key === "criterion" ||
    key === "ad"
  ) {
    return nestedProviderObjectId(value);
  }
  return null;
}

function scalarTimestampValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarTimestampValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = wrapperFieldRecord(record.data);
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
    wrapperFieldRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];

  for (const candidate of candidates) {
    const normalized = scalarTimestampValue(candidate, seen);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
    if (normalized instanceof Date) return normalized;
  }

  return value;
}

function isoFromTimestampValue(value: unknown): string | null {
  const normalizedValue = scalarTimestampValue(value);
  if (normalizedValue instanceof Date) {
    return Number.isNaN(normalizedValue.getTime()) ? null : normalizedValue.toISOString();
  }
  if (typeof normalizedValue === "string" && normalizedValue.trim()) {
    const normalized = normalizedValue.trim();
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

  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue) && normalizedValue > 0) {
    const millis = normalizedValue < 10_000_000_000 ? normalizedValue * 1000 : normalizedValue;
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
    "committedAt",
    "committed_at",
    "authoredAt",
    "authored_at",
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
    "firstCardAt",
    "first_card_at",
  ]);
}

function recordSourceUpdatedAt(record: Record<string, unknown>): string | null {
  return timestampFromRecord(record, [
    "sourceUpdatedAt",
    "source_updated_at",
    "syncedAt",
    "synced_at",
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
    "lastCardAt",
    "last_card_at",
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

function payloadCompleteness(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + payloadCompleteness(item), 0);
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce(
      (sum, [, entryValue]) => sum + 1 + payloadCompleteness(entryValue),
      0,
    );
  }
  return 1;
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
  const freshnessDelta = rawRecordFreshness(candidate, asOf) - rawRecordFreshness(current, asOf);
  if (freshnessDelta !== 0) return freshnessDelta > 0 ? candidate : current;
  const completenessDelta =
    payloadCompleteness(candidate.payload) - payloadCompleteness(current.payload);
  if (completenessDelta !== 0) return completenessDelta > 0 ? candidate : current;
  return candidate;
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
      const pathObjectType = objectTypeForArray(path, input.snapshotKey);
      value.forEach((entry, index) => {
        if (entry && typeof entry === "object" && seen.has(entry)) return;
        const entryRecord = asRecord(entry);
        if (Object.keys(entryRecord).length === 0) return;
        if (entry && typeof entry === "object") {
          seen.add(entry);
        }
        const objectType = jsonApiObjectTypeForArrayEntry(path, entryRecord) ?? pathObjectType;
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
      const objectType = jsonApiObjectTypeForObject(path, record, parentExternalId) ?? objectTypeForObject(path);
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

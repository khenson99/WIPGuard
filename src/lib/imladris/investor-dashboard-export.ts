import { normalizeMetricConfidence, normalizeMetricStatus, normalizeMetricWarnings } from "@/lib/imladris/confidence";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";
import type { PrismaClientType } from "@/lib/prisma";

const INVESTOR_METRIC_KEYS = [
  "revenue.mrr",
  "finance.cash_runway_months",
  "finance.net_burn",
  "sales.qualified_pipeline",
] as const;
const EXPORT_SOURCE = "imladris-investor-dashboard-export";
const EXPORT_SCHEMA_VERSION = 1;
const RAW_PROVIDERS = ["STRIPE", "HUBSPOT", "MERCURY", "GOOGLE_WORKSPACE", "SLACK"] as const;
const RAW_PROVIDER_KEYS = new Set<string>(RAW_PROVIDERS);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "cancelled",
  "incomplete",
  "incompleteexpired",
  "paused",
  "unpaid",
]);
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

export type InvestorDashboardRange = "30d" | "90d" | "180d";

export interface InvestorDashboardExportContext {
  userId: string | null;
  organizationId: string | null;
}

interface MetricLineageRow {
  sourceKey: string;
  sourceType: string;
  sourceId: string | null;
  rawRecordId: string | null;
  capturedAt: Date | string | null;
  metadata: unknown;
}

interface CanonicalMetricRow {
  metricKey: string;
  department: string;
  unit: string;
  value: unknown;
  periodStart: Date | string;
  periodEnd: Date | string;
  status: string;
  confidence: number;
  warnings: string[];
  calculationVersion: string;
  computedAt: Date | string;
  userId?: string | null;
  organizationId?: string | null;
  lineage?: MetricLineageRow[];
}

interface RawSourceRecordRow {
  id: string;
  provider: string;
  objectType: string;
  externalId: string;
  scopeKey?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  occurredAt: Date | string | null;
  sourceCreatedAt: Date | string | null;
  sourceUpdatedAt: Date | string | null;
  payload: unknown;
}

interface WeeklyPoint {
  week: string;
  demos: number;
  customers: number;
  revenue: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return asRecord(value);
}

function expandSingleValueSource(source: Record<string, unknown>): Record<string, unknown>[] {
  const entries = Object.entries(source);
  if (entries.length !== 1) return [source];

  const [key, value] = entries[0];
  const nestedValue = asRecord(value);
  if (!["value", "metricValue", "metric_value"].includes(key) || Object.keys(nestedValue).length === 0) {
    return [source];
  }

  return [nestedValue, source];
}

function wrapperSources(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = nestedRecord(payload.data);
  const wrappers = [
    data,
    nestedRecord(payload.properties),
    nestedRecord(payload.summary),
    nestedRecord(payload.metrics),
    nestedRecord(payload.values),
    nestedRecord(payload.attributes),
    nestedRecord(payload.fields),
    nestedRecord(data.properties),
    nestedRecord(data.summary),
    nestedRecord(data.metrics),
    nestedRecord(data.values),
    nestedRecord(data.attributes),
    nestedRecord(data.fields),
  ].filter((source) => Object.keys(source).length > 0);
  return (wrappers.length > 0 ? [payload, ...wrappers] : [payload]).flatMap(expandSingleValueSource);
}

function directCanonicalMetricFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !["data", "properties", "summary", "metrics", "values", "attributes", "fields"].includes(key),
    ),
  );
}

function directJsonApiDataMetricFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !["id", "type", "data", "properties", "summary", "metrics", "values", "attributes", "fields"].includes(key),
    ),
  );
}

function canonicalMetricSources(value: unknown): Record<string, unknown>[] {
  const payload = asRecord(value);
  const data = nestedRecord(payload.data);
  return [
    directCanonicalMetricFields(payload),
    nestedRecord(payload.properties),
    nestedRecord(payload.summary),
    nestedRecord(payload.metrics),
    nestedRecord(payload.values),
    nestedRecord(payload.attributes),
    nestedRecord(payload.fields),
    directJsonApiDataMetricFields(data),
    nestedRecord(data.properties),
    nestedRecord(data.summary),
    nestedRecord(data.metrics),
    nestedRecord(data.values),
    nestedRecord(data.attributes),
    nestedRecord(data.fields),
  ].filter((source) => Object.keys(source).length > 0);
}

function unwrapSingleMetricValueField(value: Record<string, unknown>): unknown {
  const entries = Object.entries(value);
  if (entries.length !== 1) return value;

  const [key, nestedValue] = entries[0];
  if (!["value", "metricValue", "metric_value"].includes(key)) return value;

  return nestedValue;
}

function flattenedCanonicalMetricValue(value: unknown): unknown {
  const sources = canonicalMetricSources(value);
  if (sources.length === 0) return value ?? null;
  return unwrapSingleMetricValueField(Object.assign({}, ...sources.reverse()));
}

function firstValueFromSources(
  sources: Record<string, unknown>[],
  keys: string[],
): unknown {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null) return value;
    }
  }
  return undefined;
}

function scalarValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.value,
    record.metricValue,
    record.metric_value,
    record.amount,
    record.number,
    record.count,
    record.total,
    record.currency,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];
  for (const candidate of candidates) {
    const normalized = scalarValue(candidate, seen);
    if (normalized instanceof Date) return normalized;
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
  }

  return value;
}

function numberFrom(value: unknown): number | null {
  return parseImladrisNumber(scalarValue(value) ?? value);
}

function nonNegativeNumberFrom(value: unknown): number | null {
  const number = numberFrom(value);
  return number === null ? null : Math.max(0, number);
}

function countFrom(value: unknown): number | null {
  const number = nonNegativeNumberFrom(value);
  return number === null ? null : Math.floor(number);
}

function numberFromFields(record: Record<string, unknown>, ...fields: string[]): number | null {
  for (const field of fields) {
    const value = numberFrom(record[field]);
    if (value !== null) return value;
  }
  return null;
}

function countFromFields(record: Record<string, unknown>, ...fields: string[]): number | null {
  for (const field of fields) {
    const value = countFrom(record[field]);
    if (value !== null) return value;
  }
  return null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function ratioFrom(value: unknown): number | null {
  const normalizedValue = scalarValue(value) ?? value;
  if (typeof normalizedValue === "string") {
    const normalized = normalizedValue.trim();
    if (normalized.endsWith("%")) {
      const parsed = numberFrom(normalized.slice(0, -1));
      return parsed === null ? null : parsed / 100;
    }
    const textPercent = normalized.match(/^(.+?)\s*(?:percent|pct)$/i);
    if (textPercent) {
      const parsed = numberFrom(textPercent[1].trim());
      return parsed === null ? null : parsed / 100;
    }
  }
  const parsed = numberFrom(normalizedValue);
  if (parsed === null) return null;
  return parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
}

function normalizeLookup(value: unknown): string | null {
  const normalizedValue = scalarValue(value);
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue)) return String(normalizedValue);
  if (typeof normalizedValue !== "string") return null;
  const normalized = normalizedValue.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function stageText(value: unknown, seen = new WeakSet<object>()): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  const candidates = [
    record.status,
    record.state,
    record.type,
    record.name,
    record.label,
    record.value,
    (record.data as Record<string, unknown> | undefined)?.attributes,
  ];
  for (const candidate of candidates) {
    const normalized = stageText(candidate, seen);
    if (normalized && normalized.trim()) {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function normalizeStageKey(value: unknown): string {
  const normalizedValue = stageText(value);
  return typeof normalizedValue === "string"
    ? normalizedValue.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : "";
}

function booleanValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  const candidates = [
    record.value,
    record.boolean,
    record.booleanValue,
    record.boolean_value,
    record.enabled,
    record.active,
    record.flag,
    (record.data as Record<string, unknown> | undefined)?.attributes,
  ];
  for (const candidate of candidates) {
    const normalized = booleanValue(candidate, seen);
    if (typeof normalized === "boolean" || typeof normalized === "number" || typeof normalized === "string") {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function isTrueLike(value: unknown): boolean {
  const normalizedValue = booleanValue(value);
  if (normalizedValue === true) return true;
  if (typeof normalizedValue === "number") return normalizedValue === 1;
  if (typeof normalizedValue !== "string") return false;
  return ["true", "yes", "y", "1"].includes(normalizedValue.trim().toLowerCase());
}

function normalizeProviderKey(value: unknown): string {
  const normalizedValue = scalarValue(value);
  if (typeof normalizedValue !== "string") return "";
  const normalized = normalizedValue
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (RAW_PROVIDER_KEYS.has(normalized)) return normalized;
  const compactNormalized = normalized.replaceAll("_", "");
  return RAW_PROVIDERS.find((provider) => provider.replaceAll("_", "") === compactNormalized) ?? normalized;
}

function objectTypeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  const normalizedValue = scalarValue(value);
  if (normalizedValue !== null && normalizedValue !== undefined && typeof normalizedValue !== "object") {
    return normalizedValue;
  }
  if (value === null || value === undefined || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.length === 1 ? objectTypeValue(value[0], seen) : null;
    seen.delete(value);
    return normalized;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const dataAttributes = asRecord(data.attributes);
  const candidates = [
    record.objectType,
    record.object_type,
    record.type,
    data.objectType,
    data.object_type,
    data.type,
    dataAttributes.objectType,
    dataAttributes.object_type,
    dataAttributes.type,
  ];
  for (const candidate of candidates) {
    const normalized = scalarValue(candidate);
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function normalizeObjectType(value: unknown): string {
  const normalizedValue = objectTypeValue(value);
  if (typeof normalizedValue !== "string") return "";
  return normalizedValue
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeExternalId(value: unknown): string {
  const normalizedValue = scalarValue(value);
  return typeof normalizedValue === "string" ? normalizedValue.trim() : "";
}

function normalizeEmailDomain(value: unknown): string | null {
  const email = normalizeLookup(value);
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  return domain && !GENERIC_EMAIL_DOMAINS.has(domain) ? domain : null;
}

function scalarDateValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.length === 1 ? scalarDateValue(value[0], seen) : null;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.value,
    record.date,
    record.datetime,
    record.dateTime,
    record.date_time,
    record.timestamp,
    record.time,
    record.iso,
    record.isoString,
    record.iso_string,
    record.seconds,
    record.milliseconds,
    record.millis,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ];
  for (const candidate of candidates) {
    const normalized = scalarDateValue(candidate, seen);
    if (normalized instanceof Date) return normalized;
    if (normalized !== null && normalized !== undefined && typeof normalized !== "object") return normalized;
  }

  return value;
}

function dateFrom(value: unknown): Date | null {
  const normalizedValue = scalarDateValue(value);
  if (!normalizedValue) return null;
  if (normalizedValue instanceof Date) return Number.isNaN(normalizedValue.getTime()) ? null : normalizedValue;
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue)) {
    const millis = normalizedValue < 10_000_000_000 ? normalizedValue * 1000 : normalizedValue;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof normalizedValue === "string" && normalizedValue.trim()) {
    const normalized = normalizedValue.trim();
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      const timestamp = Number(normalized);
      if (Number.isFinite(timestamp) && timestamp > 0) {
        const millis = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
        const date = new Date(millis);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIso(value: Date | string | null | undefined): string | null {
  const date = dateFrom(value);
  return date ? date.toISOString() : null;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeTenantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeContext(context: InvestorDashboardExportContext): InvestorDashboardExportContext {
  return {
    userId: normalizeTenantId(context.userId),
    organizationId: normalizeTenantId(context.organizationId),
  };
}

function scopeKeyForContext(context: InvestorDashboardExportContext): string {
  const normalized = normalizeContext(context);
  if (normalized.organizationId) return `org:${normalized.organizationId}`;
  if (normalized.userId) return `user:${normalized.userId}`;
  return "global";
}

function canonicalMetricScopeWhere(context: InvestorDashboardExportContext) {
  if (context.organizationId) {
    const scopedRows = context.userId ? [{ userId: context.userId, organizationId: context.organizationId }] : [];
    const legacyUserRows = context.userId ? [{ userId: context.userId, organizationId: null }] : [];
    return {
      OR: [
        ...scopedRows,
        { userId: null, organizationId: context.organizationId },
        ...legacyUserRows,
        { userId: null, organizationId: null },
      ],
    };
  }

  if (!context.userId) {
    return {
      OR: [{ userId: null, organizationId: null }],
    };
  }

  return {
    OR: [
      { userId: context.userId, organizationId: null },
      { userId: null, organizationId: null },
    ],
  };
}

function canonicalMetricMatchesContext(
  row: CanonicalMetricRow,
  context: InvestorDashboardExportContext,
): boolean {
  if (row.userId === undefined && row.organizationId === undefined) return true;

  const rowUserId = row.userId ?? null;
  const rowOrganizationId = row.organizationId ?? null;

  if (context.organizationId) {
    if (rowOrganizationId === context.organizationId) {
      return rowUserId === null || rowUserId === context.userId;
    }
    if (rowOrganizationId === null) {
      return rowUserId === null || Boolean(context.userId && rowUserId === context.userId);
    }
    return false;
  }

  if (context.userId) {
    return rowOrganizationId === null && (rowUserId === null || rowUserId === context.userId);
  }

  return rowUserId === null && rowOrganizationId === null;
}

function weekStartUtc(value: Date): string {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return isoDate(date);
}

function recordDate(record: RawSourceRecordRow): Date | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const startSources = sources.map((source) => nestedRecord(source.start));
  const endSources = sources.map((source) => nestedRecord(source.end));
  const firstDateFromSources = (sourceRecords: Record<string, unknown>[], keys: string[]): Date | null => {
    for (const source of sourceRecords) {
      for (const key of keys) {
        const date = dateFrom(source[key]);
        if (date) return date;
      }
    }
    return null;
  };
  return (
    firstDateFromSources(sources, [
      "closedAt",
      "closed_at",
      "closeDate",
      "close_date",
      "closedate",
      "created",
      "createdAt",
      "created_at",
      "createdate",
      "hs_createdate",
      "currentPeriodStart",
      "current_period_start",
      "currentPeriodEnd",
      "current_period_end",
      "startedAt",
      "started_at",
      "startDate",
      "start_date",
      "startAt",
      "start_at",
      "startTime",
      "start_time",
      "eventStart",
      "event_start",
    ]) ??
    firstDateFromSources(startSources, ["dateTime", "date_time", "date"]) ??
    firstDateFromSources(endSources, ["dateTime", "date_time", "date"]) ??
    dateFrom(record.occurredAt) ??
    dateFrom(record.sourceUpdatedAt) ??
    dateFrom(record.sourceCreatedAt)
  );
}

function weeklyEntry(byWeek: Map<string, WeeklyPoint>, date: Date): WeeklyPoint {
  const week = weekStartUtc(date);
  const existing = byWeek.get(week);
  if (existing) return existing;
  const entry = { week, demos: 0, customers: 0, revenue: 0 };
  byWeek.set(week, entry);
  return entry;
}

function metricStatus(status: unknown): string {
  return normalizeMetricStatus(status);
}

function currencyFrom(...values: Array<Record<string, unknown> | null | undefined>): string {
  for (const value of values) {
    const currency = scalarValue(value?.currency);
    if (typeof currency === "string" && currency.trim()) return currency.trim().toUpperCase();
  }
  return "USD";
}

function canonicalMetricScopeSpecificity(
  row: CanonicalMetricRow,
  context: InvestorDashboardExportContext,
): number {
  if (row.userId === undefined && row.organizationId === undefined) return 1;

  const rowUserId = row.userId ?? null;
  const rowOrganizationId = row.organizationId ?? null;

  if (context.organizationId) {
    if (rowUserId === context.userId && rowOrganizationId === context.organizationId) return 4;
    if (context.userId && rowUserId === context.userId && rowOrganizationId === null) return 3;
    if (rowUserId === null && rowOrganizationId === context.organizationId) return 2;
    if (rowUserId === null && rowOrganizationId === null) return 1;
    return 0;
  }

  if (context.userId) {
    if (rowUserId === context.userId && rowOrganizationId === null) return 3;
    if (rowUserId === null && rowOrganizationId === null) return 1;
    return 0;
  }

  return rowUserId === null && rowOrganizationId === null ? 1 : 0;
}

function latestMetricsByKey(
  rows: CanonicalMetricRow[],
  context: InvestorDashboardExportContext,
): Map<string, CanonicalMetricRow> {
  const sortedRows = [...rows].sort((left, right) => {
    const scopeDelta =
      canonicalMetricScopeSpecificity(right, context) -
      canonicalMetricScopeSpecificity(left, context);
    if (scopeDelta !== 0) return scopeDelta;
    const periodDelta =
      (dateFrom(right.periodEnd)?.getTime() ?? 0) -
      (dateFrom(left.periodEnd)?.getTime() ?? 0);
    if (periodDelta !== 0) return periodDelta;
    return (
      (dateFrom(right.computedAt)?.getTime() ?? 0) -
      (dateFrom(left.computedAt)?.getTime() ?? 0)
    );
  });
  const byKey = new Map<string, CanonicalMetricRow>();
  for (const row of sortedRows) {
    if (!byKey.has(row.metricKey)) {
      byKey.set(row.metricKey, row);
    }
  }
  return byKey;
}

function rowsWithinExportWindow(
  rows: CanonicalMetricRow[],
  toDate: Date,
  now: Date,
): CanonicalMetricRow[] {
  const maxPeriodEnd = toDate.getTime();
  const maxComputedAt = now.getTime();
  return rows.filter((row) => {
    const periodStart = dateFrom(row.periodStart);
    const periodEnd = dateFrom(row.periodEnd);
    const computedAt = dateFrom(row.computedAt);
    return (
      periodStart !== null &&
      periodEnd !== null &&
      periodStart.getTime() <= periodEnd.getTime() &&
      periodEnd.getTime() <= maxPeriodEnd &&
      computedAt !== null &&
      computedAt.getTime() <= maxComputedAt
    );
  });
}

function rawRecordScopeWhere(context: InvestorDashboardExportContext): {
  OR: Array<Record<string, string | null>>;
} {
  if (context.organizationId) {
    const organizationScopeKey = scopeKeyForContext({
      userId: null,
      organizationId: context.organizationId,
    });
    return {
      OR: [
        { scopeKey: organizationScopeKey, organizationId: context.organizationId },
        ...(context.userId
          ? [
              { scopeKey: organizationScopeKey, userId: context.userId },
              {
                scopeKey: scopeKeyForContext({ userId: context.userId, organizationId: null }),
                userId: context.userId,
              },
            ]
          : []),
        { scopeKey: "global", userId: null, organizationId: null },
      ],
    };
  }

  if (context.userId) {
    return {
      OR: [
        {
          scopeKey: scopeKeyForContext(context),
          userId: context.userId,
        },
        { scopeKey: "global", userId: null, organizationId: null },
      ],
    };
  }

  return {
    OR: [{ scopeKey: "global", userId: null, organizationId: null }],
  };
}

function rawRecordDeduplicationKey(record: RawSourceRecordRow): string {
  const provider = normalizeProviderKey(record.provider);
  const objectType = normalizeObjectType(record.objectType);
  const externalId = normalizeExternalId(record.externalId);
  if (externalId) return `${provider}:${objectType}:external:${externalId}`;
  return `${provider}:${objectType}:raw:${record.id.trim()}`;
}

function rawRecordIdentityFallback(record: RawSourceRecordRow): string {
  return normalizeExternalId(record.externalId) || record.id.trim();
}

function rawRecordScopeRank(record: RawSourceRecordRow, context: InvestorDashboardExportContext): number {
  const rowUserId = record.userId ?? null;
  const rowOrganizationId = record.organizationId ?? null;
  const scopeKey = record.scopeKey ?? null;

  if (context.organizationId) {
    const organizationScopeKey = scopeKeyForContext({
      userId: null,
      organizationId: context.organizationId,
    });
    if (
      context.userId &&
      rowUserId === context.userId &&
      (rowOrganizationId === context.organizationId || rowOrganizationId === null) &&
      scopeKey === organizationScopeKey
    ) {
      return 4;
    }
    if (rowUserId === null && rowOrganizationId === context.organizationId && scopeKey === organizationScopeKey) {
      return 3;
    }
    if (
      context.userId &&
      rowUserId === context.userId &&
      rowOrganizationId === null &&
      scopeKey === scopeKeyForContext({ userId: context.userId, organizationId: null })
    ) {
      return 2;
    }
    if (rowUserId === null && rowOrganizationId === null && scopeKey === "global") return 1;
    if (record.userId === undefined && record.organizationId === undefined && record.scopeKey === undefined) return 1;
    return 0;
  }

  if (
    context.userId &&
    rowUserId === context.userId &&
    rowOrganizationId === null &&
    scopeKey === scopeKeyForContext({ userId: context.userId, organizationId: null })
  ) {
    return 2;
  }
  if (rowUserId === null && rowOrganizationId === null && scopeKey === "global") return 1;
  if (record.userId === undefined && record.organizationId === undefined && record.scopeKey === undefined) return 1;
  return 0;
}

function rawRecordTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  const date = recordDate(record);
  if (!date || date.getTime() > asOf.getTime()) return 0;
  return date.getTime();
}

function compareRawRecordPreference(
  left: RawSourceRecordRow,
  right: RawSourceRecordRow,
  context: InvestorDashboardExportContext,
  asOf: Date,
): number {
  const scopeDelta = rawRecordScopeRank(right, context) - rawRecordScopeRank(left, context);
  if (scopeDelta !== 0) return scopeDelta;
  return rawRecordTimestampAsOf(right, asOf) - rawRecordTimestampAsOf(left, asOf);
}

function dedupeRawSourceRecords(
  records: RawSourceRecordRow[],
  context: InvestorDashboardExportContext,
  asOf: Date,
): RawSourceRecordRow[] {
  const bestByObject = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    if (rawRecordScopeRank(record, context) === 0) continue;
    const key = rawRecordDeduplicationKey(record);
    const current = bestByObject.get(key);
    if (!current || compareRawRecordPreference(current, record, context, asOf) > 0) {
      bestByObject.set(key, record);
    }
  }
  return [...bestByObject.values()];
}

function earlierDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function stripeCustomerId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const customerSources = [...sources, ...subscriptionSources].map((source) => nestedRecord(source.customer));
  return normalizeLookup(
    firstValueFromSources([...sources, ...subscriptionSources, ...customerSources], [
      "customerId",
      "customer_id",
      "stripeCustomerId",
      "stripe_customer_id",
      "id",
    ]),
  );
}

function stripeCustomerEmail(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const customerSources = [...sources, ...subscriptionSources].map((source) => nestedRecord(source.customer));
  return normalizeLookup(
    firstValueFromSources([...sources, ...subscriptionSources, ...customerSources], [
      "customerEmail",
      "customer_email",
      "email",
    ]),
  );
}

function isActiveStripeSubscription(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "STRIPE") return false;
  if (!["subscription", "active_customer_ref"].includes(normalizeObjectType(record.objectType))) return false;
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const status = normalizeStageKey(firstValueFromSources([...sources, ...subscriptionSources], ["status"]));
  return !status || !INACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

function hubspotDealStage(record: RawSourceRecordRow): string {
  const payload = asRecord(record.payload);
  return normalizeStageKey(
    firstValueFromSources(wrapperSources(payload), [
      "dealstage",
      "stage",
      "stageLabel",
      "stage_label",
      "stageId",
      "stage_id",
    ]),
  );
}

function hubspotCustomerId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  return normalizeLookup(
    firstValueFromSources(wrapperSources(payload), [
      "stripeCustomerId",
      "stripe_customer_id",
      "customerId",
      "customer_id",
    ]),
  );
}

function hubspotEmail(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  return normalizeLookup(
    firstValueFromSources(wrapperSources(payload), [
      "primaryContactEmail",
      "primary_contact_email",
      "contactEmail",
      "contact_email",
      "email",
    ]),
  );
}

function isHubspotSubscriptionRecord(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "HUBSPOT") return false;
  const objectType = normalizeObjectType(record.objectType);
  if (objectType === "subscription_deal") return true;
  if (objectType !== "deal") return false;
  const stage = hubspotDealStage(record);
  const payload = asRecord(record.payload);
  const recurringFlag = firstValueFromSources(wrapperSources(payload), [
    "recurringRevenue",
    "recurring_revenue",
  ]);
  return (
    stage === "subscription" ||
    stage === "subscriptions" ||
    isTrueLike(recurringFlag)
  );
}

function recordWithinExportWindow(record: RawSourceRecordRow, fromDate: Date, toDate: Date): boolean {
  const date = recordDate(record);
  return date !== null && isWithinDateWindow(date, fromDate, toDate);
}

function activeSubscriptionCount(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): number {
  const windowedRecords = records.filter((record) => recordWithinExportWindow(record, fromDate, toDate));
  const stripeRecords = windowedRecords.filter(isActiveStripeSubscription);
  const stripeCustomerIds = new Set(
    stripeRecords.map(stripeCustomerId).filter((value): value is string => Boolean(value)),
  );
  const stripeEmails = new Set(
    stripeRecords.map(stripeCustomerEmail).filter((value): value is string => Boolean(value)),
  );
  const stripeDomains = new Set(
    stripeRecords
      .map((record) => normalizeEmailDomain(stripeCustomerEmail(record)))
      .filter((value): value is string => Boolean(value)),
  );
  const stripeSubscriptionKeys = new Set(
    stripeRecords.map((record) => stripeCustomerId(record) ?? rawRecordIdentityFallback(record)),
  );
  const hubspotOnlyKeys = new Set<string>();

  for (const record of windowedRecords) {
    if (!isHubspotSubscriptionRecord(record)) continue;
    const customerId = hubspotCustomerId(record);
    const email = hubspotEmail(record);
    const emailDomain = normalizeEmailDomain(email);
    const linkedToStripe =
      Boolean(customerId && stripeCustomerIds.has(customerId)) ||
      Boolean(email && stripeEmails.has(email)) ||
      Boolean(emailDomain && stripeDomains.has(emailDomain));
    if (linkedToStripe) continue;
    hubspotOnlyKeys.add(customerId ?? email ?? rawRecordIdentityFallback(record));
  }

  return stripeSubscriptionKeys.size + hubspotOnlyKeys.size;
}

function isDemoRecord(record: RawSourceRecordRow): boolean {
  if (!["GOOGLE_WORKSPACE", "HUBSPOT"].includes(normalizeProviderKey(record.provider))) return false;
  if (!["event", "calendar_event", "meeting", "demo", "deal"].includes(normalizeObjectType(record.objectType))) {
    return false;
  }
  const payload = asRecord(record.payload);
  const textKeys = [
    "summary",
    "title",
    "name",
    "subject",
    "description",
    "dealName",
    "dealname",
    "stageLabel",
    "stage_label",
    "stage",
    "dealstage",
  ];
  const text = wrapperSources(payload)
    .flatMap((source) => textKeys.map((key) => source[key]))
    .map((value) => scalarValue(value))
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /\bdemo\b/.test(text) || hubspotDealStage(record) === "appointmentscheduled";
}

function isClosedWonDeal(record: RawSourceRecordRow): boolean {
  return (
    normalizeProviderKey(record.provider) === "HUBSPOT" &&
    normalizeObjectType(record.objectType) === "deal" &&
    ["closedwon", "won"].includes(hubspotDealStage(record))
  );
}

function stripeChargeRevenue(record: RawSourceRecordRow): number {
  if (normalizeProviderKey(record.provider) !== "STRIPE" || normalizeObjectType(record.objectType) !== "charge") {
    return 0;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const status = normalizeStageKey(firstValueFromSources(sources, ["status"]));
  if (status && status !== "succeeded" && status !== "paid") return 0;
  const explicitDecimal = nonNegativeNumberFrom(
    firstValueFromSources(sources, [
      "amountDecimal",
      "amount_decimal",
      "amountDollars",
      "amount_dollars",
      "amountUsd",
      "amount_usd",
    ]),
  );
  const explicitCents = nonNegativeNumberFrom(
    firstValueFromSources(sources, ["amountCents", "amount_cents"]),
  );
  const amount = nonNegativeNumberFrom(
    firstValueFromSources(sources, [
      "amount",
      "amount_paid",
      "amountPaid",
      "amount_captured",
      "amountCaptured",
      "amount_received",
      "amountReceived",
      "netAmount",
      "net_amount",
      "value",
    ]),
  );
  const grossRevenue =
    explicitDecimal ??
    (explicitCents !== null
      ? explicitCents / 100
      : amount === null
        ? 0
        : amount / 100);
  const refundedDecimal = nonNegativeNumberFrom(
    firstValueFromSources(sources, [
      "amountRefundedDecimal",
      "amount_refunded_decimal",
      "refundedAmountDecimal",
      "refunded_amount_decimal",
    ]),
  );
  const refundedCents = nonNegativeNumberFrom(
    firstValueFromSources(sources, [
      "amountRefunded",
      "amount_refunded",
      "amountRefundedCents",
      "amount_refunded_cents",
      "refundedAmount",
      "refunded_amount",
      "refundedAmountCents",
      "refunded_amount_cents",
      "refundAmount",
      "refund_amount",
      "refundAmountCents",
      "refund_amount_cents",
    ]),
  );
  const refundedRevenue = refundedDecimal ?? (refundedCents === null ? 0 : refundedCents / 100);
  return Math.max(0, grossRevenue - refundedRevenue);
}

function isWithinDateWindow(date: Date, fromDate: Date, toDate: Date): boolean {
  const timestamp = date.getTime();
  return timestamp >= fromDate.getTime() && timestamp <= toDate.getTime();
}

function buildWeekly(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): WeeklyPoint[] {
  const byWeek = new Map<string, WeeklyPoint>();

  for (const record of records) {
    const date = recordDate(record);
    if (!date) continue;
    if (!isWithinDateWindow(date, fromDate, toDate)) continue;
    const entry = weeklyEntry(byWeek, date);
    if (isDemoRecord(record)) entry.demos += 1;
    if (isClosedWonDeal(record)) entry.customers += 1;
    entry.revenue += stripeChargeRevenue(record);
  }

  return Array.from(byWeek.values())
    .map((point) => ({ ...point, revenue: roundMoney(point.revenue) }))
    .filter((point) => point.demos > 0 || point.customers > 0 || point.revenue > 0)
    .sort((left, right) => left.week.localeCompare(right.week));
}

function metricPayload(row: CanonicalMetricRow | undefined): Record<string, unknown> {
  if (!row) return {};
  const status = metricStatus(row.status);
  if (status === "missing" || status === "error") return {};
  return asRecord(flattenedCanonicalMetricValue(row.value));
}

function buildMetrics(rowsByKey: Map<string, CanonicalMetricRow>) {
  return INVESTOR_METRIC_KEYS.map((key) => {
    const row = rowsByKey.get(key);
    return {
      key,
      department: row?.department ?? null,
      unit: row?.unit ?? null,
      value: row ? flattenedCanonicalMetricValue(row.value) : null,
      status: row ? metricStatus(row.status) : "missing",
      confidence: normalizeMetricConfidence(row?.confidence),
      warnings: row
        ? normalizeMetricWarnings(row.warnings)
        : ["Canonical Imladris materialization is missing for this metric."],
      periodStart: toIso(row?.periodStart),
      periodEnd: toIso(row?.periodEnd),
      calculationVersion: row?.calculationVersion ?? null,
      computedAt: toIso(row?.computedAt),
      sourceLineage:
        row?.lineage?.map((lineage) => ({
          sourceKey: lineage.sourceKey,
          sourceType: lineage.sourceType,
          sourceId: lineage.sourceId,
          rawRecordId: lineage.rawRecordId,
          capturedAt: toIso(lineage.capturedAt),
          metadata: lineage.metadata,
        })) ?? [],
    };
  });
}

export async function buildInvestorDashboardExport(input: {
  prisma: Pick<PrismaClientType, "imladrisCanonicalMetricValue" | "imladrisRawSourceRecord">;
  context: InvestorDashboardExportContext;
  range: InvestorDashboardRange;
  fromDate: Date;
  toDate: Date;
  now?: Date;
}) {
  const context = normalizeContext(input.context);
  const now = input.now ?? new Date();
  const [canonicalRows, rawRecords] = await Promise.all([
    input.prisma.imladrisCanonicalMetricValue.findMany({
      where: {
        metricKey: { in: [...INVESTOR_METRIC_KEYS] },
        periodEnd: { lte: input.toDate },
        computedAt: { lte: now },
        ...canonicalMetricScopeWhere(context),
      },
      include: {
        lineage: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
      orderBy: [{ periodEnd: "desc" }, { computedAt: "desc" }],
    }),
    input.prisma.imladrisRawSourceRecord.findMany({
      where: {
        provider: { in: [...RAW_PROVIDERS] },
        ...rawRecordScopeWhere(context),
        AND: [
          {
            OR: [
              { occurredAt: { gte: input.fromDate, lte: input.toDate } },
              { sourceUpdatedAt: { gte: input.fromDate, lte: input.toDate } },
              { sourceCreatedAt: { gte: input.fromDate, lte: input.toDate } },
            ],
          },
        ],
      },
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }, { sourceCreatedAt: "asc" }],
    }),
  ]);

  const dedupedRawRecords = dedupeRawSourceRecords(
    rawRecords as RawSourceRecordRow[],
    context,
    earlierDate(input.toDate, now),
  );
  const metricsByKey = latestMetricsByKey(
    rowsWithinExportWindow(canonicalRows as CanonicalMetricRow[], input.toDate, now).filter((row) =>
      canonicalMetricMatchesContext(row, context),
    ),
    context,
  );
  const mrr = metricPayload(metricsByKey.get("revenue.mrr"));
  const runway = metricPayload(metricsByKey.get("finance.cash_runway_months"));
  const netBurn = metricPayload(metricsByKey.get("finance.net_burn"));
  const pipeline = metricPayload(metricsByKey.get("sales.qualified_pipeline"));
  const currency = currencyFrom(mrr, runway, netBurn, pipeline);

  return {
    summary: {
      arr: roundMoney(numberFrom(mrr.arr) ?? (numberFrom(mrr.amount) ?? 0) * 12),
      mrr: roundMoney(numberFrom(mrr.amount) ?? 0),
      activeSubscriptions: activeSubscriptionCount(dedupedRawRecords, input.fromDate, input.toDate),
      runwayMonths: numberFrom(runway.months) ?? 0,
      cashBalance: roundMoney(numberFromFields(runway, "cashBalance", "cash_balance") ?? 0),
      netBurn: roundMoney(
        numberFromFields(netBurn, "amount", "netBurn", "net_burn") ??
          numberFromFields(runway, "netBurn", "net_burn") ??
          0,
      ),
      currency,
    },
    weekly: buildWeekly(dedupedRawRecords, input.fromDate, input.toDate),
    pipeline: {
      qualifiedPipelineValue: roundMoney(numberFrom(pipeline.amount) ?? 0),
      qualifiedPipelineCount: countFromFields(pipeline, "qualifiedDealCount", "qualified_deal_count") ?? 0,
      collaborationTouchCount: countFromFields(pipeline, "collaborationTouchCount", "collaboration_touch_count") ?? 0,
      collaborationCoverage: roundRatio(
        ratioFrom(pipeline.collaborationCoverage ?? pipeline.collaboration_coverage) ?? 0,
      ),
      currency: currencyFrom(pipeline, mrr, runway, netBurn),
    },
    metrics: buildMetrics(metricsByKey),
    meta: {
      servedAt: now.toISOString(),
      range: input.range,
      from: isoDate(input.fromDate),
      to: isoDate(input.toDate),
      source: EXPORT_SOURCE,
      schemaVersion: EXPORT_SCHEMA_VERSION,
    },
  };
}

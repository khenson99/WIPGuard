import { normalizeMetricConfidence, normalizeMetricStatus, normalizeMetricWarnings } from "@/lib/imladris/confidence";
import { getImladrisDashboardDefinition, getImladrisDerivedMetricDefinition } from "@/lib/imladris/catalog";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";
import { normalizeImladrisObjectType } from "@/lib/imladris/object-types";
import { attachWinnerLineage } from "@/lib/imladris/winner-lineage";
import type { PrismaClientType } from "@/lib/prisma";

// Derived metrics are computed on read and never materialized as canonical
// rows, so this export (which reads canonical rows directly) excludes them.
const INVESTOR_METRIC_KEYS = (getImladrisDashboardDefinition("company")?.metricKeys ?? [
  "revenue.mrr",
  "revenue.arr",
  "revenue.subscription_revenue",
  "revenue.services_revenue",
  "revenue.active_subscriptions",
  "revenue.customer_count",
  "finance.cash_balance",
  "finance.cash_runway_months",
  "finance.net_burn",
  "finance.expenses",
  "finance.gross_margin",
  "sales.qualified_pipeline",
  "sales.demos",
  "marketing.website_traffic",
  "marketing.conversion_rate",
  "marketing.pipeline_efficiency",
  "product.activation_rate",
  "customer_success.customer_health",
  "customer_success.customer_activity",
  "customer_success.churn_rate",
  "customer_success.retention_rate",
  "customer_success.retention_risk",
]).filter((key) => getImladrisDerivedMetricDefinition(key) === null);
const EXPORT_SOURCE = "imladris-investor-dashboard-export";
const EXPORT_SCHEMA_VERSION = 1;
const RAW_PROVIDERS = [
  "STRIPE",
  "HUBSPOT",
  "MERCURY",
  "GOOGLE_ANALYTICS",
  "GOOGLE_ADS",
  "META_ADS",
  "META_PAGE",
  "REDDIT",
  "SEMRUSH",
  "CODA",
  "GOOGLE_WORKSPACE",
  "SLACK",
  "WEBFLOW",
  "GOOGLE_SEARCH_CONSOLE",
  "UNIFY",
  "POSTHOG",
  "PYLON",
] as const;
const RAW_PROVIDER_KEYS = new Set<string>(RAW_PROVIDERS);
const PAID_AD_PROVIDERS = new Set(["GOOGLE_ADS", "META_ADS", "META_PAGE", "REDDIT"]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "cancelled",
  "incomplete",
  "incompleteexpired",
  "paused",
  "unpaid",
]);
const TERMINAL_DEAL_STAGE_KEYS = new Set(["closedwon", "closedlost", "won", "lost"]);
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
  id: string;
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
  /**
   * Loaded separately for winning rows only — never eagerly included on the
   * full canonical history (see the 2026-06-11 pgsql_tmp incident).
   */
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

interface RawDerivedMetricRow {
  department: string;
  unit: string;
  value: unknown;
  confidence: number;
  warnings: string[];
  calculationVersion: string;
  computedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  lineage: MetricLineageRow[];
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
  return normalizeImladrisObjectType(normalizedValue);
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

function stripeCustomerIdentity(record: RawSourceRecordRow): string | null {
  const customerId = stripeCustomerId(record);
  if (customerId) return `stripe:${customerId}`;

  const email = stripeCustomerEmail(record);
  if (email) return `email:${email}`;

  const emailDomain = normalizeEmailDomain(email);
  if (emailDomain) return `domain:${emailDomain}`;

  if (normalizeObjectType(record.objectType) === "active_customer_ref") {
    const externalId = normalizeLookup(record.externalId);
    if (externalId) return `stripe:${externalId}`;
  }

  return null;
}

function hubspotCustomerIdentity(record: RawSourceRecordRow): string {
  const customerId = hubspotCustomerId(record);
  if (customerId) return `stripe:${customerId}`;

  const email = hubspotEmail(record);
  if (email) return `email:${email}`;

  const emailDomain = normalizeEmailDomain(email);
  if (emailDomain) return `domain:${emailDomain}`;

  return `hubspot:${rawRecordIdentityFallback(record)}`;
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

function rawActiveSubscriptionCounts(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  total: number;
  stripe: number;
  hubspotOnly: number;
} {
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

  return {
    total: stripeSubscriptionKeys.size + hubspotOnlyKeys.size,
    stripe: stripeSubscriptionKeys.size,
    hubspotOnly: hubspotOnlyKeys.size,
  };
}

function rawCustomerCounts(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  total: number;
  stripe: number;
  hubspotOnly: number;
} {
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
  const stripeCustomerKeys = new Set(
    stripeRecords.map(stripeCustomerIdentity).filter((value): value is string => Boolean(value)),
  );
  const hubspotOnlyCustomerKeys = new Set<string>();

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
    hubspotOnlyCustomerKeys.add(hubspotCustomerIdentity(record));
  }

  return {
    total: stripeCustomerKeys.size + hubspotOnlyCustomerKeys.size,
    stripe: stripeCustomerKeys.size,
    hubspotOnly: hubspotOnlyCustomerKeys.size,
  };
}

function rawDemoCounts(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  count: number;
  requestedDemos: number;
  webflowDemoRequests: number;
} {
  const demoRecords = records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && isDemoRecord(record),
  );
  const webflowDemoRequests = demoRecords.filter(isWebflowDemoRequest).length;
  return {
    count: demoRecords.length,
    requestedDemos: webflowDemoRequests,
    webflowDemoRequests,
  };
}

function stripeChargeCurrency(record: RawSourceRecordRow): string {
  return currencyFrom(...wrapperSources(asRecord(record.payload)));
}

function rawRevenueTotals(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  total: number;
  currency: string;
} {
  const revenueRecords = records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && stripeChargeRevenue(record) > 0,
  );
  const total = revenueRecords.reduce((sum, record) => sum + stripeChargeRevenue(record), 0);
  return {
    total: roundMoney(total),
    currency: revenueRecords[0] ? stripeChargeCurrency(revenueRecords[0]) : "USD",
  };
}

function arrayValuesFromContainer(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const record = value as Record<string, unknown>;
  for (const candidate of [
    record.data,
    record.items,
    record.values,
    record.lines,
    record.records,
    record.results,
    asRecord(record.data).data,
    asRecord(record.attributes).data,
  ]) {
    const values = arrayValuesFromContainer(candidate, seen);
    if (values.length > 0) {
      seen.delete(value);
      return values;
    }
  }

  seen.delete(value);
  return [];
}

function stripeInvoiceIsPaid(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "STRIPE" || normalizeObjectType(record.objectType) !== "invoice") {
    return false;
  }
  const sources = wrapperSources(asRecord(record.payload));
  const paid = booleanValue(firstValueFromSources(sources, ["paid", "isPaid", "is_paid"]));
  if (paid === false) return false;
  if (paid === true) return true;
  const status = normalizeStageKey(firstValueFromSources(sources, ["status", "state"]));
  if (["void", "voided", "draft", "open", "uncollectible"].includes(status)) return false;
  if (status === "paid") return true;
  const amountPaid = numberFrom(firstValueFromSources(sources, ["amount_paid", "amountPaid", "amountPaidCents"]));
  return Boolean(amountPaid && amountPaid > 0);
}

function stripeInvoiceLineItems(record: RawSourceRecordRow): Record<string, unknown>[] {
  const sources = wrapperSources(asRecord(record.payload));
  const containers = sources.flatMap((source) => [
    source.lines,
    source.invoiceLines,
    source.invoice_lines,
    nestedRecord(source.invoice).lines,
    nestedRecord(source.invoice).invoiceLines,
    nestedRecord(source.invoice).invoice_lines,
  ]);
  return containers.flatMap((container) => arrayValuesFromContainer(container).map(nestedRecord));
}

function stripeInvoiceLineAmount(item: Record<string, unknown>): number {
  const amount = nonNegativeNumberFrom(
    firstValueFromSources(wrapperSources(item), [
      "amount",
      "amount_excluding_tax",
      "amountExcludingTax",
      "subtotal",
      "subtotal_excluding_tax",
      "subtotalExcludingTax",
    ]),
  );
  return amount === null ? 0 : amount / 100;
}

function stripeInvoiceLineHasRecurringEvidence(item: Record<string, unknown>): boolean {
  const sources = wrapperSources(item);
  const parentSources = sources.map((source) => nestedRecord(source.parent));
  const subscriptionItemSources = parentSources.flatMap((source) => [
    nestedRecord(source.subscription_item_details),
    nestedRecord(source.subscriptionItemDetails),
  ]);
  const priceSources = sources.flatMap((source) => [
    ...wrapperSources(nestedRecord(source.price)),
    ...wrapperSources(nestedRecord(source.pricing)),
    ...wrapperSources(nestedRecord(source.plan)),
  ]);
  const recurringEvidence = firstValueFromSources(priceSources, ["recurring", "interval"]);
  if (recurringEvidence !== null && recurringEvidence !== undefined) return true;
  return Boolean(
    normalizeLookup(
      firstValueFromSources([...sources, ...subscriptionItemSources], [
        "subscription",
        "subscriptionId",
        "subscription_id",
        "subscription_item",
        "subscriptionItem",
        "subscription_item_id",
        "subscriptionItemId",
      ]),
    ),
  );
}

function stripeInvoiceLineIsOneTimeService(item: Record<string, unknown>): boolean {
  if (stripeInvoiceLineAmount(item) <= 0 || stripeInvoiceLineHasRecurringEvidence(item)) return false;
  const sources = wrapperSources(item);
  const parentSources = sources.map((source) => nestedRecord(source.parent));
  const priceSources = sources.flatMap((source) => [
    ...wrapperSources(nestedRecord(source.price)),
    ...wrapperSources(nestedRecord(source.pricing)),
    ...wrapperSources(nestedRecord(source.plan)),
  ]);
  const productSources = priceSources.flatMap((source) => [
    ...wrapperSources(nestedRecord(source.product)),
    ...wrapperSources(nestedRecord(source.product_details)),
    ...wrapperSources(nestedRecord(source.productDetails)),
  ]);
  const typeSignals = [...sources, ...parentSources, ...priceSources]
    .flatMap((source) => [source.type, source.billingScheme, source.billing_scheme])
    .map((value) => String(scalarValue(value) ?? "").trim().toLowerCase().replace(/[\s_-]+/g, ""));
  if (typeSignals.some((signal) => ["invoiceitemdetails", "invoiceitem", "onetime"].includes(signal))) {
    return true;
  }

  const serviceSignals = [...sources, ...priceSources, ...productSources]
    .flatMap((source) => [
      source.description,
      source.name,
      source.nickname,
      source.productName,
      source.product_name,
      source.lineOfBusiness,
      source.line_of_business,
      source.category,
    ])
    .map((value) => String(scalarValue(value) ?? "").trim().toLowerCase());
  return serviceSignals.some((signal) =>
    /service|implementation|consulting|support|setup|onboarding|professional/.test(signal),
  );
}

function rawInvoiceRevenueComponents(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  subscriptionRevenue: number;
  servicesRevenue: number;
  total: number;
  currency: string;
  subscriptionInvoiceLines: number;
  stripeServiceInvoices: number;
  stripeServiceInvoiceLines: number;
} {
  const paidInvoices = records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && stripeInvoiceIsPaid(record),
  );
  let subscriptionRevenue = 0;
  let servicesRevenue = 0;
  let subscriptionInvoiceLines = 0;
  let stripeServiceInvoices = 0;
  let stripeServiceInvoiceLines = 0;

  for (const invoice of paidInvoices) {
    let serviceLinesForInvoice = 0;
    for (const line of stripeInvoiceLineItems(invoice)) {
      const amount = stripeInvoiceLineAmount(line);
      if (amount <= 0) continue;
      if (stripeInvoiceLineHasRecurringEvidence(line)) {
        subscriptionRevenue += amount;
        subscriptionInvoiceLines += 1;
        continue;
      }
      if (stripeInvoiceLineIsOneTimeService(line)) {
        servicesRevenue += amount;
        serviceLinesForInvoice += 1;
      }
    }
    if (serviceLinesForInvoice > 0) {
      stripeServiceInvoices += 1;
      stripeServiceInvoiceLines += serviceLinesForInvoice;
    }
  }

  return {
    subscriptionRevenue: roundMoney(subscriptionRevenue),
    servicesRevenue: roundMoney(servicesRevenue),
    total: roundMoney(subscriptionRevenue + servicesRevenue),
    currency: paidInvoices[0] ? stripeChargeCurrency(paidInvoices[0]) : "USD",
    subscriptionInvoiceLines,
    stripeServiceInvoices,
    stripeServiceInvoiceLines,
  };
}

function isMercuryTransaction(record: RawSourceRecordRow): boolean {
  return (
    normalizeProviderKey(record.provider) === "MERCURY" &&
    ["transaction", "bank_transaction"].includes(normalizeObjectType(record.objectType))
  );
}

function isMercuryBalanceRecord(record: RawSourceRecordRow): boolean {
  return (
    normalizeProviderKey(record.provider) === "MERCURY" &&
    ["account_balance", "balance"].includes(normalizeObjectType(record.objectType))
  );
}

function mercuryTransactionAmount(record: RawSourceRecordRow): number | null {
  const sources = wrapperSources(asRecord(record.payload));
  const explicitDecimal = numberFrom(
    firstValueFromSources(sources, [
      "amountDecimal",
      "amount_decimal",
      "amountDollars",
      "amount_dollars",
      "netAmountDecimal",
      "net_amount_decimal",
      "netAmountDollars",
      "net_amount_dollars",
    ]),
  );
  if (explicitDecimal !== null) return explicitDecimal;
  const explicitCents = numberFrom(
    firstValueFromSources(sources, [
      "amountCents",
      "amount_cents",
      "netAmountCents",
      "net_amount_cents",
      "valueCents",
      "value_cents",
    ]),
  );
  if (explicitCents !== null) return explicitCents / 100;
  const debitAmount = numberFrom(
    firstValueFromSources(sources, [
      "debitAmount",
      "debit_amount",
      "debit",
      "withdrawalAmount",
      "withdrawal_amount",
      "withdrawal",
    ]),
  );
  const creditAmount = numberFrom(
    firstValueFromSources(sources, [
      "creditAmount",
      "credit_amount",
      "credit",
      "depositAmount",
      "deposit_amount",
      "deposit",
    ]),
  );
  if (debitAmount !== null || creditAmount !== null) return Math.abs(creditAmount ?? 0) - Math.abs(debitAmount ?? 0);
  return numberFrom(firstValueFromSources(sources, ["amount", "netAmount", "net_amount", "value"]));
}

function mercuryTransactionIsCostOfGoodsSold(record: RawSourceRecordRow): boolean {
  const signals = wrapperSources(asRecord(record.payload))
    .flatMap((source) => [
      source.category,
      source.type,
      source.kind,
      source.description,
      source.memo,
      source.merchantName,
      source.merchant_name,
      source.counterpartyName,
      source.counterparty_name,
    ])
    .map((value) =>
      String(scalarValue(value) ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, ""),
    );
  return signals.some((signal) =>
    [
      "cogs",
      "costofgoodssold",
      "costofrevenue",
      "servicedelivery",
      "hostingcogs",
      "cloudhosting",
      "infrastructure",
      "supportdelivery",
    ].some((keyword) => signal.includes(keyword)),
  );
}

function stripeBalanceTransactionFeeAmount(record: RawSourceRecordRow): number {
  if (normalizeProviderKey(record.provider) !== "STRIPE" || normalizeObjectType(record.objectType) !== "balance_transaction") {
    return 0;
  }
  const feeCents = numberFrom(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), [
      "fee",
      "feeAmount",
      "fee_amount",
      "feeCents",
      "fee_cents",
      "stripeFee",
      "stripe_fee",
    ]),
  );
  return feeCents && feeCents > 0 ? feeCents / 100 : 0;
}

function stripeBalanceTransactionSourceId(record: RawSourceRecordRow): string | null {
  if (normalizeProviderKey(record.provider) !== "STRIPE" || normalizeObjectType(record.objectType) !== "balance_transaction") {
    return null;
  }
  return (
    normalizeLookup(
      firstValueFromSources(wrapperSources(asRecord(record.payload)), [
        "id",
        "balanceTransactionId",
        "balance_transaction_id",
        "transactionId",
        "transaction_id",
      ]),
    ) ?? normalizeLookup(record.externalId)
  );
}

function computeStripeProcessingFees(records: RawSourceRecordRow[]): number {
  const feesByTransaction = new Map<string, number>();
  let unkeyedFees = 0;
  for (const record of records) {
    const fee = stripeBalanceTransactionFeeAmount(record);
    if (fee <= 0) continue;
    const transactionId = stripeBalanceTransactionSourceId(record);
    if (!transactionId) {
      unkeyedFees += fee;
      continue;
    }
    feesByTransaction.set(transactionId, Math.max(feesByTransaction.get(transactionId) ?? 0, fee));
  }
  return [...feesByTransaction.values()].reduce((sum, amount) => sum + amount, unkeyedFees);
}

function mercuryBalanceAmount(record: RawSourceRecordRow): number | null {
  return numberFrom(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), [
      "availableBalance",
      "available_balance",
      "currentBalance",
      "current_balance",
      "balance",
    ]),
  );
}

function mercuryBalanceAccountKey(record: RawSourceRecordRow): string {
  const sources = wrapperSources(asRecord(record.payload));
  const accountSources = sources.map((source) => nestedRecord(source.account));
  return (
    normalizeLookup(
      firstValueFromSources([...sources, ...accountSources], [
        "accountId",
        "account_id",
        "accountNumber",
        "account_number",
        "id",
      ]),
    ) ??
    normalizeLookup(record.externalId) ??
    normalizeLookup(record.id) ??
    ""
  );
}

function rawRecordTimestamp(record: RawSourceRecordRow): number {
  return (
    dateFrom(record.occurredAt)?.getTime() ??
    dateFrom(record.sourceUpdatedAt)?.getTime() ??
    dateFrom(record.sourceCreatedAt)?.getTime() ??
    0
  );
}

function rawFinanceCurrency(records: RawSourceRecordRow[]): string {
  for (const record of records) {
    const currency = firstValueFromSources(wrapperSources(asRecord(record.payload)), ["currency"]);
    if (typeof scalarValue(currency) === "string" && String(scalarValue(currency)).trim()) {
      return String(scalarValue(currency)).trim().toUpperCase();
    }
  }
  return "USD";
}

interface RawFinanceValues {
  cashBalance: number;
  cashOutflow: number;
  cashInflow: number;
  netBurn: number;
  runwayMonths: number | null;
  expenses: number;
  expenseTransactions: number;
  currency: string;
  hasBalanceEvidence: boolean;
  hasTransactionEvidence: boolean;
}

function rawFinanceValues(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): RawFinanceValues {
  const windowedRecords = records.filter((record) => recordWithinExportWindow(record, fromDate, toDate));
  const transactions = windowedRecords.filter(isMercuryTransaction);
  const balances = windowedRecords.filter(isMercuryBalanceRecord);
  const latestBalancesByAccount = new Map<string, { amount: number; timestamp: number }>();

  for (const record of balances) {
    const amount = mercuryBalanceAmount(record);
    if (amount === null) continue;
    const key = mercuryBalanceAccountKey(record);
    const timestamp = rawRecordTimestamp(record);
    const current = latestBalancesByAccount.get(key);
    if (!current || timestamp >= current.timestamp) {
      latestBalancesByAccount.set(key, { amount, timestamp });
    }
  }

  const transactionAmounts = transactions
    .map((record) => mercuryTransactionAmount(record))
    .filter((amount): amount is number => amount !== null);
  const cashOutflow = transactionAmounts.reduce((sum, amount) => (amount < 0 ? sum + Math.abs(amount) : sum), 0);
  const cashInflow = transactionAmounts.reduce((sum, amount) => (amount > 0 ? sum + amount : sum), 0);
  const netBurn = cashOutflow - cashInflow;
  const cashBalance = [...latestBalancesByAccount.values()].reduce((sum, entry) => sum + entry.amount, 0);

  return {
    cashBalance: roundMoney(cashBalance),
    cashOutflow: roundMoney(cashOutflow),
    cashInflow: roundMoney(cashInflow),
    netBurn: roundMoney(netBurn),
    runwayMonths: netBurn > 0 ? roundRatio(cashBalance / netBurn) : null,
    expenses: roundMoney(cashOutflow),
    expenseTransactions: transactionAmounts.filter((amount) => amount < 0).length,
    currency: rawFinanceCurrency(windowedRecords),
    hasBalanceEvidence: latestBalancesByAccount.size > 0,
    hasTransactionEvidence: transactionAmounts.length > 0,
  };
}

function rawGrossMarginValues(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
  rawRevenue: ReturnType<typeof rawRevenueTotals>,
  rawInvoiceRevenue: ReturnType<typeof rawInvoiceRevenueComponents>,
): {
  rate: number | null;
  revenue: number;
  costOfGoodsSold: number;
  stripeProcessingFees: number;
  currency: string;
  hasEvidence: boolean;
} {
  const windowedRecords = records.filter((record) => recordWithinExportWindow(record, fromDate, toDate));
  const mercuryCostOfGoodsSold = windowedRecords
    .filter(isMercuryTransaction)
    .reduce((sum, record) => {
      const amount = mercuryTransactionAmount(record);
      return amount !== null && amount < 0 && mercuryTransactionIsCostOfGoodsSold(record)
        ? sum + Math.abs(amount)
        : sum;
    }, 0);
  const stripeProcessingFees = computeStripeProcessingFees(windowedRecords);
  const revenue = rawInvoiceRevenue.total > 0 ? rawInvoiceRevenue.total : rawRevenue.total;
  const costOfGoodsSold = mercuryCostOfGoodsSold + stripeProcessingFees;
  return {
    rate: revenue > 0 ? roundRatio(((revenue - costOfGoodsSold) / revenue) * 100) : null,
    revenue: roundMoney(revenue),
    costOfGoodsSold: roundMoney(costOfGoodsSold),
    stripeProcessingFees: roundMoney(stripeProcessingFees),
    currency: rawInvoiceRevenue.total > 0 ? rawInvoiceRevenue.currency : rawRevenue.currency,
    hasEvidence: revenue > 0 || costOfGoodsSold > 0,
  };
}

function isGoogleSearchConsoleRecord(record: RawSourceRecordRow): boolean {
  return normalizeProviderKey(record.provider) === "GOOGLE_SEARCH_CONSOLE";
}

function isRawPosthogEvent(record: RawSourceRecordRow): boolean {
  return normalizeProviderKey(record.provider) === "POSTHOG" && normalizeObjectType(record.objectType) === "event";
}

function isRawPosthogSnapshotMetricRecord(record: RawSourceRecordRow): boolean {
  return normalizeProviderKey(record.provider) === "POSTHOG" && !isRawPosthogEvent(record);
}

function googleSearchConsoleCount(record: RawSourceRecordRow, keys: string[]): number {
  const value = firstValueFromSources(wrapperSources(asRecord(record.payload)), keys);
  return countFrom(value) ?? 0;
}

function rawPosthogSnapshotCount(record: RawSourceRecordRow, keys: string[]): number | null {
  if (!isRawPosthogSnapshotMetricRecord(record)) return null;
  return countFrom(firstValueFromSources(wrapperSources(asRecord(record.payload)), keys));
}

function latestRawPosthogSnapshotMetricRecord(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
  keys: string[],
): RawSourceRecordRow | null {
  let latest: RawSourceRecordRow | null = null;
  for (const record of records) {
    if (!recordWithinExportWindow(record, fromDate, toDate)) continue;
    if (rawPosthogSnapshotCount(record, keys) === null) continue;
    if (!latest || rawRecordTimestamp(record) >= rawRecordTimestamp(latest)) {
      latest = record;
    }
  }
  return latest;
}

const RAW_POSTHOG_SNAPSHOT_PAGEVIEW_KEYS = [
  "pageviewCount",
  "pageview_count",
  "pageviews",
  "page_views",
  "posthogPageviews",
  "posthog_pageviews",
];

const RAW_POSTHOG_SNAPSHOT_CONVERSION_KEYS = [
  "conversionEventCount",
  "conversion_event_count",
  "posthogConversions",
  "posthog_conversions",
  "conversions",
  "conversion_count",
];

function rawPosthogSnapshotPageviews(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): number {
  const record = latestRawPosthogSnapshotMetricRecord(records, fromDate, toDate, RAW_POSTHOG_SNAPSHOT_PAGEVIEW_KEYS);
  return record ? rawPosthogSnapshotCount(record, RAW_POSTHOG_SNAPSHOT_PAGEVIEW_KEYS) ?? 0 : 0;
}

function rawPosthogSnapshotConversions(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): number {
  const record = latestRawPosthogSnapshotMetricRecord(records, fromDate, toDate, RAW_POSTHOG_SNAPSHOT_CONVERSION_KEYS);
  return record ? rawPosthogSnapshotCount(record, RAW_POSTHOG_SNAPSHOT_CONVERSION_KEYS) ?? 0 : 0;
}

function rawPosthogSnapshotEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
  keys: string[],
): RawSourceRecordRow[] {
  const record = latestRawPosthogSnapshotMetricRecord(records, fromDate, toDate, keys);
  const count = record ? rawPosthogSnapshotCount(record, keys) : null;
  return count !== null && count > 0 && record ? [record] : [];
}

function rawPosthogEventIdentity(record: RawSourceRecordRow): string {
  return (
    normalizeLookup(
      firstValueFromSources(wrapperSources(asRecord(record.payload)), [
        "eventId",
        "event_id",
        "eventUuid",
        "event_uuid",
        "uuid",
        "id",
      ]),
    ) ?? rawRecordDeduplicationKey(record)
  );
}

function latestRawPosthogEventsById(records: RawSourceRecordRow[]): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = rawPosthogEventIdentity(record);
    const current = latestByKey.get(key);
    if (!current || rawRecordTimestamp(record) >= rawRecordTimestamp(current)) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function rawPosthogMarketingEventTimestamp(record: RawSourceRecordRow): Date | null {
  return (
    rawPosthogEventTimestamp(record) ??
    dateFrom(record.occurredAt) ??
    dateFrom(record.sourceUpdatedAt) ??
    dateFrom(record.sourceCreatedAt)
  );
}

function rawPosthogMarketingEventName(record: RawSourceRecordRow): string {
  return normalizeStageKey(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), [
      "event",
      "eventName",
      "event_name",
      "name",
      "type",
    ]),
  );
}

function rawPosthogMarketingEvents(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return latestRawPosthogEventsById(records.filter(isRawPosthogEvent)).filter((record) => {
    const timestamp = rawPosthogMarketingEventTimestamp(record);
    return timestamp !== null && isWithinDateWindow(timestamp, fromDate, toDate);
  });
}

const RAW_POSTHOG_PAGEVIEW_EVENT_KEYS = new Set([
  "$pageview",
  "pageview",
  "pageviewed",
  "viewedpage",
]);

const RAW_POSTHOG_MARKETING_CONVERSION_EVENT_KEYS = new Set([
  "bookdemo",
  "contactformsubmitted",
  "conversion",
  "demobooked",
  "demorequested",
  "formsubmission",
  "formsubmitted",
  "leadconverted",
  "leadcreated",
  "requestdemo",
  "signup",
  "signedup",
  "trialstarted",
]);

function isRawPosthogPageviewEvent(record: RawSourceRecordRow): boolean {
  return RAW_POSTHOG_PAGEVIEW_EVENT_KEYS.has(rawPosthogMarketingEventName(record));
}

function isRawPosthogMarketingConversionEvent(record: RawSourceRecordRow): boolean {
  return RAW_POSTHOG_MARKETING_CONVERSION_EVENT_KEYS.has(rawPosthogMarketingEventName(record));
}

function rawWebsiteTrafficCounts(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  count: number;
  websiteSessions: number;
  posthogPageviews: number;
  organicTraffic: number;
  searchClicks: number;
  searchImpressions: number;
} {
  const searchConsoleRecords = records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && isGoogleSearchConsoleRecord(record),
  );
  const searchClicks = searchConsoleRecords.reduce(
    (sum, record) =>
      sum +
      googleSearchConsoleCount(record, [
        "clicks",
        "clickCount",
        "click_count",
        "searchClicks",
        "search_clicks",
      ]),
    0,
  );
  const searchImpressions = searchConsoleRecords.reduce(
    (sum, record) =>
      sum +
      googleSearchConsoleCount(record, [
        "impressions",
        "impressionCount",
        "impression_count",
        "searchImpressions",
        "search_impressions",
      ]),
    0,
  );
  const posthogEventPageviews = rawPosthogMarketingEvents(records, fromDate, toDate).filter(isRawPosthogPageviewEvent).length;
  const posthogPageviews =
    posthogEventPageviews > 0 ? posthogEventPageviews : rawPosthogSnapshotPageviews(records, fromDate, toDate);
  const websiteSessions = searchClicks > 0 ? searchClicks : posthogPageviews;
  return {
    count: websiteSessions,
    websiteSessions,
    posthogPageviews,
    organicTraffic: 0,
    searchClicks,
    searchImpressions,
  };
}

function isWebflowFormSubmission(record: RawSourceRecordRow): boolean {
  return (
    normalizeProviderKey(record.provider) === "WEBFLOW" &&
    ["form_submission", "form", "submission", "lead"].includes(normalizeObjectType(record.objectType))
  );
}

function nestedRecordFromKey(source: Record<string, unknown>, key: string): Record<string, unknown> {
  return nestedRecord(source[key]);
}

function hubspotMarketingConversionSources(record: RawSourceRecordRow): Record<string, unknown>[] {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return [
    ...sources,
    ...sources.flatMap((source) => [
      nestedRecordFromKey(source, "contact"),
      nestedRecordFromKey(source, "lead"),
      nestedRecordFromKey(source, "lifecycle"),
    ]),
  ];
}

function firstDateFromSources(sources: Record<string, unknown>[], keys: string[]): Date | null {
  for (const source of sources) {
    for (const key of keys) {
      const date = dateFrom(source[key]);
      if (date) return date;
    }
  }
  return null;
}

function hubspotMarketingConversionTimestamp(record: RawSourceRecordRow): Date | null {
  return firstDateFromSources(hubspotMarketingConversionSources(record), [
    "createdAt",
    "created_at",
    "createdate",
    "hs_createdate",
    "conversionDate",
    "conversion_date",
    "convertedAt",
    "converted_at",
    "firstConversionDate",
    "first_conversion_date",
    "becameLeadAt",
    "became_lead_at",
    "hs_date_entered_lead",
    "hs_date_entered_marketingqualifiedlead",
  ]) ?? dateFrom(record.sourceCreatedAt) ?? dateFrom(record.occurredAt);
}

function hubspotMarketingLifecycleStageIsConversion(record: RawSourceRecordRow): boolean {
  const stage = normalizeStageKey(
    firstValueFromSources(hubspotMarketingConversionSources(record), [
      "lifecyclestage",
      "lifecycleStage",
      "lifecycle_stage",
      "hs_lifecyclestage",
      "stage",
      "stageName",
      "stage_name",
      "status",
    ]),
  );
  if (!stage) return true;
  return [
    "lead",
    "marketingqualifiedlead",
    "mql",
    "salesqualifiedlead",
    "sql",
    "opportunity",
    "customer",
  ].includes(stage);
}

function hubspotMarketingConversionIdentity(record: RawSourceRecordRow): string {
  const sources = hubspotMarketingConversionSources(record);
  const email = normalizeLookup(firstValueFromSources(sources, [
    "email",
    "emailAddress",
    "email_address",
  ]));
  if (email) return email;

  return (
    normalizeLookup(firstValueFromSources(sources, [
      "hs_object_id",
      "contactId",
      "contact_id",
      "leadId",
      "lead_id",
      "id",
    ])) ??
    normalizeLookup(record.externalId) ??
    normalizeLookup(record.id) ??
    rawRecordDeduplicationKey(record)
  );
}

function isHubspotMarketingConversionRecord(
  record: RawSourceRecordRow,
  fromDate: Date,
  toDate: Date,
): boolean {
  if (normalizeProviderKey(record.provider) !== "HUBSPOT") return false;
  if (!["contact", "lead"].includes(normalizeObjectType(record.objectType))) return false;
  if (!hubspotMarketingLifecycleStageIsConversion(record)) return false;
  const convertedAt = hubspotMarketingConversionTimestamp(record);
  return convertedAt !== null && isWithinDateWindow(convertedAt, fromDate, toDate);
}

function rawSpendAmount(record: RawSourceRecordRow): number | null {
  const sources = wrapperSources(asRecord(record.payload));
  const costMicros = nonNegativeNumberFrom(
    firstValueFromSources(sources, [
      "costMicros",
      "cost_micros",
      "COST_MICROS",
      "spendMicros",
      "spend_micros",
      "SPEND_MICROS",
      "totalSpendMicros",
      "total_spend_micros",
      "TOTAL_SPEND_MICROS",
    ]),
  );
  if (costMicros !== null) return costMicros / 1_000_000;

  const redditSpendMicros =
    normalizeProviderKey(record.provider) === "REDDIT"
      ? nonNegativeNumberFrom(firstValueFromSources(sources, ["SPEND"]))
      : null;
  if (redditSpendMicros !== null) return redditSpendMicros / 1_000_000;

  return nonNegativeNumberFrom(
    firstValueFromSources(sources, [
      "totalSpend30d",
      "total_spend_30d",
      "TOTAL_SPEND_30D",
      "totalSpend",
      "total_spend",
      "TOTAL_SPEND",
      "spend",
      "amountSpent",
      "amount_spent",
      "AMOUNT_SPENT",
      "cost",
      "COST",
    ]),
  );
}

function isPaidAdSpendRecord(record: RawSourceRecordRow): boolean {
  return PAID_AD_PROVIDERS.has(normalizeProviderKey(record.provider)) && rawSpendAmount(record) !== null;
}

function paidAdDimensionSources(record: RawSourceRecordRow): Record<string, unknown>[] {
  const sources = wrapperSources(asRecord(record.payload));
  return [
    ...sources,
    ...sources.flatMap((source) => [
      nestedRecordFromKey(source, "campaign"),
      nestedRecordFromKey(source, "campaigns"),
      nestedRecordFromKey(source, "adGroup"),
      nestedRecordFromKey(source, "ad_group"),
      nestedRecordFromKey(source, "adSet"),
      nestedRecordFromKey(source, "ad_set"),
      nestedRecordFromKey(source, "ad"),
    ]),
  ];
}

function paidAdDimensionValue(record: RawSourceRecordRow, keys: string[]): string | null {
  return normalizeLookup(firstValueFromSources(paidAdDimensionSources(record), keys));
}

function paidAdDateDimension(record: RawSourceRecordRow): string | null {
  const value = firstValueFromSources(paidAdDimensionSources(record), [
    "date",
    "DATE",
    "rowDate",
    "row_date",
    "ROW_DATE",
    "startDate",
    "start_date",
    "START_DATE",
    "endDate",
    "end_date",
    "END_DATE",
    "period",
    "PERIOD",
    "month",
    "MONTH",
  ]);
  const parsedDate = dateFrom(value);
  if (parsedDate) return parsedDate.toISOString().slice(0, 10);
  return normalizeLookup(value);
}

function paidAdSpendRecordDeduplicationKey(record: RawSourceRecordRow): string {
  const dimensions = [
    paidAdDimensionValue(record, [
      "customerId",
      "customer_id",
      "CUSTOMER_ID",
      "customer",
      "accountId",
      "account_id",
      "ACCOUNT_ID",
      "account",
      "adAccountId",
      "ad_account_id",
      "AD_ACCOUNT_ID",
      "adAccount",
      "ad_account",
      "AD_ACCOUNT",
    ]),
    paidAdDimensionValue(record, [
      "campaignId",
      "campaign_id",
      "CAMPAIGN_ID",
      "campaign",
      "campaignName",
      "campaign_name",
      "CAMPAIGN_NAME",
      "id",
    ]),
    paidAdDimensionValue(record, ["adGroupId", "ad_group_id", "AD_GROUP_ID", "adGroup", "ad_group", "AD_GROUP"]),
    paidAdDimensionValue(record, ["adSetId", "ad_set_id", "AD_SET_ID", "adSet", "ad_set"]),
    paidAdDimensionValue(record, ["adId", "ad_id", "AD_ID", "ad"]),
    paidAdDateDimension(record),
  ]
    .map((value, index) => (value ? `${index}:${value}` : null))
    .filter((value): value is string => Boolean(value));

  if (dimensions.length > 0) {
    return `${normalizeProviderKey(record.provider)}:${normalizeObjectType(record.objectType)}:${dimensions.join(":")}`;
  }
  return rawRecordDeduplicationKey(record);
}

function latestPaidAdSpendRecordsById(records: RawSourceRecordRow[]): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = paidAdSpendRecordDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (!current || rawRecordTimestamp(record) >= rawRecordTimestamp(current)) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function rawMarketingPipelineDealAmount(record: RawSourceRecordRow): number {
  return nonNegativeNumberFrom(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), [
      "amount",
      "amountInHomeCurrency",
      "amount_in_home_currency",
      "dealAmount",
      "deal_amount",
      "weightedAmount",
      "weighted_amount",
      "hs_projected_amount",
      "hs_weighted_amount",
      "forecastAmount",
      "forecast_amount",
      "hs_forecast_amount",
    ]),
  ) ?? 0;
}

function rawMarketingPipelineDealId(record: RawSourceRecordRow): string {
  return (
    normalizeLookup(
      firstValueFromSources(wrapperSources(asRecord(record.payload)), [
        "dealId",
        "deal_id",
        "hubspotDealId",
        "hubspot_deal_id",
        "id",
      ]),
    ) ??
    normalizeLookup(record.externalId) ??
    rawRecordDeduplicationKey(record)
  );
}

function isRawMarketingPipelineDeal(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "HUBSPOT" || normalizeObjectType(record.objectType) !== "deal") {
    return false;
  }
  const sources = wrapperSources(asRecord(record.payload));
  const stage = hubspotDealStage(record);
  if (TERMINAL_DEAL_STAGE_KEYS.has(stage) || stage === "appointmentscheduled") return false;
  const source =
    normalizeLookup(
      firstValueFromSources(sources, [
        "originalSource",
        "original_source",
        "source",
      ]),
    ) ?? "";
  return (
    rawMarketingPipelineDealAmount(record) > 0 &&
    (source.includes("paid") ||
      source.includes("organic") ||
      source.includes("seo") ||
      source.includes("website") ||
      source.includes("marketing"))
  );
}

function latestRawMarketingPipelineDealsById(records: RawSourceRecordRow[]): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = rawMarketingPipelineDealId(record);
    const current = latestByKey.get(key);
    if (!current || rawRecordTimestamp(record) >= rawRecordTimestamp(current)) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function isIdentifiedVisitorRecord(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "UNIFY") return false;
  const sources = wrapperSources(asRecord(record.payload));
  const nestedSources = sources.flatMap((source) => [
    nestedRecordFromKey(source, "account"),
    nestedRecordFromKey(source, "company"),
  ]);
  const identified = firstValueFromSources(sources, ["identified"]);
  if (identified !== null && identified !== undefined) return isTrueLike(identified);
  return [...sources, ...nestedSources].some(
    (source) =>
      normalizeLookup(
        firstValueFromSources([source], [
          "companyId",
          "company_id",
          "accountId",
          "account_id",
          "companyDomain",
          "company_domain",
          "domain",
          "id",
        ]),
      ) !== null,
  );
}

function identifiedVisitorRecordKey(record: RawSourceRecordRow): string | null {
  if (!isIdentifiedVisitorRecord(record)) return null;
  const sources = wrapperSources(asRecord(record.payload));
  const nestedSources = sources.flatMap((source) => [
    nestedRecordFromKey(source, "account"),
    nestedRecordFromKey(source, "company"),
  ]);
  return (
    normalizeLookup(
      firstValueFromSources([...sources, ...nestedSources], [
        "companyId",
        "company_id",
        "accountId",
        "account_id",
        "companyDomain",
        "company_domain",
        "domain",
        "id",
      ]),
    ) ?? rawRecordDeduplicationKey(record)
  );
}

function rawIdentifiedVisitorCount(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): number {
  return new Set(
    records
      .filter((record) => recordWithinExportWindow(record, fromDate, toDate))
      .map(identifiedVisitorRecordKey)
      .filter((key): key is string => Boolean(key)),
  ).size;
}

function rawConversionCounts(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
  rawWebsiteTraffic: ReturnType<typeof rawWebsiteTrafficCounts>,
): {
  rate: number | null;
  conversions: number;
  websiteSessions: number;
  webflowFormSubmissions: number;
  hubspotLeadConversions: number;
  posthogConversions: number;
  identifiedVisitors: number;
} {
  const webflowFormSubmissions = records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && isWebflowFormSubmission(record),
  ).length;
  const hubspotLeadConversions = new Set(
    records
      .filter((record) => isHubspotMarketingConversionRecord(record, fromDate, toDate))
      .map(hubspotMarketingConversionIdentity),
  ).size;
  const posthogEventConversions = rawPosthogMarketingEvents(records, fromDate, toDate).filter(
    isRawPosthogMarketingConversionEvent,
  ).length;
  const posthogConversions =
    posthogEventConversions > 0 ? posthogEventConversions : rawPosthogSnapshotConversions(records, fromDate, toDate);
  const conversions = webflowFormSubmissions + hubspotLeadConversions + posthogConversions;
  const websiteSessions = rawWebsiteTraffic.websiteSessions;
  return {
    rate: websiteSessions > 0 ? roundRatio((conversions / websiteSessions) * 100) : null,
    conversions,
    websiteSessions,
    webflowFormSubmissions,
    hubspotLeadConversions,
    posthogConversions,
    identifiedVisitors: rawIdentifiedVisitorCount(records, fromDate, toDate),
  };
}

function rawMarketingPipelineEfficiencyValues(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
  rawWebsiteTraffic: ReturnType<typeof rawWebsiteTrafficCounts>,
  rawConversions: ReturnType<typeof rawConversionCounts>,
): {
  ratio: number | null;
  qualifiedPipeline: number;
  qualifiedPipelineCount: number;
  acquisitionSpend: number;
  websiteSessions: number;
  webflowFormSubmissions: number;
  hubspotLeadConversions: number;
  posthogPageviews: number;
  posthogConversions: number;
  organicTraffic: number;
  searchClicks: number;
  searchImpressions: number;
  identifiedVisitors: number;
  currency: string;
} {
  const windowedRecords = records.filter((record) => recordWithinExportWindow(record, fromDate, toDate));
  const spendRecords = latestPaidAdSpendRecordsById(windowedRecords.filter(isPaidAdSpendRecord));
  const pipelineDeals = latestRawMarketingPipelineDealsById(windowedRecords.filter(isRawMarketingPipelineDeal));
  const acquisitionSpend = roundMoney(
    spendRecords.reduce((sum, record) => sum + (rawSpendAmount(record) ?? 0), 0),
  );
  const qualifiedPipeline = roundMoney(
    pipelineDeals.reduce((sum, record) => sum + rawMarketingPipelineDealAmount(record), 0),
  );
  return {
    ratio: acquisitionSpend > 0 ? roundRatio(qualifiedPipeline / acquisitionSpend) : null,
    qualifiedPipeline,
    qualifiedPipelineCount: pipelineDeals.length,
    acquisitionSpend,
    websiteSessions: rawWebsiteTraffic.websiteSessions,
    webflowFormSubmissions: rawConversions.webflowFormSubmissions,
    hubspotLeadConversions: rawConversions.hubspotLeadConversions,
    posthogPageviews: rawWebsiteTraffic.posthogPageviews,
    posthogConversions: rawConversions.posthogConversions,
    organicTraffic: rawWebsiteTraffic.organicTraffic,
    searchClicks: rawWebsiteTraffic.searchClicks,
    searchImpressions: rawWebsiteTraffic.searchImpressions,
    identifiedVisitors: rawConversions.identifiedVisitors,
    currency: currencyFrom(...windowedRecords.map((record) => asRecord(record.payload))),
  };
}

function rawActivationHubspotAccountId(record: RawSourceRecordRow): string | null {
  if (normalizeProviderKey(record.provider) !== "HUBSPOT") return null;
  if (!["company", "account", "contact"].includes(normalizeObjectType(record.objectType))) return null;
  return (
    normalizeLookup(
      firstValueFromSources(wrapperSources(asRecord(record.payload)), [
        "companyId",
        "company_id",
        "accountId",
        "account_id",
        "hs_object_id",
        "id",
      ]),
    ) ?? normalizeLookup(record.externalId)
  );
}

function rawActivationEventAccountId(record: RawSourceRecordRow): string | null {
  return normalizeLookup(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), [
      "hubspotCompanyId",
      "hubspot_company_id",
      "companyId",
      "company_id",
      "accountId",
      "account_id",
      "distinct_id",
    ]),
  );
}

function rawPosthogEventTimestamp(record: RawSourceRecordRow): Date | null {
  return firstDateFromSources(wrapperSources(asRecord(record.payload)), [
    "timestamp",
    "time",
    "eventTimestamp",
    "event_timestamp",
    "eventTime",
    "event_time",
    "createdAt",
    "created_at",
  ]);
}

function isRawActivationEvent(record: RawSourceRecordRow, toDate: Date): boolean {
  if (normalizeProviderKey(record.provider) !== "POSTHOG" || normalizeObjectType(record.objectType) !== "event") {
    return false;
  }
  const eventTimestamp = rawPosthogEventTimestamp(record);
  if (eventTimestamp && eventTimestamp.getTime() > toDate.getTime()) return false;
  const eventName = normalizeLookup(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), ["event"]),
  );
  return (
    eventName !== null &&
    ["activation_completed", "activated", "account_activated"].includes(eventName)
  );
}

function rawActivationValues(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  rate: number;
  activatedAccounts: number;
  eligibleAccounts: number;
} {
  const windowedRecords = records.filter((record) => recordWithinExportWindow(record, fromDate, toDate));
  const eligibleAccountIds = new Set(
    windowedRecords
      .map(rawActivationHubspotAccountId)
      .filter((id): id is string => Boolean(id)),
  );
  const activatedAccountIds = new Set(
    windowedRecords
      .filter((record) => isRawActivationEvent(record, toDate))
      .map(rawActivationEventAccountId)
      .filter((id): id is string => typeof id === "string" && eligibleAccountIds.has(id)),
  );
  const eligibleAccounts = eligibleAccountIds.size;
  const activatedAccounts = activatedAccountIds.size;
  return {
    rate: eligibleAccounts === 0 ? 0 : roundRatio((activatedAccounts / eligibleAccounts) * 100),
    activatedAccounts,
    eligibleAccounts,
  };
}

function isCustomerSupportRecord(record: RawSourceRecordRow): boolean {
  const provider = normalizeProviderKey(record.provider);
  const objectType = normalizeObjectType(record.objectType);
  return (
    (provider === "PYLON" && ["conversation", "issue", "ticket"].includes(objectType)) ||
    (provider === "HUBSPOT" && objectType === "ticket")
  );
}

function supportClosedAtOrBefore(record: RawSourceRecordRow, asOf: Date): boolean {
  const closedAt = dateFrom(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), [
      "closedAt",
      "closed_at",
      "resolvedAt",
      "resolved_at",
      "completedAt",
      "completed_at",
      "cancelledAt",
      "cancelled_at",
      "canceledAt",
      "canceled_at",
    ]),
  );
  return closedAt !== null && closedAt.getTime() <= asOf.getTime();
}

function isClosedSupportStatus(record: RawSourceRecordRow): boolean {
  const status = normalizeStageKey(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), [
      "status",
      "state",
      "stage",
      "pipelineStage",
      "pipeline_stage",
      "hs_pipeline_stage",
      "hs_ticket_status",
    ]),
  );
  return /(?:closed|resolved|done|complete|completed|cancelled|canceled)/.test(status);
}

function isOpenSupportIssue(record: RawSourceRecordRow, asOf: Date): boolean {
  return isCustomerSupportRecord(record) && !supportClosedAtOrBefore(record, asOf) && !isClosedSupportStatus(record);
}

function supportTextValues(value: unknown, seen = new WeakSet<object>()): string[] {
  const scalar = scalarValue(value);
  if (typeof scalar === "string") return [scalar.toLowerCase()];
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const values = Array.isArray(value)
    ? value.flatMap((item) => supportTextValues(item, seen))
    : Object.values(value as Record<string, unknown>).flatMap((item) => supportTextValues(item, seen));

  seen.delete(value);
  return values;
}

function isEscalatedSupportIssue(record: RawSourceRecordRow, asOf: Date): boolean {
  if (!isOpenSupportIssue(record, asOf)) return false;
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const priority =
    normalizeLookup(
      firstValueFromSources(sources, [
        "priority",
        "ticketPriority",
        "ticket_priority",
        "hs_ticket_priority",
      ]),
    ) ?? "";
  const type =
    normalizeLookup(firstValueFromSources(sources, ["type", "kind", "category"])) ?? "";
  const tags = sources.flatMap((source) => [
    ...supportTextValues(source.tags),
    ...supportTextValues(source.labels),
  ]);
  return (
    ["urgent", "high", "critical", "p0", "p1"].includes(priority) ||
    type.includes("escalation") ||
    tags.some((tag) => tag.includes("urgent") || tag.includes("escalation"))
  );
}

function supportAccountIdentity(record: RawSourceRecordRow): string {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const accountSources = sources.map((source) => nestedRecord(source.account));
  const companySources = sources.map((source) => nestedRecord(source.company));
  const customerSources = sources.map((source) => nestedRecord(source.customer));
  const requesterSources = sources.map((source) => nestedRecord(source.requester));
  const identity = normalizeLookup(
    firstValueFromSources(
      [...sources, ...accountSources, ...companySources, ...customerSources, ...requesterSources],
      [
        "accountId",
        "account_id",
        "companyId",
        "company_id",
        "hubspotCompanyId",
        "hubspot_company_id",
        "customerId",
        "customer_id",
        "contactId",
        "contact_id",
        "email",
      ],
    ),
  );
  return identity ?? `support:${rawRecordIdentityFallback(record)}`;
}

function customerSuccessAccountId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const nestedSources = sources.flatMap((source) => [
    nestedRecord(source.account),
    nestedRecord(source.company),
    nestedRecord(source.customer),
    nestedRecord(source.contact),
    nestedRecord(source.organization),
    nestedRecord(source.workspace),
  ]);
  return normalizeLookup(
    firstValueFromSources([...sources, ...nestedSources], [
      "accountId",
      "account_id",
      "companyId",
      "company_id",
      "hubspotCompanyId",
      "hubspot_company_id",
      "customerId",
      "customer_id",
      "contactId",
      "contact_id",
      "organizationId",
      "organization_id",
      "workspaceId",
      "workspace_id",
      "email",
    ]),
  );
}

function isRawPosthogCustomerUsageRecord(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "POSTHOG") return false;
  if (!customerSuccessAccountId(record)) return false;
  return [
    "account_usage",
    "account_activity",
    "customer_activity",
    "product_usage",
    "user_activity",
    "event",
  ].includes(normalizeObjectType(record.objectType));
}

function isRawCollaborationSignal(record: RawSourceRecordRow): boolean {
  const provider = normalizeProviderKey(record.provider);
  const objectType = normalizeObjectType(record.objectType);
  const supported =
    (provider === "GOOGLE_WORKSPACE" &&
      ["calendar_event", "email_thread", "document", "event", "thread", "file"].includes(objectType)) ||
    (provider === "SLACK" && ["message", "thread"].includes(objectType));
  return supported && customerSuccessAccountId(record) !== null;
}

function rawCollaborationSignalEventId(record: RawSourceRecordRow): string | null {
  const sources = wrapperSources(asRecord(record.payload));
  return normalizeLookup(
    firstValueFromSources(sources, [
      "eventId",
      "event_id",
      "messageId",
      "message_id",
      "threadId",
      "thread_id",
      "threadTs",
      "thread_ts",
      "ts",
      "id",
    ]),
  );
}

function rawCollaborationSignalDeduplicationKey(record: RawSourceRecordRow): string {
  const accountId = customerSuccessAccountId(record);
  const eventId = rawCollaborationSignalEventId(record);
  if (accountId && eventId) {
    return `${normalizeProviderKey(record.provider)}:${normalizeObjectType(record.objectType)}:${accountId}:${eventId}`;
  }
  return rawRecordDeduplicationKey(record);
}

function latestRawCollaborationSignalsById(records: RawSourceRecordRow[]): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    if (!isRawCollaborationSignal(record)) continue;
    const key = rawCollaborationSignalDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (!current || rawRecordTimestamp(record) >= rawRecordTimestamp(current)) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function rawCustomerSuccessCounts(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  customerHealth: number;
  riskScore: number;
  atRiskAccounts: number;
  openSupportIssues: number;
  escalations: number;
  accountsWithBillingRisk: number;
  lowUsageAccounts: number;
  customerActivity: number;
  supportInteractions: number;
  productUsageRecords: number;
  collaborationSignals: number;
  activeAccounts: number;
} {
  const supportRecords = records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && isCustomerSupportRecord(record),
  );
  const productUsageRecords = records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && isRawPosthogCustomerUsageRecord(record),
  );
  const collaborationSignals = latestRawCollaborationSignalsById(
    records.filter((record) => recordWithinExportWindow(record, fromDate, toDate)),
  );
  const openSupportRecords = supportRecords.filter((record) => isOpenSupportIssue(record, toDate));
  const escalations = openSupportRecords.filter((record) => isEscalatedSupportIssue(record, toDate));
  const atRiskAccounts = new Set(openSupportRecords.map(supportAccountIdentity)).size;
  const activeAccounts = new Set(
    [
      ...supportRecords.map(supportAccountIdentity),
      ...productUsageRecords.map(customerSuccessAccountId),
      ...collaborationSignals.map(customerSuccessAccountId),
    ].filter((identity): identity is string => Boolean(identity)),
  ).size;
  const riskScore = Math.min(100, openSupportRecords.length * 12 + escalations.length * 18);
  return {
    customerHealth: Math.max(0, 100 - riskScore),
    riskScore,
    atRiskAccounts,
    openSupportIssues: openSupportRecords.length,
    escalations: escalations.length,
    accountsWithBillingRisk: 0,
    lowUsageAccounts: 0,
    customerActivity: supportRecords.length + productUsageRecords.length + collaborationSignals.length,
    supportInteractions: supportRecords.length,
    productUsageRecords: productUsageRecords.length,
    collaborationSignals: collaborationSignals.length,
    activeAccounts,
  };
}

function rawCustomerIdentity(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const nestedSources = sources.flatMap((source) => [
    nestedRecord(source.subscription),
    nestedRecord(source.customer),
    nestedRecord(source.company),
    nestedRecord(source.account),
    nestedRecord(source.contact),
    nestedRecord(source.lifecycle),
  ]);
  const identity = normalizeLookup(
    firstValueFromSources([...sources, ...nestedSources], [
      "accountId",
      "account_id",
      "companyId",
      "company_id",
      "hubspotCompanyId",
      "hubspot_company_id",
      "customerId",
      "customer_id",
      "stripeCustomerId",
      "stripe_customer_id",
      "contactId",
      "contact_id",
      "email",
    ]),
  );
  if (identity) return identity;
  if (normalizeProviderKey(record.provider) === "STRIPE") {
    return stripeCustomerId(record) ?? stripeCustomerEmail(record) ?? rawRecordIdentityFallback(record);
  }
  return rawRecordIdentityFallback(record);
}

function stripeSubscriptionCancellationDate(record: RawSourceRecordRow): Date | null {
  const sources = wrapperSources(asRecord(record.payload));
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  return dateFrom(
    firstValueFromSources([...sources, ...subscriptionSources], [
      "canceled_at",
      "canceledAt",
      "cancel_at",
      "cancelAt",
      "cancelled_at",
      "cancelledAt",
      "ended_at",
      "endedAt",
      "ended",
      "statusChangedAt",
      "status_changed_at",
    ]),
  );
}

function isChurnedStripeCustomer(record: RawSourceRecordRow, fromDate: Date, toDate: Date): boolean {
  if (normalizeProviderKey(record.provider) !== "STRIPE" || normalizeObjectType(record.objectType) !== "subscription") {
    return false;
  }
  const sources = wrapperSources(asRecord(record.payload));
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const cancellationDate = stripeSubscriptionCancellationDate(record);
  if (cancellationDate) return isWithinDateWindow(cancellationDate, fromDate, toDate);
  const status = normalizeStageKey(firstValueFromSources([...sources, ...subscriptionSources], ["status"]));
  if (!["canceled", "cancelled"].includes(status)) return false;
  const churnDate = recordDate(record);
  return churnDate !== null && isWithinDateWindow(churnDate, fromDate, toDate);
}

function isChurnedHubspotCustomer(record: RawSourceRecordRow, fromDate: Date, toDate: Date): boolean {
  if (normalizeProviderKey(record.provider) !== "HUBSPOT") return false;
  if (!["deal", "company", "customer", "account"].includes(normalizeObjectType(record.objectType))) return false;
  const sources = wrapperSources(asRecord(record.payload));
  const lifecycleSources = sources.flatMap((source) => [
    source,
    nestedRecord(source.company),
    nestedRecord(source.customer),
    nestedRecord(source.account),
    nestedRecord(source.lifecycle),
  ]);
  const stage = normalizeStageKey(
    firstValueFromSources(lifecycleSources, [
      "dealstage",
      "stage",
      "stageLabel",
      "stage_label",
      "stageId",
      "stage_id",
      "lifecycleStage",
      "lifecycle_stage",
      "lifecyclestage",
      "customerStatus",
      "customer_status",
      "status",
    ]),
  );
  if (!stage.includes("churn") && stage !== "closedlost" && stage !== "lost") return false;
  const churnDate = dateFrom(
    firstValueFromSources(lifecycleSources, [
      "churnedAt",
      "churned_at",
      "canceledAt",
      "canceled_at",
      "cancelledAt",
      "cancelled_at",
      "closedAt",
      "closed_at",
      "closeDate",
      "close_date",
      "closedate",
    ]),
  ) ?? recordDate(record);
  return churnDate !== null && churnDate.getTime() >= fromDate.getTime() && churnDate.getTime() <= toDate.getTime();
}

function isRetainedRawCustomer(record: RawSourceRecordRow): boolean {
  if (isActiveStripeSubscription(record)) return true;
  return isHubspotSubscriptionRecord(record);
}

function rawRetentionCounts(records: RawSourceRecordRow[], fromDate: Date, toDate: Date): {
  churnRate: number | null;
  retentionRate: number | null;
  churnedCustomers: number;
  retainedCustomers: number;
  customerBase: number;
} {
  const retainedCustomerIds = new Set<string>();
  const churnedCustomerIds = new Set<string>();
  for (const record of records.filter((entry) => recordWithinExportWindow(entry, fromDate, toDate))) {
    const identity = rawCustomerIdentity(record);
    if (!identity) continue;
    if (isChurnedStripeCustomer(record, fromDate, toDate) || isChurnedHubspotCustomer(record, fromDate, toDate)) {
      churnedCustomerIds.add(identity);
      continue;
    }
    if (isRetainedRawCustomer(record)) {
      retainedCustomerIds.add(identity);
    }
  }
  for (const churnedCustomerId of churnedCustomerIds) {
    retainedCustomerIds.delete(churnedCustomerId);
  }
  const customerBase = new Set([...retainedCustomerIds, ...churnedCustomerIds]).size;
  const churnedCustomers = churnedCustomerIds.size;
  const retainedCustomers = retainedCustomerIds.size;
  return {
    churnRate: customerBase > 0 ? roundRatio((churnedCustomers / customerBase) * 100) : null,
    retentionRate: customerBase > 0 ? roundRatio((retainedCustomers / customerBase) * 100) : null,
    churnedCustomers,
    retainedCustomers,
    customerBase,
  };
}

function rawMetricLineage(records: RawSourceRecordRow[]): MetricLineageRow[] {
  return records.map((record) => ({
    sourceKey: normalizeProviderKey(record.provider).toLowerCase(),
    sourceType: "raw",
    sourceId: normalizeLookup(record.externalId),
    rawRecordId: record.id,
    capturedAt: recordDate(record),
    metadata: {
      provider: record.provider,
      objectType: record.objectType,
      fallback: "raw_source_records",
    },
  }));
}

function rawCountMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) =>
      recordWithinExportWindow(record, fromDate, toDate) &&
      (isActiveStripeSubscription(record) || isHubspotSubscriptionRecord(record)),
  );
}

function rawRevenueMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && stripeChargeRevenue(record) > 0,
  );
}

function rawInvoiceRevenueMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) =>
      recordWithinExportWindow(record, fromDate, toDate) &&
      stripeInvoiceIsPaid(record) &&
      stripeInvoiceLineItems(record).some(
        (line) => stripeInvoiceLineHasRecurringEvidence(line) || stripeInvoiceLineIsOneTimeService(line),
      ),
  );
}

function rawFinanceMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) =>
      recordWithinExportWindow(record, fromDate, toDate) &&
      ((isMercuryBalanceRecord(record) && mercuryBalanceAmount(record) !== null) ||
        (isMercuryTransaction(record) && mercuryTransactionAmount(record) !== null)),
  );
}

function rawGrossMarginMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) =>
      recordWithinExportWindow(record, fromDate, toDate) &&
      ((stripeInvoiceIsPaid(record) &&
        stripeInvoiceLineItems(record).some(
          (line) => stripeInvoiceLineHasRecurringEvidence(line) || stripeInvoiceLineIsOneTimeService(line),
        )) ||
        (isMercuryTransaction(record) &&
          (mercuryTransactionAmount(record) ?? 0) < 0 &&
          mercuryTransactionIsCostOfGoodsSold(record)) ||
        stripeBalanceTransactionFeeAmount(record) > 0),
  );
}

function rawWebsiteTrafficMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  const searchEvidence = records.filter(
    (record) =>
      recordWithinExportWindow(record, fromDate, toDate) &&
      isGoogleSearchConsoleRecord(record) &&
      (googleSearchConsoleCount(record, [
        "clicks",
        "clickCount",
        "click_count",
        "searchClicks",
        "search_clicks",
      ]) > 0 ||
        googleSearchConsoleCount(record, [
          "impressions",
          "impressionCount",
          "impression_count",
          "searchImpressions",
          "search_impressions",
        ]) > 0),
  );
  const posthogPageviewEvidence = rawPosthogMarketingEvents(records, fromDate, toDate).filter(isRawPosthogPageviewEvent);
  const posthogSnapshotEvidence =
    posthogPageviewEvidence.length > 0
      ? []
      : rawPosthogSnapshotEvidenceRecords(records, fromDate, toDate, RAW_POSTHOG_SNAPSHOT_PAGEVIEW_KEYS);
  return [...searchEvidence, ...posthogPageviewEvidence, ...posthogSnapshotEvidence];
}

function rawConversionMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  const searchWebflowHubspotEvidence = records.filter(
    (record) =>
      (recordWithinExportWindow(record, fromDate, toDate) &&
        (isWebflowFormSubmission(record) ||
          (isGoogleSearchConsoleRecord(record) &&
            googleSearchConsoleCount(record, [
              "clicks",
              "clickCount",
              "click_count",
              "searchClicks",
              "search_clicks",
            ]) > 0))) ||
      isHubspotMarketingConversionRecord(record, fromDate, toDate),
  );
  const posthogMarketingEvidence = rawPosthogMarketingEvents(records, fromDate, toDate).filter(
    (record) => isRawPosthogPageviewEvent(record) || isRawPosthogMarketingConversionEvent(record),
  );
  const posthogSnapshotEvidence =
    posthogMarketingEvidence.some(isRawPosthogMarketingConversionEvent)
      ? []
      : rawPosthogSnapshotEvidenceRecords(records, fromDate, toDate, RAW_POSTHOG_SNAPSHOT_CONVERSION_KEYS);
  return [...searchWebflowHubspotEvidence, ...posthogMarketingEvidence, ...posthogSnapshotEvidence];
}

function rawPipelineEfficiencyMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  const sourceEvidence = records.filter(
    (record) =>
      recordWithinExportWindow(record, fromDate, toDate) &&
      (isPaidAdSpendRecord(record) ||
        isRawMarketingPipelineDeal(record) ||
        isGoogleSearchConsoleRecord(record) ||
        isIdentifiedVisitorRecord(record)),
  );
  const posthogMarketingEvidence = rawPosthogMarketingEvents(records, fromDate, toDate).filter(
    (record) => isRawPosthogPageviewEvent(record) || isRawPosthogMarketingConversionEvent(record),
  );
  const posthogSnapshotEvidence = [
    ...rawPosthogSnapshotEvidenceRecords(records, fromDate, toDate, RAW_POSTHOG_SNAPSHOT_PAGEVIEW_KEYS),
    ...rawPosthogSnapshotEvidenceRecords(records, fromDate, toDate, RAW_POSTHOG_SNAPSHOT_CONVERSION_KEYS),
  ].filter((record, index, evidence) => evidence.findIndex((candidate) => candidate.id === record.id) === index);
  return [...sourceEvidence, ...posthogMarketingEvidence, ...posthogSnapshotEvidence];
}

function rawActivationMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) =>
      recordWithinExportWindow(record, fromDate, toDate) &&
      (rawActivationHubspotAccountId(record) !== null || isRawActivationEvent(record, toDate)),
  );
}

function rawDemoMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && isDemoRecord(record),
  );
}

function rawCustomerSuccessMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) => recordWithinExportWindow(record, fromDate, toDate) && isCustomerSupportRecord(record),
  );
}

function rawCustomerActivityMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  const windowedRecords = records.filter((record) => recordWithinExportWindow(record, fromDate, toDate));
  return [
    ...windowedRecords.filter(isCustomerSupportRecord),
    ...windowedRecords.filter(isRawPosthogCustomerUsageRecord),
    ...latestRawCollaborationSignalsById(windowedRecords),
  ];
}

function rawRetentionMetricEvidenceRecords(
  records: RawSourceRecordRow[],
  fromDate: Date,
  toDate: Date,
): RawSourceRecordRow[] {
  return records.filter(
    (record) =>
      recordWithinExportWindow(record, fromDate, toDate) &&
      (isRetainedRawCustomer(record) || isChurnedStripeCustomer(record, fromDate, toDate) || isChurnedHubspotCustomer(record, fromDate, toDate)),
  );
}

function rawDerivedMetricFallbacks(input: {
  records: RawSourceRecordRow[];
  fromDate: Date;
  toDate: Date;
  rawActiveSubscriptions: ReturnType<typeof rawActiveSubscriptionCounts>;
  rawCustomers: ReturnType<typeof rawCustomerCounts>;
  rawDemos: ReturnType<typeof rawDemoCounts>;
  rawRevenue: ReturnType<typeof rawRevenueTotals>;
  rawInvoiceRevenue: ReturnType<typeof rawInvoiceRevenueComponents>;
  rawFinance: RawFinanceValues;
  rawGrossMargin: ReturnType<typeof rawGrossMarginValues>;
  rawWebsiteTraffic: ReturnType<typeof rawWebsiteTrafficCounts>;
  rawConversions: ReturnType<typeof rawConversionCounts>;
  rawPipelineEfficiency: ReturnType<typeof rawMarketingPipelineEfficiencyValues>;
  rawActivation: ReturnType<typeof rawActivationValues>;
  rawCustomerSuccess: ReturnType<typeof rawCustomerSuccessCounts>;
  rawRetention: ReturnType<typeof rawRetentionCounts>;
  now: Date;
  hasTotalRevenueMetric: boolean;
  hasSubscriptionRevenueMetric: boolean;
  hasServicesRevenueMetric: boolean;
  hasCashBalanceMetric: boolean;
  hasRunwayMetric: boolean;
  hasNetBurnMetric: boolean;
  hasExpensesMetric: boolean;
  hasGrossMarginMetric: boolean;
  hasActiveSubscriptionsMetric: boolean;
  hasCustomerCountMetric: boolean;
  hasSalesDemosMetric: boolean;
  hasWebsiteTrafficMetric: boolean;
  hasConversionRateMetric: boolean;
  hasPipelineEfficiencyMetric: boolean;
  hasActivationRateMetric: boolean;
  hasCustomerHealthMetric: boolean;
  hasCustomerActivityMetric: boolean;
  hasChurnRateMetric: boolean;
  hasRetentionRateMetric: boolean;
  hasRetentionRiskMetric: boolean;
}): Map<string, RawDerivedMetricRow> {
  const fallbackRows = new Map<string, RawDerivedMetricRow>();
  const base = {
    department: "revenue",
    unit: "count",
    confidence: 0.68,
    warnings: ["Canonical Imladris materialization is missing for this metric; using raw source fallback."],
    computedAt: input.now,
    periodStart: input.fromDate,
    periodEnd: input.toDate,
  };
  const countEvidenceRecords = rawCountMetricEvidenceRecords(input.records, input.fromDate, input.toDate);
  const revenueEvidenceRecords = rawRevenueMetricEvidenceRecords(input.records, input.fromDate, input.toDate);
  const invoiceRevenueEvidenceRecords = rawInvoiceRevenueMetricEvidenceRecords(
    input.records,
    input.fromDate,
    input.toDate,
  );
  const financeEvidenceRecords = rawFinanceMetricEvidenceRecords(input.records, input.fromDate, input.toDate);
  const grossMarginEvidenceRecords = rawGrossMarginMetricEvidenceRecords(input.records, input.fromDate, input.toDate);
  const websiteTrafficEvidenceRecords = rawWebsiteTrafficMetricEvidenceRecords(
    input.records,
    input.fromDate,
    input.toDate,
  );
  const conversionEvidenceRecords = rawConversionMetricEvidenceRecords(input.records, input.fromDate, input.toDate);
  const pipelineEfficiencyEvidenceRecords = rawPipelineEfficiencyMetricEvidenceRecords(
    input.records,
    input.fromDate,
    input.toDate,
  );
  const activationEvidenceRecords = rawActivationMetricEvidenceRecords(input.records, input.fromDate, input.toDate);
  const customerSuccessEvidenceRecords = rawCustomerSuccessMetricEvidenceRecords(
    input.records,
    input.fromDate,
    input.toDate,
  );
  const customerActivityEvidenceRecords = rawCustomerActivityMetricEvidenceRecords(
    input.records,
    input.fromDate,
    input.toDate,
  );
  const retentionEvidenceRecords = rawRetentionMetricEvidenceRecords(input.records, input.fromDate, input.toDate);
  const totalRevenueAmount = input.rawRevenue.total > 0 ? input.rawRevenue.total : input.rawInvoiceRevenue.total;
  const totalRevenueCurrency = input.rawRevenue.total > 0 ? input.rawRevenue.currency : input.rawInvoiceRevenue.currency;
  const totalRevenueEvidenceRecords =
    revenueEvidenceRecords.length > 0 ? revenueEvidenceRecords : invoiceRevenueEvidenceRecords;

  if (!input.hasTotalRevenueMetric && totalRevenueAmount > 0 && totalRevenueEvidenceRecords.length > 0) {
    fallbackRows.set("revenue.total_revenue", {
      ...base,
      department: "finance",
      unit: "currency",
      lineage: rawMetricLineage(totalRevenueEvidenceRecords),
      value: {
        amount: totalRevenueAmount,
        currency: totalRevenueCurrency,
        source: "raw_source_records",
      },
      calculationVersion: "raw-total-revenue-investor-fallback-v1",
    });
  }

  if (
    !input.hasSubscriptionRevenueMetric &&
    input.rawInvoiceRevenue.subscriptionRevenue > 0 &&
    invoiceRevenueEvidenceRecords.length > 0
  ) {
    fallbackRows.set("revenue.subscription_revenue", {
      ...base,
      unit: "currency",
      lineage: rawMetricLineage(invoiceRevenueEvidenceRecords),
      value: {
        amount: input.rawInvoiceRevenue.subscriptionRevenue,
        currency: input.rawInvoiceRevenue.currency,
        stripeInvoiceLines: input.rawInvoiceRevenue.subscriptionInvoiceLines,
        source: "raw_source_records",
      },
      calculationVersion: "raw-subscription-revenue-investor-fallback-v1",
    });
  }

  if (
    !input.hasServicesRevenueMetric &&
    input.rawInvoiceRevenue.servicesRevenue > 0 &&
    invoiceRevenueEvidenceRecords.length > 0
  ) {
    fallbackRows.set("revenue.services_revenue", {
      ...base,
      unit: "currency",
      lineage: rawMetricLineage(invoiceRevenueEvidenceRecords),
      value: {
        amount: input.rawInvoiceRevenue.servicesRevenue,
        currency: input.rawInvoiceRevenue.currency,
        stripeServiceInvoices: input.rawInvoiceRevenue.stripeServiceInvoices,
        stripeServiceInvoiceLines: input.rawInvoiceRevenue.stripeServiceInvoiceLines,
        source: "raw_source_records",
      },
      calculationVersion: "raw-services-revenue-investor-fallback-v1",
    });
  }

  if (!input.hasActiveSubscriptionsMetric && input.rawActiveSubscriptions.total > 0 && countEvidenceRecords.length > 0) {
    fallbackRows.set("revenue.active_subscriptions", {
      ...base,
      lineage: rawMetricLineage(countEvidenceRecords),
      value: {
        count: input.rawActiveSubscriptions.total,
        stripeSubscriptions: input.rawActiveSubscriptions.stripe,
        hubspotOnlySubscriptions: input.rawActiveSubscriptions.hubspotOnly,
        source: "raw_source_records",
      },
      calculationVersion: "raw-active-subscriptions-investor-fallback-v1",
    });
  }

  if (!input.hasCustomerCountMetric && input.rawCustomers.total > 0 && countEvidenceRecords.length > 0) {
    fallbackRows.set("revenue.customer_count", {
      ...base,
      lineage: rawMetricLineage(countEvidenceRecords),
      value: {
        count: input.rawCustomers.total,
        stripeCustomers: input.rawCustomers.stripe,
        hubspotOnlyCustomers: input.rawCustomers.hubspotOnly,
        source: "raw_source_records",
      },
      calculationVersion: "raw-customer-count-investor-fallback-v1",
    });
  }

  if (!input.hasCashBalanceMetric && input.rawFinance.hasBalanceEvidence && financeEvidenceRecords.length > 0) {
    fallbackRows.set("finance.cash_balance", {
      ...base,
      department: "finance",
      unit: "currency",
      lineage: rawMetricLineage(financeEvidenceRecords),
      value: {
        amount: input.rawFinance.cashBalance,
        currency: input.rawFinance.currency,
        source: "raw_source_records",
      },
      calculationVersion: "raw-cash-balance-investor-fallback-v1",
    });
  }

  if (!input.hasNetBurnMetric && input.rawFinance.hasTransactionEvidence && financeEvidenceRecords.length > 0) {
    fallbackRows.set("finance.net_burn", {
      ...base,
      department: "finance",
      unit: "currency",
      lineage: rawMetricLineage(financeEvidenceRecords),
      value: {
        amount: input.rawFinance.netBurn,
        cashOutflow: input.rawFinance.cashOutflow,
        cashInflow: input.rawFinance.cashInflow,
        currency: input.rawFinance.currency,
        source: "raw_source_records",
      },
      calculationVersion: "raw-net-burn-investor-fallback-v1",
    });
  }

  if (!input.hasRunwayMetric && input.rawFinance.hasBalanceEvidence && input.rawFinance.hasTransactionEvidence) {
    fallbackRows.set("finance.cash_runway_months", {
      ...base,
      department: "finance",
      unit: "months",
      lineage: rawMetricLineage(financeEvidenceRecords),
      value: {
        months: input.rawFinance.runwayMonths,
        cashBalance: input.rawFinance.cashBalance,
        netBurn: input.rawFinance.netBurn,
        currency: input.rawFinance.currency,
        source: "raw_source_records",
      },
      calculationVersion: "raw-cash-runway-investor-fallback-v1",
    });
  }

  if (!input.hasExpensesMetric && input.rawFinance.hasTransactionEvidence && financeEvidenceRecords.length > 0) {
    fallbackRows.set("finance.expenses", {
      ...base,
      department: "finance",
      unit: "currency",
      lineage: rawMetricLineage(financeEvidenceRecords),
      value: {
        amount: input.rawFinance.expenses,
        cashOutflow: input.rawFinance.cashOutflow,
        expenseTransactions: input.rawFinance.expenseTransactions,
        currency: input.rawFinance.currency,
        source: "raw_source_records",
      },
      calculationVersion: "raw-expenses-investor-fallback-v1",
    });
  }

  if (
    !input.hasGrossMarginMetric &&
    input.rawGrossMargin.hasEvidence &&
    input.rawGrossMargin.rate !== null &&
    grossMarginEvidenceRecords.length > 0
  ) {
    fallbackRows.set("finance.gross_margin", {
      ...base,
      department: "finance",
      unit: "percent",
      lineage: rawMetricLineage(grossMarginEvidenceRecords),
      value: {
        rate: input.rawGrossMargin.rate,
        revenue: input.rawGrossMargin.revenue,
        costOfGoodsSold: input.rawGrossMargin.costOfGoodsSold,
        stripeProcessingFees: input.rawGrossMargin.stripeProcessingFees,
        currency: input.rawGrossMargin.currency,
        source: "raw_source_records",
      },
      calculationVersion: "raw-gross-margin-investor-fallback-v1",
    });
  }

  if (
    !input.hasWebsiteTrafficMetric &&
    (input.rawWebsiteTraffic.count > 0 || input.rawWebsiteTraffic.searchImpressions > 0) &&
    websiteTrafficEvidenceRecords.length > 0
  ) {
    fallbackRows.set("marketing.website_traffic", {
      ...base,
      department: "marketing",
      unit: "count",
      lineage: rawMetricLineage(websiteTrafficEvidenceRecords),
      value: {
        count: input.rawWebsiteTraffic.count,
        websiteSessions: input.rawWebsiteTraffic.websiteSessions,
        posthogPageviews: input.rawWebsiteTraffic.posthogPageviews,
        organicTraffic: input.rawWebsiteTraffic.organicTraffic,
        searchClicks: input.rawWebsiteTraffic.searchClicks,
        searchImpressions: input.rawWebsiteTraffic.searchImpressions,
        source: "raw_source_records",
      },
      calculationVersion: "raw-website-traffic-investor-fallback-v1",
    });
  }

  if (
    !input.hasConversionRateMetric &&
    input.rawConversions.conversions > 0 &&
    input.rawConversions.rate !== null &&
    conversionEvidenceRecords.length > 0
  ) {
    fallbackRows.set("marketing.conversion_rate", {
      ...base,
      department: "marketing",
      unit: "percent",
      lineage: rawMetricLineage(conversionEvidenceRecords),
      value: {
        rate: input.rawConversions.rate,
        conversions: input.rawConversions.conversions,
        websiteSessions: input.rawConversions.websiteSessions,
        webflowFormSubmissions: input.rawConversions.webflowFormSubmissions,
        hubspotLeadConversions: input.rawConversions.hubspotLeadConversions,
        posthogConversions: input.rawConversions.posthogConversions,
        identifiedVisitors: input.rawConversions.identifiedVisitors,
        source: "raw_source_records",
      },
      calculationVersion: "raw-conversion-rate-investor-fallback-v1",
    });
  }

  if (
    !input.hasPipelineEfficiencyMetric &&
    input.rawPipelineEfficiency.ratio !== null &&
    input.rawPipelineEfficiency.acquisitionSpend > 0 &&
    pipelineEfficiencyEvidenceRecords.length > 0
  ) {
    fallbackRows.set("marketing.pipeline_efficiency", {
      ...base,
      department: "marketing",
      unit: "ratio",
      lineage: rawMetricLineage(pipelineEfficiencyEvidenceRecords),
      value: {
        ratio: input.rawPipelineEfficiency.ratio,
        qualifiedPipeline: input.rawPipelineEfficiency.qualifiedPipeline,
        qualifiedPipelineCount: input.rawPipelineEfficiency.qualifiedPipelineCount,
        acquisitionSpend: input.rawPipelineEfficiency.acquisitionSpend,
        websiteSessions: input.rawPipelineEfficiency.websiteSessions,
        webflowFormSubmissions: input.rawPipelineEfficiency.webflowFormSubmissions,
        hubspotLeadConversions: input.rawPipelineEfficiency.hubspotLeadConversions,
        posthogPageviews: input.rawPipelineEfficiency.posthogPageviews,
        posthogConversions: input.rawPipelineEfficiency.posthogConversions,
        organicTraffic: input.rawPipelineEfficiency.organicTraffic,
        searchClicks: input.rawPipelineEfficiency.searchClicks,
        searchImpressions: input.rawPipelineEfficiency.searchImpressions,
        identifiedVisitors: input.rawPipelineEfficiency.identifiedVisitors,
        currency: input.rawPipelineEfficiency.currency,
        source: "raw_source_records",
      },
      calculationVersion: "raw-marketing-pipeline-efficiency-investor-fallback-v1",
    });
  }

  if (!input.hasActivationRateMetric && input.rawActivation.eligibleAccounts > 0 && activationEvidenceRecords.length > 0) {
    fallbackRows.set("product.activation_rate", {
      ...base,
      department: "development",
      unit: "percent",
      lineage: rawMetricLineage(activationEvidenceRecords),
      value: {
        rate: input.rawActivation.rate,
        activatedAccounts: input.rawActivation.activatedAccounts,
        eligibleAccounts: input.rawActivation.eligibleAccounts,
        source: "raw_source_records",
      },
      calculationVersion: "raw-product-activation-rate-investor-fallback-v1",
    });
  }

  const demoEvidenceRecords = rawDemoMetricEvidenceRecords(input.records, input.fromDate, input.toDate);
  if (!input.hasSalesDemosMetric && input.rawDemos.count > 0 && demoEvidenceRecords.length > 0) {
    fallbackRows.set("sales.demos", {
      ...base,
      department: "sales",
      lineage: rawMetricLineage(demoEvidenceRecords),
      value: {
        count: input.rawDemos.count,
        requestedDemos: input.rawDemos.requestedDemos,
        webflowDemoRequests: input.rawDemos.webflowDemoRequests,
        source: "raw_source_records",
      },
      calculationVersion: "raw-sales-demos-investor-fallback-v1",
    });
  }

  if (
    !input.hasCustomerHealthMetric &&
    input.rawCustomerSuccess.supportInteractions > 0 &&
    customerSuccessEvidenceRecords.length > 0
  ) {
    fallbackRows.set("customer_success.customer_health", {
      ...base,
      department: "customer-success",
      unit: "score",
      lineage: rawMetricLineage(customerSuccessEvidenceRecords),
      value: {
        score: input.rawCustomerSuccess.customerHealth,
        riskScore: input.rawCustomerSuccess.riskScore,
        atRiskAccounts: input.rawCustomerSuccess.atRiskAccounts,
        openSupportIssues: input.rawCustomerSuccess.openSupportIssues,
        escalations: input.rawCustomerSuccess.escalations,
        accountsWithBillingRisk: input.rawCustomerSuccess.accountsWithBillingRisk,
        lowUsageAccounts: input.rawCustomerSuccess.lowUsageAccounts,
        source: "raw_source_records",
      },
      calculationVersion: "raw-customer-health-investor-fallback-v1",
    });
  }

  if (
    !input.hasCustomerActivityMetric &&
    input.rawCustomerSuccess.customerActivity > 0 &&
    customerActivityEvidenceRecords.length > 0
  ) {
    fallbackRows.set("customer_success.customer_activity", {
      ...base,
      department: "customer-success",
      unit: "count",
      lineage: rawMetricLineage(customerActivityEvidenceRecords),
      value: {
        count: input.rawCustomerSuccess.customerActivity,
        supportInteractions: input.rawCustomerSuccess.supportInteractions,
        productUsageRecords: input.rawCustomerSuccess.productUsageRecords,
        collaborationSignals: input.rawCustomerSuccess.collaborationSignals,
        activeAccounts: input.rawCustomerSuccess.activeAccounts,
        source: "raw_source_records",
      },
      calculationVersion: "raw-customer-activity-investor-fallback-v1",
    });
  }

  if (
    !input.hasRetentionRiskMetric &&
    input.rawCustomerSuccess.supportInteractions > 0 &&
    customerSuccessEvidenceRecords.length > 0
  ) {
    fallbackRows.set("customer_success.retention_risk", {
      ...base,
      department: "customer-success",
      unit: "score",
      lineage: rawMetricLineage(customerSuccessEvidenceRecords),
      value: {
        score: input.rawCustomerSuccess.riskScore,
        atRiskAccounts: input.rawCustomerSuccess.atRiskAccounts,
        openSupportIssues: input.rawCustomerSuccess.openSupportIssues,
        escalations: input.rawCustomerSuccess.escalations,
        accountsWithBillingRisk: input.rawCustomerSuccess.accountsWithBillingRisk,
        lowUsageAccounts: input.rawCustomerSuccess.lowUsageAccounts,
        source: "raw_source_records",
      },
      calculationVersion: "raw-retention-risk-investor-fallback-v1",
    });
  }

  if (
    !input.hasChurnRateMetric &&
    input.rawRetention.customerBase > 0 &&
    input.rawRetention.churnRate !== null &&
    retentionEvidenceRecords.length > 0
  ) {
    fallbackRows.set("customer_success.churn_rate", {
      ...base,
      department: "customer-success",
      unit: "percent",
      lineage: rawMetricLineage(retentionEvidenceRecords),
      value: {
        rate: input.rawRetention.churnRate,
        churnedCustomers: input.rawRetention.churnedCustomers,
        retainedCustomers: input.rawRetention.retainedCustomers,
        customerBase: input.rawRetention.customerBase,
        source: "raw_source_records",
      },
      calculationVersion: "raw-churn-rate-investor-fallback-v1",
    });
  }

  if (
    !input.hasRetentionRateMetric &&
    input.rawRetention.customerBase > 0 &&
    input.rawRetention.retentionRate !== null &&
    retentionEvidenceRecords.length > 0
  ) {
    fallbackRows.set("customer_success.retention_rate", {
      ...base,
      department: "customer-success",
      unit: "percent",
      lineage: rawMetricLineage(retentionEvidenceRecords),
      value: {
        rate: input.rawRetention.retentionRate,
        retainedCustomers: input.rawRetention.retainedCustomers,
        churnedCustomers: input.rawRetention.churnedCustomers,
        customerBase: input.rawRetention.customerBase,
        source: "raw_source_records",
      },
      calculationVersion: "raw-retention-rate-investor-fallback-v1",
    });
  }

  return fallbackRows;
}

function isWebflowDemoRequest(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "WEBFLOW") return false;
  if (!["form_submission", "form", "submission", "lead"].includes(normalizeObjectType(record.objectType))) {
    return false;
  }
  const payload = asRecord(record.payload);
  const textKeys = [
    "formName",
    "form_name",
    "formTitle",
    "form_title",
    "formId",
    "form_id",
    "name",
    "title",
    "subject",
    "description",
    "pageName",
    "page_name",
    "pageTitle",
    "page_title",
    "pagePath",
    "page_path",
    "submissionId",
    "submission_id",
  ];
  const text = wrapperSources(payload)
    .flatMap((source) => [
      ...textKeys.map((key) => source[key]),
      ...textKeys.map((key) => nestedRecord(source.form)[key]),
      ...textKeys.map((key) => nestedRecord(source.page)[key]),
    ])
    .map((value) => scalarValue(value))
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /\bdemo\b/.test(text) || /\b(?:book|request|schedule)\b.*\bdemo\b/.test(text);
}

function isDemoRecord(record: RawSourceRecordRow): boolean {
  if (isWebflowDemoRequest(record)) return true;
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

function buildMetrics(
  rowsByKey: Map<string, CanonicalMetricRow>,
  rawFallbacks: Map<string, RawDerivedMetricRow> = new Map(),
) {
  return INVESTOR_METRIC_KEYS.map((key) => {
    const row = rowsByKey.get(key);
    const rawFallback = rawFallbacks.get(key);
    if (!row && rawFallback) {
      return {
        key,
        department: rawFallback.department,
        unit: rawFallback.unit,
        value: rawFallback.value,
        status: "partial",
        confidence: rawFallback.confidence,
        warnings: rawFallback.warnings,
        periodStart: toIso(rawFallback.periodStart),
        periodEnd: toIso(rawFallback.periodEnd),
        calculationVersion: rawFallback.calculationVersion,
        computedAt: toIso(rawFallback.computedAt),
        sourceLineage: rawFallback.lineage.map((lineage) => ({
          sourceKey: lineage.sourceKey,
          sourceType: lineage.sourceType,
          sourceId: lineage.sourceId,
          rawRecordId: lineage.rawRecordId,
          capturedAt: toIso(lineage.capturedAt),
          metadata: lineage.metadata,
        })),
      };
    }
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
  prisma: Pick<
    PrismaClientType,
    "imladrisCanonicalMetricValue" | "imladrisRawSourceRecord"
  >;
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

  // Load lineage only for the winning row per metric, via a second id-bounded
  // query. The history query above intentionally omits lineage — including it
  // pulled millions of lineage rows through pgsql_tmp (2026-06-11 incident).
  await attachWinnerLineage(input.prisma, [...metricsByKey.values()]);
  const mrr = metricPayload(metricsByKey.get("revenue.mrr"));
  const arr = metricPayload(metricsByKey.get("revenue.arr"));
  const totalRevenue = metricPayload(metricsByKey.get("revenue.total_revenue"));
  const subscriptionRevenue = metricPayload(metricsByKey.get("revenue.subscription_revenue"));
  const servicesRevenue = metricPayload(metricsByKey.get("revenue.services_revenue"));
  const activeSubscriptions = metricPayload(metricsByKey.get("revenue.active_subscriptions"));
  const customerCount = metricPayload(metricsByKey.get("revenue.customer_count"));
  const cashBalance = metricPayload(metricsByKey.get("finance.cash_balance"));
  const runway = metricPayload(metricsByKey.get("finance.cash_runway_months"));
  const netBurn = metricPayload(metricsByKey.get("finance.net_burn"));
  const expenses = metricPayload(metricsByKey.get("finance.expenses"));
  const grossMargin = metricPayload(metricsByKey.get("finance.gross_margin"));
  const pipeline = metricPayload(metricsByKey.get("sales.qualified_pipeline"));
  const demos = metricPayload(metricsByKey.get("sales.demos"));
  const websiteTraffic = metricPayload(metricsByKey.get("marketing.website_traffic"));
  const conversionRate = metricPayload(metricsByKey.get("marketing.conversion_rate"));
  const pipelineEfficiency = metricPayload(metricsByKey.get("marketing.pipeline_efficiency"));
  const activationRate = metricPayload(metricsByKey.get("product.activation_rate"));
  const customerHealth = metricPayload(metricsByKey.get("customer_success.customer_health"));
  const customerActivity = metricPayload(metricsByKey.get("customer_success.customer_activity"));
  const churnRate = metricPayload(metricsByKey.get("customer_success.churn_rate"));
  const retentionRate = metricPayload(metricsByKey.get("customer_success.retention_rate"));
  const retentionRisk = metricPayload(metricsByKey.get("customer_success.retention_risk"));
  const currency = currencyFrom(
    mrr,
    arr,
    totalRevenue,
    subscriptionRevenue,
    servicesRevenue,
    cashBalance,
    runway,
    netBurn,
    expenses,
    pipeline,
  );
  const rawActiveSubscriptions = rawActiveSubscriptionCounts(dedupedRawRecords, input.fromDate, input.toDate);
  const rawCustomers = rawCustomerCounts(dedupedRawRecords, input.fromDate, input.toDate);
  const rawDemos = rawDemoCounts(dedupedRawRecords, input.fromDate, input.toDate);
  const rawRevenue = rawRevenueTotals(dedupedRawRecords, input.fromDate, input.toDate);
  const rawInvoiceRevenue = rawInvoiceRevenueComponents(dedupedRawRecords, input.fromDate, input.toDate);
  const rawFinance = rawFinanceValues(dedupedRawRecords, input.fromDate, input.toDate);
  const rawGrossMargin = rawGrossMarginValues(
    dedupedRawRecords,
    input.fromDate,
    input.toDate,
    rawRevenue,
    rawInvoiceRevenue,
  );
  const rawWebsiteTraffic = rawWebsiteTrafficCounts(dedupedRawRecords, input.fromDate, input.toDate);
  const rawConversions = rawConversionCounts(dedupedRawRecords, input.fromDate, input.toDate, rawWebsiteTraffic);
  const rawPipelineEfficiency = rawMarketingPipelineEfficiencyValues(
    dedupedRawRecords,
    input.fromDate,
    input.toDate,
    rawWebsiteTraffic,
    rawConversions,
  );
  const rawActivation = rawActivationValues(dedupedRawRecords, input.fromDate, input.toDate);
  const rawCustomerSuccess = rawCustomerSuccessCounts(dedupedRawRecords, input.fromDate, input.toDate);
  const rawRetention = rawRetentionCounts(dedupedRawRecords, input.fromDate, input.toDate);
  const rawFallbacks = rawDerivedMetricFallbacks({
    records: dedupedRawRecords,
    fromDate: input.fromDate,
    toDate: input.toDate,
    rawActiveSubscriptions,
    rawCustomers,
    rawDemos,
    rawRevenue,
    rawInvoiceRevenue,
    rawFinance,
    rawGrossMargin,
    rawWebsiteTraffic,
    rawConversions,
    rawPipelineEfficiency,
    rawActivation,
    rawCustomerSuccess,
    rawRetention,
    now,
    hasTotalRevenueMetric: metricsByKey.has("revenue.total_revenue"),
    hasSubscriptionRevenueMetric: metricsByKey.has("revenue.subscription_revenue"),
    hasServicesRevenueMetric: metricsByKey.has("revenue.services_revenue"),
    hasCashBalanceMetric: metricsByKey.has("finance.cash_balance"),
    hasRunwayMetric: metricsByKey.has("finance.cash_runway_months"),
    hasNetBurnMetric: metricsByKey.has("finance.net_burn"),
    hasExpensesMetric: metricsByKey.has("finance.expenses"),
    hasGrossMarginMetric: metricsByKey.has("finance.gross_margin"),
    hasActiveSubscriptionsMetric: metricsByKey.has("revenue.active_subscriptions"),
    hasCustomerCountMetric: metricsByKey.has("revenue.customer_count"),
    hasSalesDemosMetric: metricsByKey.has("sales.demos"),
    hasWebsiteTrafficMetric: metricsByKey.has("marketing.website_traffic"),
    hasConversionRateMetric: metricsByKey.has("marketing.conversion_rate"),
    hasPipelineEfficiencyMetric: metricsByKey.has("marketing.pipeline_efficiency"),
    hasActivationRateMetric: metricsByKey.has("product.activation_rate"),
    hasCustomerHealthMetric: metricsByKey.has("customer_success.customer_health"),
    hasCustomerActivityMetric: metricsByKey.has("customer_success.customer_activity"),
    hasChurnRateMetric: metricsByKey.has("customer_success.churn_rate"),
    hasRetentionRateMetric: metricsByKey.has("customer_success.retention_rate"),
    hasRetentionRiskMetric: metricsByKey.has("customer_success.retention_risk"),
  });
  const subscriptionRevenueAmount =
    numberFromFields(subscriptionRevenue, "amount", "arr") ?? rawInvoiceRevenue.subscriptionRevenue;
  const servicesRevenueAmount =
    numberFromFields(servicesRevenue, "amount") ?? rawInvoiceRevenue.servicesRevenue;
  const canonicalRevenueAmount = numberFromFields(totalRevenue, "amount", "totalRevenue", "total_revenue");
  const canonicalRevenueComponentAmount = subscriptionRevenueAmount + servicesRevenueAmount;
  const revenueComponentAmount =
    canonicalRevenueComponentAmount > 0 ? canonicalRevenueComponentAmount : rawInvoiceRevenue.total;
  const canonicalCustomerTotal = countFromFields(customerCount, "count", "activeCustomers", "active_customers");
  const useRawCustomerBreakdown =
    canonicalCustomerTotal === null || canonicalCustomerTotal === rawCustomers.total;
  const useRawCustomerSuccessRisk = rawCustomerSuccess.supportInteractions > 0;
  const useRawCustomerActivity = rawCustomerSuccess.customerActivity > 0;
  const useRawGrossMargin = !metricsByKey.has("finance.gross_margin");
  const useRawQualifiedPipeline = !metricsByKey.has("sales.qualified_pipeline");

  return {
    summary: {
      arr: roundMoney(
        numberFromFields(arr, "amount", "arr") ??
          numberFrom(mrr.arr) ??
          (numberFrom(mrr.amount) ?? 0) * 12,
      ),
      mrr: roundMoney(numberFrom(mrr.amount) ?? 0),
      totalRevenue: roundMoney(
        canonicalRevenueAmount ??
          (revenueComponentAmount > 0 ? revenueComponentAmount : rawRevenue.total),
      ),
      subscriptionRevenue: roundMoney(subscriptionRevenueAmount),
      servicesRevenue: roundMoney(servicesRevenueAmount),
      activeSubscriptions: countFromFields(activeSubscriptions, "count", "activeSubscriptions", "active_subscriptions") ?? rawActiveSubscriptions.total,
      stripeSubscriptions:
        countFromFields(activeSubscriptions, "stripeSubscriptions", "stripe_subscriptions") ?? rawActiveSubscriptions.stripe,
      hubspotOnlySubscriptions:
        countFromFields(activeSubscriptions, "hubspotOnlySubscriptions", "hubspot_only_subscriptions") ?? rawActiveSubscriptions.hubspotOnly,
      customers: canonicalCustomerTotal ?? rawCustomers.total,
      stripeCustomers:
        countFromFields(customerCount, "stripeCustomers", "stripe_customers") ??
        (useRawCustomerBreakdown ? rawCustomers.stripe : 0),
      hubspotOnlyCustomers:
        countFromFields(customerCount, "hubspotOnlyCustomers", "hubspot_only_customers") ??
        (useRawCustomerBreakdown ? rawCustomers.hubspotOnly : 0),
      runwayMonths:
        numberFrom(runway.months) ??
        (rawFinance.hasBalanceEvidence && rawFinance.hasTransactionEvidence && rawFinance.runwayMonths !== null
          ? rawFinance.runwayMonths
          : 0),
      cashBalance: roundMoney(
        numberFromFields(cashBalance, "amount", "cashBalance", "cash_balance") ??
          numberFromFields(runway, "cashBalance", "cash_balance") ??
          (rawFinance.hasBalanceEvidence ? rawFinance.cashBalance : 0),
      ),
      netBurn: roundMoney(
        numberFromFields(netBurn, "amount", "netBurn", "net_burn") ??
          numberFromFields(runway, "netBurn", "net_burn") ??
          (rawFinance.hasTransactionEvidence ? rawFinance.netBurn : 0),
      ),
      cashOutflow:
        roundMoney(
          numberFromFields(netBurn, "cashOutflow", "cash_outflow") ??
            (rawFinance.hasTransactionEvidence ? rawFinance.cashOutflow : 0),
        ),
      cashInflow:
        roundMoney(
          numberFromFields(netBurn, "cashInflow", "cash_inflow") ??
            (rawFinance.hasTransactionEvidence ? rawFinance.cashInflow : 0),
        ),
      expenses: roundMoney(
        numberFromFields(expenses, "amount", "expenses") ??
          (rawFinance.hasTransactionEvidence ? rawFinance.expenses : 0),
      ),
      grossMargin:
        numberFromFields(grossMargin, "rate", "grossMargin", "gross_margin") ??
        (useRawGrossMargin ? rawGrossMargin.rate : null) ??
        0,
      grossMarginRevenue:
        roundMoney(
          numberFromFields(grossMargin, "revenue", "grossMarginRevenue", "gross_margin_revenue") ??
            (useRawGrossMargin ? rawGrossMargin.revenue : 0),
        ),
      costOfGoodsSold:
        roundMoney(
          numberFromFields(grossMargin, "costOfGoodsSold", "cost_of_goods_sold", "cogs") ??
            (useRawGrossMargin ? rawGrossMargin.costOfGoodsSold : 0),
        ),
      stripeProcessingFees:
        roundMoney(
          numberFromFields(grossMargin, "stripeProcessingFees", "stripe_processing_fees", "stripeFees", "stripe_fees") ??
            (useRawGrossMargin ? rawGrossMargin.stripeProcessingFees : 0),
        ),
      qualifiedPipelineCount:
        countFromFields(pipeline, "qualifiedDealCount", "qualified_deal_count") ??
        (useRawQualifiedPipeline ? rawPipelineEfficiency.qualifiedPipelineCount : 0),
      collaborationTouchCount:
        countFromFields(pipeline, "collaborationTouchCount", "collaboration_touch_count") ?? 0,
      collaborationCoverage: roundRatio(
        ratioFrom(pipeline.collaborationCoverage ?? pipeline.collaboration_coverage) ?? 0,
      ),
      demos: countFromFields(demos, "count", "demos", "scheduledDemos", "scheduled_demos") ?? rawDemos.count,
      scheduledDemos:
        countFromFields(demos, "scheduledDemos", "scheduled_demos") ?? 0,
      requestedDemos:
        countFromFields(demos, "requestedDemos", "requested_demos") ?? rawDemos.requestedDemos,
      hubspotDemoDeals:
        countFromFields(demos, "hubspotDemoDeals", "hubspot_demo_deals") ?? 0,
      hubspotDemoMeetings:
        countFromFields(demos, "hubspotDemoMeetings", "hubspot_demo_meetings") ?? 0,
      calendarDemoEvents:
        countFromFields(demos, "calendarDemoEvents", "calendar_demo_events") ?? 0,
      webflowDemoRequests:
        countFromFields(demos, "webflowDemoRequests", "webflow_demo_requests") ?? rawDemos.webflowDemoRequests,
      websiteTraffic:
        countFromFields(websiteTraffic, "count", "websiteSessions", "website_sessions") ??
        rawWebsiteTraffic.count,
      websiteSessions:
        countFromFields(websiteTraffic, "websiteSessions", "website_sessions", "sessions") ??
        rawWebsiteTraffic.websiteSessions,
      posthogPageviews:
        countFromFields(websiteTraffic, "posthogPageviews", "posthog_pageviews") ??
        rawWebsiteTraffic.posthogPageviews,
      organicTraffic:
        countFromFields(websiteTraffic, "organicTraffic", "organic_traffic") ??
        rawWebsiteTraffic.organicTraffic,
      searchClicks:
        countFromFields(websiteTraffic, "searchClicks", "search_clicks") ??
        rawWebsiteTraffic.searchClicks,
      searchImpressions:
        countFromFields(websiteTraffic, "searchImpressions", "search_impressions") ??
        rawWebsiteTraffic.searchImpressions,
      conversionRate:
        numberFromFields(conversionRate, "rate", "conversionRate", "conversion_rate") ??
        rawConversions.rate ??
        0,
      conversions:
        countFromFields(conversionRate, "conversions", "conversionCount", "conversion_count") ??
        rawConversions.conversions,
      webflowFormSubmissions:
        countFromFields(
          conversionRate,
          "webflowFormSubmissions",
          "webflow_form_submissions",
          "formSubmissions",
          "form_submissions",
        ) ?? rawConversions.webflowFormSubmissions,
      hubspotLeadConversions:
        countFromFields(
          conversionRate,
          "hubspotLeadConversions",
          "hubspot_lead_conversions",
          "hubspotConversions",
          "hubspot_conversions",
        ) ?? rawConversions.hubspotLeadConversions,
      posthogConversions:
        countFromFields(conversionRate, "posthogConversions", "posthog_conversions") ??
        rawConversions.posthogConversions,
      identifiedVisitors:
        countFromFields(conversionRate, "identifiedVisitors", "identified_visitors") ??
        rawConversions.identifiedVisitors,
      pipelineEfficiency:
        numberFromFields(pipelineEfficiency, "ratio", "rate", "pipelineEfficiency", "pipeline_efficiency") ??
        rawPipelineEfficiency.ratio ??
        0,
      acquisitionSpend:
        roundMoney(
          numberFromFields(pipelineEfficiency, "acquisitionSpend", "acquisition_spend") ??
            rawPipelineEfficiency.acquisitionSpend,
        ),
      activationRate:
        numberFromFields(activationRate, "rate", "activationRate", "activation_rate") ??
        rawActivation.rate,
      activatedAccounts:
        countFromFields(activationRate, "activatedAccounts", "activated_accounts") ??
        rawActivation.activatedAccounts,
      eligibleAccounts:
        countFromFields(activationRate, "eligibleAccounts", "eligible_accounts") ??
        rawActivation.eligibleAccounts,
      customerHealth:
        numberFromFields(customerHealth, "score", "customerHealth", "customer_health") ??
        (useRawCustomerSuccessRisk ? rawCustomerSuccess.customerHealth : 0),
      atRiskAccounts:
        countFromFields(customerHealth, "atRiskAccounts", "at_risk_accounts") ??
        (useRawCustomerSuccessRisk ? rawCustomerSuccess.atRiskAccounts : 0),
      openSupportIssues:
        countFromFields(customerHealth, "openSupportIssues", "open_support_issues") ??
        (useRawCustomerSuccessRisk ? rawCustomerSuccess.openSupportIssues : 0),
      customerActivity:
        countFromFields(customerActivity, "count", "customerActivity", "customer_activity") ??
        (useRawCustomerActivity ? rawCustomerSuccess.customerActivity : 0),
      supportInteractions:
        countFromFields(customerActivity, "supportInteractions", "support_interactions") ??
        (useRawCustomerActivity ? rawCustomerSuccess.supportInteractions : 0),
      productUsageRecords:
        countFromFields(customerActivity, "productUsageRecords", "product_usage_records") ??
        (useRawCustomerActivity ? rawCustomerSuccess.productUsageRecords : 0),
      collaborationSignals:
        countFromFields(customerActivity, "collaborationSignals", "collaboration_signals") ??
        (useRawCustomerActivity ? rawCustomerSuccess.collaborationSignals : 0),
      customerActivityActiveAccounts:
        countFromFields(customerActivity, "activeAccounts", "active_accounts") ??
        (useRawCustomerActivity ? rawCustomerSuccess.activeAccounts : 0),
      churnRate:
        numberFromFields(churnRate, "rate", "churnRate", "churn_rate") ??
        rawRetention.churnRate ??
        0,
      retentionRate:
        numberFromFields(retentionRate, "rate", "retentionRate", "retention_rate") ??
        rawRetention.retentionRate ??
        0,
      churnedCustomers:
        countFromFields(churnRate, "churnedCustomers", "churned_customers") ??
        countFromFields(retentionRate, "churnedCustomers", "churned_customers") ??
        rawRetention.churnedCustomers,
      retainedCustomers:
        countFromFields(retentionRate, "retainedCustomers", "retained_customers") ??
        countFromFields(churnRate, "retainedCustomers", "retained_customers") ??
        rawRetention.retainedCustomers,
      retentionCustomerBase:
        countFromFields(retentionRate, "customerBase", "customer_base") ??
        countFromFields(churnRate, "customerBase", "customer_base") ??
        rawRetention.customerBase,
      retentionRiskScore:
        numberFromFields(retentionRisk, "score", "riskScore", "risk_score") ??
        (useRawCustomerSuccessRisk ? rawCustomerSuccess.riskScore : 0),
      retentionRiskAccounts:
        countFromFields(retentionRisk, "atRiskAccounts", "at_risk_accounts") ??
        (useRawCustomerSuccessRisk ? rawCustomerSuccess.atRiskAccounts : 0),
      retentionRiskEscalations:
        countFromFields(retentionRisk, "escalations", "escalationCount", "escalation_count") ??
        countFromFields(customerHealth, "escalations", "escalationCount", "escalation_count") ??
        (useRawCustomerSuccessRisk ? rawCustomerSuccess.escalations : 0),
      retentionRiskBillingRiskAccounts:
        countFromFields(
          retentionRisk,
          "accountsWithBillingRisk",
          "accounts_with_billing_risk",
          "billingRiskAccounts",
          "billing_risk_accounts",
        ) ??
        countFromFields(
          customerHealth,
          "accountsWithBillingRisk",
          "accounts_with_billing_risk",
          "billingRiskAccounts",
          "billing_risk_accounts",
        ) ??
        (useRawCustomerSuccessRisk ? rawCustomerSuccess.accountsWithBillingRisk : 0),
      retentionRiskLowUsageAccounts:
        countFromFields(retentionRisk, "lowUsageAccounts", "low_usage_accounts") ??
        countFromFields(customerHealth, "lowUsageAccounts", "low_usage_accounts") ??
        (useRawCustomerSuccessRisk ? rawCustomerSuccess.lowUsageAccounts : 0),
      currency,
    },
    weekly: buildWeekly(dedupedRawRecords, input.fromDate, input.toDate),
    pipeline: {
      qualifiedPipelineValue: roundMoney(
        numberFrom(pipeline.amount) ??
          (useRawQualifiedPipeline ? rawPipelineEfficiency.qualifiedPipeline : 0),
      ),
      qualifiedPipelineCount:
        countFromFields(pipeline, "qualifiedDealCount", "qualified_deal_count") ??
        (useRawQualifiedPipeline ? rawPipelineEfficiency.qualifiedPipelineCount : 0),
      collaborationTouchCount: countFromFields(pipeline, "collaborationTouchCount", "collaboration_touch_count") ?? 0,
      collaborationCoverage: roundRatio(
        ratioFrom(pipeline.collaborationCoverage ?? pipeline.collaboration_coverage) ?? 0,
      ),
      currency: useRawQualifiedPipeline
        ? currencyFrom({ currency: rawPipelineEfficiency.currency }, pipeline, mrr, runway, netBurn)
        : currencyFrom(pipeline, mrr, runway, netBurn),
    },
    metrics: buildMetrics(metricsByKey, rawFallbacks),
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

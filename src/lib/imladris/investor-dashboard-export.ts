import { normalizeMetricConfidence, normalizeMetricStatus, normalizeMetricWarnings } from "@/lib/imladris/confidence";
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

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const withoutCurrency = value.trim().replace(/[$,\s]/g, "");
    const normalized = /^\(.+\)$/.test(withoutCurrency)
      ? `-${withoutCurrency.slice(1, -1)}`
      : withoutCurrency;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
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
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.endsWith("%")) {
      const parsed = numberFrom(normalized.slice(0, -1));
      return parsed === null ? null : parsed / 100;
    }
  }
  const parsed = numberFrom(value);
  if (parsed === null) return null;
  return parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
}

function normalizeLookup(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStageKey(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : "";
}

function isTrueLike(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  return ["true", "yes", "y", "1"].includes(value.trim().toLowerCase());
}

function normalizeProviderKey(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[\s-]+/g, "_")
    : "";
}

function normalizeObjectType(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeExternalId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmailDomain(value: unknown): string | null {
  const email = normalizeLookup(value);
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  return domain && !GENERIC_EMAIL_DOMAINS.has(domain) ? domain : null;
}

function dateFrom(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim();
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
  const properties = nestedRecord(payload.properties);
  return (
    dateFrom(payload.closedAt) ??
    dateFrom(payload.closed_at) ??
    dateFrom(payload.closeDate) ??
    dateFrom(payload.close_date) ??
    dateFrom(payload.closedate) ??
    dateFrom(properties.closedAt) ??
    dateFrom(properties.closed_at) ??
    dateFrom(properties.closeDate) ??
    dateFrom(properties.close_date) ??
    dateFrom(properties.closedate) ??
    dateFrom(payload.created) ??
    dateFrom(payload.createdAt) ??
    dateFrom(payload.created_at) ??
    dateFrom(payload.createdate) ??
    dateFrom(properties.created) ??
    dateFrom(properties.createdAt) ??
    dateFrom(properties.created_at) ??
    dateFrom(properties.createdate) ??
    dateFrom(properties.hs_createdate) ??
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
    const currency = value?.currency;
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
    const periodDelta =
      (dateFrom(right.periodEnd)?.getTime() ?? 0) -
      (dateFrom(left.periodEnd)?.getTime() ?? 0);
    if (periodDelta !== 0) return periodDelta;
    const scopeDelta =
      canonicalMetricScopeSpecificity(right, context) -
      canonicalMetricScopeSpecificity(left, context);
    if (scopeDelta !== 0) return scopeDelta;
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
    const periodEnd = dateFrom(row.periodEnd);
    const computedAt = dateFrom(row.computedAt);
    return (
      periodEnd !== null &&
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
  return `${normalizeProviderKey(record.provider)}:${normalizeObjectType(record.objectType)}:${normalizeExternalId(record.externalId)}`;
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
  }

  if (context.userId && rowUserId === context.userId && rowOrganizationId === null) return 2;
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
  const customer = nestedRecord(payload.customer);
  return normalizeLookup(
    payload.customerId ??
      payload.customer_id ??
      payload.stripeCustomerId ??
      payload.stripe_customer_id ??
      customer.id,
  );
}

function stripeCustomerEmail(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const customer = nestedRecord(payload.customer);
  return normalizeLookup(payload.customerEmail ?? payload.customer_email ?? payload.email ?? customer.email);
}

function isActiveStripeSubscription(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "STRIPE") return false;
  if (!["subscription", "active_customer_ref"].includes(normalizeObjectType(record.objectType))) return false;
  const status = normalizeStageKey(asRecord(record.payload).status);
  return !status || !INACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

function hubspotDealStage(record: RawSourceRecordRow): string {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  return normalizeStageKey(
    payload.dealstage ??
      payload.stage ??
      payload.stageLabel ??
      payload.stage_label ??
      payload.stageId ??
      payload.stage_id ??
      properties.dealstage ??
      properties.stage ??
      properties.stageLabel ??
      properties.stage_label ??
      properties.stageId ??
      properties.stage_id,
  );
}

function hubspotCustomerId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  return normalizeLookup(
    payload.stripeCustomerId ??
      payload.stripe_customer_id ??
      payload.customerId ??
      payload.customer_id ??
      properties.stripeCustomerId ??
      properties.stripe_customer_id ??
      properties.customerId ??
      properties.customer_id,
  );
}

function hubspotEmail(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  return normalizeLookup(
    payload.primaryContactEmail ??
      payload.primary_contact_email ??
      payload.contactEmail ??
      payload.contact_email ??
      payload.email ??
      properties.primaryContactEmail ??
      properties.contactEmail ??
      properties.email,
  );
}

function isHubspotSubscriptionRecord(record: RawSourceRecordRow): boolean {
  if (normalizeProviderKey(record.provider) !== "HUBSPOT") return false;
  const objectType = normalizeObjectType(record.objectType);
  if (objectType === "subscription_deal") return true;
  if (objectType !== "deal") return false;
  const stage = hubspotDealStage(record);
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  return (
    stage === "subscription" ||
    stage === "subscriptions" ||
    isTrueLike(payload.recurringRevenue) ||
    isTrueLike(payload.recurring_revenue) ||
    isTrueLike(properties.recurringRevenue) ||
    isTrueLike(properties.recurring_revenue)
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
    stripeRecords.map((record) => stripeCustomerId(record) ?? record.externalId),
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
    hubspotOnlyKeys.add(customerId ?? email ?? record.externalId);
  }

  return stripeSubscriptionKeys.size + hubspotOnlyKeys.size;
}

function isDemoRecord(record: RawSourceRecordRow): boolean {
  if (!["GOOGLE_WORKSPACE", "HUBSPOT"].includes(normalizeProviderKey(record.provider))) return false;
  if (!["event", "calendar_event", "meeting", "demo", "deal"].includes(normalizeObjectType(record.objectType))) {
    return false;
  }
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const text = [
    payload.summary,
    payload.title,
    payload.name,
    payload.subject,
    payload.description,
    payload.dealName,
    payload.dealname,
    payload.stageLabel,
    payload.stage,
    payload.dealstage,
    properties.summary,
    properties.title,
    properties.subject,
    properties.dealname,
    properties.stageLabel,
    properties.dealstage,
  ]
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
  if (normalizeProviderKey(record.provider) !== "STRIPE" || normalizeObjectType(record.objectType) !== "charge") return 0;
  const payload = asRecord(record.payload);
  const status = normalizeStageKey(payload.status);
  if (status && status !== "succeeded" && status !== "paid") return 0;
  const explicitDecimal = numberFrom(
    payload.amountDecimal ??
      payload.amount_decimal ??
      payload.amountDollars ??
      payload.amount_dollars ??
      payload.amountUsd ??
      payload.amount_usd,
  );
  const explicitCents = numberFrom(payload.amountCents ?? payload.amount_cents);
  const amount = numberFrom(payload.amount ?? payload.amount_paid ?? payload.amountPaid);
  const grossRevenue =
    explicitDecimal ??
    (explicitCents !== null
      ? explicitCents / 100
      : amount === null
        ? 0
        : amount / 100);
  const refundedDecimal = numberFrom(
    payload.amountRefundedDecimal ??
      payload.amount_refunded_decimal ??
      payload.refundedAmountDecimal ??
      payload.refunded_amount_decimal,
  );
  const refundedCents = numberFrom(
    payload.amountRefunded ??
      payload.amount_refunded ??
      payload.refundedAmount ??
      payload.refunded_amount,
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
  return asRecord(row?.value);
}

function buildMetrics(rowsByKey: Map<string, CanonicalMetricRow>) {
  return INVESTOR_METRIC_KEYS.map((key) => {
    const row = rowsByKey.get(key);
    return {
      key,
      department: row?.department ?? null,
      unit: row?.unit ?? null,
      value: row?.value ?? null,
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
      cashBalance: roundMoney(numberFrom(runway.cashBalance) ?? 0),
      netBurn: roundMoney(numberFrom(netBurn.amount) ?? numberFrom(runway.netBurn) ?? 0),
      currency,
    },
    weekly: buildWeekly(dedupedRawRecords, input.fromDate, input.toDate),
    pipeline: {
      qualifiedPipelineValue: roundMoney(numberFrom(pipeline.amount) ?? 0),
      qualifiedPipelineCount: numberFrom(pipeline.qualifiedDealCount) ?? 0,
      collaborationTouchCount: numberFrom(pipeline.collaborationTouchCount) ?? 0,
      collaborationCoverage: roundRatio(ratioFrom(pipeline.collaborationCoverage) ?? 0),
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

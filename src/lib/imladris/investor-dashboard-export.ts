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
  "incompleteexpired",
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
  userId: string;
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
  lineage?: MetricLineageRow[];
}

interface RawSourceRecordRow {
  id: string;
  provider: string;
  objectType: string;
  externalId: string;
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
    const normalized = value.trim().replace(/[$,\s]/g, "");
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
    const date = new Date(value);
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

function scopeKeyForContext(context: InvestorDashboardExportContext): string {
  return context.organizationId ? `org:${context.organizationId}` : `user:${context.userId}`;
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
  return (
    dateFrom(payload.closedAt) ??
    dateFrom(payload.closed_at) ??
    dateFrom(payload.created) ??
    dateFrom(payload.createdAt) ??
    dateFrom(payload.created_at) ??
    dateFrom(record.occurredAt) ??
    dateFrom(record.sourceUpdatedAt)
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

function metricStatus(status: string): string {
  return status.trim().toLowerCase();
}

function currencyFrom(...values: Array<Record<string, unknown> | null | undefined>): string {
  for (const value of values) {
    const currency = value?.currency;
    if (typeof currency === "string" && currency.trim()) return currency.trim().toUpperCase();
  }
  return "USD";
}

function latestMetricsByKey(rows: CanonicalMetricRow[]): Map<string, CanonicalMetricRow> {
  const byKey = new Map<string, CanonicalMetricRow>();
  for (const row of rows) {
    if (!byKey.has(row.metricKey)) {
      byKey.set(row.metricKey, row);
    }
  }
  return byKey;
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
  if (record.provider !== "STRIPE") return false;
  if (!["subscription", "active_customer_ref"].includes(record.objectType)) return false;
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
  if (record.provider !== "HUBSPOT") return false;
  if (record.objectType === "subscription_deal") return true;
  if (record.objectType !== "deal") return false;
  const stage = hubspotDealStage(record);
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  return (
    stage === "subscription" ||
    stage === "subscriptions" ||
    payload.recurringRevenue === true ||
    payload.recurring_revenue === true ||
    properties.recurringRevenue === true ||
    properties.recurring_revenue === true
  );
}

function activeSubscriptionCount(records: RawSourceRecordRow[]): number {
  const stripeRecords = records.filter(isActiveStripeSubscription);
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

  for (const record of records) {
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
  if (!["GOOGLE_WORKSPACE", "HUBSPOT"].includes(record.provider)) return false;
  if (!["event", "calendar_event", "meeting", "demo", "deal"].includes(record.objectType)) {
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
  return record.provider === "HUBSPOT" && record.objectType === "deal" && ["closedwon", "won"].includes(hubspotDealStage(record));
}

function stripeChargeRevenue(record: RawSourceRecordRow): number {
  if (record.provider !== "STRIPE" || record.objectType !== "charge") return 0;
  const payload = asRecord(record.payload);
  const status = normalizeStageKey(payload.status);
  if (status && status !== "succeeded" && status !== "paid") return 0;
  const explicitCents = numberFrom(payload.amountCents ?? payload.amount_cents);
  if (explicitCents !== null) return Math.max(0, explicitCents / 100);
  const amount = numberFrom(payload.amount ?? payload.amount_paid ?? payload.amountPaid);
  return amount === null ? 0 : Math.max(0, amount / 100);
}

function buildWeekly(records: RawSourceRecordRow[]): WeeklyPoint[] {
  const byWeek = new Map<string, WeeklyPoint>();

  for (const record of records) {
    const date = recordDate(record);
    if (!date) continue;
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
      confidence: row?.confidence ?? 0,
      warnings: row?.warnings ?? ["Canonical Imladris materialization is missing for this metric."],
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
  const [canonicalRows, rawRecords] = await Promise.all([
    input.prisma.imladrisCanonicalMetricValue.findMany({
      where: {
        metricKey: { in: [...INVESTOR_METRIC_KEYS] },
        userId: input.context.userId,
        organizationId: input.context.organizationId,
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
        scopeKey: scopeKeyForContext(input.context),
        OR: [
          { userId: input.context.userId },
          ...(input.context.organizationId ? [{ organizationId: input.context.organizationId }] : []),
        ],
        AND: [
          {
            OR: [
              { occurredAt: { gte: input.fromDate, lte: input.toDate } },
              { sourceUpdatedAt: { gte: input.fromDate, lte: input.toDate } },
            ],
          },
        ],
      },
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    }),
  ]);

  const metricsByKey = latestMetricsByKey(canonicalRows as CanonicalMetricRow[]);
  const mrr = metricPayload(metricsByKey.get("revenue.mrr"));
  const runway = metricPayload(metricsByKey.get("finance.cash_runway_months"));
  const netBurn = metricPayload(metricsByKey.get("finance.net_burn"));
  const pipeline = metricPayload(metricsByKey.get("sales.qualified_pipeline"));
  const currency = currencyFrom(mrr, runway, netBurn, pipeline);

  return {
    summary: {
      arr: roundMoney(numberFrom(mrr.arr) ?? (numberFrom(mrr.amount) ?? 0) * 12),
      mrr: roundMoney(numberFrom(mrr.amount) ?? 0),
      activeSubscriptions: activeSubscriptionCount(rawRecords as RawSourceRecordRow[]),
      runwayMonths: numberFrom(runway.months) ?? 0,
      cashBalance: roundMoney(numberFrom(runway.cashBalance) ?? 0),
      netBurn: roundMoney(numberFrom(netBurn.amount) ?? numberFrom(runway.netBurn) ?? 0),
      currency,
    },
    weekly: buildWeekly(rawRecords as RawSourceRecordRow[]),
    pipeline: {
      qualifiedPipelineValue: roundMoney(numberFrom(pipeline.amount) ?? 0),
      qualifiedPipelineCount: numberFrom(pipeline.qualifiedDealCount) ?? 0,
      collaborationTouchCount: numberFrom(pipeline.collaborationTouchCount) ?? 0,
      collaborationCoverage: roundRatio(numberFrom(pipeline.collaborationCoverage) ?? 0),
      currency: currencyFrom(pipeline, mrr, runway, netBurn),
    },
    metrics: buildMetrics(metricsByKey),
    meta: {
      servedAt: (input.now ?? new Date()).toISOString(),
      range: input.range,
      from: isoDate(input.fromDate),
      to: isoDate(input.toDate),
      source: EXPORT_SOURCE,
      schemaVersion: EXPORT_SCHEMA_VERSION,
    },
  };
}

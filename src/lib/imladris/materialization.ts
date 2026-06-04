import {
  ImladrisMetricStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";
import type { PrismaClientType } from "@/lib/prisma";

const DEVELOPMENT_CALCULATION_VERSION = "development-delivery-health-v1";
const PRODUCT_ACTIVATION_CALCULATION_VERSION = "product-activation-rate-v1";
const FINANCE_NET_BURN_CALCULATION_VERSION = "finance-net-burn-v1";
const FINANCE_CASH_RUNWAY_CALCULATION_VERSION = "finance-cash-runway-v1";
const REVENUE_MRR_CALCULATION_VERSION = "revenue-mrr-v1";
const SALES_QUALIFIED_PIPELINE_CALCULATION_VERSION = "sales-qualified-pipeline-v1";
const MARKETING_PIPELINE_EFFICIENCY_CALCULATION_VERSION =
  "marketing-pipeline-efficiency-v1";
const CUSTOMER_SUCCESS_RETENTION_RISK_CALCULATION_VERSION =
  "customer-success-retention-risk-v1";
const INACTIVE_STRIPE_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "cancelled",
  "incomplete",
  "incompleteexpired",
  "paused",
  "unpaid",
]);
const TERMINAL_DEAL_STAGE_KEYS = new Set([
  "closedwon",
  "closedlost",
  "lost",
  "unlikely",
  "churn",
]);
const PAID_AD_PROVIDERS = [
  IntegrationProvider.GOOGLE_ADS,
  IntegrationProvider.META_ADS,
  IntegrationProvider.META_PAGE,
  IntegrationProvider.REDDIT,
] as const;
const STRIPE_INVOICE_LINE_ITEM_KEY = "__imladrisStripeInvoiceLineItem";
const INTEGRATION_PROVIDER_VALUES = new Set<string>(Object.values(IntegrationProvider));

interface ImladrisActorContext {
  userId: string | null;
  organizationId: string | null;
}

interface RawSourceRecordRow {
  id: string;
  provider: unknown;
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

interface MaterializeDevelopmentMetricsInput {
  prisma: PrismaClientType;
  context: ImladrisActorContext;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}

export interface MaterializedImladrisMetricResult {
  metricKey: string;
  metricValueId: string;
  status: keyof typeof ImladrisMetricStatus;
  rawRecordCount: number;
  value: Record<string, unknown>;
}

type RawSourceRecordDelegate = {
  findMany(args: Record<string, unknown>): Promise<RawSourceRecordRow[]>;
};

type CanonicalMetricDelegate = {
  upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<{ id: string }>;
};

type MetricLineageDelegate = {
  deleteMany(args: { where: { metricValueId: string } }): Promise<unknown>;
  createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nestedRecord(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entryValue]) => [String(key), entryValue]),
    );
  }
  return asRecord(value);
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
  return null;
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
  return [
    payload,
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
  ].flatMap(expandSingleValueSource);
}

function metricSources(payload: Record<string, unknown>): Record<string, unknown>[] {
  const sources = wrapperSources(payload);
  return [
    ...sources,
    ...sources.flatMap((source) => [
      nestedRecord(source.summary),
      nestedRecord(source.metrics),
    ]),
  ];
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
  const date = new Date(String(normalizedValue));
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstDateFrom(...values: unknown[]): Date | null {
  for (const value of values) {
    const date = dateFrom(value);
    if (date) return date;
  }
  return null;
}

function firstDateAtOrBefore(asOf: Date, ...values: unknown[]): Date | null {
  for (const value of values) {
    const date = dateFrom(value);
    if (date && date.getTime() <= asOf.getTime()) return date;
  }
  return null;
}

function hasDateAfter(asOf: Date, ...values: unknown[]): boolean {
  return values.some((value) => {
    const date = dateFrom(value);
    return Boolean(date && date.getTime() > asOf.getTime());
  });
}

function daysBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / 86_400_000);
}

function isCompletedLinearIssue(record: RawSourceRecordRow, asOf: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const completionDateFields = sources.flatMap((source) => [
    source.completedAt,
    source.completed_at,
  ]);
  if (hasDateAfter(asOf, ...completionDateFields)) return false;
  const state = firstValueFromSources(sources, ["state"]);
  const completedStateNames = ["done", "completed", "complete"];
  const stateKey = normalizeStageKey(state);
  if (completedStateNames.includes(stateKey)) return true;
  const stateRecord = nestedRecord(state);
  if (normalizeStageKey(stateRecord.type) === "completed") {
    return true;
  }
  if (completedStateNames.includes(normalizeStageKey(stateRecord.name))) {
    return true;
  }
  return firstDateAtOrBefore(asOf, ...completionDateFields) !== null;
}

function linearCycleTimeDays(record: RawSourceRecordRow, asOf: Date): number | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return daysBetween(
    firstDateFrom(
      ...sources.flatMap((source) => [
        source.createdAt,
        source.created_at,
      ]),
      record.sourceCreatedAt,
    ),
    firstDateAtOrBefore(
      asOf,
      ...sources.flatMap((source) => [
        source.completedAt,
        source.completed_at,
      ]),
      record.occurredAt,
      record.sourceUpdatedAt,
    ),
  );
}

function isMergedPullRequest(record: RawSourceRecordRow, asOf: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const mergedDateFields = sources.flatMap((source) => [
    source.mergedAt,
    source.merged_at,
  ]);
  if (hasDateAfter(asOf, ...mergedDateFields)) return false;
  return (
    booleanFrom(firstValueFromSources(sources, ["merged"])) === true ||
    firstDateAtOrBefore(asOf, ...mergedDateFields) !== null
  );
}

function normalizeProvider(value: unknown): IntegrationProvider | null {
  const normalizedValue = scalarValue(value);
  if (typeof normalizedValue !== "string") return null;
  const normalized = normalizedValue
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (INTEGRATION_PROVIDER_VALUES.has(normalized)) return normalized as IntegrationProvider;
  const compactNormalized = normalized.replaceAll("_", "");
  const compactMatch = Object.values(IntegrationProvider).find(
    (provider) => provider.replaceAll("_", "") === compactNormalized,
  );
  return compactMatch ?? null;
}

function recordProvider(record: RawSourceRecordRow): IntegrationProvider | null {
  return normalizeProvider(record.provider);
}

function recordIsProvider(record: RawSourceRecordRow, provider: IntegrationProvider): boolean {
  return recordProvider(record) === provider;
}

function sourceKeyForProvider(
  provider: unknown,
):
  | "hubspot"
  | "stripe"
  | "pylon"
  | "mercury"
  | "linear"
  | "github"
  | "posthog"
  | "googleWorkspace"
  | "slack"
  | "googleAnalytics"
  | "googleSearchConsole"
  | "googleAds"
  | "metaAds"
  | "reddit"
  | "semrush"
  | "coda"
  | "webflow"
  | "unify" {
  switch (normalizeProvider(provider)) {
    case IntegrationProvider.HUBSPOT:
      return "hubspot";
    case IntegrationProvider.STRIPE:
      return "stripe";
    case IntegrationProvider.PYLON:
      return "pylon";
    case IntegrationProvider.MERCURY:
      return "mercury";
    case IntegrationProvider.LINEAR:
      return "linear";
    case IntegrationProvider.GITHUB:
      return "github";
    case IntegrationProvider.GOOGLE_WORKSPACE:
      return "googleWorkspace";
    case IntegrationProvider.SLACK:
      return "slack";
    case IntegrationProvider.GOOGLE_ANALYTICS:
      return "googleAnalytics";
    case IntegrationProvider.GOOGLE_SEARCH_CONSOLE:
      return "googleSearchConsole";
    case IntegrationProvider.GOOGLE_ADS:
      return "googleAds";
    case IntegrationProvider.META_ADS:
    case IntegrationProvider.META_PAGE:
      return "metaAds";
    case IntegrationProvider.REDDIT:
      return "reddit";
    case IntegrationProvider.SEMRUSH:
      return "semrush";
    case IntegrationProvider.CODA:
      return "coda";
    case IntegrationProvider.WEBFLOW:
      return "webflow";
    case IntegrationProvider.UNIFY:
      return "unify";
    case IntegrationProvider.POSTHOG:
      return "posthog";
    default:
      return "posthog";
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeDeliveryHealth(records: RawSourceRecordRow[], asOf: Date) {
  const linearIssues = records.filter(
    (record) => recordIsProvider(record, IntegrationProvider.LINEAR) && recordIsObjectType(record, "issue"),
  );
  const completedLinearIssues = linearIssues.filter((record) => isCompletedLinearIssue(record, asOf));
  const mergedPullRequests = records.filter(
    (record) =>
      recordIsProvider(record, IntegrationProvider.GITHUB) &&
      recordIsObjectType(record, "pull_request") &&
      isMergedPullRequest(record, asOf),
  );
  const productEvents = records.filter(
    (record) => recordIsProvider(record, IntegrationProvider.POSTHOG) && recordIsObjectType(record, "event"),
  );
  const cycleTimes = completedLinearIssues
    .map((record) => linearCycleTimeDays(record, asOf))
    .filter((value): value is number => typeof value === "number");
  const averageLinearCycleTimeDays = average(cycleTimes);

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        45 +
          Math.min(25, completedLinearIssues.length * 5) +
          Math.min(20, mergedPullRequests.length * 5) +
          Math.min(10, productEvents.length * 2) -
          (averageLinearCycleTimeDays ? Math.max(0, averageLinearCycleTimeDays - 7) : 0),
      ),
    ),
  );

  return {
    score,
    completedLinearIssues: completedLinearIssues.length,
    mergedPullRequests: mergedPullRequests.length,
    productEvents: productEvents.length,
    averageLinearCycleTimeDays,
  };
}

function confidenceFor(records: RawSourceRecordRow[]): number {
  if (records.length === 0) return 0;
  const providerCount = new Set(
    records.map(recordProvider).filter((provider): provider is IntegrationProvider => provider !== null),
  ).size;
  return Math.min(0.95, Number((0.55 + providerCount * 0.12).toFixed(2)));
}

function providerDisplayName(provider: IntegrationProvider): string {
  switch (provider) {
    case IntegrationProvider.GOOGLE_WORKSPACE:
      return "Google Workspace";
    case IntegrationProvider.GOOGLE_ANALYTICS:
      return "Google Analytics";
    case IntegrationProvider.GOOGLE_SEARCH_CONSOLE:
      return "Google Search Console";
    case IntegrationProvider.GOOGLE_ADS:
      return "Google Ads";
    case IntegrationProvider.META_ADS:
      return "Meta Ads";
    case IntegrationProvider.META_PAGE:
      return "Meta Page";
    case IntegrationProvider.HUBSPOT:
      return "HubSpot";
    case IntegrationProvider.GITHUB:
      return "GitHub";
    case IntegrationProvider.POSTHOG:
      return "PostHog";
    case IntegrationProvider.SEMRUSH:
      return "SEMrush";
    default:
      return provider
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function formatProviderList(providers: IntegrationProvider[]): string {
  const names = providers.map(providerDisplayName);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function missingProviders(
  records: RawSourceRecordRow[],
  requiredProviders: IntegrationProvider[],
): IntegrationProvider[] {
  const presentProviders = new Set(
    records
      .map(recordProvider)
      .filter((provider): provider is IntegrationProvider => provider !== null)
      .map(providerCoverageKey),
  );
  return requiredProviders.filter(
    (provider) => !presentProviders.has(providerCoverageKey(provider)),
  );
}

function providerCoverageKey(provider: IntegrationProvider): IntegrationProvider {
  return provider === IntegrationProvider.META_PAGE ? IntegrationProvider.META_ADS : provider;
}

function statusForProviderCoverage(input: {
  records: RawSourceRecordRow[];
  requiredProviders: IntegrationProvider[];
}): keyof typeof ImladrisMetricStatus {
  if (input.records.length === 0) return ImladrisMetricStatus.MISSING;
  return missingProviders(input.records, input.requiredProviders).length === 0
    ? ImladrisMetricStatus.READY
    : ImladrisMetricStatus.PARTIAL;
}

function providerCoverageWarning(input: {
  metricLabel: string;
  missingVerb?: "is" | "are";
  records: RawSourceRecordRow[];
  requiredProviders: IntegrationProvider[];
  emptyWarning: string;
}): string[] {
  if (input.records.length === 0) return [input.emptyWarning];
  const missing = missingProviders(input.records, input.requiredProviders);
  if (missing.length === 0) return [];
  return [
    `${input.metricLabel} ${input.missingVerb ?? "is"} missing ${formatProviderList(missing)} raw records for this period.`,
  ];
}

function numberFrom(value: unknown): number | null {
  return parseImladrisNumber(scalarValue(value) ?? value);
}

function nonNegativeNumberFrom(value: unknown): number | null {
  const number = numberFrom(value);
  return number === null ? null : Math.max(0, number);
}

function nonNegativeIntegerFrom(value: unknown): number | null {
  const number = nonNegativeNumberFrom(value);
  return number === null ? null : Math.floor(number);
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

function booleanFrom(value: unknown): boolean | null {
  const normalizedValue = booleanValue(value);
  if (typeof normalizedValue === "boolean") return normalizedValue;
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue)) {
    if (normalizedValue === 1) return true;
    if (normalizedValue === 0) return false;
    return null;
  }
  if (typeof normalizedValue === "string") {
    const normalized = normalizedValue.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "0"].includes(normalized)) return false;
  }
  return null;
}

function currencyFrom(records: RawSourceRecordRow[]): string {
  for (const record of records) {
    const payload = asRecord(record.payload);
    const currency = firstValueFromSources(wrapperSources(payload), [
      "currency",
      "currencyCode",
      "currency_code",
      "hs_currency",
    ]);
    const normalizedCurrency = scalarValue(currency);
    if (typeof normalizedCurrency === "string" && normalizedCurrency.trim()) {
      return normalizedCurrency.trim().toUpperCase();
    }
  }
  return "USD";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

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

function normalizeLookup(value: unknown): string | null {
  const normalizedValue = scalarValue(value);
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue)) {
    return String(normalizedValue).toLowerCase();
  }
  if (typeof normalizedValue !== "string") return null;
  const normalized = normalizedValue.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeObjectType(value: unknown): string {
  const normalizedValue = scalarValue(value);
  return typeof normalizedValue === "string"
    ? normalizedValue
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase()
    : "";
}

function recordObjectType(record: RawSourceRecordRow): string {
  return normalizeObjectType(record.objectType);
}

function recordIsObjectType(record: RawSourceRecordRow, ...objectTypes: string[]): boolean {
  return objectTypes.includes(recordObjectType(record));
}

function normalizeIdentifier(value: unknown): string | null {
  const normalizedValue = scalarValue(value);
  if (typeof normalizedValue === "number" && Number.isFinite(normalizedValue)) {
    return String(normalizedValue);
  }
  if (typeof normalizedValue !== "string") return null;
  const normalized = normalizedValue.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTenantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeContext(context: ImladrisActorContext): ImladrisActorContext {
  return {
    userId: normalizeTenantId(context.userId),
    organizationId: normalizeTenantId(context.organizationId),
  };
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

function normalizeEmailDomain(value: unknown): string | null {
  const email = normalizeLookup(value);
  if (!email || !email.includes("@")) return null;
  const [, domain] = email.split("@");
  const normalized = normalizeLookup(domain);
  if (!normalized || GENERIC_EMAIL_DOMAINS.has(normalized)) return null;
  return normalized;
}

function scopeKeyForContext(context: ImladrisActorContext): string {
  const normalized = normalizeContext(context);
  if (normalized.organizationId) return `org:${normalized.organizationId}`;
  if (normalized.userId) return `user:${normalized.userId}`;
  return "global";
}

function providerWindowWhere(input: {
  providers: IntegrationProvider[];
  context: ImladrisActorContext;
  periodStart: Date;
  periodEnd: Date;
}) {
  const context = normalizeContext(input.context);
  const scopeFilters = rawRecordScopeFilters(context);
  return {
    provider: {
      in: input.providers,
    },
    OR: scopeFilters,
    AND: [
      {
        OR: [
          { occurredAt: { gte: input.periodStart, lte: input.periodEnd } },
          { sourceCreatedAt: { gte: input.periodStart, lte: input.periodEnd } },
          { sourceUpdatedAt: { gte: input.periodStart, lte: input.periodEnd } },
        ],
      },
    ],
  };
}

function financeWindowWhere(input: {
  providers: IntegrationProvider[];
  context: ImladrisActorContext;
  periodStart: Date;
  periodEnd: Date;
}) {
  const context = normalizeContext(input.context);
  const scopeFilters = rawRecordScopeFilters(context);
  return {
    provider: {
      in: input.providers,
    },
    OR: scopeFilters,
    AND: [
      {
        OR: [
          { occurredAt: { gte: input.periodStart, lte: input.periodEnd } },
          { sourceCreatedAt: { gte: input.periodStart, lte: input.periodEnd } },
          { sourceUpdatedAt: { gte: input.periodStart, lte: input.periodEnd } },
          {
            objectType: {
              in: [
                "active_customer_ref",
                "account_balance",
                "balance",
                "deal",
                "snapshot",
                "subscription",
                "subscription_deal",
              ],
            },
            OR: [
              { occurredAt: { lte: input.periodEnd } },
              { sourceCreatedAt: { lte: input.periodEnd } },
              { sourceUpdatedAt: { lte: input.periodEnd } },
            ],
          },
        ],
      },
    ],
  };
}

function rawRecordScopeFilters(context: ImladrisActorContext): Array<Record<string, string | null>> {
  if (context.organizationId) {
    const organizationScopeKey = scopeKeyForContext({
      userId: null,
      organizationId: context.organizationId,
    });
    return [
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
    ];
  }

  if (context.userId) {
    return [
      { scopeKey: scopeKeyForContext(context), userId: context.userId },
      { scopeKey: "global", userId: null, organizationId: null },
    ];
  }

  return [{ scopeKey: "global", userId: null, organizationId: null }];
}

function rawRecordDeduplicationKey(record: RawSourceRecordRow): string {
  const externalId = normalizeIdentifier(record.externalId);
  const provider = recordProvider(record) ?? "UNKNOWN";
  if (externalId) return `${provider}:${recordObjectType(record)}:external:${externalId}`;
  return `${provider}:${recordObjectType(record)}:raw:${normalizeIdentifier(record.id) ?? ""}`;
}

function rawRecordSourceId(record: RawSourceRecordRow): string | null {
  return normalizeIdentifier(record.externalId) ?? normalizeIdentifier(record.id);
}

function rawRecordScopeRank(record: RawSourceRecordRow, context: ImladrisActorContext): number {
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

function rawRevisionTimestampAsOf(value: Date | string | null, asOf: Date): number | null {
  const date = dateFrom(value);
  if (!date) return null;
  return date.getTime() <= asOf.getTime() ? date.getTime() : null;
}

function compareRawRecordPreference(
  left: RawSourceRecordRow,
  right: RawSourceRecordRow,
  context: ImladrisActorContext,
  asOf: Date,
): number {
  const scopeDelta = rawRecordScopeRank(right, context) - rawRecordScopeRank(left, context);
  if (scopeDelta !== 0) return scopeDelta;
  return (
    (rawRevisionTimestampAsOf(right.sourceUpdatedAt, asOf) ??
      rawRevisionTimestampAsOf(right.occurredAt, asOf) ??
      rawRevisionTimestampAsOf(right.sourceCreatedAt, asOf) ??
      0) -
    (rawRevisionTimestampAsOf(left.sourceUpdatedAt, asOf) ??
      rawRevisionTimestampAsOf(left.occurredAt, asOf) ??
      rawRevisionTimestampAsOf(left.sourceCreatedAt, asOf) ??
      0)
  );
}

function rawRecordIsObservableAsOf(record: RawSourceRecordRow, asOf: Date): boolean {
  return firstDateAtOrBefore(asOf, record.sourceUpdatedAt, record.occurredAt, record.sourceCreatedAt) !== null;
}

function inclusivePeriodEnd(periodEnd: Date): Date {
  if (
    periodEnd.getUTCHours() === 0 &&
    periodEnd.getUTCMinutes() === 0 &&
    periodEnd.getUTCSeconds() === 0 &&
    periodEnd.getUTCMilliseconds() === 0
  ) {
    const endOfDay = new Date(periodEnd);
    endOfDay.setUTCHours(23, 59, 59, 999);
    return endOfDay;
  }
  return periodEnd;
}

function rawRecordIsWithinPeriod(record: RawSourceRecordRow, periodStart: Date, periodEnd: Date): boolean {
  const inclusiveEnd = inclusivePeriodEnd(periodEnd);
  return [record.occurredAt, record.sourceCreatedAt, record.sourceUpdatedAt].some((value) => {
    const date = dateFrom(value);
    if (!date) return false;
    const timestamp = date.getTime();
    return timestamp >= periodStart.getTime() && timestamp <= inclusiveEnd.getTime();
  });
}

function rawRecordObservedAtOrBefore(record: RawSourceRecordRow, at: Date): boolean {
  return firstDateAtOrBefore(at, record.sourceUpdatedAt, record.occurredAt, record.sourceCreatedAt) !== null;
}

function durableFinanceRecordAppliesToPeriod(
  record: RawSourceRecordRow,
  periodStart: Date,
  periodEnd: Date,
  asOf: Date,
): boolean {
  if (rawRecordIsWithinPeriod(record, periodStart, periodEnd)) return true;
  const inclusiveEnd = inclusivePeriodEnd(periodEnd);
  if (!rawRecordObservedAtOrBefore(record, inclusiveEnd)) return false;

  if (recordIsProvider(record, IntegrationProvider.MERCURY)) {
    return recordIsObjectType(record, "account_balance", "balance", "snapshot");
  }
  if (recordIsProvider(record, IntegrationProvider.STRIPE)) {
    return (
      recordIsObjectType(record, "active_customer_ref") ||
      (recordIsObjectType(record, "subscription") &&
        !isInactiveStripeSubscription(record, asOf) &&
        !isFutureTrialStripeSubscription(record, asOf) &&
        !isFutureStartStripeSubscription(record, asOf))
    );
  }
  if (recordIsProvider(record, IntegrationProvider.HUBSPOT)) {
    return recordIsObjectType(record, "deal", "subscription_deal") && hubspotRecurringRevenueAsOf(record, asOf) !== null;
  }

  return false;
}

type RawRecordPeriodPredicate = (
  record: RawSourceRecordRow,
  periodStart: Date,
  periodEnd: Date,
  asOf: Date,
) => boolean;

function dedupeRawSourceRecords(
  records: RawSourceRecordRow[],
  context: ImladrisActorContext,
  periodStart: Date,
  periodEnd: Date,
  asOf: Date,
  recordAppliesToPeriod: RawRecordPeriodPredicate = (record, start, end) =>
    rawRecordIsWithinPeriod(record, start, end),
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
  return [...bestByObject.values()].filter((record) =>
    recordAppliesToPeriod(record, periodStart, periodEnd, asOf) &&
    rawRecordIsObservableAsOf(record, asOf),
  );
}

async function replaceLineage(input: {
  metricLineage: MetricLineageDelegate;
  metricValueId: string;
  records: RawSourceRecordRow[];
  calculationVersion: string;
  asOf: Date;
}) {
  await input.metricLineage.deleteMany({
    where: { metricValueId: input.metricValueId },
  });
  if (input.records.length === 0) return;
  await input.metricLineage.createMany({
    data: input.records.map((record) => ({
      metricValueId: input.metricValueId,
      rawRecordId: record.id,
      sourceKey: sourceKeyForProvider(record.provider),
      sourceType: recordObjectType(record),
      sourceId: rawRecordSourceId(record),
      capturedAt: firstDateAtOrBefore(
        input.asOf,
        record.occurredAt,
        record.sourceUpdatedAt,
        record.sourceCreatedAt,
      ),
      metadata: {
        provider: record.provider,
        calculationVersion: input.calculationVersion,
      },
    })),
  });
}

export async function materializeImladrisDevelopmentMetrics(
  input: MaterializeDevelopmentMetricsInput,
): Promise<MaterializedImladrisMetricResult> {
  const rawRecords = input.prisma.imladrisRawSourceRecord as RawSourceRecordDelegate;
  const canonicalMetrics = input.prisma
    .imladrisCanonicalMetricValue as CanonicalMetricDelegate;
  const metricLineage = input.prisma.imladrisMetricLineage as MetricLineageDelegate;
  const context = normalizeContext(input.context);
  const now = input.now ?? new Date();

  const requiredProviders = [
    IntegrationProvider.LINEAR,
    IntegrationProvider.GITHUB,
    IntegrationProvider.POSTHOG,
  ];
  const queriedRecords = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: requiredProviders,
      context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const records = dedupeRawSourceRecords(queriedRecords, context, input.periodStart, input.periodEnd, now);

  const value = computeDeliveryHealth(records, now);
  const status = statusForProviderCoverage({ records, requiredProviders });
  const warnings = providerCoverageWarning({
    metricLabel: "Development Delivery Health",
    records,
    requiredProviders,
    emptyWarning: "No Linear, GitHub, or PostHog raw records were available for this period.",
  });
  const metricValue = await canonicalMetrics.upsert({
    where: {
      organizationId_userId_metricKey_periodEnd_calculationVersion: {
        organizationId: context.organizationId,
        userId: context.userId,
        metricKey: "development.delivery_health",
        periodEnd: input.periodEnd,
        calculationVersion: DEVELOPMENT_CALCULATION_VERSION,
      },
    },
    create: {
      metricKey: "development.delivery_health",
      department: "development",
      unit: "score",
      value,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status,
      confidence: confidenceFor(records),
      warnings,
      calculationVersion: DEVELOPMENT_CALCULATION_VERSION,
      computedAt: now,
      userId: context.userId,
      organizationId: context.organizationId,
    },
    update: {
      value,
      periodStart: input.periodStart,
      status,
      confidence: confidenceFor(records),
      warnings,
      computedAt: now,
    },
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: DEVELOPMENT_CALCULATION_VERSION,
    asOf: now,
  });

  return {
    metricKey: "development.delivery_health",
    metricValueId: metricValue.id,
    status,
    rawRecordCount: records.length,
    value,
  };
}

function hubspotAccountId(record: RawSourceRecordRow): string | null {
  if (!recordIsObjectType(record, "company", "account", "contact")) return null;
  const payload = asRecord(record.payload);
  const id = firstValueFromSources(wrapperSources(payload), [
    "companyId",
    "company_id",
    "accountId",
    "account_id",
    "hs_object_id",
    "id",
  ]);
  return normalizeIdentifier(id) ?? normalizeIdentifier(record.externalId);
}

function activationAccountId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const id = firstValueFromSources(wrapperSources(payload), [
    "hubspotCompanyId",
    "hubspot_company_id",
    "companyId",
    "company_id",
    "accountId",
    "account_id",
    "distinct_id",
  ]);
  return normalizeIdentifier(id);
}

function isActivationEvent(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.POSTHOG) || !recordIsObjectType(record, "event")) {
    return false;
  }
  const eventName = firstValueFromSources(wrapperSources(asRecord(record.payload)), ["event"]);
  const normalizedEventName = normalizeLookup(eventName);
  return (
    normalizedEventName !== null &&
    ["activation_completed", "activated", "account_activated"].includes(normalizedEventName)
  );
}

function computeActivationRate(records: RawSourceRecordRow[]) {
  const eligibleAccountIds = new Set(
    records
      .filter((record) => recordIsProvider(record, IntegrationProvider.HUBSPOT))
      .map(hubspotAccountId)
      .filter((id): id is string => Boolean(id)),
  );
  const activatedAccountIds = new Set(
    records
      .filter(isActivationEvent)
      .map(activationAccountId)
      .filter(
        (id): id is string => typeof id === "string" && eligibleAccountIds.has(id),
      ),
  );
  const eligibleAccounts = eligibleAccountIds.size;
  const activatedAccounts = activatedAccountIds.size;

  return {
    rate: eligibleAccounts === 0 ? 0 : roundRatio((activatedAccounts / eligibleAccounts) * 100),
    activatedAccounts,
    eligibleAccounts,
  };
}

export async function materializeImladrisProductActivationMetric(
  input: MaterializeDevelopmentMetricsInput,
): Promise<MaterializedImladrisMetricResult> {
  const rawRecords = input.prisma.imladrisRawSourceRecord as RawSourceRecordDelegate;
  const canonicalMetrics = input.prisma
    .imladrisCanonicalMetricValue as CanonicalMetricDelegate;
  const metricLineage = input.prisma.imladrisMetricLineage as MetricLineageDelegate;
  const context = normalizeContext(input.context);
  const now = input.now ?? new Date();

  const requiredProviders = [IntegrationProvider.HUBSPOT, IntegrationProvider.POSTHOG];
  const queriedRecords = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: requiredProviders,
      context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const records = dedupeRawSourceRecords(queriedRecords, context, input.periodStart, input.periodEnd, now);

  const value = computeActivationRate(records);
  const status =
    value.eligibleAccounts > 0
      ? statusForProviderCoverage({ records, requiredProviders })
      : ImladrisMetricStatus.MISSING;
  const warnings =
    value.eligibleAccounts > 0
      ? providerCoverageWarning({
          metricLabel: "Activation Rate",
          records,
          requiredProviders,
          emptyWarning: "No HubSpot account cohort was available for activation-rate materialization.",
        })
      : ["No HubSpot account cohort was available for activation-rate materialization."];
  const metricValue = await canonicalMetrics.upsert({
    where: {
      organizationId_userId_metricKey_periodEnd_calculationVersion: {
        organizationId: context.organizationId,
        userId: context.userId,
        metricKey: "product.activation_rate",
        periodEnd: input.periodEnd,
        calculationVersion: PRODUCT_ACTIVATION_CALCULATION_VERSION,
      },
    },
    create: {
      metricKey: "product.activation_rate",
      department: "development",
      unit: "percent",
      value,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status,
      confidence: confidenceFor(records),
      warnings,
      calculationVersion: PRODUCT_ACTIVATION_CALCULATION_VERSION,
      computedAt: now,
      userId: context.userId,
      organizationId: context.organizationId,
    },
    update: {
      value,
      periodStart: input.periodStart,
      status,
      confidence: confidenceFor(records),
      warnings,
      computedAt: now,
    },
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: PRODUCT_ACTIVATION_CALCULATION_VERSION,
    asOf: now,
  });

  return {
    metricKey: "product.activation_rate",
    metricValueId: metricValue.id,
    status,
    rawRecordCount: records.length,
    value,
  };
}

function transactionAmount(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
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
  const debitAmountCents = numberFrom(
    firstValueFromSources(sources, [
      "debitAmountCents",
      "debit_amount_cents",
      "debitCents",
      "debit_cents",
      "withdrawalAmountCents",
      "withdrawal_amount_cents",
      "withdrawalCents",
      "withdrawal_cents",
    ]),
  );
  const creditAmountCents = numberFrom(
    firstValueFromSources(sources, [
      "creditAmountCents",
      "credit_amount_cents",
      "creditCents",
      "credit_cents",
      "depositAmountCents",
      "deposit_amount_cents",
      "depositCents",
      "deposit_cents",
    ]),
  );
  if (debitAmountCents !== null || creditAmountCents !== null) {
    return (Math.abs(creditAmountCents ?? 0) - Math.abs(debitAmountCents ?? 0)) / 100;
  }
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
  if (debitAmount !== null || creditAmount !== null) {
    return Math.abs(creditAmount ?? 0) - Math.abs(debitAmount ?? 0);
  }
  return numberFrom(
    firstValueFromSources(sources, [
      "amount",
      "netAmount",
      "net_amount",
      "value",
    ]),
  );
}

function balanceAmount(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  return numberFrom(
    firstValueFromSources(wrapperSources(payload), [
      "availableBalance",
      "available_balance",
      "currentBalance",
      "current_balance",
      "balance",
    ]),
  );
}

function balanceAccountKey(record: RawSourceRecordRow): string {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const accountSources = sources.flatMap((source) => [
    nestedRecord(source.account),
  ]);
  return (
    normalizeIdentifier(
      firstValueFromSources([...sources, ...accountSources], [
        "accountId",
        "account_id",
        "accountNumber",
        "account_number",
        "id",
      ]),
    ) ??
    normalizeIdentifier(record.externalId) ??
    normalizeIdentifier(record.id) ??
    ""
  );
}

function recordFactTimestamp(record: RawSourceRecordRow): number {
  return (
    dateFrom(record.occurredAt)?.getTime() ??
    dateFrom(record.sourceUpdatedAt)?.getTime() ??
    dateFrom(record.sourceCreatedAt)?.getTime() ??
    0
  );
}

function balanceRecordTimestamp(record: RawSourceRecordRow): number {
  const payload = asRecord(record.payload);
  return (
    dateFrom(
      firstValueFromSources(wrapperSources(payload), [
        "balanceAsOf",
        "balance_as_of",
        "asOf",
        "as_of",
        "effectiveAt",
        "effective_at",
      ]),
    )?.getTime() ??
    dateFrom(record.sourceUpdatedAt)?.getTime() ??
    dateFrom(record.occurredAt)?.getTime() ??
    dateFrom(record.sourceCreatedAt)?.getTime() ??
    0
  );
}

function latestAccountBalanceAmounts(records: RawSourceRecordRow[]): number[] {
  const latestByAccount = new Map<string, { amount: number; timestamp: number }>();
  for (const record of records) {
    const amount = balanceAmount(record);
    if (amount === null) continue;
    const accountKey = balanceAccountKey(record);
    const timestamp = balanceRecordTimestamp(record);
    const current = latestByAccount.get(accountKey);
    if (!current || timestamp >= current.timestamp) {
      latestByAccount.set(accountKey, { amount, timestamp });
    }
  }
  return [...latestByAccount.values()].map((entry) => entry.amount);
}

function mercurySnapshotCashBalance(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const cashFlowSources = sources.flatMap((source) => [
    nestedRecord(source.cashFlow),
    nestedRecord(source.cash_flow),
  ]);
  const directTotal = numberFrom(
    firstValueFromSources([...cashFlowSources, ...metricSources(payload)], [
      "totalBalance",
      "total_balance",
      "totalCash",
      "total_cash",
    ]),
  );
  if (directTotal !== null) return directTotal;

  const bankCash = numberFrom(
    firstValueFromSources([...cashFlowSources, ...sources], [
      "bankCash",
      "bank_cash",
    ]),
  );
  const treasuryCash = numberFrom(
    firstValueFromSources([...cashFlowSources, ...sources], [
      "treasuryCash",
      "treasury_cash",
    ]),
  );

  return bankCash !== null || treasuryCash !== null
    ? (bankCash ?? 0) + (treasuryCash ?? 0)
    : null;
}

function stripeMrrAmount(record: RawSourceRecordRow, asOf: Date): number | null {
  if (!recordIsObjectType(record, "revenue_summary", "subscription")) return null;
  const payload = asRecord(record.payload);
  if (
    isInactiveStripeSubscription(record, asOf) ||
    isFutureTrialStripeSubscription(record, asOf) ||
    isFutureStartStripeSubscription(record, asOf)
  ) {
    return null;
  }
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const explicitMrr = numberFrom(
    firstValueFromSources([...sources, ...subscriptionSources], [
      "monthlyRecurringRevenue",
      "monthly_recurring_revenue",
      "mrr",
      "amountMonthly",
      "amount_monthly",
    ]),
  );
  if (explicitMrr !== null) return Math.max(0, explicitMrr);
  const itemMrr = stripeSubscriptionItemMrr(payload);
  return itemMrr === null ? null : applyStripeSubscriptionDiscounts(itemMrr, payload, asOf);
}

function computeStripeMrr(records: RawSourceRecordRow[], asOf: Date): number {
  const stripeRecords = records.filter((record) => recordIsProvider(record, IntegrationProvider.STRIPE));
  const summaryMrrEntries = stripeRecords
    .filter((record) => recordIsObjectType(record, "revenue_summary"))
    .filter((record) => {
      const occurredAt = dateFrom(record.occurredAt);
      return !occurredAt || occurredAt.getTime() <= asOf.getTime();
    })
    .map((record) => ({
      amount: stripeMrrAmount(record, asOf),
      timestamp: recordFactTimestampAsOf(record, asOf),
    }))
    .filter(
      (entry): entry is { amount: number; timestamp: number } =>
        typeof entry.amount === "number",
    );
  const latestSummaryMrr = summaryMrrEntries.reduce<
    { amount: number; timestamp: number } | null
  >(
    (latest, entry) =>
      !latest || entry.timestamp >= latest.timestamp ? entry : latest,
    null,
  );
  if (latestSummaryMrr) return latestSummaryMrr.amount;
  return stripeRecords.reduce((sum, record) => sum + (stripeMrrAmount(record, asOf) ?? 0), 0);
}

function scalarValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value.length === 1 ? scalarValue(value[0], seen) : null;
    seen.delete(value);
    return normalized;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const candidates = [
    record.value,
    record.number,
    record.count,
    record.name,
    record.label,
    record.id,
    record.type,
    asRecord(data.attributes).value,
    asRecord(data.attributes).type,
    data.type,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
    record.data,
  ];
  for (const candidate of candidates) {
    const normalized = scalarValue(candidate, seen);
    if (
      typeof normalized === "string" ||
      typeof normalized === "number" ||
      typeof normalized === "boolean"
    ) {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function recurringMonthlyDivisor(value: unknown): number {
  const recurring = nestedRecord(value);
  const intervalValue = scalarValue(recurring.interval);
  const interval =
    typeof intervalValue === "string" ? intervalValue.trim().toLowerCase() : "month";
  const normalizedInterval = interval.replace(/[^a-z]/g, "");
  const intervalCount = Math.max(
    1,
    numberFrom(scalarValue(recurring.interval_count ?? recurring.intervalCount)) ?? 1,
  );
  if (["year", "years", "yearly", "annual", "annually"].includes(normalizedInterval)) {
    return 12 * intervalCount;
  }
  if (["quarter", "quarters", "quarterly"].includes(normalizedInterval)) return 3 * intervalCount;
  if (["month", "months", "monthly"].includes(normalizedInterval)) return intervalCount;
  if (["week", "weeks", "weekly"].includes(normalizedInterval)) return intervalCount / (52 / 12);
  if (["day", "days", "daily"].includes(normalizedInterval)) return intervalCount / (365 / 12);
  return intervalCount;
}

function invoiceLinePeriodMonthlyDivisor(item: Record<string, unknown>): number | null {
  if (item[STRIPE_INVOICE_LINE_ITEM_KEY] !== true) return null;
  const periodSources = wrapperSources(item).map((source) => nestedRecord(source.period));
  const start = firstDateFrom(
    ...periodSources.flatMap((period) => [
      period.start,
      period.startedAt,
      period.started_at,
      period.periodStart,
      period.period_start,
    ]),
  );
  const end = firstDateFrom(
    ...periodSources.flatMap((period) => [
      period.end,
      period.endedAt,
      period.ended_at,
      period.periodEnd,
      period.period_end,
    ]),
  );
  const days = daysBetween(start, end);
  if (days === null || days <= 45) return null;
  return Math.max(1, Math.round(days / (365 / 12)));
}

function stripeSubscriptionItemRecurring(item: Record<string, unknown>): unknown {
  const sources = wrapperSources(item);
  const priceSources = sources.flatMap((source) => wrapperSources(nestedRecord(source.price)));
  const pricingSources = sources.flatMap((source) => wrapperSources(nestedRecord(source.pricing)));
  const planSources = sources.flatMap((source) => wrapperSources(nestedRecord(source.plan)));
  return (
    firstValueFromSources([...priceSources, ...pricingSources], ["recurring"]) ??
    planSources.find((source) => Object.keys(source).length > 0) ??
    {}
  );
}

function isOneTimeStripeInvoiceLine(item: Record<string, unknown>): boolean {
  if (item[STRIPE_INVOICE_LINE_ITEM_KEY] !== true) return false;
  const sources = wrapperSources(item);
  const parentSources = sources.map((source) => nestedRecord(source.parent));
  const parentInvoiceItemSources = parentSources.flatMap((source) => [
    nestedRecord(source.invoice_item_details),
    nestedRecord(source.invoiceItemDetails),
  ]);
  const parentSubscriptionItemSources = parentSources.flatMap((source) => [
    nestedRecord(source.subscription_item_details),
    nestedRecord(source.subscriptionItemDetails),
  ]);
  const lineSources = [
    ...sources,
    ...parentSources,
    ...parentInvoiceItemSources,
    ...parentSubscriptionItemSources,
  ];
  if (booleanFrom(firstValueFromSources(lineSources, ["proration", "isProration", "is_proration"])) === true) {
    return true;
  }
  if (
    normalizeStageKey(firstValueFromSources(parentSources, ["type"])) ===
    "invoiceitemdetails"
  ) {
    return true;
  }
  const priceSources = sources.flatMap((source) => wrapperSources(nestedRecord(source.price)));
  const pricingSources = sources.flatMap((source) => wrapperSources(nestedRecord(source.pricing)));
  return [...sources, ...priceSources, ...pricingSources].some((source) => {
    const type = scalarValue(source.type);
    if (typeof type !== "string") return false;
    const normalized = type.trim().toLowerCase().replace(/[\s_-]+/g, "");
    return normalized === "onetime" || normalized === "invoiceitem";
  });
}

function isDeletedStripeItem(item: Record<string, unknown>): boolean {
  return booleanFrom(firstValueFromSources(wrapperSources(item), ["deleted"])) === true;
}

function isContributingStripeItem(item: Record<string, unknown>): boolean {
  return !isOneTimeStripeInvoiceLine(item) && !isDeletedStripeItem(item);
}

function itemUnitAmount(item: Record<string, unknown>): number | null {
  if (!isContributingStripeItem(item)) return null;
  const sources = wrapperSources(item);
  const priceSources = sources.flatMap((source) => wrapperSources(nestedRecord(source.price)));
  const planSources = sources.flatMap((source) => wrapperSources(nestedRecord(source.plan)));
  const pricingSources = sources.flatMap((source) => wrapperSources(nestedRecord(source.pricing)));
  const divisor =
    invoiceLinePeriodMonthlyDivisor(item) ??
    recurringMonthlyDivisor(stripeSubscriptionItemRecurring(item));
  const amountCents = numberFrom(firstValueFromSources(sources, ["amount"]));
  if (item[STRIPE_INVOICE_LINE_ITEM_KEY] === true && amountCents !== null) {
    return amountCents / 100 / divisor;
  }
  const explicitUnitCents = numberFrom(
    firstValueFromSources([...sources, ...priceSources, ...planSources, ...pricingSources], [
      "unit_amount",
      "unitAmount",
      "unit_amount_decimal",
      "unitAmountDecimal",
    ]),
  );
  const quantity = Math.max(0, numberFrom(firstValueFromSources(sources, ["quantity"])) ?? 1);
  if (explicitUnitCents !== null) {
    return (explicitUnitCents / 100) * quantity / divisor;
  }
  if (amountCents === null) return null;
  return (amountCents / 100) * quantity / divisor;
}

function stripeReferenceId(value: unknown): string | null {
  const direct = normalizeIdentifier(value);
  if (direct) return direct;
  const record = nestedRecord(value);
  return normalizeIdentifier(firstValueFromSources(wrapperSources(record), ["id"]));
}

function stripeSubscriptionItemId(item: Record<string, unknown>): string | null {
  return stripeReferenceId(
    firstValueFromSources(wrapperSources(item), [
      "id",
      "subscriptionItemId",
      "subscription_item_id",
    ]),
  );
}

function stripeInvoiceLineSubscriptionItemId(item: Record<string, unknown>): string | null {
  const sources = wrapperSources(item);
  const parentSubscriptionItemSources = sources
    .map((source) => nestedRecord(source.parent))
    .flatMap((parent) => [
      nestedRecord(parent.subscription_item_details),
      nestedRecord(parent.subscriptionItemDetails),
    ]);
  return stripeReferenceId(
    firstValueFromSources([...sources, ...parentSubscriptionItemSources], [
      "subscription_item",
      "subscriptionItem",
      "subscription_item_id",
      "subscriptionItemId",
    ]),
  );
}

function arrayValuesFromContainer(value: unknown, seen = new WeakSet<object>()): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = nestedRecord(value);
  const data = record.data;
  const dataRecord = nestedRecord(data);
  const dataAttributes = nestedRecord(dataRecord.attributes);
  const candidates = [
    data,
    dataAttributes.value,
    dataRecord.value,
    record.value,
    record.values,
    record.fields,
    record.attributes,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const normalized = arrayValuesFromContainer(candidate, seen);
    if (normalized !== null) {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function stripeSubscriptionItems(payload: Record<string, unknown>): Record<string, unknown>[] {
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const subscriptionItemSources = [...sources, ...subscriptionSources];
  const invoiceSources = subscriptionItemSources.flatMap((source) => [
    nestedRecord(source.latest_invoice),
    nestedRecord(source.latestInvoice),
    nestedRecord(source.invoice),
  ]);
  const itemContainers = subscriptionItemSources.flatMap((source) => [
    source.items,
    source.subscriptionItems,
    source.subscription_items,
  ]);
  const invoiceLineContainers = invoiceSources.flatMap((source) => [
    source.lines,
    source.invoiceLines,
    source.invoice_lines,
  ]);
  const itemsFromContainers = (
    containers: unknown[],
    invoiceLineItem: boolean,
  ): Record<string, unknown>[] =>
    containers.flatMap((container) => {
      return arrayValuesFromContainer(container) ?? [];
    }).map((item) => {
      const record = nestedRecord(item);
      return invoiceLineItem
        ? { ...record, [STRIPE_INVOICE_LINE_ITEM_KEY]: true }
        : record;
    });
  const subscriptionItems = itemsFromContainers(itemContainers, false);
  const invoiceLineItems = itemsFromContainers(invoiceLineContainers, true);
  const usableSubscriptionItems = subscriptionItems.filter((item) => itemUnitAmount(item) !== null);
  if (usableSubscriptionItems.length === 0) {
    return invoiceLineItems.length > 0 ? invoiceLineItems : subscriptionItems;
  }
  const usableSubscriptionItemIds = new Set(
    usableSubscriptionItems
      .map(stripeSubscriptionItemId)
      .filter((id): id is string => Boolean(id)),
  );
  const partialSubscriptionItemIds = new Set(
    subscriptionItems
      .filter((item) => itemUnitAmount(item) === null)
      .map(stripeSubscriptionItemId)
      .filter((id): id is string => Boolean(id)),
  );
  const supplementalInvoiceLines = invoiceLineItems.filter((item) => {
    const subscriptionItemId = stripeInvoiceLineSubscriptionItemId(item);
    return Boolean(
      subscriptionItemId &&
        partialSubscriptionItemIds.has(subscriptionItemId) &&
        !usableSubscriptionItemIds.has(subscriptionItemId),
    );
  });
  return [...usableSubscriptionItems, ...supplementalInvoiceLines];
}

function stripeSubscriptionItemMrr(payload: Record<string, unknown>): number | null {
  const items = stripeSubscriptionItems(payload);
  const amounts = items
    .map((item) => itemUnitAmount(item))
    .filter((amount): amount is number => amount !== null);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

function stripeSubscriptionDiscountMonthlyDivisor(payload: Record<string, unknown>): number {
  const divisors = stripeSubscriptionItems(payload)
    .filter(isContributingStripeItem)
    .map((item) => recurringMonthlyDivisor(stripeSubscriptionItemRecurring(item)))
    .filter((divisor) => Number.isFinite(divisor) && divisor > 0);
  return divisors.length === 0 ? 1 : Math.max(...divisors);
}

function stripeSubscriptionDiscounts(payload: Record<string, unknown>): Record<string, unknown>[] {
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const discountSources = [...sources, ...subscriptionSources];
  const discounts: Record<string, unknown>[] = [];
  const addDiscount = (value: unknown) => {
    const discount = nestedRecord(value);
    if (Object.keys(discount).length > 0) discounts.push(discount);
  };
  for (const source of discountSources) {
    addDiscount(source.discount);
  }
  const discountContainers = discountSources.flatMap((source) => [
    source.discounts,
    source.subscriptionDiscounts,
    source.subscription_discounts,
  ]);
  for (const container of discountContainers) {
    for (const entry of arrayValuesFromContainer(container) ?? []) addDiscount(entry);
  }
  return discounts;
}

function percentFrom(value: unknown): number | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.endsWith("%")) {
      const parsed = numberFrom(normalized.slice(0, -1).trim());
      return parsed === null ? null : parsed;
    }
    const textPercent = normalized.match(/^(.+?)\s*(?:percent|pct)$/i);
    if (textPercent) {
      const parsed = numberFrom(textPercent[1].trim());
      return parsed === null ? null : parsed;
    }
  }
  return numberFrom(value);
}

function stripePayloadCurrency(payload: Record<string, unknown>): string | null {
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const itemPriceSources = stripeSubscriptionItems(payload).flatMap((item) => {
    const itemSources = wrapperSources(item);
    return itemSources.flatMap((source) => [
      source,
      ...wrapperSources(nestedRecord(source.price)),
      ...wrapperSources(nestedRecord(source.pricing)),
      ...wrapperSources(nestedRecord(source.plan)),
    ]);
  });
  const currency = firstValueFromSources([...sources, ...subscriptionSources], [
    "currency",
    "currencyCode",
    "currency_code",
  ]) ?? firstValueFromSources(itemPriceSources, ["currency", "currencyCode", "currency_code"]);
  const normalizedCurrency = scalarValue(currency);
  return typeof normalizedCurrency === "string" && normalizedCurrency.trim()
    ? normalizedCurrency.trim().toLowerCase()
    : null;
}

function stripeCouponSources(discountSources: Record<string, unknown>[]): Record<string, unknown>[] {
  return discountSources.flatMap((source) => wrapperSources(nestedRecord(source.coupon)));
}

function recordFromContainer(value: unknown, seen = new WeakSet<object>()): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  if (seen.has(value)) return {};
  seen.add(value);

  const record = nestedRecord(value);
  const data = record.data;
  const dataRecord = nestedRecord(data);
  const dataAttributes = nestedRecord(dataRecord.attributes);
  const candidates = [
    dataAttributes.value,
    dataRecord.value,
    data,
    record.value,
    record.values,
    record.fields,
    record.attributes,
  ];
  for (const candidate of candidates) {
    const normalized = recordFromContainer(candidate, seen);
    if (Object.keys(normalized).length > 0) {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return record;
}

function isInactiveStripeDiscount(discount: Record<string, unknown>, asOf: Date): boolean {
  const sources = wrapperSources(discount);
  const couponSources = stripeCouponSources(sources);
  const duration = firstValueFromSources([...sources, ...couponSources], ["duration"]);
  const durationValue = scalarValue(duration);
  const normalizedDuration =
    typeof durationValue === "string"
      ? durationValue.trim().toLowerCase().replace(/[\s_-]+/g, "")
      : "";
  if (normalizedDuration === "once" || normalizedDuration === "onetime") return true;
  const startsAt = firstDateFrom(
    ...sources.flatMap((source) => [
      source.start,
      source.startsAt,
      source.starts_at,
      source.startedAt,
      source.started_at,
    ]),
  );
  if (startsAt && startsAt.getTime() > asOf.getTime()) return true;
  const durationMonths = numberFrom(
    firstValueFromSources([...sources, ...couponSources], [
      "duration_in_months",
      "durationInMonths",
    ]),
  );
  if (
    normalizedDuration === "repeating" &&
    startsAt &&
    durationMonths !== null &&
    durationMonths > 0
  ) {
    const derivedEnd = new Date(startsAt.getTime());
    derivedEnd.setUTCMonth(derivedEnd.getUTCMonth() + Math.floor(durationMonths));
    if (derivedEnd.getTime() <= asOf.getTime()) return true;
  }
  const endedAt = firstDateFrom(
    ...sources.flatMap((source) => [
      source.end,
      source.endsAt,
      source.ends_at,
      source.endedAt,
      source.ended_at,
    ]),
  );
  return Boolean(endedAt && endedAt.getTime() <= asOf.getTime());
}

function stripeDiscountAmountOff(
  discountSources: Record<string, unknown>[],
  couponSources: Record<string, unknown>[],
  currency: string | null,
): number | null {
  const directAmountOff = numberFrom(
    firstValueFromSources([...couponSources, ...discountSources], [
      "amount_off",
      "amountOff",
    ]),
  );
  if (directAmountOff !== null) return directAmountOff;
  if (!currency) return null;

  for (const source of [...couponSources, ...discountSources]) {
    const currencyOptionRecords =
      [
        recordFromContainer(source.currency_options),
        recordFromContainer(source.currencyOptions),
      ].find((optionRecords) => Object.keys(optionRecords).length > 0) ?? {};
    const option = nestedRecord(
      currencyOptionRecords[currency] ??
        Object.entries(currencyOptionRecords).find(([key]) => key.toLowerCase() === currency)?.[1],
    );
    const amountOff = numberFrom(
      firstValueFromSources(wrapperSources(option), ["amount_off", "amountOff"]),
    );
    if (amountOff !== null) return amountOff;
  }

  return null;
}

function applyStripeSubscriptionDiscounts(
  monthlyAmount: number,
  payload: Record<string, unknown>,
  asOf: Date,
): number {
  let discountedAmount = monthlyAmount;
  const discountMonthlyDivisor = stripeSubscriptionDiscountMonthlyDivisor(payload);
  const currency = stripePayloadCurrency(payload);
  for (const discount of stripeSubscriptionDiscounts(payload)) {
    if (isInactiveStripeDiscount(discount, asOf)) continue;
    const discountSources = wrapperSources(discount);
    const couponSources = stripeCouponSources(discountSources);
    const percentOff = percentFrom(
      firstValueFromSources([...couponSources, ...discountSources], [
        "percent_off",
        "percentOff",
      ]),
    );
    if (percentOff !== null) {
      const discountRatio = Math.min(Math.max(percentOff, 0), 100) / 100;
      discountedAmount *= 1 - discountRatio;
    }
    const amountOff = stripeDiscountAmountOff(discountSources, couponSources, currency);
    if (amountOff !== null) {
      discountedAmount -= amountOff / 100 / discountMonthlyDivisor;
    }
  }
  return Math.max(0, discountedAmount);
}

function stripeSubscriptionInactiveAt(record: RawSourceRecordRow): Date | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const stripeSources = [...sources, ...subscriptionSources];
  return firstDateFrom(
    ...stripeSources.flatMap((source) => [
      source.canceled_at,
      source.canceledAt,
      source.cancel_at,
      source.cancelAt,
      source.cancelled_at,
      source.cancelledAt,
      source.ended_at,
      source.endedAt,
      source.ended,
      source.statusChangedAt,
      source.status_changed_at,
    ]),
  );
}

function isInactiveStripeSubscription(record: RawSourceRecordRow, asOf?: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const status = firstValueFromSources([...sources, ...subscriptionSources], ["status"]);
  const inactiveAt = asOf ? stripeSubscriptionInactiveAt(record) : null;
  if (!INACTIVE_STRIPE_SUBSCRIPTION_STATUSES.has(normalizeStageKey(status))) {
    return Boolean(inactiveAt && asOf && inactiveAt.getTime() <= asOf.getTime());
  }
  if (!asOf) return true;
  return !(inactiveAt && inactiveAt.getTime() > asOf.getTime());
}

function isFutureTrialStripeSubscription(record: RawSourceRecordRow, asOf: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const stripeSources = [...sources, ...subscriptionSources];
  const status = firstValueFromSources(stripeSources, ["status"]);
  if (normalizeStageKey(status) !== "trialing") return false;
  const trialEnd = firstDateFrom(
    ...stripeSources.flatMap((source) => [
      source.trial_end,
      source.trialEnd,
      source.trial_ends_at,
      source.trialEndsAt,
      source.trial_ended_at,
      source.trialEndedAt,
    ]),
  );
  return !trialEnd || trialEnd.getTime() > asOf.getTime();
}

function isFutureStartStripeSubscription(record: RawSourceRecordRow, asOf: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const stripeSources = [...sources, ...subscriptionSources];
  const periodSources = stripeSources.flatMap((source) => [
    nestedRecord(source.current_period),
    nestedRecord(source.currentPeriod),
  ]);
  const startsAt = firstDateFrom(
    ...stripeSources.flatMap((source) => [
      source.start,
      source.startsAt,
      source.starts_at,
      source.startedAt,
      source.started_at,
      source.startDate,
      source.start_date,
      source.current_period_start,
      source.currentPeriodStart,
    ]),
    ...periodSources.flatMap((source) => [
      source.start,
      source.startsAt,
      source.starts_at,
    ]),
  );
  return Boolean(startsAt && startsAt.getTime() > asOf.getTime());
}

function stripeCustomerId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  const customerSources = [...sources, ...subscriptionSources].map((source) => nestedRecord(source.customer));
  return normalizeLookup(
    firstValueFromSources([...sources, ...customerSources], [
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
    firstValueFromSources([...sources, ...customerSources], [
      "customerEmail",
      "customer_email",
      "email",
    ]),
  );
}

function stripeCustomerEmailDomain(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const explicitDomain = normalizeLookup(
    firstValueFromSources(wrapperSources(payload), [
      "emailDomain",
      "email_domain",
      "customerDomain",
      "customer_domain",
    ]),
  );
  if (explicitDomain && !GENERIC_EMAIL_DOMAINS.has(explicitDomain)) return explicitDomain;
  return normalizeEmailDomain(stripeCustomerEmail(record));
}

function stripeSubscriptionId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecord(source.subscription));
  return normalizeLookup(
    firstValueFromSources([...sources, ...subscriptionSources], [
      "subscriptionId",
      "subscription_id",
      "stripeSubscriptionId",
      "stripe_subscription_id",
      "id",
    ]),
  ) ?? normalizeLookup(String(record.externalId).split(":").pop());
}

function hubspotDealEmail(record: RawSourceRecordRow): string | null {
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

function hubspotDealEmailDomain(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const explicitDomain = normalizeLookup(
    firstValueFromSources(wrapperSources(payload), [
      "emailDomain",
      "email_domain",
      "companyDomain",
      "company_domain",
      "domain",
    ]),
  );
  if (explicitDomain && !GENERIC_EMAIL_DOMAINS.has(explicitDomain)) return explicitDomain;
  return normalizeEmailDomain(hubspotDealEmail(record));
}

function hubspotStripeCustomerId(record: RawSourceRecordRow): string | null {
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

function hubspotStripeSubscriptionId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  return normalizeLookup(
    firstValueFromSources(wrapperSources(payload), [
      "stripeSubscriptionId",
      "stripe_subscription_id",
      "subscriptionId",
      "subscription_id",
    ]),
  );
}

function isLinkedHubspotDeal(
  record: RawSourceRecordRow,
  stripeRefs: {
    customerIds: Set<string>;
    subscriptionIds: Set<string>;
    emails: Set<string>;
    domains: Set<string>;
  },
): boolean {
  const customerId = hubspotStripeCustomerId(record);
  const subscriptionId = hubspotStripeSubscriptionId(record);
  const email = hubspotDealEmail(record);
  const emailDomain = hubspotDealEmailDomain(record);
  return (
    Boolean(customerId && stripeRefs.customerIds.has(customerId)) ||
    Boolean(subscriptionId && stripeRefs.subscriptionIds.has(subscriptionId)) ||
    Boolean(email && stripeRefs.emails.has(email)) ||
    Boolean(emailDomain && stripeRefs.domains.has(emailDomain))
  );
}

function hubspotRecurringRevenueAsOf(
  record: RawSourceRecordRow,
  asOf?: Date,
): {
  mrr: number;
  arr: number;
} | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const stage = normalizeStageKey(
    firstValueFromSources(sources, [
      "dealstage",
      "stage",
      "stageLabel",
      "stage_label",
      "stageId",
      "stage_id",
    ]),
  );
  if (stage && !["closedwon", "won"].includes(stage)) {
    return null;
  }
  const closedAt = firstDateFrom(
    ...sources.flatMap((source) => [
      source.closedAt,
      source.closed_at,
      source.closeDate,
      source.close_date,
      source.closedate,
      source.wonAt,
      source.won_at,
      source.hs_closedate,
    ]),
  );
  if (asOf && closedAt && closedAt.getTime() > asOf.getTime()) return null;
  const lifecycleSources = sources.flatMap((source) => [
    source,
    nestedRecord(source.subscription),
    nestedRecord(source.billing),
    nestedRecord(source.service),
    nestedRecord(source.contract),
  ]);
  const subscriptionStartsAt = firstDateFrom(
    ...lifecycleSources.flatMap((source) => [
      source.subscriptionStartDate,
      source.subscription_start_date,
      source.subscriptionStartsAt,
      source.subscription_starts_at,
      source.billingStartDate,
      source.billing_start_date,
      source.billingStartsAt,
      source.billing_starts_at,
      source.serviceStartDate,
      source.service_start_date,
      source.contractStartDate,
      source.contract_start_date,
      source.startDate,
      source.start_date,
      source.startsAt,
      source.starts_at,
    ]),
  );
  if (asOf && subscriptionStartsAt && subscriptionStartsAt.getTime() > asOf.getTime()) return null;
  const subscriptionEndsAt = firstDateFrom(
    ...lifecycleSources.flatMap((source) => [
      source.subscriptionEndDate,
      source.subscription_end_date,
      source.subscriptionEndsAt,
      source.subscription_ends_at,
      source.billingEndDate,
      source.billing_end_date,
      source.billingEndsAt,
      source.billing_ends_at,
      source.serviceEndDate,
      source.service_end_date,
      source.contractEndDate,
      source.contract_end_date,
      source.canceledAt,
      source.canceled_at,
      source.cancelledAt,
      source.cancelled_at,
      source.churnedAt,
      source.churned_at,
      source.endDate,
      source.end_date,
      source.endsAt,
      source.ends_at,
    ]),
  );
  if (asOf && subscriptionEndsAt && subscriptionEndsAt.getTime() <= asOf.getTime()) return null;
  const recurringFlag = firstValueFromSources(sources, [
    "recurringRevenue",
    "recurring_revenue",
  ]);
  const recurringFlagValue = booleanFrom(recurringFlag);
  if (recurringFlagValue === false) return null;
  const hasRecurringEvidence = recurringFlagValue === true || recordIsObjectType(record, "subscription_deal");
  const explicitMrr = numberFrom(
    firstValueFromSources(sources, [
      "monthlyRecurringRevenue",
      "monthly_recurring_revenue",
      "mrr",
      "amountMonthly",
      "amount_monthly",
    ]),
  );
  if (explicitMrr !== null) {
    const mrr = Math.max(0, explicitMrr);
    return { mrr, arr: mrr * 12 };
  }
  const explicitAnnualValue = numberFrom(
    firstValueFromSources(sources, [
      "recurringRevenueAmount",
      "recurring_revenue_amount",
      "annualRecurringRevenue",
      "annual_recurring_revenue",
      "arr",
    ]),
  );
  if (explicitAnnualValue !== null) {
    const arr = Math.max(0, explicitAnnualValue);
    return { mrr: arr / 12, arr };
  }
  if (!hasRecurringEvidence) return null;
  const annualValue = numberFrom(firstValueFromSources(sources, ["amount"]));
  if (annualValue === null) return null;
  const arr = Math.max(0, annualValue);
  return { mrr: arr / 12, arr };
}

function buildStripeRefs(
  records: RawSourceRecordRow[],
  asOf: Date,
  includeActiveCustomerRefs: boolean,
) {
  const stripeRecords = records.filter(
    (record) =>
      recordIsProvider(record, IntegrationProvider.STRIPE) &&
      ((includeActiveCustomerRefs && recordIsObjectType(record, "active_customer_ref")) ||
        (recordIsObjectType(record, "subscription") &&
          !isInactiveStripeSubscription(record, asOf) &&
          !isFutureTrialStripeSubscription(record, asOf) &&
          !isFutureStartStripeSubscription(record, asOf))),
  );
  return {
    customerIds: new Set(
      stripeRecords.map(stripeCustomerId).filter((value): value is string => Boolean(value)),
    ),
    subscriptionIds: new Set(
      stripeRecords.map(stripeSubscriptionId).filter((value): value is string => Boolean(value)),
    ),
    emails: new Set(
      stripeRecords.map(stripeCustomerEmail).filter((value): value is string => Boolean(value)),
    ),
    domains: new Set(
      stripeRecords.map(stripeCustomerEmailDomain).filter((value): value is string => Boolean(value)),
    ),
  };
}

function computeMrrBreakdown(records: RawSourceRecordRow[], asOf: Date) {
  const stripeMrr = computeStripeMrr(records, asOf);
  const stripeArr = stripeMrr * 12;
  const stripeRefs = buildStripeRefs(records, asOf, stripeMrr > 0);
  let hubspotSubscriptionMrr = 0;
  let hubspotSubscriptionArr = 0;
  let hubspotOnlySubscriptionMrr = 0;
  let hubspotOnlySubscriptionArr = 0;
  let excludedLinkedHubspotSubscriptionMrr = 0;
  let excludedLinkedHubspotSubscriptionArr = 0;

  for (const record of records) {
    if (
      !recordIsProvider(record, IntegrationProvider.HUBSPOT) ||
      !recordIsObjectType(record, "deal", "subscription_deal")
    ) {
      continue;
    }
    const recurringRevenue = hubspotRecurringRevenueAsOf(record, asOf);
    if (!recurringRevenue) continue;

    hubspotSubscriptionMrr += recurringRevenue.mrr;
    hubspotSubscriptionArr += recurringRevenue.arr;
    if (isLinkedHubspotDeal(record, stripeRefs)) {
      excludedLinkedHubspotSubscriptionMrr += recurringRevenue.mrr;
      excludedLinkedHubspotSubscriptionArr += recurringRevenue.arr;
    } else {
      hubspotOnlySubscriptionMrr += recurringRevenue.mrr;
      hubspotOnlySubscriptionArr += recurringRevenue.arr;
    }
  }

  const totalMrr = stripeMrr + hubspotOnlySubscriptionMrr;
  const totalArr = stripeArr + hubspotOnlySubscriptionArr;

  return {
    amount: roundMoney(totalMrr),
    arr: roundMoney(totalArr),
    stripeMrr: roundMoney(stripeMrr),
    stripeArr: roundMoney(stripeArr),
    hubspotSubscriptionMrr: roundMoney(hubspotSubscriptionMrr),
    hubspotSubscriptionArr: roundMoney(hubspotSubscriptionArr),
    hubspotOnlySubscriptionMrr: roundMoney(hubspotOnlySubscriptionMrr),
    hubspotOnlySubscriptionArr: roundMoney(hubspotOnlySubscriptionArr),
    hubspotRecurringRevenue: roundMoney(hubspotOnlySubscriptionMrr),
    excludedLinkedHubspotSubscriptionMrr: roundMoney(excludedLinkedHubspotSubscriptionMrr),
    excludedLinkedHubspotSubscriptionArr: roundMoney(excludedLinkedHubspotSubscriptionArr),
  };
}

function computeFinanceValues(records: RawSourceRecordRow[], asOf: Date) {
  const mercuryTransactions = records.filter(
    (record) =>
      recordIsProvider(record, IntegrationProvider.MERCURY) &&
      recordIsObjectType(record, "transaction", "bank_transaction"),
  );
  const cashOutflow = mercuryTransactions.reduce((sum, record) => {
    const amount = transactionAmount(record);
    return amount && amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
  const mercuryCashInflow = mercuryTransactions.reduce((sum, record) => {
    const amount = transactionAmount(record);
    return amount && amount > 0 ? sum + amount : sum;
  }, 0);
  const stripeMrr = computeStripeMrr(records, asOf);
  const mrr = computeMrrBreakdown(records, asOf);
  const cashInflow = mercuryCashInflow + stripeMrr;
  const netBurn = cashOutflow - cashInflow;
  const mercuryBalanceAmounts = records
    .filter(
      (record) =>
        recordIsProvider(record, IntegrationProvider.MERCURY) &&
        recordIsObjectType(record, "account_balance", "balance"),
    );
  const snapshotCashBalances = records
    .filter(
      (record) =>
        recordIsProvider(record, IntegrationProvider.MERCURY) &&
        recordIsObjectType(record, "account_profile_summary", "current_balance_summary", "snapshot"),
    )
    .map((record) => ({
      amount: mercurySnapshotCashBalance(record),
      timestamp: recordFactTimestamp(record),
    }))
    .filter(
      (entry): entry is { amount: number; timestamp: number } =>
        typeof entry.amount === "number",
    );
  const latestSnapshotCashBalance = snapshotCashBalances.reduce<
    { amount: number; timestamp: number } | null
  >(
    (latest, entry) =>
      !latest || entry.timestamp >= latest.timestamp ? entry : latest,
    null,
  );
  const latestAccountBalances = latestAccountBalanceAmounts(mercuryBalanceAmounts);
  const cashBalance =
    latestAccountBalances.length > 0
      ? latestAccountBalances.reduce((sum, amount) => sum + amount, 0)
      : latestSnapshotCashBalance?.amount ?? 0;
  const currency = currencyFrom(records);

  return {
    netBurn: {
      amount: roundMoney(netBurn),
      currency,
      cashOutflow: roundMoney(cashOutflow),
      cashInflow: roundMoney(cashInflow),
    },
    runway: {
      months: netBurn > 0 ? roundRatio(cashBalance / netBurn) : null,
      cashBalance: roundMoney(cashBalance),
      netBurn: roundMoney(netBurn),
      currency,
    },
    mrr: {
      ...mrr,
      currency,
    },
  };
}

async function upsertCanonicalMetric(input: {
  canonicalMetrics: CanonicalMetricDelegate;
  context: ImladrisActorContext;
  metricKey: string;
  department: string;
  unit: string;
  value: Record<string, unknown>;
  periodStart: Date;
  periodEnd: Date;
  status: keyof typeof ImladrisMetricStatus;
  confidence: number;
  warnings: string[];
  calculationVersion: string;
  now?: Date;
}) {
  const context = normalizeContext(input.context);
  return input.canonicalMetrics.upsert({
    where: {
      organizationId_userId_metricKey_periodEnd_calculationVersion: {
        organizationId: context.organizationId,
        userId: context.userId,
        metricKey: input.metricKey,
        periodEnd: input.periodEnd,
        calculationVersion: input.calculationVersion,
      },
    },
    create: {
      metricKey: input.metricKey,
      department: input.department,
      unit: input.unit,
      value: input.value,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: input.status,
      confidence: input.confidence,
      warnings: input.warnings,
      calculationVersion: input.calculationVersion,
      computedAt: input.now ?? new Date(),
      userId: context.userId,
      organizationId: context.organizationId,
    },
    update: {
      value: input.value,
      periodStart: input.periodStart,
      status: input.status,
      confidence: input.confidence,
      warnings: input.warnings,
      computedAt: input.now ?? new Date(),
    },
  });
}

export async function materializeImladrisFinanceMetrics(
  input: MaterializeDevelopmentMetricsInput,
): Promise<MaterializedImladrisMetricResult[]> {
  const rawRecords = input.prisma.imladrisRawSourceRecord as RawSourceRecordDelegate;
  const canonicalMetrics = input.prisma
    .imladrisCanonicalMetricValue as CanonicalMetricDelegate;
  const metricLineage = input.prisma.imladrisMetricLineage as MetricLineageDelegate;
  const context = normalizeContext(input.context);
  const now = input.now ?? new Date();
  const financeAsOf = inclusivePeriodEnd(input.periodEnd);

  const requiredProviders = [
    IntegrationProvider.MERCURY,
    IntegrationProvider.STRIPE,
    IntegrationProvider.HUBSPOT,
  ];
  const queriedRecords = await rawRecords.findMany({
    where: financeWindowWhere({
      providers: requiredProviders,
      context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const records = dedupeRawSourceRecords(
    queriedRecords,
    context,
    input.periodStart,
    input.periodEnd,
    financeAsOf,
    durableFinanceRecordAppliesToPeriod,
  );
  const values = computeFinanceValues(records, financeAsOf);
  const confidence = confidenceFor(records);
  const status = statusForProviderCoverage({ records, requiredProviders });
  const warnings = providerCoverageWarning({
    metricLabel: "Finance metrics",
    missingVerb: "are",
    records,
    requiredProviders,
    emptyWarning: "No Mercury, Stripe, or HubSpot raw records were available for finance materialization.",
  });
  const metricInputs = [
    {
      metricKey: "finance.net_burn",
      department: "finance",
      unit: "currency",
      value: values.netBurn,
      calculationVersion: FINANCE_NET_BURN_CALCULATION_VERSION,
    },
    {
      metricKey: "finance.cash_runway_months",
      department: "finance",
      unit: "months",
      value: values.runway,
      calculationVersion: FINANCE_CASH_RUNWAY_CALCULATION_VERSION,
    },
    {
      metricKey: "revenue.mrr",
      department: "finance",
      unit: "currency",
      value: values.mrr,
      calculationVersion: REVENUE_MRR_CALCULATION_VERSION,
    },
  ];
  const results: MaterializedImladrisMetricResult[] = [];

  for (const metricInput of metricInputs) {
    const metricValue = await upsertCanonicalMetric({
      canonicalMetrics,
      context: input.context,
      metricKey: metricInput.metricKey,
      department: metricInput.department,
      unit: metricInput.unit,
      value: metricInput.value,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status,
      confidence,
      warnings,
      calculationVersion: metricInput.calculationVersion,
      now,
    });
    await replaceLineage({
      metricLineage,
      metricValueId: metricValue.id,
      records,
      calculationVersion: metricInput.calculationVersion,
      asOf: now,
    });
    results.push({
      metricKey: metricInput.metricKey,
      metricValueId: metricValue.id,
      status,
      rawRecordCount: records.length,
      value: metricInput.value,
    });
  }

  return results;
}

function isQualifiedPipelineDeal(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.HUBSPOT) || !recordIsObjectType(record, "deal")) {
    return false;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const stage = normalizeStageKey(
    firstValueFromSources(sources, [
      "dealstage",
      "stage",
      "stageLabel",
      "stage_label",
      "stageId",
      "stage_id",
    ]),
  );
  if (TERMINAL_DEAL_STAGE_KEYS.has(stage) || stage === "appointmentscheduled") {
    return false;
  }
  return [
    "qualified",
    "sql",
    "salesqualifiedlead",
    "salesqualified",
    "proposal",
    "contractsent",
    "negotiation",
    "decisionmakerboughtin",
  ].includes(stage);
}

function dealAmount(record: RawSourceRecordRow): number {
  const payload = asRecord(record.payload);
  return (
    nonNegativeNumberFrom(
      firstValueFromSources(wrapperSources(payload), [
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
    ) ?? 0
  );
}

function dealIdFromRecord(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const id = firstValueFromSources(wrapperSources(payload), [
    "dealId",
    "deal_id",
    "hubspotDealId",
    "hubspot_deal_id",
    "hs_object_id",
    "id",
  ]);
  return normalizeIdentifier(id) ?? normalizeIdentifier(record.externalId);
}

function linkedDealId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const id = firstValueFromSources(wrapperSources(payload), [
    "dealId",
    "deal_id",
    "hubspotDealId",
    "hubspot_deal_id",
    "hs_object_id",
  ]);
  return normalizeIdentifier(id);
}

function computeQualifiedPipeline(records: RawSourceRecordRow[]) {
  const qualifiedDeals = records.filter(isQualifiedPipelineDeal);
  const qualifiedDealIds = new Set(
    qualifiedDeals.map(dealIdFromRecord).filter((id): id is string => Boolean(id)),
  );
  const collaborationTouches = records.filter((record) => {
    if (
      !recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE) &&
      !recordIsProvider(record, IntegrationProvider.SLACK)
    ) {
      return false;
    }
    const dealId = linkedDealId(record);
    return Boolean(dealId && qualifiedDealIds.has(dealId));
  });
  const coveredDealIds = new Set(
    collaborationTouches
      .map(linkedDealId)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    amount: roundMoney(qualifiedDeals.reduce((sum, record) => sum + dealAmount(record), 0)),
    currency: currencyFrom(qualifiedDeals.length > 0 ? qualifiedDeals : records),
    qualifiedDealCount: qualifiedDeals.length,
    collaborationTouchCount: collaborationTouches.length,
    collaborationCoverage:
      qualifiedDeals.length === 0 ? 0 : roundRatio(coveredDealIds.size / qualifiedDeals.length),
  };
}

export async function materializeImladrisSalesMetrics(
  input: MaterializeDevelopmentMetricsInput,
): Promise<MaterializedImladrisMetricResult> {
  const rawRecords = input.prisma.imladrisRawSourceRecord as RawSourceRecordDelegate;
  const canonicalMetrics = input.prisma
    .imladrisCanonicalMetricValue as CanonicalMetricDelegate;
  const metricLineage = input.prisma.imladrisMetricLineage as MetricLineageDelegate;
  const context = normalizeContext(input.context);
  const now = input.now ?? new Date();

  const requiredProviders = [
    IntegrationProvider.HUBSPOT,
    IntegrationProvider.GOOGLE_WORKSPACE,
    IntegrationProvider.SLACK,
  ];
  const queriedRecords = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: requiredProviders,
      context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const records = dedupeRawSourceRecords(queriedRecords, context, input.periodStart, input.periodEnd, now);
  const value = computeQualifiedPipeline(records);
  const status = statusForProviderCoverage({ records, requiredProviders });
  const warnings = providerCoverageWarning({
    metricLabel: "Qualified Pipeline",
    records,
    requiredProviders,
    emptyWarning: "No HubSpot, Google Workspace, or Slack raw records were available for sales materialization.",
  });
  const metricValue = await upsertCanonicalMetric({
    canonicalMetrics,
    context,
    metricKey: "sales.qualified_pipeline",
    department: "sales",
    unit: "currency",
    value,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status,
    confidence: confidenceFor(records),
    warnings,
    calculationVersion: SALES_QUALIFIED_PIPELINE_CALCULATION_VERSION,
    now,
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: SALES_QUALIFIED_PIPELINE_CALCULATION_VERSION,
    asOf: now,
  });

  return {
    metricKey: "sales.qualified_pipeline",
    metricValueId: metricValue.id,
    status,
    rawRecordCount: records.length,
    value,
  };
}

function spendAmount(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const costMicros = nonNegativeNumberFrom(
    firstValueFromSources(sources, [
      "costMicros",
      "cost_micros",
      "spendMicros",
      "spend_micros",
      "totalSpendMicros",
      "total_spend_micros",
    ]),
  );
  if (costMicros !== null) {
    return costMicros / 1_000_000;
  }
  return nonNegativeNumberFrom(
    firstValueFromSources(sources, [
      "totalSpend30d",
      "total_spend_30d",
      "totalSpend",
      "total_spend",
      "spend",
      "amountSpent",
      "amount_spent",
      "cost",
    ]),
  );
}

function acquisitionSpendForProvider(
  records: RawSourceRecordRow[],
  provider: (typeof PAID_AD_PROVIDERS)[number],
): number {
  const providerRecords = records.filter((record) => recordIsProvider(record, provider));
  const snapshotAmounts = providerRecords
    .filter((record) => recordIsObjectType(record, "snapshot"))
    .map(spendAmount)
    .filter((amount): amount is number => typeof amount === "number");
  const recordsForSpend =
    snapshotAmounts.length > 0
      ? snapshotAmounts
      : providerRecords
          .map(spendAmount)
          .filter((amount): amount is number => typeof amount === "number");
  return recordsForSpend.reduce((sum, amount) => sum + amount, 0);
}

function sessionsCount(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  return nonNegativeIntegerFrom(
    firstValueFromSources(metricSources(payload), [
      "sessions30d",
      "sessions_30d",
      "sessions",
      "users30d",
      "users_30d",
      "users",
      "activeUsers",
      "active_users",
    ]),
  );
}

function websiteSessionsCount(records: RawSourceRecordRow[]): number {
  const googleAnalyticsRecords = records.filter(
    (record) => recordIsProvider(record, IntegrationProvider.GOOGLE_ANALYTICS),
  );
  const snapshotCounts = googleAnalyticsRecords
    .filter((record) => recordIsObjectType(record, "snapshot"))
    .map(sessionsCount)
    .filter((count): count is number => typeof count === "number");
  const recordsForSessions =
    snapshotCounts.length > 0
      ? snapshotCounts
      : googleAnalyticsRecords
          .map(sessionsCount)
          .filter((count): count is number => typeof count === "number");
  return recordsForSessions.reduce((sum, count) => sum + count, 0);
}

function organicTrafficCount(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  return nonNegativeIntegerFrom(
    firstValueFromSources(metricSources(payload), [
      "organicTraffic",
      "organic_traffic",
      "traffic",
      "visits",
    ]),
  );
}

function semrushOrganicTraffic(records: RawSourceRecordRow[]): number {
  const semrushRecords = records.filter(
    (record) => recordIsProvider(record, IntegrationProvider.SEMRUSH),
  );
  const snapshotCounts = semrushRecords
    .filter((record) => recordIsObjectType(record, "snapshot"))
    .map(organicTrafficCount)
    .filter((count): count is number => typeof count === "number");
  const recordsForTraffic =
    snapshotCounts.length > 0
      ? snapshotCounts
      : semrushRecords
          .map(organicTrafficCount)
          .filter((count): count is number => typeof count === "number");
  return recordsForTraffic.reduce((sum, count) => sum + count, 0);
}

function webflowFormSubmissionCount(records: RawSourceRecordRow[]): number {
  const webflowRecords = records.filter((record) => recordIsProvider(record, IntegrationProvider.WEBFLOW));
  const snapshotCounts = webflowRecords
    .filter((record) => recordIsObjectType(record, "snapshot"))
    .map((record) => {
      const payload = asRecord(record.payload);
      return nonNegativeIntegerFrom(
        firstValueFromSources(metricSources(payload), [
          "totalFormSubmissions",
          "total_form_submissions",
        ]),
      );
    })
    .filter((count): count is number => typeof count === "number");
  if (snapshotCounts.length > 0) {
    return snapshotCounts.reduce((sum, count) => sum + count, 0);
  }

  return webflowRecords
    .filter((record) => recordIsObjectType(record, "form_submission"))
    .reduce((sum, record) => {
      const payload = asRecord(record.payload);
      return (
        sum +
        (nonNegativeIntegerFrom(
          firstValueFromSources(metricSources(payload), ["count", "submissions"]),
        ) ?? 1)
      );
    }, 0);
}

function searchClicks(record: RawSourceRecordRow): number {
  if (!recordIsProvider(record, IntegrationProvider.GOOGLE_SEARCH_CONSOLE)) return 0;
  const payload = asRecord(record.payload);
  return (
    nonNegativeIntegerFrom(
      firstValueFromSources(metricSources(payload), [
        "clicks",
        "clickCount",
        "click_count",
        "searchClicks",
        "search_clicks",
      ]),
    ) ?? 0
  );
}

function searchImpressions(record: RawSourceRecordRow): number {
  if (!recordIsProvider(record, IntegrationProvider.GOOGLE_SEARCH_CONSOLE)) return 0;
  const payload = asRecord(record.payload);
  return (
    nonNegativeIntegerFrom(
      firstValueFromSources(metricSources(payload), [
        "impressions",
        "impressionCount",
        "impression_count",
        "searchImpressions",
        "search_impressions",
      ]),
    ) ?? 0
  );
}

function isIdentifiedVisitor(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.UNIFY)) return false;
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const nestedSources = sources.flatMap((source) => [
    nestedRecord(source.account),
    nestedRecord(source.company),
  ]);
  const identified = firstValueFromSources(sources, ["identified"]);
  if (identified !== null && identified !== undefined) return booleanFrom(identified) ?? false;
  return [...sources, ...nestedSources].some(
    (source) =>
      normalizeIdentifier(
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

function isMarketingPipelineDeal(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.HUBSPOT) || !recordIsObjectType(record, "deal")) {
    return false;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const stage = normalizeStageKey(
    firstValueFromSources(sources, [
      "dealstage",
      "stage",
      "stageLabel",
      "stage_label",
      "stageId",
      "stage_id",
    ]),
  );
  if (TERMINAL_DEAL_STAGE_KEYS.has(stage) || stage === "appointmentscheduled") {
    return false;
  }
  const source =
    normalizeLookup(firstValueFromSources(sources, [
      "originalSource",
      "original_source",
      "source",
    ])) ?? "";
  return (
    source.includes("paid") ||
    source.includes("organic") ||
    source.includes("seo") ||
    source.includes("website") ||
    source.includes("marketing")
  );
}

function computeMarketingPipelineEfficiency(records: RawSourceRecordRow[]) {
  const acquisitionSpend = PAID_AD_PROVIDERS.reduce(
    (sum, provider) => sum + acquisitionSpendForProvider(records, provider),
    0,
  );
  const qualifiedPipeline = records
    .filter(isMarketingPipelineDeal)
    .reduce((sum, record) => sum + dealAmount(record), 0);
  const websiteSessions = websiteSessionsCount(records);
  const organicTraffic = semrushOrganicTraffic(records);
  const webflowFormSubmissions = webflowFormSubmissionCount(records);
  const googleSearchConsoleRecords = records.filter(
    (record) => recordIsProvider(record, IntegrationProvider.GOOGLE_SEARCH_CONSOLE),
  );
  const googleSearchConsoleSummaryRecords = googleSearchConsoleRecords.filter(
    (record) => recordIsObjectType(record, "snapshot"),
  );
  const googleSearchConsoleTrafficRecords =
    googleSearchConsoleSummaryRecords.length > 0
      ? googleSearchConsoleSummaryRecords
      : googleSearchConsoleRecords;
  const searchClickCount = googleSearchConsoleTrafficRecords.reduce(
    (sum, record) => sum + searchClicks(record),
    0,
  );
  const searchImpressionCount = googleSearchConsoleTrafficRecords.reduce(
    (sum, record) => sum + searchImpressions(record),
    0,
  );
  const identifiedVisitors = records.filter(isIdentifiedVisitor).length;
  const currency = currencyFrom(records);

  return {
    ratio: acquisitionSpend > 0 ? roundRatio(qualifiedPipeline / acquisitionSpend) : null,
    qualifiedPipeline: roundMoney(qualifiedPipeline),
    acquisitionSpend: roundMoney(acquisitionSpend),
    websiteSessions,
    webflowFormSubmissions,
    organicTraffic,
    searchClicks: searchClickCount,
    searchImpressions: searchImpressionCount,
    identifiedVisitors,
    currency,
  };
}

export async function materializeImladrisMarketingMetrics(
  input: MaterializeDevelopmentMetricsInput,
): Promise<MaterializedImladrisMetricResult> {
  const rawRecords = input.prisma.imladrisRawSourceRecord as RawSourceRecordDelegate;
  const canonicalMetrics = input.prisma
    .imladrisCanonicalMetricValue as CanonicalMetricDelegate;
  const metricLineage = input.prisma.imladrisMetricLineage as MetricLineageDelegate;
  const context = normalizeContext(input.context);
  const now = input.now ?? new Date();

  const requiredProviders = [
    IntegrationProvider.GOOGLE_ANALYTICS,
    IntegrationProvider.GOOGLE_ADS,
    IntegrationProvider.META_ADS,
    IntegrationProvider.REDDIT,
    IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
    IntegrationProvider.SEMRUSH,
    IntegrationProvider.CODA,
    IntegrationProvider.WEBFLOW,
    IntegrationProvider.UNIFY,
    IntegrationProvider.HUBSPOT,
  ];
  const queryProviders = [...requiredProviders, IntegrationProvider.META_PAGE];
  const queriedRecords = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: queryProviders,
      context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const records = dedupeRawSourceRecords(queriedRecords, context, input.periodStart, input.periodEnd, now);
  const value = computeMarketingPipelineEfficiency(records);
  const status = statusForProviderCoverage({ records, requiredProviders });
  const warnings = providerCoverageWarning({
    metricLabel: "Pipeline Efficiency",
    records,
    requiredProviders,
    emptyWarning: "No acquisition, traffic, visitor, or HubSpot raw records were available for marketing materialization.",
  });
  const metricValue = await upsertCanonicalMetric({
    canonicalMetrics,
    context,
    metricKey: "marketing.pipeline_efficiency",
    department: "marketing",
    unit: "ratio",
    value,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status,
    confidence: confidenceFor(records),
    warnings,
    calculationVersion: MARKETING_PIPELINE_EFFICIENCY_CALCULATION_VERSION,
    now,
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: MARKETING_PIPELINE_EFFICIENCY_CALCULATION_VERSION,
    asOf: now,
  });

  return {
    metricKey: "marketing.pipeline_efficiency",
    metricValueId: metricValue.id,
    status,
    rawRecordCount: records.length,
    value,
  };
}

function accountIdFromPayload(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const nestedSources = sources.flatMap((source) => [
    nestedRecord(source.account),
    nestedRecord(source.company),
    nestedRecord(source.customer),
  ]);
  const id =
    firstValueFromSources(sources, [
      "accountId",
      "account_id",
      "companyId",
      "company_id",
      "customerId",
      "customer_id",
      "stripeCustomerId",
      "stripe_customer_id",
    ]) ??
    firstValueFromSources(nestedSources, [
      "id",
      "stripeCustomerId",
      "stripe_customer_id",
    ]);

  return normalizeIdentifier(id);
}

function statusText(value: unknown, seen = new WeakSet<object>()): string | null {
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
    const normalized = statusText(candidate, seen);
    if (normalized && normalized.trim()) {
      seen.delete(value);
      return normalized;
    }
  }

  seen.delete(value);
  return null;
}

function isClosedStatus(status: unknown): boolean {
  const statusString = statusText(status);
  if (typeof statusString !== "string") return false;

  const normalizedStatus = statusString.trim().toLowerCase();
  return (
    normalizedStatus.length > 0 &&
    /\b(closed|resolved|done|complete|completed|cancelled|canceled)\b/.test(normalizedStatus)
  );
}

function isOpenSupportIssue(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.PYLON)) return false;
  if (!recordIsObjectType(record, "conversation", "ticket", "issue")) return false;

  const payload = asRecord(record.payload);
  return !isClosedStatus(
    firstValueFromSources(wrapperSources(payload), ["status", "state"]),
  );
}

function pylonSnapshotCount(record: RawSourceRecordRow, keys: string[]): number | null {
  if (!recordIsProvider(record, IntegrationProvider.PYLON) || !recordIsObjectType(record, "snapshot")) {
    return null;
  }

  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const supportRecords = sources.map((source) => nestedRecord(source.support));
  for (const key of keys) {
    const count = nonNegativeIntegerFrom(
      [...sources, ...supportRecords]
        .map((source) => source[key])
        .find((value) => value !== undefined),
    );
    if (count !== null) return count;
  }
  return null;
}

function recordFactTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    firstDateAtOrBefore(asOf, record.occurredAt, record.sourceUpdatedAt, record.sourceCreatedAt)?.getTime() ??
    0
  );
}

function latestRecordByFactTimestamp(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow | null {
  return records.reduce<RawSourceRecordRow | null>(
    (latest, record) =>
      !latest || recordFactTimestampAsOf(record, asOf) >= recordFactTimestampAsOf(latest, asOf)
        ? record
        : latest,
    null,
  );
}

function tagValueCandidates(value: unknown, seen = new WeakSet<object>()): unknown[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [value];
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    const values = value.flatMap((item) => tagValueCandidates(item, seen));
    seen.delete(value);
    return values;
  }

  const record = value as Record<string, unknown>;
  const data = asRecord(record.data);
  const values = [
    record.value,
    record.tags,
    record.labels,
    record.items,
    asRecord(data.attributes).value,
    data.value,
    data.attributes,
    record.attributes,
    record.values,
    record.fields,
  ].flatMap((candidate) => tagValueCandidates(candidate, seen));

  seen.delete(value);
  return values;
}

function normalizedTagValues(value: unknown): string[] {
  return tagValueCandidates(value)
    .map((tag) => normalizeLookup(tag))
    .filter((tag): tag is string => tag !== null);
}

function isEscalation(record: RawSourceRecordRow): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  if (
    isClosedStatus(
      firstValueFromSources(sources, ["status", "state"]),
    )
  ) {
    return false;
  }

  const type =
    normalizeLookup(firstValueFromSources(sources, ["type", "kind", "category"])) ?? "";
  const rawTags = firstValueFromSources(sources, ["tags"]);
  const tags = normalizedTagValues(rawTags);
  const priority = normalizeLookup(firstValueFromSources(sources, ["priority"])) ?? "";

  if (recordIsProvider(record, IntegrationProvider.SLACK)) {
    return (
      booleanFrom(firstValueFromSources(sources, ["escalation"])) === true ||
      type.includes("escalation") ||
      tags.some((tag) => tag.toLowerCase().includes("escalation"))
    );
  }

  if (
    recordIsProvider(record, IntegrationProvider.PYLON) &&
    recordIsObjectType(record, "conversation", "ticket", "issue")
  ) {
    return (
      priority === "urgent" ||
      priority === "high" ||
      tags.some((tag) => tag.toLowerCase() === "urgent")
    );
  }

  return false;
}

function isBillingRisk(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.STRIPE)) return false;

  const payload = asRecord(record.payload);
  const status = normalizeStageKey(
    firstValueFromSources(wrapperSources(payload), [
      "status",
      "collectionStatus",
      "collection_status",
    ]),
  );
  return ["pastdue", "unpaid", "incomplete", "paymentfailed"].includes(status);
}

function isLowUsage(record: RawSourceRecordRow, asOf: Date): boolean {
  if (!recordIsProvider(record, IntegrationProvider.POSTHOG)) return false;

  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const activeUsers = numberFrom(
    firstValueFromSources(sources, [
      "activeUsers",
      "active_users",
      "weeklyActiveUsers",
      "weekly_active_users",
    ]),
  );
  const daysSinceLastActive = numberFrom(
    firstValueFromSources(sources, [
      "daysSinceLastActive",
      "days_since_last_active",
      "inactiveDays",
      "inactive_days",
    ]),
  );
  const lastActiveAt = firstDateAtOrBefore(
    asOf,
    ...sources.flatMap((source) => [
      source.lastActiveAt,
      source.last_active_at,
      source.lastSeenAt,
      source.last_seen_at,
      source.lastActivityAt,
      source.last_activity_at,
    ]),
  );
  const derivedInactiveDays = daysBetween(lastActiveAt, asOf);

  return (
    (activeUsers !== null && activeUsers <= 1) ||
    (daysSinceLastActive !== null && daysSinceLastActive >= 14) ||
    (derivedInactiveDays !== null && derivedInactiveDays >= 14)
  );
}

function isCollaborationSignal(record: RawSourceRecordRow): boolean {
  const supported =
    (recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE) &&
      recordIsObjectType(record, "calendar_event", "email_thread", "document")) ||
    (recordIsProvider(record, IntegrationProvider.SLACK) && recordIsObjectType(record, "message"));
  if (!supported) return false;

  return Boolean(accountIdFromPayload(record));
}

function computeRetentionRisk(records: RawSourceRecordRow[], asOf: Date) {
  const supportIssues = records.filter(isOpenSupportIssue);
  const escalations = records.filter(isEscalation);
  const billingRiskRecords = records.filter(isBillingRisk);
  const lowUsageRecords = records.filter((record) => isLowUsage(record, asOf));
  const collaborationSignals = records.filter(isCollaborationSignal);
  const latestPylonSnapshot = latestRecordByFactTimestamp(
    records.filter(
      (record) =>
        recordIsProvider(record, IntegrationProvider.PYLON) &&
        recordIsObjectType(record, "snapshot"),
    ),
    asOf,
  );
  const pylonSnapshotOpenSupportIssues =
    latestPylonSnapshot
      ? pylonSnapshotCount(latestPylonSnapshot, [
        "openConversations",
        "open_conversations",
        "openIssues",
        "open_issues",
        "openTickets",
        "open_tickets",
        "unresolvedConversations",
        "unresolved_conversations",
        "unresolvedIssues",
        "unresolved_issues",
        "unresolvedTickets",
        "unresolved_tickets",
      ])
      : null;
  const pylonSnapshotEscalations =
    latestPylonSnapshot
      ? pylonSnapshotCount(latestPylonSnapshot, [
          "urgentConversations",
          "urgent_conversations",
          "urgentIssues",
          "urgent_issues",
          "urgentTickets",
          "urgent_tickets",
        ]) ?? 0
      : 0;
  const openSupportIssueCount = pylonSnapshotOpenSupportIssues ?? supportIssues.length;
  const escalationCount = escalations.length + pylonSnapshotEscalations;

  const billingRiskAccounts = new Set(
    billingRiskRecords
      .map(accountIdFromPayload)
      .filter((id): id is string => Boolean(id)),
  );
  const lowUsageAccounts = new Set(
    lowUsageRecords
      .map(accountIdFromPayload)
      .filter((id): id is string => Boolean(id)),
  );
  const atRiskAccountIds = new Set(
    [...supportIssues, ...escalations, ...billingRiskRecords, ...lowUsageRecords]
      .map(accountIdFromPayload)
      .filter((id): id is string => Boolean(id)),
  );
  const collaborationOffset = Math.max(0, 10 - collaborationSignals.length * 5);
  const score = Math.min(
    100,
    Math.round(
      openSupportIssueCount * 12 +
        escalationCount * 18 +
        billingRiskAccounts.size * 20 +
        lowUsageAccounts.size * 18 +
        collaborationOffset,
    ),
  );

  return {
    score,
    atRiskAccounts: atRiskAccountIds.size,
    openSupportIssues: openSupportIssueCount,
    escalations: escalationCount,
    accountsWithBillingRisk: billingRiskAccounts.size,
    lowUsageAccounts: lowUsageAccounts.size,
    collaborationSignals: collaborationSignals.length,
  };
}

export async function materializeImladrisCustomerSuccessMetrics(
  input: MaterializeDevelopmentMetricsInput,
): Promise<MaterializedImladrisMetricResult> {
  const rawRecords = input.prisma.imladrisRawSourceRecord as RawSourceRecordDelegate;
  const canonicalMetrics = input.prisma
    .imladrisCanonicalMetricValue as CanonicalMetricDelegate;
  const metricLineage = input.prisma.imladrisMetricLineage as MetricLineageDelegate;
  const context = normalizeContext(input.context);
  const now = input.now ?? new Date();

  const requiredProviders = [
    IntegrationProvider.PYLON,
    IntegrationProvider.POSTHOG,
    IntegrationProvider.SLACK,
    IntegrationProvider.GOOGLE_WORKSPACE,
    IntegrationProvider.STRIPE,
  ];
  const queriedRecords = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: requiredProviders,
      context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const records = dedupeRawSourceRecords(queriedRecords, context, input.periodStart, input.periodEnd, now);
  const value = computeRetentionRisk(records, now);
  const status = statusForProviderCoverage({ records, requiredProviders });
  const warnings = providerCoverageWarning({
    metricLabel: "Retention Risk",
    records,
    requiredProviders,
    emptyWarning: "No Pylon, PostHog, Slack, Google Workspace, or Stripe raw records were available for customer-success materialization.",
  });
  const metricValue = await upsertCanonicalMetric({
    canonicalMetrics,
    context,
    metricKey: "customer_success.retention_risk",
    department: "customer-success",
    unit: "score",
    value,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status,
    confidence: confidenceFor(records),
    warnings,
    calculationVersion: CUSTOMER_SUCCESS_RETENTION_RISK_CALCULATION_VERSION,
    now,
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: CUSTOMER_SUCCESS_RETENTION_RISK_CALCULATION_VERSION,
    asOf: now,
  });

  return {
    metricKey: "customer_success.retention_risk",
    metricValueId: metricValue.id,
    status,
    rawRecordCount: records.length,
    value,
  };
}

export async function materializeImladrisCanonicalMetrics(
  input: MaterializeDevelopmentMetricsInput,
): Promise<MaterializedImladrisMetricResult[]> {
  const [development, productActivation, finance, sales, marketing, customerSuccess] =
    await Promise.all([
      materializeImladrisDevelopmentMetrics(input),
      materializeImladrisProductActivationMetric(input),
      materializeImladrisFinanceMetrics(input),
      materializeImladrisSalesMetrics(input),
      materializeImladrisMarketingMetrics(input),
      materializeImladrisCustomerSuccessMetrics(input),
    ]);

  return [
    development,
    productActivation,
    ...finance,
    sales,
    marketing,
    customerSuccess,
  ];
}

import {
  ImladrisMetricStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";
import {
  imladrisObjectTypeQueryVariants,
  normalizeImladrisObjectType,
} from "@/lib/imladris/object-types";
import type { PrismaClientType } from "@/lib/prisma";

const DEVELOPMENT_CALCULATION_VERSION = "development-delivery-health-v1";
const PRODUCT_ACTIVATION_CALCULATION_VERSION = "product-activation-rate-v1";
const FINANCE_NET_BURN_CALCULATION_VERSION = "finance-net-burn-v1";
const FINANCE_CASH_BALANCE_CALCULATION_VERSION = "finance-cash-balance-v1";
const FINANCE_CASH_RUNWAY_CALCULATION_VERSION = "finance-cash-runway-v1";
const FINANCE_EXPENSES_CALCULATION_VERSION = "finance-expenses-v1";
const FINANCE_GROSS_MARGIN_CALCULATION_VERSION = "finance-gross-margin-v1";
const REVENUE_MRR_CALCULATION_VERSION = "revenue-mrr-v1";
const REVENUE_ARR_CALCULATION_VERSION = "revenue-arr-v1";
const REVENUE_TOTAL_REVENUE_CALCULATION_VERSION = "revenue-total-revenue-v1";
const REVENUE_SUBSCRIPTION_REVENUE_CALCULATION_VERSION =
  "revenue-subscription-revenue-v1";
const REVENUE_SERVICES_REVENUE_CALCULATION_VERSION =
  "revenue-services-revenue-v1";
const REVENUE_ACTIVE_SUBSCRIPTIONS_CALCULATION_VERSION =
  "revenue-active-subscriptions-v1";
const REVENUE_CUSTOMER_COUNT_CALCULATION_VERSION = "revenue-customer-count-v1";
const SALES_QUALIFIED_PIPELINE_CALCULATION_VERSION = "sales-qualified-pipeline-v1";
const SALES_DEMOS_CALCULATION_VERSION = "sales-demos-v1";
const MARKETING_PIPELINE_EFFICIENCY_CALCULATION_VERSION =
  "marketing-pipeline-efficiency-v1";
const MARKETING_WEBSITE_TRAFFIC_CALCULATION_VERSION =
  "marketing-website-traffic-v1";
const MARKETING_CONVERSION_RATE_CALCULATION_VERSION =
  "marketing-conversion-rate-v1";
const CUSTOMER_SUCCESS_CUSTOMER_HEALTH_CALCULATION_VERSION =
  "customer-success-customer-health-v1";
const CUSTOMER_SUCCESS_CUSTOMER_ACTIVITY_CALCULATION_VERSION =
  "customer-success-customer-activity-v1";
const CUSTOMER_SUCCESS_CHURN_RATE_CALCULATION_VERSION =
  "customer-success-churn-rate-v1";
const CUSTOMER_SUCCESS_RETENTION_RATE_CALCULATION_VERSION =
  "customer-success-retention-rate-v1";
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
const FINANCE_STANDING_OBJECT_TYPES = imladrisObjectTypeQueryVariants(
  "active_customer_ref",
  "account_balance",
  "balance",
  "deal",
  "snapshot",
  "subscription",
  "subscription_deal",
);

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
  deleteMany(args: {
    where: { metricValueId: string; createdAt?: { lt: Date } };
  }): Promise<unknown>;
  createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown>;
};

/**
 * Canonical materialization period boundary.
 *
 * The canonical metric upsert key includes `periodEnd`, so periodEnd MUST be
 * stable across sync runs within the same period or every run inserts a new
 * metric value row (plus a full copy of its lineage evidence) instead of
 * updating the existing one. Passing a raw `new Date()` here is what filled
 * the production Postgres volume in June 2026 (~41.5M lineage rows in one
 * week — see docs/runbooks/postgres-disk-incident-2026-06.md).
 *
 * Truncating to the start of the current UTC day gives one metric value per
 * metricKey per day: repeated runs within a day update in place, and history
 * accrues at a bounded one-row-per-day rate.
 */
export function imladrisCanonicalPeriodEnd(now: Date): Date {
  const periodEnd = new Date(now);
  periodEnd.setUTCHours(0, 0, 0, 0);
  return periodEnd;
}

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
      for (const keyVariant of keyVariants(key)) {
        const value = source[keyVariant];
        if (value !== undefined && value !== null) return value;
      }
    }
  }
  return null;
}

function valuesFromSources(sources: Record<string, unknown>[], keys: string[]): unknown[] {
  return sources.map((source) => firstValueFromSources([source], keys));
}

function keyVariants(key: string): string[] {
  const uppercaseKey = key.toUpperCase();
  return uppercaseKey === key ? [key] : [key, uppercaseKey];
}

function nestedRecordFromKey(source: Record<string, unknown>, key: string): Record<string, unknown> {
  for (const keyVariant of keyVariants(key)) {
    const record = nestedRecord(source[keyVariant]);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
}

function nonEmptyRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  return Object.keys(record).length > 0 ? record : null;
}

function expandSingleValueSource(source: Record<string, unknown>): Record<string, unknown>[] {
  const entries = Object.entries(source);
  if (entries.length !== 1) return [source];

  const [key, value] = entries[0];
  const nestedValue = asRecord(value);
  const scalarWrapperKeys = ["value", "metricValue", "metric_value"].flatMap(keyVariants);
  if (!scalarWrapperKeys.includes(key) || Object.keys(nestedValue).length === 0) {
    return [source];
  }

  return [nestedValue, source];
}

function wrapperSources(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = nestedRecordFromKey(payload, "data");
  return [
    payload,
    data,
    nestedRecordFromKey(payload, "properties"),
    nestedRecordFromKey(payload, "summary"),
    nestedRecordFromKey(payload, "metrics"),
    nestedRecordFromKey(payload, "values"),
    nestedRecordFromKey(payload, "attributes"),
    nestedRecordFromKey(payload, "fields"),
    nestedRecordFromKey(data, "properties"),
    nestedRecordFromKey(data, "summary"),
    nestedRecordFromKey(data, "metrics"),
    nestedRecordFromKey(data, "values"),
    nestedRecordFromKey(data, "attributes"),
    nestedRecordFromKey(data, "fields"),
  ].flatMap(expandSingleValueSource);
}

function metricSources(payload: Record<string, unknown>): Record<string, unknown>[] {
  const sources = wrapperSources(payload);
  return [
    ...sources,
    ...sources.flatMap((source) => [
      nestedRecordFromKey(source, "summary"),
      nestedRecordFromKey(source, "metrics"),
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
  const data = nestedRecordFromKey(record, "data");
  const dataAttributes = nestedRecordFromKey(data, "attributes");
  const dateValueKeys = [
    "value",
    "date",
    "datetime",
    "dateTime",
    "date_time",
    "timestamp",
    "time",
    "iso",
    "isoString",
    "iso_string",
    "seconds",
    "milliseconds",
    "millis",
  ];
  const candidates = [
    ...dateValueKeys.map((key) => firstValueFromSources([record], [key])),
    firstValueFromSources([dataAttributes], ["value"]),
    firstValueFromSources([data], ["value"]),
    nonEmptyRecord(nestedRecordFromKey(data, "attributes")),
    nonEmptyRecord(nestedRecordFromKey(record, "attributes")),
    nonEmptyRecord(nestedRecordFromKey(record, "values")),
    nonEmptyRecord(nestedRecordFromKey(record, "fields")),
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
  const completionDateFields = valuesFromSources(sources, ["completedAt", "completed_at"]);
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
      ...valuesFromSources(sources, ["createdAt", "created_at"]),
      record.sourceCreatedAt,
    ),
    firstDateAtOrBefore(
      asOf,
      ...valuesFromSources(sources, ["completedAt", "completed_at"]),
      record.occurredAt,
      record.sourceUpdatedAt,
    ),
  );
}

function isMergedPullRequest(record: RawSourceRecordRow, asOf: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const mergedDateFields = valuesFromSources(sources, ["mergedAt", "merged_at"]);
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

function latestRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function linearIssueIdentity(record: RawSourceRecordRow): string | null {
  if (!recordIsProvider(record, IntegrationProvider.LINEAR) || !recordIsObjectType(record, "issue")) {
    return null;
  }
  const payload = asRecord(record.payload);
  const id = firstValueFromSources(wrapperSources(payload), [
    "issueId",
    "issue_id",
    "linearIssueId",
    "linear_issue_id",
    "identifier",
    "key",
    "number",
    "id",
  ]);
  const payloadId = normalizeLookup(id);
  if (payloadId) return payloadId;
  const externalId = normalizeLookup(record.externalId);
  if (externalId) return externalId.split(":").filter(Boolean).pop() ?? externalId;
  return normalizeLookup(record.id);
}

function latestLinearIssuesById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestById = new Map<string, RawSourceRecordRow>();
  const unkeyedRecords: RawSourceRecordRow[] = [];
  for (const record of records) {
    const issueId = linearIssueIdentity(record);
    if (!issueId) {
      unkeyedRecords.push(record);
      continue;
    }
    const current = latestById.get(issueId);
    if (!current || latestRevisionTimestampAsOf(record, asOf) >= latestRevisionTimestampAsOf(current, asOf)) {
      latestById.set(issueId, record);
    }
  }
  return [...latestById.values(), ...unkeyedRecords];
}

function githubPullRequestIdentity(record: RawSourceRecordRow): string | null {
  if (
    !recordIsProvider(record, IntegrationProvider.GITHUB) ||
    !recordIsObjectType(record, "pull_request")
  ) {
    return null;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const repositorySources = sources.flatMap((source) => [
    nestedRecordFromKey(source, "repository"),
    nestedRecordFromKey(source, "repo"),
  ]);
  const repository = normalizeLookup(
    firstValueFromSources([...repositorySources, ...sources], [
      "repositoryFullName",
      "repository_full_name",
      "repoFullName",
      "repo_full_name",
      "nameWithOwner",
      "name_with_owner",
      "fullName",
      "full_name",
      "repository",
      "repo",
    ]),
  );
  const number = normalizeLookup(
    firstValueFromSources(sources, [
      "pullRequestNumber",
      "pull_request_number",
      "prNumber",
      "pr_number",
      "number",
    ]),
  );
  if (repository && number) return `${repository}#${number}`;
  return normalizeLookup(record.externalId) ?? normalizeLookup(record.id);
}

function latestGithubPullRequestsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestById = new Map<string, RawSourceRecordRow>();
  const unkeyedRecords: RawSourceRecordRow[] = [];
  for (const record of records) {
    const pullRequestId = githubPullRequestIdentity(record);
    if (!pullRequestId) {
      unkeyedRecords.push(record);
      continue;
    }
    const current = latestById.get(pullRequestId);
    if (!current || latestRevisionTimestampAsOf(record, asOf) >= latestRevisionTimestampAsOf(current, asOf)) {
      latestById.set(pullRequestId, record);
    }
  }
  return [...latestById.values(), ...unkeyedRecords];
}

function posthogEventIdentity(record: RawSourceRecordRow): string | null {
  if (!recordIsProvider(record, IntegrationProvider.POSTHOG) || !recordIsObjectType(record, "event")) {
    return null;
  }
  const payload = asRecord(record.payload);
  const id = firstValueFromSources(wrapperSources(payload), [
    "eventId",
    "event_id",
    "eventUuid",
    "event_uuid",
    "uuid",
    "id",
  ]);
  return normalizeLookup(id) ?? rawRecordDeduplicationKey(record);
}

function latestPosthogEventsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestById = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const eventId = posthogEventIdentity(record);
    if (!eventId) continue;
    const current = latestById.get(eventId);
    if (!current || latestRevisionTimestampAsOf(record, asOf) >= latestRevisionTimestampAsOf(current, asOf)) {
      latestById.set(eventId, record);
    }
  }
  return [...latestById.values()];
}

function computeDeliveryHealth(records: RawSourceRecordRow[], asOf: Date) {
  const linearIssues = latestLinearIssuesById(
    records.filter(
      (record) => recordIsProvider(record, IntegrationProvider.LINEAR) && recordIsObjectType(record, "issue"),
    ),
    asOf,
  );
  const completedLinearIssues = linearIssues.filter((record) => isCompletedLinearIssue(record, asOf));
  const pullRequests = latestGithubPullRequestsById(
    records.filter(
      (record) => recordIsProvider(record, IntegrationProvider.GITHUB) && recordIsObjectType(record, "pull_request"),
    ),
    asOf,
  );
  const mergedPullRequests = pullRequests.filter((record) => isMergedPullRequest(record, asOf));
  const productEvents = latestPosthogEventsById(
    records.filter(
      (record) => recordIsProvider(record, IntegrationProvider.POSTHOG) && recordIsObjectType(record, "event"),
    ),
    asOf,
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

function observedNonNegativeIntegerFrom(value: unknown): number | null {
  const number = numberFrom(value);
  return number !== null && number >= 0 ? Math.floor(number) : null;
}

function booleanValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  const data = nestedRecordFromKey(record, "data");
  const dataAttributes = nestedRecordFromKey(data, "attributes");
  const booleanValueKeys = [
    "value",
    "boolean",
    "booleanValue",
    "boolean_value",
    "enabled",
    "active",
    "flag",
  ];
  const candidates = [
    ...booleanValueKeys.map((key) => firstValueFromSources([record], [key])),
    firstValueFromSources([dataAttributes], booleanValueKeys),
    firstValueFromSources([data], booleanValueKeys),
    nonEmptyRecord(dataAttributes),
    nonEmptyRecord(nestedRecordFromKey(record, "attributes")),
    nonEmptyRecord(nestedRecordFromKey(record, "values")),
    nonEmptyRecord(nestedRecordFromKey(record, "fields")),
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

function normalizeFirstLookup(value: unknown): string | null {
  const normalized = normalizeLookup(value);
  if (normalized) return normalized;
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const itemValue = normalizeLookup(item);
    if (itemValue) return itemValue;
  }
  return null;
}

function normalizeFirstAssociationLookup(
  value: unknown,
  seen = new WeakSet<object>(),
): string | null {
  if (typeof value === "string" || typeof value === "number") return normalizeLookup(value);
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeFirstAssociationLookup(item, seen);
      if (normalized) {
        seen.delete(value);
        return normalized;
      }
    }
    seen.delete(value);
    return null;
  }

  const record = nestedRecord(value);
  const directId = normalizeLookup(
    firstValueFromSources([record], [
      "toObjectId",
      "to_object_id",
      "toId",
      "to_id",
      "objectId",
      "object_id",
      "id",
    ]),
  );
  if (directId) {
    seen.delete(value);
    return directId;
  }

  const nestedTo = nestedRecordFromKey(record, "to");
  if (Object.keys(nestedTo).length > 0) {
    const nestedToId = normalizeFirstAssociationLookup(nestedTo, seen);
    if (nestedToId) {
      seen.delete(value);
      return nestedToId;
    }
  }

  for (const key of [
    "results",
    "data",
    "ids",
    "companies",
    "company",
    "accounts",
    "account",
  ]) {
    const nested = firstValueFromSources([record], [key]);
    const normalized = normalizeFirstAssociationLookup(nested, seen);
    if (normalized) {
      seen.delete(value);
      return normalized;
    }
  }

  const normalized = normalizeLookup(value);
  seen.delete(value);
  return normalized;
}

function normalizeObjectType(value: unknown): string {
  const normalizedValue = scalarValue(value);
  return typeof normalizedValue === "string" ? normalizeImladrisObjectType(normalizedValue) : "";
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

function textEnvelopeCandidates(record: Record<string, unknown>): unknown[] {
  const data = nestedRecordFromKey(record, "data");
  const dataAttributes = nestedRecordFromKey(data, "attributes");
  const textValueKeys = ["status", "state", "type", "name", "label", "value"];
  return [
    ...textValueKeys.map((key) => firstValueFromSources([record], [key])),
    firstValueFromSources([dataAttributes], textValueKeys),
    firstValueFromSources([data], textValueKeys),
    nonEmptyRecord(dataAttributes),
    nonEmptyRecord(nestedRecordFromKey(record, "attributes")),
    nonEmptyRecord(nestedRecordFromKey(record, "values")),
    nonEmptyRecord(nestedRecordFromKey(record, "fields")),
  ];
}

function stageText(value: unknown, seen = new WeakSet<object>()): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  const candidates = textEnvelopeCandidates(record);
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
              in: FINANCE_STANDING_OBJECT_TYPES,
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

function earlierDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
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
  // Insert the fresh evidence set FIRST (with an explicit createdAt stamp),
  // then delete everything older than the stamp. The two statements are not
  // transactional, so this ordering matters:
  //   - delete-then-insert loses lineage permanently if the insert fails;
  //   - insert-then-prune at worst leaves a stale duplicate set that the
  //     next run (or the data-retention sweep) removes.
  // Concurrent runs against the same metricValueId converge for the same
  // reason: each prune removes every row older than its own insert batch.
  const insertStamp = new Date();
  if (input.records.length > 0) {
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
        createdAt: insertStamp,
        metadata: {
          provider: record.provider,
          calculationVersion: input.calculationVersion,
        },
      })),
    });
  }
  await input.metricLineage.deleteMany({
    where: {
      metricValueId: input.metricValueId,
      createdAt: { lt: insertStamp },
    },
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
  return normalizeLookup(id) ?? normalizeLookup(record.externalId);
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
  return normalizeLookup(id);
}

function posthogEventTimestamp(record: RawSourceRecordRow): Date | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return firstDateFrom(
    ...valuesFromSources(sources, [
      "timestamp",
      "time",
      "eventTimestamp",
      "event_timestamp",
      "eventTime",
      "event_time",
      "createdAt",
      "created_at",
    ]),
  );
}

function isActivationEvent(record: RawSourceRecordRow, asOf: Date): boolean {
  if (!recordIsProvider(record, IntegrationProvider.POSTHOG) || !recordIsObjectType(record, "event")) {
    return false;
  }
  const eventTimestamp = posthogEventTimestamp(record);
  if (eventTimestamp && eventTimestamp.getTime() > asOf.getTime()) return false;
  const eventName = firstValueFromSources(wrapperSources(asRecord(record.payload)), ["event"]);
  const normalizedEventName = normalizeLookup(eventName);
  return (
    normalizedEventName !== null &&
    ["activation_completed", "activated", "account_activated"].includes(normalizedEventName)
  );
}

function computeActivationRate(records: RawSourceRecordRow[], asOf: Date) {
  const eligibleAccountIds = new Set(
    records
      .filter((record) => recordIsProvider(record, IntegrationProvider.HUBSPOT))
      .map(hubspotAccountId)
      .filter((id): id is string => Boolean(id)),
  );
  const activatedAccountIds = new Set(
    records
      .filter((record) => isActivationEvent(record, asOf))
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

  const activationAsOf = earlierDate(inclusivePeriodEnd(input.periodEnd), now);
  const value = computeActivationRate(records, activationAsOf);
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

function mercuryTransactionIsCostOfGoodsSold(record: RawSourceRecordRow): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const signals = valuesFromSources(sources, [
    "category",
    "type",
    "kind",
    "description",
    "memo",
    "merchantName",
    "merchant_name",
    "counterpartyName",
    "counterparty_name",
  ]).map((value) =>
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

function mercuryTransactionIdentity(record: RawSourceRecordRow): string | null {
  if (
    !recordIsProvider(record, IntegrationProvider.MERCURY) ||
    !recordIsObjectType(record, "transaction", "bank_transaction")
  ) {
    return null;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const id = firstValueFromSources(sources, [
    "transactionId",
    "transaction_id",
    "bankTransactionId",
    "bank_transaction_id",
    "mercuryTransactionId",
    "mercury_transaction_id",
    "id",
  ]);
  return normalizeLookup(id) ?? rawRecordDeduplicationKey(record);
}

function latestMercuryTransactionsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestById = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const transactionId = mercuryTransactionIdentity(record);
    if (!transactionId) continue;
    const current = latestById.get(transactionId);
    if (!current || latestRevisionTimestampAsOf(record, asOf) >= latestRevisionTimestampAsOf(current, asOf)) {
      latestById.set(transactionId, record);
    }
  }
  return [...latestById.values()];
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
    nestedRecordFromKey(source, "account"),
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

function balanceRecordTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  const payload = asRecord(record.payload);
  return (
    firstDateAtOrBefore(
      asOf,
      firstValueFromSources(wrapperSources(payload), [
        "balanceAsOf",
        "balance_as_of",
        "asOf",
        "as_of",
        "effectiveAt",
        "effective_at",
      ]),
    )?.getTime() ??
    firstDateAtOrBefore(
      asOf,
      record.sourceUpdatedAt,
      record.occurredAt,
      record.sourceCreatedAt,
    )?.getTime() ??
    0
  );
}

function latestAccountBalanceAmounts(records: RawSourceRecordRow[], asOf: Date): number[] {
  const latestByAccount = new Map<string, { amount: number; timestamp: number }>();
  for (const record of records) {
    const amount = balanceAmount(record);
    if (amount === null) continue;
    const accountKey = balanceAccountKey(record);
    const timestamp = balanceRecordTimestampAsOf(record, asOf);
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
    nestedRecordFromKey(source, "cashFlow"),
    nestedRecordFromKey(source, "cash_flow"),
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
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
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

function latestStripeSubscriptionsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestById = new Map<string, RawSourceRecordRow>();
  const unkeyedRecords: RawSourceRecordRow[] = [];
  for (const record of records) {
    if (!recordIsProvider(record, IntegrationProvider.STRIPE) || !recordIsObjectType(record, "subscription")) {
      continue;
    }
    const subscriptionId = stripeSubscriptionId(record);
    if (!subscriptionId) {
      unkeyedRecords.push(record);
      continue;
    }
    const current = latestById.get(subscriptionId);
    if (!current || latestRevisionTimestampAsOf(record, asOf) >= latestRevisionTimestampAsOf(current, asOf)) {
      latestById.set(subscriptionId, record);
    }
  }
  return [...latestById.values(), ...unkeyedRecords];
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
  const subscriptionRecords = latestStripeSubscriptionsById(
    stripeRecords.filter((record) => recordIsObjectType(record, "subscription")),
    asOf,
  );
  return subscriptionRecords.reduce((sum, record) => sum + (stripeMrrAmount(record, asOf) ?? 0), 0);
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
  const data = nestedRecordFromKey(record, "data");
  const dataAttributes = nestedRecordFromKey(data, "attributes");
  const scalarValueKeys = [
    "value",
    "number",
    "count",
    "name",
    "label",
    "id",
    "type",
  ];
  const candidates = [
    ...scalarValueKeys.map((key) => firstValueFromSources([record], [key])),
    firstValueFromSources([dataAttributes], ["value", "type"]),
    firstValueFromSources([data], ["type"]),
    nonEmptyRecord(nestedRecordFromKey(data, "attributes")),
    nonEmptyRecord(nestedRecordFromKey(record, "attributes")),
    nonEmptyRecord(nestedRecordFromKey(record, "values")),
    nonEmptyRecord(nestedRecordFromKey(record, "fields")),
    nonEmptyRecord(data),
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
  const periodSources = wrapperSources(item).map((source) => nestedRecordFromKey(source, "period"));
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
  const priceSources = sources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "price")));
  const pricingSources = sources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "pricing")));
  const planSources = sources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "plan")));
  return (
    firstValueFromSources([...priceSources, ...pricingSources], ["recurring"]) ??
    planSources.find((source) => Object.keys(source).length > 0) ??
    {}
  );
}

function isOneTimeStripeInvoiceLine(item: Record<string, unknown>): boolean {
  if (item[STRIPE_INVOICE_LINE_ITEM_KEY] !== true) return false;
  const sources = wrapperSources(item);
  const parentSources = sources.map((source) => nestedRecordFromKey(source, "parent"));
  const parentInvoiceItemSources = parentSources.flatMap((source) => [
    nestedRecordFromKey(source, "invoice_item_details"),
    nestedRecordFromKey(source, "invoiceItemDetails"),
  ]);
  const parentSubscriptionItemSources = parentSources.flatMap((source) => [
    nestedRecordFromKey(source, "subscription_item_details"),
    nestedRecordFromKey(source, "subscriptionItemDetails"),
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
  const priceSources = sources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "price")));
  const pricingSources = sources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "pricing")));
  return [...sources, ...priceSources, ...pricingSources].some((source) => {
    const type = scalarValue(firstValueFromSources([source], ["type"]));
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
  const priceSources = sources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "price")));
  const planSources = sources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "plan")));
  const pricingSources = sources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "pricing")));
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
    .map((source) => nestedRecordFromKey(source, "parent"))
    .flatMap((parent) => [
      nestedRecordFromKey(parent, "subscription_item_details"),
      nestedRecordFromKey(parent, "subscriptionItemDetails"),
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
  const dataValue = firstValueFromSources([record], ["data"]);
  const dataRecord = nestedRecord(dataValue);
  const dataAttributesValue = firstValueFromSources([dataRecord], ["attributes"]);
  const dataAttributes = nestedRecord(dataAttributesValue);
  const candidates = [
    dataValue,
    firstValueFromSources([dataAttributes], ["value"]),
    firstValueFromSources([dataRecord], ["value"]),
    firstValueFromSources([record], ["value"]),
    dataAttributesValue,
    nonEmptyRecord(dataRecord),
    nonEmptyRecord(dataAttributes),
    nonEmptyRecord(nestedRecordFromKey(record, "values")),
    nonEmptyRecord(nestedRecordFromKey(record, "fields")),
    nonEmptyRecord(nestedRecordFromKey(record, "attributes")),
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
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const subscriptionItemSources = [...sources, ...subscriptionSources];
  const invoiceSources = subscriptionItemSources.flatMap((source) => [
    nestedRecordFromKey(source, "latest_invoice"),
    nestedRecordFromKey(source, "latestInvoice"),
    nestedRecordFromKey(source, "invoice"),
  ]);
  const itemContainers = subscriptionItemSources.flatMap((source) => [
    ...keyVariants("items").map((key) => source[key]),
    ...keyVariants("subscriptionItems").map((key) => source[key]),
    ...keyVariants("subscription_items").map((key) => source[key]),
  ]);
  const invoiceLineContainers = invoiceSources.flatMap((source) => [
    ...keyVariants("lines").map((key) => source[key]),
    ...keyVariants("invoiceLines").map((key) => source[key]),
    ...keyVariants("invoice_lines").map((key) => source[key]),
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
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const discountSources = [...sources, ...subscriptionSources];
  const discounts: Record<string, unknown>[] = [];
  const addDiscount = (value: unknown) => {
    const discount = nestedRecord(value);
    if (Object.keys(discount).length > 0) discounts.push(discount);
  };
  for (const source of discountSources) {
    for (const key of keyVariants("discount")) addDiscount(source[key]);
  }
  const discountContainers = discountSources.flatMap((source) => [
    ...keyVariants("discounts").map((key) => source[key]),
    ...keyVariants("subscriptionDiscounts").map((key) => source[key]),
    ...keyVariants("subscription_discounts").map((key) => source[key]),
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
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const itemPriceSources = stripeSubscriptionItems(payload).flatMap((item) => {
    const itemSources = wrapperSources(item);
    return itemSources.flatMap((source) => [
      source,
      ...wrapperSources(nestedRecordFromKey(source, "price")),
      ...wrapperSources(nestedRecordFromKey(source, "pricing")),
      ...wrapperSources(nestedRecordFromKey(source, "plan")),
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
  return discountSources.flatMap((source) => wrapperSources(nestedRecordFromKey(source, "coupon")));
}

function recordFromContainer(value: unknown, seen = new WeakSet<object>()): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  if (seen.has(value)) return {};
  seen.add(value);

  const record = nestedRecord(value);
  const dataValue = firstValueFromSources([record], ["data"]);
  const dataRecord = nestedRecord(dataValue);
  const dataAttributesValue = firstValueFromSources([dataRecord], ["attributes"]);
  const dataAttributes = nestedRecord(dataAttributesValue);
  const candidates = [
    dataValue,
    firstValueFromSources([dataAttributes], ["value"]),
    firstValueFromSources([dataRecord], ["value"]),
    firstValueFromSources([record], ["value"]),
    dataAttributesValue,
    nonEmptyRecord(dataRecord),
    nonEmptyRecord(dataAttributes),
    nonEmptyRecord(nestedRecordFromKey(record, "values")),
    nonEmptyRecord(nestedRecordFromKey(record, "fields")),
    nonEmptyRecord(nestedRecordFromKey(record, "attributes")),
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
    ...valuesFromSources(sources, [
      "start",
      "startsAt",
      "starts_at",
      "startedAt",
      "started_at",
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
    ...valuesFromSources(sources, [
      "end",
      "endsAt",
      "ends_at",
      "endedAt",
      "ended_at",
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
        recordFromContainer(firstValueFromSources([source], ["currency_options"])),
        recordFromContainer(firstValueFromSources([source], ["currencyOptions"])),
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
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const stripeSources = [...sources, ...subscriptionSources];
  const periodSources = stripeSources.flatMap((source) => [
    nestedRecordFromKey(source, "current_period"),
    nestedRecordFromKey(source, "currentPeriod"),
  ]);
  return firstDateFrom(
    ...valuesFromSources(stripeSources, [
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
      "current_period_end",
      "currentPeriodEnd",
    ]),
    ...valuesFromSources(periodSources, [
      "end",
      "ended",
      "endedAt",
      "ended_at",
      "endDate",
      "end_date",
      "endsAt",
      "ends_at",
    ]),
  );
}

function isInactiveStripeSubscription(record: RawSourceRecordRow, asOf?: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
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
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const stripeSources = [...sources, ...subscriptionSources];
  const status = firstValueFromSources(stripeSources, ["status"]);
  if (normalizeStageKey(status) !== "trialing") return false;
  const trialEnd = firstDateFrom(
    ...valuesFromSources(stripeSources, [
      "trial_end",
      "trialEnd",
      "trial_ends_at",
      "trialEndsAt",
      "trial_ended_at",
      "trialEndedAt",
    ]),
  );
  return !trialEnd || trialEnd.getTime() > asOf.getTime();
}

function isFutureStartStripeSubscription(record: RawSourceRecordRow, asOf: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const stripeSources = [...sources, ...subscriptionSources];
  const periodSources = stripeSources.flatMap((source) => [
    nestedRecordFromKey(source, "current_period"),
    nestedRecordFromKey(source, "currentPeriod"),
  ]);
  const startsAt = firstDateFrom(
    ...valuesFromSources(stripeSources, [
      "start",
      "startsAt",
      "starts_at",
      "startedAt",
      "started_at",
      "startDate",
      "start_date",
      "current_period_start",
      "currentPeriodStart",
    ]),
    ...valuesFromSources(periodSources, [
      "start",
      "startsAt",
      "starts_at",
      "startDate",
      "start_date",
    ]),
  );
  return Boolean(startsAt && startsAt.getTime() > asOf.getTime());
}

function stripeCustomerId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const customerSources = [...sources, ...subscriptionSources].map((source) =>
    nestedRecordFromKey(source, "customer"),
  );
  const directCustomerId = normalizeLookup(
    firstValueFromSources([...sources, ...subscriptionSources], [
      "customerId",
      "customer_id",
      "stripeCustomerId",
      "stripe_customer_id",
      "customer",
    ]),
  );
  if (directCustomerId) return directCustomerId;

  const expandedCustomerId = normalizeLookup(
    firstValueFromSources(customerSources, [
      "customerId",
      "customer_id",
      "stripeCustomerId",
      "stripe_customer_id",
      "id",
    ]),
  );
  if (expandedCustomerId) return expandedCustomerId;

  if (recordIsObjectType(record, "active_customer_ref")) {
    return normalizeLookup(firstValueFromSources(sources, ["id"]));
  }

  return null;
}

function stripeCustomerEmail(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const customerSources = [...sources, ...subscriptionSources].map((source) =>
    nestedRecordFromKey(source, "customer"),
  );
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

function stripeHubspotCompanyIdentity(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const customerSources = [...sources, ...subscriptionSources].map((source) =>
    nestedRecordFromKey(source, "customer"),
  );
  const metadataSources = [...sources, ...subscriptionSources, ...customerSources].map((source) =>
    nestedRecordFromKey(source, "metadata"),
  );
  return normalizeFirstAssociationLookup(
    firstValueFromSources([...sources, ...subscriptionSources, ...customerSources, ...metadataSources], [
      "hubspotCompanyId",
      "hubspot_company_id",
      "hubspotCompanyIds",
      "hubspot_company_ids",
      "hubspotAssociatedCompanyId",
      "hubspot_associated_company_id",
      "hubspotAssociatedCompanyIds",
      "hubspot_associated_company_ids",
    ]),
  );
}

function stripeSubscriptionId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
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

function hubspotDealAssociatedCompanyIdentity(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const associationSources = sources.flatMap((source) => {
    const associations = nestedRecordFromKey(source, "associations");
    return [
      nestedRecordFromKey(source, "company"),
      nestedRecordFromKey(source, "account"),
      nestedRecordFromKey(source, "customer"),
      associations,
      nestedRecordFromKey(associations, "companies"),
      nestedRecordFromKey(associations, "company"),
      nestedRecordFromKey(associations, "accounts"),
      nestedRecordFromKey(associations, "account"),
    ];
  });

  return normalizeFirstAssociationLookup(
    firstValueFromSources([...sources, ...associationSources], [
      "companyIds",
      "company_ids",
      "associatedCompanyIds",
      "associated_company_ids",
      "associatedCompanies",
      "associated_companies",
      "hubspotCompanyIds",
      "hubspot_company_ids",
      "companies",
      "company",
      "results",
      "data",
      "ids",
      "id",
    ]),
  );
}

function hubspotDealCustomerIdentity(record: RawSourceRecordRow): string {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return (
    hubspotDealAssociatedCompanyIdentity(record) ??
    normalizeLookup(
      firstValueFromSources(sources, [
        "companyId",
        "company_id",
        "accountId",
        "account_id",
        "customerId",
        "customer_id",
        "hubspotCompanyId",
        "hubspot_company_id",
      ]),
    ) ??
    hubspotDealEmail(record) ??
    hubspotDealEmailDomain(record) ??
    normalizeLookup(record.externalId) ??
    normalizeLookup(record.id) ??
    "unknown"
  );
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
    hubspotCompanyIds: Set<string>;
  },
): boolean {
  const customerId = hubspotStripeCustomerId(record);
  const subscriptionId = hubspotStripeSubscriptionId(record);
  const email = hubspotDealEmail(record);
  const emailDomain = hubspotDealEmailDomain(record);
  const hubspotCompanyId = hubspotDealAssociatedCompanyIdentity(record);
  return (
    Boolean(customerId && stripeRefs.customerIds.has(customerId)) ||
    Boolean(subscriptionId && stripeRefs.subscriptionIds.has(subscriptionId)) ||
    Boolean(email && stripeRefs.emails.has(email)) ||
    Boolean(emailDomain && stripeRefs.domains.has(emailDomain)) ||
    Boolean(hubspotCompanyId && stripeRefs.hubspotCompanyIds.has(hubspotCompanyId))
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
    ...valuesFromSources(sources, [
      "closedAt",
      "closed_at",
      "closeDate",
      "close_date",
      "closedate",
      "wonAt",
      "won_at",
      "hs_closedate",
    ]),
  );
  if (asOf && closedAt && closedAt.getTime() > asOf.getTime()) return null;
  const lifecycleSources = sources.flatMap((source) => [
    source,
    nestedRecordFromKey(source, "subscription"),
    nestedRecordFromKey(source, "billing"),
    nestedRecordFromKey(source, "service"),
    nestedRecordFromKey(source, "contract"),
  ]);
  const subscriptionStartsAt = firstDateFrom(
    ...valuesFromSources(lifecycleSources, [
      "subscriptionStartDate",
      "subscription_start_date",
      "subscriptionStartsAt",
      "subscription_starts_at",
      "billingStartDate",
      "billing_start_date",
      "billingStartsAt",
      "billing_starts_at",
      "hs_recurring_billing_start_date",
      "serviceStartDate",
      "service_start_date",
      "contractStartDate",
      "contract_start_date",
      "startDate",
      "start_date",
      "startsAt",
      "starts_at",
    ]),
  );
  if (asOf && subscriptionStartsAt && subscriptionStartsAt.getTime() > asOf.getTime()) return null;
  const subscriptionEndsAt = firstDateFrom(
    ...valuesFromSources(lifecycleSources, [
      "subscriptionEndDate",
      "subscription_end_date",
      "subscriptionEndsAt",
      "subscription_ends_at",
      "billingEndDate",
      "billing_end_date",
      "billingEndsAt",
      "billing_ends_at",
      "hs_recurring_billing_end_date",
      "serviceEndDate",
      "service_end_date",
      "contractEndDate",
      "contract_end_date",
      "canceledAt",
      "canceled_at",
      "cancelledAt",
      "cancelled_at",
      "churnedAt",
      "churned_at",
      "endDate",
      "end_date",
      "endsAt",
      "ends_at",
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
      "hs_mrr",
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
      "hs_arr",
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
    hubspotCompanyIds: new Set(
      stripeRecords.map(stripeHubspotCompanyIdentity).filter((value): value is string => Boolean(value)),
    ),
  };
}

function computeMrrBreakdown(records: RawSourceRecordRow[], asOf: Date) {
  const stripeMrr = computeStripeMrr(records, asOf);
  const stripeArr = stripeMrr * 12;
  const stripeRefs = buildStripeRefs(records, asOf, stripeMrr > 0);
  const activeStripeSubscriptions = latestStripeSubscriptionsById(
    records.filter(
      (record) =>
        recordIsProvider(record, IntegrationProvider.STRIPE) &&
        recordIsObjectType(record, "subscription"),
    ),
    asOf,
  ).filter((record) => (stripeMrrAmount(record, asOf) ?? 0) > 0);
  const activeStripeCustomerIdentities = new Set(
    activeStripeSubscriptions
      .map(
        (record) =>
          stripeCustomerId(record) ??
          stripeCustomerEmail(record) ??
          stripeCustomerEmailDomain(record) ??
          stripeHubspotCompanyIdentity(record) ??
          stripeSubscriptionId(record),
      )
      .filter((value): value is string => Boolean(value)),
  );
  let hubspotSubscriptionMrr = 0;
  let hubspotSubscriptionArr = 0;
  let hubspotOnlySubscriptionMrr = 0;
  let hubspotOnlySubscriptionArr = 0;
  let excludedLinkedHubspotSubscriptionMrr = 0;
  let excludedLinkedHubspotSubscriptionArr = 0;
  let hubspotOnlySubscriptions = 0;
  const hubspotOnlyCustomerIdentities = new Set<string>();

  const hubspotSubscriptionRecords = latestRecordsByDealId(
    records.filter(
      (record) =>
        recordIsProvider(record, IntegrationProvider.HUBSPOT) &&
        recordIsObjectType(record, "deal", "subscription_deal"),
    ),
    asOf,
  );

  for (const record of hubspotSubscriptionRecords) {
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
      hubspotOnlySubscriptions += 1;
      hubspotOnlyCustomerIdentities.add(hubspotDealCustomerIdentity(record));
    }
  }

  const totalMrr = stripeMrr + hubspotOnlySubscriptionMrr;
  const totalArr = stripeArr + hubspotOnlySubscriptionArr;
  const stripeSubscriptions = activeStripeSubscriptions.length;
  const stripeCustomers = activeStripeCustomerIdentities.size;

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
    activeSubscriptions: stripeSubscriptions + hubspotOnlySubscriptions,
    stripeSubscriptions,
    hubspotOnlySubscriptions,
    activeCustomers: stripeCustomers + hubspotOnlyCustomerIdentities.size,
    stripeCustomers,
    hubspotOnlyCustomers: hubspotOnlyCustomerIdentities.size,
  };
}

function closedWonHubspotDealAmount(record: RawSourceRecordRow, asOf: Date): number | null {
  if (!recordIsProvider(record, IntegrationProvider.HUBSPOT) || !recordIsObjectType(record, "deal")) {
    return null;
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
  if (stage && !["closedwon", "won"].includes(stage)) return null;
  const closedAt = firstDateFrom(
    ...valuesFromSources(sources, [
      "closedAt",
      "closed_at",
      "closeDate",
      "close_date",
      "closedate",
      "wonAt",
      "won_at",
      "hs_closedate",
    ]),
  );
  if (closedAt && closedAt.getTime() > asOf.getTime()) return null;
  return Math.max(0, numberFrom(firstValueFromSources(sources, ["amount"])) ?? 0);
}

function hubspotDealIsServicesRevenue(record: RawSourceRecordRow, asOf: Date): boolean {
  if (hubspotRecurringRevenueAsOf(record, asOf)) return false;
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const serviceSignals = valuesFromSources(sources, [
    "revenueType",
    "revenue_type",
    "dealType",
    "deal_type",
    "productType",
    "product_type",
    "lineOfBusiness",
    "line_of_business",
    "category",
    "type",
  ]).map((value) => String(scalarValue(value) ?? "").trim().toLowerCase());
  return serviceSignals.some((signal) =>
    [
      "service",
      "services",
      "professionalservice",
      "professionalservices",
      "professional_services",
      "implementation",
      "support",
      "consulting",
      "one-time",
      "onetime",
      "nonrecurring",
      "non-recurring",
    ].includes(signal.replace(/\s+/g, "")),
  );
}

function stripeInvoiceIsPaid(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.STRIPE) || !recordIsObjectType(record, "invoice")) {
    return false;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const paid = booleanFrom(firstValueFromSources(sources, ["paid", "isPaid", "is_paid"]));
  if (paid === false) return false;
  if (paid === true) return true;
  const status = normalizeStageKey(firstValueFromSources(sources, ["status"]));
  if (["void", "voided", "draft", "open", "uncollectible"].includes(status)) return false;
  if (status === "paid") return true;
  const amountPaid = numberFrom(firstValueFromSources(sources, ["amount_paid", "amountPaid"]));
  return Boolean(amountPaid && amountPaid > 0);
}

function stripeInvoiceLineItems(payload: Record<string, unknown>): Record<string, unknown>[] {
  const sources = wrapperSources(payload);
  const containers = sources.flatMap((source) => [
    ...keyVariants("lines").map((key) => source[key]),
    ...keyVariants("invoiceLines").map((key) => source[key]),
    ...keyVariants("invoice_lines").map((key) => source[key]),
  ]);
  return containers.flatMap((container) => {
    return (arrayValuesFromContainer(container) ?? []).map((item) => nestedRecord(item));
  });
}

function stripeInvoiceLineAmount(item: Record<string, unknown>): number {
  const sources = wrapperSources(item);
  const explicitDecimalAmount = numberFrom(
    firstValueFromSources(sources, [
      "amountDecimal",
      "amount_decimal",
      "amountDollars",
      "amount_dollars",
      "subtotalDecimal",
      "subtotal_decimal",
      "subtotalDollars",
      "subtotal_dollars",
      "totalDecimal",
      "total_decimal",
      "totalDollars",
      "total_dollars",
    ]),
  );
  if (explicitDecimalAmount !== null) return Math.max(0, explicitDecimalAmount);

  const explicitAmountCents = numberFrom(
    firstValueFromSources(sources, [
      "amountCents",
      "amount_cents",
      "subtotalCents",
      "subtotal_cents",
      "totalCents",
      "total_cents",
    ]),
  );
  if (explicitAmountCents !== null) return Math.max(0, explicitAmountCents / 100);

  const amountCents = numberFrom(
    firstValueFromSources(sources, [
      "amount",
      "amount_excluding_tax",
      "amountExcludingTax",
      "subtotal",
      "subtotal_excluding_tax",
      "subtotalExcludingTax",
    ]),
  );
  return amountCents && amountCents > 0 ? amountCents / 100 : 0;
}

function stripeInvoiceId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const invoiceSources = sources.map((source) => nestedRecordFromKey(source, "invoice"));
  return normalizeLookup(
    firstValueFromSources([...sources, ...invoiceSources], [
      "invoiceId",
      "invoice_id",
      "stripeInvoiceId",
      "stripe_invoice_id",
      "id",
    ]),
  ) ?? normalizeLookup(String(record.externalId).split(":").pop());
}

function stripePaymentIntentId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const paymentIntentSources = sources.map((source) => nestedRecordFromKey(source, "payment_intent"));
  const explicitId = normalizeLookup(
    firstValueFromSources(sources, [
      "paymentIntentId",
      "payment_intent_id",
      "stripePaymentIntentId",
      "stripe_payment_intent_id",
    ]),
  );
  if (explicitId) return explicitId;

  const paymentIntentReference = normalizeLookup(
    firstValueFromSources(sources, [
      "paymentIntent",
      "payment_intent",
    ]),
  );
  if (paymentIntentReference) return paymentIntentReference;

  const nestedPaymentIntentId = normalizeLookup(firstValueFromSources(paymentIntentSources, ["id"]));
  if (nestedPaymentIntentId) return nestedPaymentIntentId;

  return recordIsObjectType(record, "payment_intent")
    ? normalizeLookup(firstValueFromSources(sources, ["id"]))
    : null;
}

function stripeChargeId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const chargeSources = sources.flatMap((source) => [
    nestedRecordFromKey(source, "charge"),
    nestedRecordFromKey(source, "latest_charge"),
    nestedRecordFromKey(source, "latestCharge"),
  ]);
  return normalizeLookup(
    firstValueFromSources([...sources, ...chargeSources], [
      "chargeId",
      "charge_id",
      "stripeChargeId",
      "stripe_charge_id",
      "charge",
      "latest_charge",
      "latestCharge",
      "id",
    ]),
  );
}

function stripeInvoicePaymentIntentId(record: RawSourceRecordRow): string | null {
  return stripePaymentIntentId(record);
}

function stripeChargeInvoiceId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const invoiceSources = sources.map((source) => nestedRecordFromKey(source, "invoice"));
  return normalizeLookup(
    firstValueFromSources([...sources, ...invoiceSources], [
      "invoiceId",
      "invoice_id",
      "stripeInvoiceId",
      "stripe_invoice_id",
      "invoice",
    ]),
  );
}

function stripeInvoiceCashAmount(record: RawSourceRecordRow): number | null {
  if (!stripeInvoiceIsPaid(record)) return null;
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const explicitAmountPaidCents = numberFrom(
    firstValueFromSources(sources, [
      "amount_paid",
      "amountPaid",
      "amount_received",
      "amountReceived",
      "paidAmount",
      "paid_amount",
      "total",
    ]),
  );
  if (explicitAmountPaidCents !== null) {
    return Math.max(0, explicitAmountPaidCents / 100);
  }
  const lineAmount = stripeInvoiceLineItems(payload).reduce(
    (sum, line) => sum + stripeInvoiceLineAmount(line),
    0,
  );
  return lineAmount > 0 ? lineAmount : null;
}

function stripeChargeCashAmount(record: RawSourceRecordRow): number | null {
  if (
    !recordIsProvider(record, IntegrationProvider.STRIPE) ||
    !recordIsObjectType(record, "charge", "payment", "payment_intent")
  ) {
    return null;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const paid = booleanFrom(firstValueFromSources(sources, ["paid", "isPaid", "is_paid"]));
  if (paid === false) return null;
  const status = normalizeStageKey(firstValueFromSources(sources, ["status", "state"]));
  if (["failed", "canceled", "cancelled", "requirespaymentmethod", "requiresconfirmation"].includes(status)) {
    return null;
  }
  if (recordIsObjectType(record, "payment_intent") && status && !["succeeded", "paid", "captured"].includes(status)) {
    return null;
  }
  const refunded = booleanFrom(firstValueFromSources(sources, ["refunded", "isRefunded", "is_refunded"]));
  const amountRefundedCents = numberFrom(
    firstValueFromSources(sources, ["amount_refunded", "amountRefunded", "refundedAmount", "refunded_amount"]),
  );
  if (refunded === true && (amountRefundedCents === null || amountRefundedCents <= 0)) return null;

  const explicitNetAmountCents = numberFrom(
    firstValueFromSources(sources, [
      "netAmountCents",
      "net_amount_cents",
    ]),
  );
  if (explicitNetAmountCents !== null) return Math.max(0, explicitNetAmountCents / 100);

  const grossAmountCents = numberFrom(
    firstValueFromSources(sources, [
      "amount_captured",
      "amountCaptured",
      "amount_received",
      "amountReceived",
      "amount",
    ]),
  );
  if (grossAmountCents === null) return null;
  return Math.max(0, (grossAmountCents - Math.max(0, amountRefundedCents ?? 0)) / 100);
}

function stripeChargeRefundedAmount(record: RawSourceRecordRow): number {
  if (
    !recordIsProvider(record, IntegrationProvider.STRIPE) ||
    !recordIsObjectType(record, "charge", "payment", "payment_intent")
  ) {
    return 0;
  }
  const amountRefundedCents = numberFrom(
    firstValueFromSources(wrapperSources(asRecord(record.payload)), [
      "amount_refunded",
      "amountRefunded",
      "refundedAmount",
      "refunded_amount",
    ]),
  );
  return amountRefundedCents && amountRefundedCents > 0 ? amountRefundedCents / 100 : 0;
}

function stripeLostDisputeAmount(record: RawSourceRecordRow): number | null {
  if (!recordIsProvider(record, IntegrationProvider.STRIPE) || !recordIsObjectType(record, "dispute")) {
    return null;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const status = normalizeStageKey(firstValueFromSources(sources, ["status", "state"]));
  if (status !== "lost") return null;
  const amountCents = numberFrom(
    firstValueFromSources(sources, [
      "amount",
      "disputeAmount",
      "dispute_amount",
      "lostAmount",
      "lost_amount",
    ]),
  );
  if (amountCents === null || amountCents === 0) return null;
  return Math.abs(amountCents) / 100;
}

function stripeRefundLossAmount(record: RawSourceRecordRow): number | null {
  if (!recordIsProvider(record, IntegrationProvider.STRIPE) || !recordIsObjectType(record, "refund")) {
    return null;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const status = normalizeStageKey(firstValueFromSources(sources, ["status", "state"]));
  if (!["succeeded", "paid", "completed"].includes(status)) return null;
  const amountCents = numberFrom(
    firstValueFromSources(sources, [
      "amount",
      "refundAmount",
      "refund_amount",
      "refundedAmount",
      "refunded_amount",
    ]),
  );
  if (amountCents === null || amountCents === 0) return null;
  return Math.abs(amountCents) / 100;
}

function stripeBalanceTransactionFeeAmount(record: RawSourceRecordRow): number {
  if (!recordIsProvider(record, IntegrationProvider.STRIPE) || !recordIsObjectType(record, "balance_transaction")) {
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
  if (!recordIsProvider(record, IntegrationProvider.STRIPE) || !recordIsObjectType(record, "balance_transaction")) {
    return null;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return (
    normalizeIdentifier(
      firstValueFromSources(sources, [
        "id",
        "balanceTransactionId",
        "balance_transaction_id",
        "transactionId",
        "transaction_id",
      ]),
    ) ?? normalizeIdentifier(record.externalId)
  );
}

function computeStripeProcessingFees(records: RawSourceRecordRow[]): number {
  const feesByTransaction = new Map<string, number>();
  let unkeyedFees = 0;
  for (const record of records) {
    const amount = stripeBalanceTransactionFeeAmount(record);
    if (amount <= 0) continue;
    const transactionId = stripeBalanceTransactionSourceId(record);
    if (!transactionId) {
      unkeyedFees += amount;
      continue;
    }
    feesByTransaction.set(transactionId, Math.max(feesByTransaction.get(transactionId) ?? 0, amount));
  }
  return [...feesByTransaction.values()].reduce((sum, amount) => sum + amount, unkeyedFees);
}

function stripeRefundChargeId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const chargeSources = sources.map((source) => nestedRecordFromKey(source, "charge"));
  return normalizeLookup(
    firstValueFromSources([...sources, ...chargeSources], [
      "chargeId",
      "charge_id",
      "stripeChargeId",
      "stripe_charge_id",
      "charge",
      "id",
    ]),
  );
}

function stripeRefundLosses(
  refunds: { record: RawSourceRecordRow; chargeId: string | null; amount: number }[],
  chargeRefundedAmounts: Map<string, number>,
) {
  const remainingReflectedRefunds = new Map(chargeRefundedAmounts);
  return refunds
    .map((refund) => {
      if (!refund.chargeId) return { record: refund.record, amount: refund.amount };
      const reflectedAmount = remainingReflectedRefunds.get(refund.chargeId) ?? 0;
      const additionalAmount = Math.max(0, refund.amount - reflectedAmount);
      remainingReflectedRefunds.set(refund.chargeId, Math.max(0, reflectedAmount - refund.amount));
      return { record: refund.record, amount: additionalAmount };
    })
    .filter((refund): refund is { record: RawSourceRecordRow; amount: number } => refund.amount > 0);
}

function computeStripeCashCollections(records: RawSourceRecordRow[]) {
  const paidInvoices = records
    .filter((record) => recordIsProvider(record, IntegrationProvider.STRIPE) && recordIsObjectType(record, "invoice"))
    .map((record) => ({
      record,
      invoiceId: stripeInvoiceId(record),
      paymentIntentId: stripeInvoicePaymentIntentId(record),
      amount: stripeInvoiceCashAmount(record),
    }))
    .filter((entry): entry is {
      record: RawSourceRecordRow;
      invoiceId: string | null;
      paymentIntentId: string | null;
      amount: number;
    } => typeof entry.amount === "number" && entry.amount > 0);
  const paidInvoiceIds = new Set(paidInvoices.map((entry) => entry.invoiceId).filter(Boolean));
  const paidInvoicePaymentIntentIds = new Set(paidInvoices.map((entry) => entry.paymentIntentId).filter(Boolean));
  const chargeCollections = records
    .filter((record) => recordIsProvider(record, IntegrationProvider.STRIPE) && recordIsObjectType(record, "charge", "payment", "payment_intent"))
    .map((record) => ({
      record,
      chargeId: stripeChargeId(record),
      invoiceId: stripeChargeInvoiceId(record),
      paymentIntentId: stripePaymentIntentId(record),
      amount: stripeChargeCashAmount(record),
      refundedAmount: stripeChargeRefundedAmount(record),
    }))
    .filter((entry): entry is {
      record: RawSourceRecordRow;
      chargeId: string | null;
      invoiceId: string | null;
      paymentIntentId: string | null;
      amount: number;
      refundedAmount: number;
    } => {
      if (typeof entry.amount !== "number" || entry.amount <= 0) return false;
      if (entry.invoiceId && paidInvoiceIds.has(entry.invoiceId)) return false;
      if (entry.paymentIntentId && paidInvoicePaymentIntentIds.has(entry.paymentIntentId)) return false;
      return true;
    });
  const chargeRefundedAmounts = new Map<string, number>();
  for (const charge of chargeCollections) {
    if (!charge.chargeId || charge.refundedAmount <= 0) continue;
    chargeRefundedAmounts.set(
      charge.chargeId,
      Math.max(chargeRefundedAmounts.get(charge.chargeId) ?? 0, charge.refundedAmount),
    );
  }
  const lostDisputes = records
    .filter((record) => recordIsProvider(record, IntegrationProvider.STRIPE) && recordIsObjectType(record, "dispute"))
    .map((record) => ({
      record,
      amount: stripeLostDisputeAmount(record),
    }))
    .filter((entry): entry is { record: RawSourceRecordRow; amount: number } =>
      typeof entry.amount === "number" && entry.amount > 0,
    );
  const successfulRefunds = records
    .filter((record) => recordIsProvider(record, IntegrationProvider.STRIPE) && recordIsObjectType(record, "refund"))
    .map((record) => ({
      record,
      chargeId: stripeRefundChargeId(record),
      amount: stripeRefundLossAmount(record),
    }))
    .filter((entry): entry is { record: RawSourceRecordRow; chargeId: string | null; amount: number } =>
      typeof entry.amount === "number" && entry.amount > 0,
    );
  const refundLosses = stripeRefundLosses(successfulRefunds, chargeRefundedAmounts);
  const grossCollections = [...paidInvoices, ...chargeCollections].reduce((sum, entry) => sum + entry.amount, 0);
  const disputeLosses = lostDisputes.reduce((sum, entry) => sum + entry.amount, 0);
  const refundLossAmount = refundLosses.reduce((sum, entry) => sum + entry.amount, 0);

  return {
    amount: roundMoney(grossCollections - disputeLosses - refundLossAmount),
    paidInvoices: paidInvoices.length,
    paidCharges: chargeCollections.length,
    lostDisputes: lostDisputes.length,
    disputeLosses: roundMoney(disputeLosses),
    refunds: refundLosses.length,
    refundLosses: roundMoney(refundLossAmount),
    observedCashEvidence:
      paidInvoices.length > 0 ||
      chargeCollections.length > 0 ||
      lostDisputes.length > 0 ||
      refundLosses.length > 0,
  };
}

function stripeInvoiceLineHasRecurringEvidence(item: Record<string, unknown>): boolean {
  const sources = wrapperSources(item);
  const parentSources = sources.map((source) => nestedRecordFromKey(source, "parent"));
  const parentSubscriptionItemSources = parentSources.flatMap((source) => [
    nestedRecordFromKey(source, "subscription_item_details"),
    nestedRecordFromKey(source, "subscriptionItemDetails"),
  ]);
  const priceSources = sources.flatMap((source) => [
    ...wrapperSources(nestedRecordFromKey(source, "price")),
    ...wrapperSources(nestedRecordFromKey(source, "pricing")),
    ...wrapperSources(nestedRecordFromKey(source, "plan")),
  ]);
  const recurringEvidence = firstValueFromSources(priceSources, ["recurring", "interval"]);
  if (recurringEvidence !== null && recurringEvidence !== undefined) return true;
  const subscriptionReference = firstValueFromSources([...sources, ...parentSubscriptionItemSources], [
    "subscription",
    "subscriptionId",
    "subscription_id",
    "subscription_item",
    "subscriptionItem",
    "subscription_item_id",
    "subscriptionItemId",
  ]);
  return Boolean(normalizeLookup(subscriptionReference));
}

function stripeInvoiceLineIsOneTimeService(item: Record<string, unknown>): boolean {
  if (stripeInvoiceLineAmount(item) <= 0) return false;
  if (stripeInvoiceLineHasRecurringEvidence(item)) return false;

  const sources = wrapperSources(item);
  const parentSources = sources.map((source) => nestedRecordFromKey(source, "parent"));
  const priceSources = sources.flatMap((source) => [
    ...wrapperSources(nestedRecordFromKey(source, "price")),
    ...wrapperSources(nestedRecordFromKey(source, "pricing")),
    ...wrapperSources(nestedRecordFromKey(source, "plan")),
  ]);
  const productSources = priceSources.flatMap((source) => [
    ...wrapperSources(nestedRecordFromKey(source, "product")),
    ...wrapperSources(nestedRecordFromKey(source, "product_details")),
    ...wrapperSources(nestedRecordFromKey(source, "productDetails")),
  ]);
  const typeSignals = valuesFromSources([...sources, ...parentSources, ...priceSources], [
    "type",
    "billingScheme",
    "billing_scheme",
  ]).map((value) => String(scalarValue(value) ?? "").trim().toLowerCase().replace(/[\s_-]+/g, ""));
  if (typeSignals.some((signal) => ["invoiceitemdetails", "invoiceitem", "onetime"].includes(signal))) {
    return true;
  }

  const serviceSignals = valuesFromSources([...sources, ...priceSources, ...productSources], [
    "description",
    "name",
    "nickname",
    "productName",
    "product_name",
    "lineOfBusiness",
    "line_of_business",
    "category",
  ]).map((value) => String(scalarValue(value) ?? "").trim().toLowerCase());
  return serviceSignals.some((signal) =>
    /service|implementation|consulting|support|setup|onboarding|professional/.test(signal),
  );
}

function computeServicesRevenue(records: RawSourceRecordRow[], asOf: Date) {
  const servicesDeals = latestRecordsByDealId(
    records.filter(
      (record) =>
        recordIsProvider(record, IntegrationProvider.HUBSPOT) &&
        recordIsObjectType(record, "deal") &&
        hubspotDealIsServicesRevenue(record, asOf),
    ),
    asOf,
  );
  const amount = servicesDeals.reduce((sum, record) => {
    return sum + (closedWonHubspotDealAmount(record, asOf) ?? 0);
  }, 0);
  const stripeServiceInvoices = records.filter(stripeInvoiceIsPaid).map((record) => {
    const serviceLines = stripeInvoiceLineItems(asRecord(record.payload)).filter(stripeInvoiceLineIsOneTimeService);
    return {
      record,
      amount: serviceLines.reduce((sum, line) => sum + stripeInvoiceLineAmount(line), 0),
      serviceLineCount: serviceLines.length,
    };
  }).filter((invoice) => invoice.amount > 0 && invoice.serviceLineCount > 0);
  const stripeServiceRevenue = stripeServiceInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  return {
    amount: roundMoney(amount + stripeServiceRevenue),
    closedWonServicesDeals: servicesDeals.filter(
      (record) => (closedWonHubspotDealAmount(record, asOf) ?? 0) > 0,
    ).length,
    stripeServiceInvoices: stripeServiceInvoices.length,
    stripeServiceInvoiceLines: stripeServiceInvoices.reduce((sum, invoice) => sum + invoice.serviceLineCount, 0),
  };
}

function computeFinanceValues(records: RawSourceRecordRow[], asOf: Date) {
  const mercuryTransactions = latestMercuryTransactionsById(
    records.filter(
      (record) =>
        recordIsProvider(record, IntegrationProvider.MERCURY) &&
        recordIsObjectType(record, "transaction", "bank_transaction"),
    ),
    asOf,
  );
  const cashOutflow = mercuryTransactions.reduce((sum, record) => {
    const amount = transactionAmount(record);
    return amount && amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
  const mercuryCostOfGoodsSold = mercuryTransactions.reduce((sum, record) => {
    const amount = transactionAmount(record);
    return amount && amount < 0 && mercuryTransactionIsCostOfGoodsSold(record)
      ? sum + Math.abs(amount)
      : sum;
  }, 0);
  const stripeProcessingFees = computeStripeProcessingFees(records);
  const costOfGoodsSold = mercuryCostOfGoodsSold + stripeProcessingFees;
  const expenseTransactions = mercuryTransactions.filter((record) => {
    const amount = transactionAmount(record);
    return Boolean(amount && amount < 0);
  }).length;
  const mercuryCashInflow = mercuryTransactions.reduce((sum, record) => {
    const amount = transactionAmount(record);
    return amount && amount > 0 ? sum + amount : sum;
  }, 0);
  const mrr = computeMrrBreakdown(records, asOf);
  // recognizedMrr is the recognized (billed) MRR. Per the canonical finance fix
  // it is surfaced for visibility but is NOT treated as cash inflow.
  const recognizedMrr = mrr.amount;
  // stripeMrr is retained as an informational "estimated MRR inflow" figure only.
  const stripeMrr = computeStripeMrr(records, asOf);
  const stripeCashCollections = computeStripeCashCollections(records);
  // Only count actual Stripe cash collections (paid invoices/charges net of
  // disputes and refunds) as cash inflow. When there is no observed cash
  // evidence we fall back to 0 rather than recognized MRR, since recognized
  // revenue is not cash.
  const stripeCashInflow = stripeCashCollections.observedCashEvidence
    ? stripeCashCollections.amount
    : 0;
  const servicesRevenue = computeServicesRevenue(records, asOf);
  const grossMarginRevenue = mrr.amount + servicesRevenue.amount;
  const cashInflow = mercuryCashInflow + stripeCashInflow;
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
      timestamp: recordFactTimestampAsOf(record, asOf),
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
  const latestAccountBalances = latestAccountBalanceAmounts(mercuryBalanceAmounts, asOf);
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
      recognizedMrr,
      mercuryCashInflow: roundMoney(mercuryCashInflow),
      stripeCashCollections: stripeCashCollections.amount,
      stripeCashCollectionInvoices: stripeCashCollections.paidInvoices,
      stripeCashCollectionCharges: stripeCashCollections.paidCharges,
      stripeDisputeLosses: stripeCashCollections.disputeLosses,
      stripeLostDisputes: stripeCashCollections.lostDisputes,
      stripeRefundLosses: stripeCashCollections.refundLosses,
      stripeRefunds: stripeCashCollections.refunds,
      stripeEstimatedMrrInflow: roundMoney(stripeMrr),
      stripeCashInflow: roundMoney(stripeCashInflow),
    },
    runway: {
      months: netBurn > 0 ? roundRatio(cashBalance / netBurn) : null,
      cashBalance: roundMoney(cashBalance),
      netBurn: roundMoney(netBurn),
      recognizedMrr,
      currency,
    },
    expenses: {
      amount: roundMoney(cashOutflow),
      currency,
      cashOutflow: roundMoney(cashOutflow),
      expenseTransactions,
    },
    grossMargin: {
      rate:
        grossMarginRevenue > 0
          ? roundRatio(((grossMarginRevenue - costOfGoodsSold) / grossMarginRevenue) * 100)
          : null,
      revenue: roundMoney(grossMarginRevenue),
      costOfGoodsSold: roundMoney(costOfGoodsSold),
      stripeProcessingFees: roundMoney(stripeProcessingFees),
      currency,
    },
    mrr: {
      amount: mrr.amount,
      arr: mrr.arr,
      stripeMrr: mrr.stripeMrr,
      stripeArr: mrr.stripeArr,
      hubspotSubscriptionMrr: mrr.hubspotSubscriptionMrr,
      hubspotSubscriptionArr: mrr.hubspotSubscriptionArr,
      hubspotOnlySubscriptionMrr: mrr.hubspotOnlySubscriptionMrr,
      hubspotOnlySubscriptionArr: mrr.hubspotOnlySubscriptionArr,
      hubspotRecurringRevenue: mrr.hubspotRecurringRevenue,
      excludedLinkedHubspotSubscriptionMrr: mrr.excludedLinkedHubspotSubscriptionMrr,
      excludedLinkedHubspotSubscriptionArr: mrr.excludedLinkedHubspotSubscriptionArr,
      currency,
    },
    subscriptionRevenue: {
      amount: mrr.arr,
      mrr: mrr.amount,
      currency,
      activeSubscriptions: mrr.activeSubscriptions,
      activeCustomers: mrr.activeCustomers,
    },
    totalRevenue: {
      amount: roundMoney(mrr.arr + servicesRevenue.amount),
      subscriptionRevenue: mrr.arr,
      servicesRevenue: servicesRevenue.amount,
      currency,
    },
    servicesRevenue: {
      ...servicesRevenue,
      currency,
    },
    activeSubscriptions: {
      count: mrr.activeSubscriptions,
      stripeSubscriptions: mrr.stripeSubscriptions,
      hubspotOnlySubscriptions: mrr.hubspotOnlySubscriptions,
    },
    customerCount: {
      count: mrr.activeCustomers,
      stripeCustomers: mrr.stripeCustomers,
      hubspotOnlyCustomers: mrr.hubspotOnlyCustomers,
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
      metricKey: "finance.cash_balance",
      department: "finance",
      unit: "currency",
      value: {
        amount: values.runway.cashBalance,
        currency: values.runway.currency,
      },
      calculationVersion: FINANCE_CASH_BALANCE_CALCULATION_VERSION,
    },
    {
      metricKey: "finance.cash_runway_months",
      department: "finance",
      unit: "months",
      value: values.runway,
      calculationVersion: FINANCE_CASH_RUNWAY_CALCULATION_VERSION,
    },
    {
      metricKey: "finance.expenses",
      department: "finance",
      unit: "currency",
      value: values.expenses,
      calculationVersion: FINANCE_EXPENSES_CALCULATION_VERSION,
    },
    {
      metricKey: "finance.gross_margin",
      department: "finance",
      unit: "percent",
      value: values.grossMargin,
      calculationVersion: FINANCE_GROSS_MARGIN_CALCULATION_VERSION,
    },
    {
      metricKey: "revenue.mrr",
      department: "finance",
      unit: "currency",
      value: values.mrr,
      calculationVersion: REVENUE_MRR_CALCULATION_VERSION,
    },
    {
      metricKey: "revenue.arr",
      department: "finance",
      unit: "currency",
      value: {
        amount: values.mrr.arr,
        mrr: values.mrr.amount,
        currency: values.mrr.currency,
      },
      calculationVersion: REVENUE_ARR_CALCULATION_VERSION,
    },
    {
      metricKey: "revenue.total_revenue",
      department: "finance",
      unit: "currency",
      value: values.totalRevenue,
      calculationVersion: REVENUE_TOTAL_REVENUE_CALCULATION_VERSION,
    },
    {
      metricKey: "revenue.subscription_revenue",
      department: "finance",
      unit: "currency",
      value: values.subscriptionRevenue,
      calculationVersion: REVENUE_SUBSCRIPTION_REVENUE_CALCULATION_VERSION,
    },
    {
      metricKey: "revenue.services_revenue",
      department: "finance",
      unit: "currency",
      value: values.servicesRevenue,
      calculationVersion: REVENUE_SERVICES_REVENUE_CALCULATION_VERSION,
    },
    {
      metricKey: "revenue.active_subscriptions",
      department: "finance",
      unit: "count",
      value: values.activeSubscriptions,
      calculationVersion: REVENUE_ACTIVE_SUBSCRIPTIONS_CALCULATION_VERSION,
    },
    {
      metricKey: "revenue.customer_count",
      department: "finance",
      unit: "count",
      value: values.customerCount,
      calculationVersion: REVENUE_CUSTOMER_COUNT_CALCULATION_VERSION,
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

function dealRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestRecordsByDealId(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByDealId = new Map<string, RawSourceRecordRow>();
  const unkeyedRecords: RawSourceRecordRow[] = [];
  for (const record of records) {
    const dealId = dealIdFromRecord(record);
    if (!dealId) {
      unkeyedRecords.push(record);
      continue;
    }
    const current = latestByDealId.get(dealId);
    if (!current || dealRevisionTimestampAsOf(record, asOf) >= dealRevisionTimestampAsOf(current, asOf)) {
      latestByDealId.set(dealId, record);
    }
  }
  return [...latestByDealId.values(), ...unkeyedRecords];
}

function collaborationEventTimestamp(record: RawSourceRecordRow): Date | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const timestampKeys = [
    "timestamp",
    "time",
    "ts",
    "createdAt",
    "created_at",
    "sentAt",
    "sent_at",
    "messageTs",
    "message_ts",
    "eventTime",
    "event_time",
    "eventTimestamp",
    "event_timestamp",
    "startedAt",
    "started_at",
    "startTime",
    "start_time",
    "startAt",
    "start_at",
    "start",
    "dateTime",
    "date_time",
    "date",
  ];
  return firstDateFrom(
    ...sources.flatMap((source) => [
      firstValueFromSources([source], timestampKeys),
      firstValueFromSources([nestedRecordFromKey(source, "start")], [
        "dateTime",
        "date_time",
        "date",
      ]),
    ]),
  );
}

function collaborationTimestampIsWithinPeriod(
  record: RawSourceRecordRow,
  periodStart: Date,
  asOf: Date,
): boolean {
  const timestamp = collaborationEventTimestamp(record);
  if (!timestamp) return true;
  const timestampMs = timestamp.getTime();
  return timestampMs >= periodStart.getTime() && timestampMs <= asOf.getTime();
}

function slackCollaborationEventId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const eventId = normalizeLookup(
    firstValueFromSources(
      sources,
      recordIsObjectType(record, "thread")
        ? [
            "threadTs",
            "thread_ts",
            "thread",
            "ts",
            "messageTs",
            "message_ts",
            "messageId",
            "message_id",
            "id",
          ]
        : [
            "messageTs",
            "message_ts",
            "messageId",
            "message_id",
            "threadTs",
            "thread_ts",
            "ts",
            "id",
          ],
    ),
  );
  if (!eventId) return null;

  const channelId = normalizeLookup(firstValueFromSources(sources, ["channelId", "channel_id", "channel"]));
  return channelId ? `${channelId}:${eventId}` : eventId;
}

function googleWorkspaceCalendarId(sources: Record<string, unknown>[]): string | null {
  const explicit = normalizeLookup(firstValueFromSources(sources, ["calendarId", "calendar_id"]));
  if (explicit) return explicit;
  return normalizeLookup(
    firstValueFromSources(
      sources.flatMap((source) => [nestedRecordFromKey(source, "calendar")]),
      ["calendarId", "calendar_id", "id"],
    ),
  );
}

function googleWorkspaceCollaborationEventId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  if (recordIsObjectType(record, "calendar_event", "event")) {
    const eventId = normalizeLookup(
      firstValueFromSources(sources, [
        "eventId",
        "event_id",
        "calendarEventId",
        "calendar_event_id",
        "id",
      ]),
    );
    if (eventId) {
      const calendarId = googleWorkspaceCalendarId(sources);
      return calendarId ? `${calendarId}:${eventId}` : eventId;
    }
    return normalizeLookup(firstValueFromSources(sources, ["iCalUID", "ical_uid"]));
  }

  return normalizeLookup(
    firstValueFromSources(sources, [
      "messageId",
      "message_id",
      "threadId",
      "thread_id",
      "thread",
      "documentId",
      "document_id",
      "fileId",
      "file_id",
      "file",
      "id",
    ]),
  );
}

function salesCollaborationTouchEventId(record: RawSourceRecordRow): string | null {
  if (recordIsProvider(record, IntegrationProvider.SLACK)) {
    return slackCollaborationEventId(record);
  }
  if (recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE)) {
    return googleWorkspaceCollaborationEventId(record);
  }
  return null;
}

function isSalesCollaborationTouchRecord(record: RawSourceRecordRow): boolean {
  return (
    (recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE) &&
      recordIsObjectType(record, "calendar_event", "email_thread", "document", "event", "thread", "file")) ||
    (recordIsProvider(record, IntegrationProvider.SLACK) && recordIsObjectType(record, "message", "thread"))
  );
}

function googleWorkspaceCollaborationObjectType(record: RawSourceRecordRow): string | null {
  if (!recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE)) return null;
  if (recordIsObjectType(record, "calendar_event", "event")) return "calendar_event";
  if (recordIsObjectType(record, "email_thread", "thread")) return "email_thread";
  if (recordIsObjectType(record, "document", "file")) return "document";
  return recordObjectType(record);
}

function collaborationObjectType(record: RawSourceRecordRow): string {
  if (recordIsProvider(record, IntegrationProvider.SLACK) && recordIsObjectType(record, "message", "thread")) {
    return "message";
  }
  return googleWorkspaceCollaborationObjectType(record) ?? recordObjectType(record) ?? "";
}

function salesCollaborationTouchDeduplicationKey(record: RawSourceRecordRow): string | null {
  const dealId = linkedDealId(record);
  if (!dealId) return null;
  const eventId = salesCollaborationTouchEventId(record);
  if (eventId) {
    return `${recordProvider(record) ?? "UNKNOWN"}:${collaborationObjectType(record)}:${dealId}:${eventId}`;
  }
  return `${dealId}:${rawRecordDeduplicationKey(record)}`;
}

function salesCollaborationTouchRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestSalesCollaborationTouchesById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = salesCollaborationTouchDeduplicationKey(record);
    if (!key) continue;
    const current = latestByKey.get(key);
    if (
      !current ||
      salesCollaborationTouchRevisionTimestampAsOf(record, asOf) >=
        salesCollaborationTouchRevisionTimestampAsOf(current, asOf)
    ) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function recordIsOneOfProviders(record: RawSourceRecordRow, providers: IntegrationProvider[]): boolean {
  const provider = recordProvider(record);
  return provider !== null && providers.includes(provider);
}

function textLooksLikeSalesDemo(value: unknown): boolean {
  const text = stageText(value) ?? normalizeLookup(value);
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, "");
  return (
    /\bdemo(?:s|nstration)?\b/.test(normalized) ||
    compact.includes("appointmentscheduled") ||
    compact.includes("scheduledemo") ||
    compact.includes("bookdemo") ||
    compact.includes("requestdemo") ||
    /\bpresentation\b/.test(normalized)
  );
}

function anySourceTextLooksLikeSalesDemo(sources: Record<string, unknown>[], keys: string[]): boolean {
  return valuesFromSources(sources, keys).some(textLooksLikeSalesDemo);
}

function hubspotDealIsDemo(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.HUBSPOT) || !recordIsObjectType(record, "deal")) {
    return false;
  }

  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return anySourceTextLooksLikeSalesDemo(sources, [
    "dealstage",
    "stage",
    "stageLabel",
    "stage_label",
    "stageName",
    "stage_name",
    "stageId",
    "stage_id",
    "pipelineStage",
    "pipeline_stage",
  ]);
}

function hubspotMeetingIsDemo(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.HUBSPOT) || !recordIsObjectType(record, "meeting")) {
    return false;
  }

  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return anySourceTextLooksLikeSalesDemo(sources, [
    "title",
    "meetingTitle",
    "meeting_title",
    "hs_meeting_title",
    "subject",
    "body",
    "description",
    "hs_meeting_body",
    "name",
  ]);
}

function googleWorkspaceRecordIsDemo(record: RawSourceRecordRow): boolean {
  if (
    !recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE) ||
    !recordIsObjectType(record, "calendar_event", "event")
  ) {
    return false;
  }

  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return anySourceTextLooksLikeSalesDemo(sources, [
    "summary",
    "title",
    "subject",
    "description",
    "name",
  ]);
}

function webflowRecordIsDemoRequest(record: RawSourceRecordRow): boolean {
  if (
    !recordIsProvider(record, IntegrationProvider.WEBFLOW) ||
    !recordIsObjectType(record, "form_submission", "form_submission_detail", "submission", "form")
  ) {
    return false;
  }

  const sources = [
    ...webflowSubmissionSources(record),
    ...webflowFormSources(record),
  ];
  return anySourceTextLooksLikeSalesDemo(sources, [
    "formName",
    "form_name",
    "formTitle",
    "form_title",
    "formId",
    "form_id",
    "name",
    "title",
    "path",
    "url",
    "page",
    "pageUrl",
    "page_url",
    "cta",
    "intent",
  ]);
}

function salesDemoRecordTimestamp(record: RawSourceRecordRow): Date | null {
  if (recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE)) {
    return collaborationEventTimestamp(record);
  }

  const payload = asRecord(record.payload);
  const sources = recordIsProvider(record, IntegrationProvider.WEBFLOW)
    ? webflowSubmissionSources(record)
    : wrapperSources(payload);
  return firstDateFrom(
    ...sources.flatMap((source) => [
      firstValueFromSources([source], [
        "startedAt",
        "started_at",
        "startTime",
        "start_time",
        "startAt",
        "start_at",
        "hs_timestamp",
        "meetingStartTime",
        "meeting_start_time",
        "submittedAt",
        "submitted_at",
        "createdAt",
        "created_at",
        "updatedAt",
        "updated_at",
        "eventTime",
        "event_time",
        "timestamp",
        "date",
      ]),
    ]),
    record.occurredAt,
    record.sourceUpdatedAt,
    record.sourceCreatedAt,
  );
}

function salesDemoTimestampIsWithinPeriod(
  record: RawSourceRecordRow,
  periodStart: Date,
  asOf: Date,
): boolean {
  const timestamp = salesDemoRecordTimestamp(record);
  if (!timestamp) return true;
  const timestampMs = timestamp.getTime();
  return timestampMs >= periodStart.getTime() && timestampMs <= asOf.getTime();
}

function salesDemoDeduplicationKey(record: RawSourceRecordRow): string {
  if (recordIsProvider(record, IntegrationProvider.HUBSPOT)) {
    return dealIdFromRecord(record) ?? rawRecordDeduplicationKey(record);
  }
  if (recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE)) {
    return googleWorkspaceCollaborationEventId(record) ?? rawRecordDeduplicationKey(record);
  }
  if (recordIsProvider(record, IntegrationProvider.WEBFLOW)) {
    return webflowFormSubmissionDeduplicationKey(record);
  }
  return rawRecordDeduplicationKey(record);
}

function salesDemoRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestSalesDemoRecordsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = salesDemoDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (
      !current ||
      salesDemoRevisionTimestampAsOf(record, asOf) >= salesDemoRevisionTimestampAsOf(current, asOf)
    ) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function isSalesDemoRecord(record: RawSourceRecordRow): boolean {
  return (
    hubspotDealIsDemo(record) ||
    hubspotMeetingIsDemo(record) ||
    googleWorkspaceRecordIsDemo(record) ||
    webflowRecordIsDemoRequest(record)
  );
}

function computeSalesDemos(records: RawSourceRecordRow[], periodStart: Date, asOf: Date) {
  const demoRecords = latestSalesDemoRecordsById(
    records.filter((record) => (
      isSalesDemoRecord(record) && salesDemoTimestampIsWithinPeriod(record, periodStart, asOf)
    )),
    asOf,
  );
  const hubspotDemoDeals = demoRecords.filter((record) =>
    recordIsProvider(record, IntegrationProvider.HUBSPOT) && recordIsObjectType(record, "deal"),
  ).length;
  const hubspotDemoMeetings = demoRecords.filter((record) =>
    recordIsProvider(record, IntegrationProvider.HUBSPOT) && recordIsObjectType(record, "meeting"),
  ).length;
  const calendarDemoEvents = demoRecords.filter((record) =>
    recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE),
  ).length;
  const webflowDemoRequests = demoRecords.filter((record) =>
    recordIsProvider(record, IntegrationProvider.WEBFLOW),
  ).length;
  const scheduledDemos = hubspotDemoDeals + hubspotDemoMeetings + calendarDemoEvents;
  const requestedDemos = webflowDemoRequests;

  return {
    records: demoRecords,
    value: {
      count: scheduledDemos + requestedDemos,
      scheduledDemos,
      requestedDemos,
      hubspotDemoDeals,
      hubspotDemoMeetings,
      calendarDemoEvents,
      webflowDemoRequests,
    },
  };
}

function computeQualifiedPipeline(records: RawSourceRecordRow[], periodStart: Date, asOf: Date) {
  const qualifiedDeals = latestRecordsByDealId(records.filter(isQualifiedPipelineDeal), asOf);
  const qualifiedDealIds = new Set(
    qualifiedDeals.map(dealIdFromRecord).filter((id): id is string => Boolean(id)),
  );
  const collaborationTouches = latestSalesCollaborationTouchesById(records.filter((record) => {
    if (!isSalesCollaborationTouchRecord(record)) {
      return false;
    }
    if (!collaborationTimestampIsWithinPeriod(record, periodStart, asOf)) {
      return false;
    }
    const dealId = linkedDealId(record);
    return Boolean(dealId && qualifiedDealIds.has(dealId));
  }), asOf);
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

  const qualifiedPipelineProviders = [
    IntegrationProvider.HUBSPOT,
    IntegrationProvider.GOOGLE_WORKSPACE,
    IntegrationProvider.SLACK,
  ];
  const salesDemoProviders = [
    IntegrationProvider.HUBSPOT,
    IntegrationProvider.GOOGLE_WORKSPACE,
    IntegrationProvider.WEBFLOW,
  ];
  const queryProviders = [
    ...qualifiedPipelineProviders,
    IntegrationProvider.WEBFLOW,
  ];
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
  const salesAsOf = earlierDate(inclusivePeriodEnd(input.periodEnd), now);
  const pipelineRecords = records.filter((record) => recordIsOneOfProviders(record, qualifiedPipelineProviders));
  const value = computeQualifiedPipeline(pipelineRecords, input.periodStart, salesAsOf);
  const status = statusForProviderCoverage({ records: pipelineRecords, requiredProviders: qualifiedPipelineProviders });
  const warnings = providerCoverageWarning({
    metricLabel: "Qualified Pipeline",
    records: pipelineRecords,
    requiredProviders: qualifiedPipelineProviders,
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
    confidence: confidenceFor(pipelineRecords),
    warnings,
    calculationVersion: SALES_QUALIFIED_PIPELINE_CALCULATION_VERSION,
    now,
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records: pipelineRecords,
    calculationVersion: SALES_QUALIFIED_PIPELINE_CALCULATION_VERSION,
    asOf: now,
  });

  const demos = computeSalesDemos(records, input.periodStart, salesAsOf);
  const demosStatus = statusForProviderCoverage({ records, requiredProviders: salesDemoProviders });
  const demosWarnings = providerCoverageWarning({
    metricLabel: "Demos",
    missingVerb: "are",
    records,
    requiredProviders: salesDemoProviders,
    emptyWarning: "No HubSpot, Google Workspace, or Webflow raw records were available for sales demos materialization.",
  });
  const demosMetricValue = await upsertCanonicalMetric({
    canonicalMetrics,
    context,
    metricKey: "sales.demos",
    department: "sales",
    unit: "count",
    value: demos.value,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: demosStatus,
    confidence: confidenceFor(demos.records),
    warnings: demosWarnings,
    calculationVersion: SALES_DEMOS_CALCULATION_VERSION,
    now,
  });

  await replaceLineage({
    metricLineage,
    metricValueId: demosMetricValue.id,
    records: demos.records,
    calculationVersion: SALES_DEMOS_CALCULATION_VERSION,
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
      "COST_MICROS",
      "spendMicros",
      "spend_micros",
      "SPEND_MICROS",
      "totalSpendMicros",
      "total_spend_micros",
      "TOTAL_SPEND_MICROS",
    ]),
  );
  if (costMicros !== null) {
    return costMicros / 1_000_000;
  }
  const redditSpendMicros = recordIsProvider(record, IntegrationProvider.REDDIT)
    ? nonNegativeNumberFrom(firstValueFromSources(sources, ["SPEND"]))
    : null;
  if (redditSpendMicros !== null) {
    return redditSpendMicros / 1_000_000;
  }
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

function paidAdDimensionSources(record: RawSourceRecordRow): Record<string, unknown>[] {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
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
    paidAdDimensionValue(record, ["adSetId", "ad_set_id", "AD_SET_ID", "adSet", "ad_set", "AD_SET"]),
    paidAdDimensionValue(record, ["adId", "ad_id", "AD_ID", "ad"]),
    paidAdDateDimension(record),
  ]
    .map((value, index) => (value ? `${index}:${value}` : null))
    .filter((value): value is string => Boolean(value));

  if (dimensions.length > 0) {
    return `${recordProvider(record) ?? "UNKNOWN"}:${recordObjectType(record)}:${dimensions.join(":")}`;
  }
  return rawRecordDeduplicationKey(record);
}

function paidAdSpendRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestPaidAdSpendRecordsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = paidAdSpendRecordDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (
      !current ||
      paidAdSpendRevisionTimestampAsOf(record, asOf) >=
        paidAdSpendRevisionTimestampAsOf(current, asOf)
    ) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function acquisitionSpendForProvider(
  records: RawSourceRecordRow[],
  provider: (typeof PAID_AD_PROVIDERS)[number],
  asOf: Date,
): number {
  const providerRecords = records.filter((record) => recordIsProvider(record, provider));
  const snapshotAmount = latestSnapshotMetric(providerRecords, spendAmount, asOf);
  const fallbackRecords = latestPaidAdSpendRecordsById(
    providerRecords.filter((record) => !recordIsObjectType(record, "snapshot")),
    asOf,
  );
  const recordsForSpend =
    snapshotAmount !== null
      ? [snapshotAmount]
      : fallbackRecords
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

function googleAnalyticsDimensionValue(record: RawSourceRecordRow, keys: string[]): string | null {
  const payload = asRecord(record.payload);
  return normalizeLookup(firstValueFromSources(wrapperSources(payload), keys));
}

function googleAnalyticsDateDimension(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const value = firstValueFromSources(wrapperSources(payload), [
    "date",
    "rowDate",
    "row_date",
    "startDate",
    "start_date",
    "endDate",
    "end_date",
    "period",
    "month",
  ]);
  const parsedDate = dateFrom(value);
  if (parsedDate) return parsedDate.toISOString().slice(0, 10);
  return normalizeLookup(value);
}

function googleAnalyticsSessionRowDeduplicationKey(record: RawSourceRecordRow): string {
  const dimensions = [
    googleAnalyticsDimensionValue(record, [
      "channel",
      "channelGroup",
      "channel_group",
      "defaultChannelGroup",
      "default_channel_group",
      "sessionDefaultChannelGroup",
      "session_default_channel_group",
    ]),
    googleAnalyticsDimensionValue(record, ["source", "sessionSource", "session_source"]),
    googleAnalyticsDimensionValue(record, ["medium", "sessionMedium", "session_medium"]),
    googleAnalyticsDateDimension(record),
  ]
    .map((value, index) => (value ? `${index}:${value}` : null))
    .filter((value): value is string => Boolean(value));

  if (dimensions.length > 0) {
    return `${recordProvider(record) ?? "UNKNOWN"}:${recordObjectType(record)}:${dimensions.join(":")}`;
  }
  return rawRecordDeduplicationKey(record);
}

function googleAnalyticsSessionRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestGoogleAnalyticsSessionRowsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = googleAnalyticsSessionRowDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (
      !current ||
      googleAnalyticsSessionRevisionTimestampAsOf(record, asOf) >=
        googleAnalyticsSessionRevisionTimestampAsOf(current, asOf)
    ) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function websiteSessionsCount(records: RawSourceRecordRow[], asOf: Date): number {
  const googleAnalyticsRecords = records.filter(
    (record) => recordIsProvider(record, IntegrationProvider.GOOGLE_ANALYTICS),
  );
  const snapshotCount = latestSnapshotMetric(googleAnalyticsRecords, sessionsCount, asOf);
  const fallbackRecords = latestGoogleAnalyticsSessionRowsById(
    googleAnalyticsRecords.filter((record) => !recordIsObjectType(record, "snapshot")),
    asOf,
  );
  const recordsForSessions =
    snapshotCount !== null
      ? [snapshotCount]
      : fallbackRecords
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

function semrushDimensionValue(record: RawSourceRecordRow, keys: string[]): string | null {
  const payload = asRecord(record.payload);
  return normalizeLookup(firstValueFromSources(wrapperSources(payload), keys));
}

function semrushDateDimension(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const value = firstValueFromSources(wrapperSources(payload), [
    "date",
    "rowDate",
    "row_date",
    "period",
    "month",
    "startDate",
    "start_date",
    "endDate",
    "end_date",
  ]);
  const parsedDate = dateFrom(value);
  if (parsedDate) return parsedDate.toISOString().slice(0, 10);
  return normalizeLookup(value);
}

function semrushTrafficRowDeduplicationKey(record: RawSourceRecordRow): string {
  const dimensions = [
    semrushDimensionValue(record, ["domain", "domainName", "domain_name", "rootDomain", "root_domain"]),
    semrushDimensionValue(record, ["keyword", "query", "searchQuery", "search_query"]),
    semrushDimensionValue(record, ["url", "page", "pageUrl", "page_url", "landingPage", "landing_page"]),
    semrushDimensionValue(record, ["country", "countryCode", "country_code", "database"]),
    semrushDateDimension(record),
  ]
    .map((value, index) => (value ? `${index}:${value}` : null))
    .filter((value): value is string => Boolean(value));

  if (dimensions.length > 0) {
    return `${recordProvider(record) ?? "UNKNOWN"}:${recordObjectType(record)}:${dimensions.join(":")}`;
  }
  return rawRecordDeduplicationKey(record);
}

function semrushTrafficRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestSemrushTrafficRowsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = semrushTrafficRowDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (
      !current ||
      semrushTrafficRevisionTimestampAsOf(record, asOf) >= semrushTrafficRevisionTimestampAsOf(current, asOf)
    ) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function semrushOrganicTraffic(records: RawSourceRecordRow[], asOf: Date): number {
  const semrushRecords = records.filter(
    (record) => recordIsProvider(record, IntegrationProvider.SEMRUSH),
  );
  const snapshotCount = latestSnapshotMetric(semrushRecords, organicTrafficCount, asOf);
  const fallbackRecords = latestSemrushTrafficRowsById(
    semrushRecords.filter((record) => !recordIsObjectType(record, "snapshot")),
    asOf,
  );
  const recordsForTraffic =
    snapshotCount !== null
      ? [snapshotCount]
      : fallbackRecords
          .map(organicTrafficCount)
          .filter((count): count is number => typeof count === "number");
  return recordsForTraffic.reduce((sum, count) => sum + count, 0);
}

function webflowSubmissionSources(record: RawSourceRecordRow): Record<string, unknown>[] {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return [
    ...sources,
    ...sources.flatMap((source) => [
      nestedRecordFromKey(source, "submission"),
      nestedRecordFromKey(source, "formSubmission"),
      nestedRecordFromKey(source, "form_submission"),
    ]),
  ];
}

function webflowFormSources(record: RawSourceRecordRow): Record<string, unknown>[] {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return [
    ...sources,
    ...sources.flatMap((source) => [
      nestedRecordFromKey(source, "form"),
      nestedRecordFromKey(source, "formData"),
      nestedRecordFromKey(source, "form_data"),
    ]),
  ];
}

function webflowSubmitterSources(record: RawSourceRecordRow): Record<string, unknown>[] {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return [
    ...sources,
    ...sources.flatMap((source) => [
      nestedRecordFromKey(source, "contact"),
      nestedRecordFromKey(source, "submitter"),
      nestedRecordFromKey(source, "person"),
      nestedRecordFromKey(source, "customer"),
      nestedRecordFromKey(source, "lead"),
      nestedRecordFromKey(source, "user"),
    ]),
  ];
}

function webflowDimensionValue(sources: Record<string, unknown>[], keys: string[]): string | null {
  return normalizeLookup(firstValueFromSources(sources, keys));
}

function webflowSubmissionDateDimension(record: RawSourceRecordRow): string | null {
  const value = firstValueFromSources(webflowSubmissionSources(record), [
    "submittedAt",
    "submitted_at",
    "createdAt",
    "created_at",
    "date",
    "rowDate",
    "row_date",
    "timestamp",
  ]);
  const parsedDate = dateFrom(value);
  if (parsedDate) return parsedDate.toISOString();
  return normalizeLookup(value);
}

function webflowFormSubmissionDeduplicationKey(record: RawSourceRecordRow): string {
  const dimensions = [
    webflowDimensionValue(webflowSubmissionSources(record), [
      "submissionId",
      "submission_id",
      "submissionID",
      "id",
    ]),
    webflowDimensionValue(webflowFormSources(record), [
      "formId",
      "form_id",
      "formID",
      "form",
      "formName",
      "form_name",
      "name",
      "id",
    ]),
    webflowDimensionValue(webflowSubmitterSources(record), [
      "email",
      "emailAddress",
      "email_address",
    ]),
    webflowSubmissionDateDimension(record),
  ]
    .map((value, index) => (value ? `${index}:${value}` : null))
    .filter((value): value is string => Boolean(value));

  if (dimensions.length > 0) {
    return `${recordProvider(record) ?? "UNKNOWN"}:${recordObjectType(record)}:${dimensions.join(":")}`;
  }
  return rawRecordDeduplicationKey(record);
}

function webflowSubmissionRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestWebflowFormSubmissionsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = webflowFormSubmissionDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (
      !current ||
      webflowSubmissionRevisionTimestampAsOf(record, asOf) >=
        webflowSubmissionRevisionTimestampAsOf(current, asOf)
    ) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function webflowFormSubmissionCount(records: RawSourceRecordRow[], asOf: Date): number {
  const webflowRecords = records.filter((record) => recordIsProvider(record, IntegrationProvider.WEBFLOW));
  const snapshotCount = latestSnapshotMetric(
    webflowRecords,
    (record) => {
      const payload = asRecord(record.payload);
      return nonNegativeIntegerFrom(
        firstValueFromSources(metricSources(payload), [
          "totalFormSubmissions",
          "total_form_submissions",
        ]),
      );
    },
    asOf,
  );
  if (snapshotCount !== null) {
    return snapshotCount;
  }

  return latestWebflowFormSubmissionsById(
    webflowRecords.filter((record) => recordIsObjectType(record, "form_submission")),
    asOf,
  ).reduce((sum, record) => {
      const payload = asRecord(record.payload);
      return (
        sum +
        (nonNegativeIntegerFrom(
          firstValueFromSources(metricSources(payload), ["count", "submissions"]),
        ) ?? 1)
      );
    }, 0);
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

function hubspotMarketingConversionTimestamp(record: RawSourceRecordRow): Date | null {
  const sources = hubspotMarketingConversionSources(record);
  return firstDateFrom(
    ...valuesFromSources(sources, [
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
    ]),
    record.sourceCreatedAt,
    record.occurredAt,
  );
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
  periodStart: Date,
  asOf: Date,
): boolean {
  if (!recordIsProvider(record, IntegrationProvider.HUBSPOT)) return false;
  if (!recordIsObjectType(record, "contact", "lead")) return false;
  if (!hubspotMarketingLifecycleStageIsConversion(record)) return false;
  const convertedAt = hubspotMarketingConversionTimestamp(record);
  if (!convertedAt) return false;
  return convertedAt.getTime() >= periodStart.getTime() && convertedAt.getTime() <= asOf.getTime();
}

function hubspotLeadConversionCount(
  records: RawSourceRecordRow[],
  periodStart: Date,
  asOf: Date,
): number {
  return new Set(
    records
      .filter((record) => isHubspotMarketingConversionRecord(record, periodStart, asOf))
      .map(hubspotMarketingConversionIdentity),
  ).size;
}

function posthogMarketingEventTimestamp(record: RawSourceRecordRow, asOf: Date): Date | null {
  return (
    posthogEventTimestamp(record) ??
    firstDateAtOrBefore(asOf, record.occurredAt, record.sourceUpdatedAt, record.sourceCreatedAt)
  );
}

function posthogMarketingEventName(record: RawSourceRecordRow): string {
  const payload = asRecord(record.payload);
  return normalizeStageKey(
    firstValueFromSources(wrapperSources(payload), [
      "event",
      "eventName",
      "event_name",
      "name",
      "type",
    ]),
  );
}

function posthogMarketingEvents(
  records: RawSourceRecordRow[],
  periodStart: Date,
  asOf: Date,
): RawSourceRecordRow[] {
  return latestPosthogEventsById(
    records.filter(
      (record) => recordIsProvider(record, IntegrationProvider.POSTHOG) && recordIsObjectType(record, "event"),
    ),
    asOf,
  ).filter((record) => {
    const eventTimestamp = posthogMarketingEventTimestamp(record, asOf);
    if (!eventTimestamp) return false;
    return eventTimestamp.getTime() >= periodStart.getTime() && eventTimestamp.getTime() <= asOf.getTime();
  });
}

const POSTHOG_PAGEVIEW_EVENT_KEYS = new Set([
  "$pageview",
  "pageview",
  "pageviewed",
  "viewedpage",
]);

const POSTHOG_MARKETING_CONVERSION_EVENT_KEYS = new Set([
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

function posthogPageviewEventCount(records: RawSourceRecordRow[]): number {
  return records.filter((record) => POSTHOG_PAGEVIEW_EVENT_KEYS.has(posthogMarketingEventName(record))).length;
}

function posthogMarketingConversionEventCount(records: RawSourceRecordRow[]): number {
  return records.filter((record) => POSTHOG_MARKETING_CONVERSION_EVENT_KEYS.has(posthogMarketingEventName(record))).length;
}

function posthogSnapshotPageviewValue(record: RawSourceRecordRow): number | null {
  if (!recordIsProvider(record, IntegrationProvider.POSTHOG)) return null;
  const payload = asRecord(record.payload);
  return nonNegativeIntegerFrom(
    firstValueFromSources(metricSources(payload), [
      "pageviewCount",
      "pageview_count",
      "pageviews",
      "page_views",
      "posthogPageviews",
      "posthog_pageviews",
    ]),
  );
}

function posthogSnapshotConversionValue(record: RawSourceRecordRow): number | null {
  if (!recordIsProvider(record, IntegrationProvider.POSTHOG)) return null;
  const payload = asRecord(record.payload);
  return nonNegativeIntegerFrom(
    firstValueFromSources(metricSources(payload), [
      "conversionEventCount",
      "conversion_event_count",
      "posthogConversions",
      "posthog_conversions",
      "conversions",
      "conversion_count",
    ]),
  );
}

function posthogSnapshotPageviews(records: RawSourceRecordRow[], asOf: Date): number {
  return latestSnapshotMetric(
    records.filter((record) => recordIsProvider(record, IntegrationProvider.POSTHOG)),
    posthogSnapshotPageviewValue,
    asOf,
  ) ?? 0;
}

function posthogSnapshotConversions(records: RawSourceRecordRow[], asOf: Date): number {
  return latestSnapshotMetric(
    records.filter((record) => recordIsProvider(record, IntegrationProvider.POSTHOG)),
    posthogSnapshotConversionValue,
    asOf,
  ) ?? 0;
}

function searchClicksValue(record: RawSourceRecordRow): number | null {
  if (!recordIsProvider(record, IntegrationProvider.GOOGLE_SEARCH_CONSOLE)) return 0;
  const payload = asRecord(record.payload);
  return nonNegativeIntegerFrom(
    firstValueFromSources(metricSources(payload), [
      "clicks",
      "clickCount",
      "click_count",
      "searchClicks",
      "search_clicks",
    ]),
  );
}

function searchClicks(record: RawSourceRecordRow): number {
  return searchClicksValue(record) ?? 0;
}

function searchImpressionsValue(record: RawSourceRecordRow): number | null {
  if (!recordIsProvider(record, IntegrationProvider.GOOGLE_SEARCH_CONSOLE)) return 0;
  const payload = asRecord(record.payload);
  return nonNegativeIntegerFrom(
    firstValueFromSources(metricSources(payload), [
      "impressions",
      "impressionCount",
      "impression_count",
      "searchImpressions",
      "search_impressions",
    ]),
  );
}

function searchImpressions(record: RawSourceRecordRow): number {
  return searchImpressionsValue(record) ?? 0;
}

function googleSearchConsoleDimensionValue(record: RawSourceRecordRow, keys: string[]): string | null {
  const payload = asRecord(record.payload);
  return normalizeLookup(firstValueFromSources(wrapperSources(payload), keys));
}

function googleSearchConsoleDateDimension(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const value = firstValueFromSources(wrapperSources(payload), [
    "date",
    "rowDate",
    "row_date",
    "startDate",
    "start_date",
    "endDate",
    "end_date",
  ]);
  const parsedDate = dateFrom(value);
  if (parsedDate) return parsedDate.toISOString().slice(0, 10);
  return normalizeLookup(value);
}

function googleSearchConsoleRowDeduplicationKey(record: RawSourceRecordRow): string {
  const dimensions = [
    googleSearchConsoleDimensionValue(record, ["query", "searchQuery", "search_query", "keyword"]),
    googleSearchConsoleDimensionValue(record, ["page", "url", "pageUrl", "page_url", "landingPage", "landing_page"]),
    googleSearchConsoleDateDimension(record),
    googleSearchConsoleDimensionValue(record, ["country", "countryCode", "country_code"]),
    googleSearchConsoleDimensionValue(record, ["device", "deviceCategory", "device_category"]),
    googleSearchConsoleDimensionValue(record, ["searchAppearance", "search_appearance"]),
  ]
    .map((value, index) => (value ? `${index}:${value}` : null))
    .filter((value): value is string => Boolean(value));

  if (dimensions.length >= 2) {
    return `${recordProvider(record) ?? "UNKNOWN"}:${recordObjectType(record)}:${dimensions.join(":")}`;
  }
  return rawRecordDeduplicationKey(record);
}

function latestGoogleSearchConsoleRowsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = googleSearchConsoleRowDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (!current || recordFactTimestampAsOf(record, asOf) >= recordFactTimestampAsOf(current, asOf)) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function isIdentifiedVisitor(record: RawSourceRecordRow): boolean {
  if (!recordIsProvider(record, IntegrationProvider.UNIFY)) return false;
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const nestedSources = sources.flatMap((source) => [
    nestedRecordFromKey(source, "account"),
    nestedRecordFromKey(source, "company"),
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

function identifiedVisitorKey(record: RawSourceRecordRow): string | null {
  if (!isIdentifiedVisitor(record)) return null;
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const nestedSources = sources.flatMap((source) => [
    nestedRecordFromKey(source, "account"),
    nestedRecordFromKey(source, "company"),
  ]);
  const identity = firstValueFromSources([...sources, ...nestedSources], [
    "companyId",
    "company_id",
    "accountId",
    "account_id",
    "companyDomain",
    "company_domain",
    "domain",
    "id",
  ]);
  return normalizeLookup(identity) ?? rawRecordDeduplicationKey(record);
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

function latestSnapshotMetric(
  records: RawSourceRecordRow[],
  metric: (record: RawSourceRecordRow) => number | null,
  asOf: Date,
): number | null {
  return records
    .filter((record) => recordIsObjectType(record, "snapshot"))
    .map((record) => ({
      value: metric(record),
      timestamp: recordFactTimestampAsOf(record, asOf),
    }))
    .filter((entry): entry is { value: number; timestamp: number } => typeof entry.value === "number")
    .reduce<{ value: number; timestamp: number } | null>(
      (latest, entry) => (!latest || entry.timestamp >= latest.timestamp ? entry : latest),
      null,
    )?.value ?? null;
}

function computeMarketingPipelineEfficiency(
  records: RawSourceRecordRow[],
  periodStart: Date,
  asOf: Date,
) {
  const acquisitionSpend = PAID_AD_PROVIDERS.reduce(
    (sum, provider) => sum + acquisitionSpendForProvider(records, provider, asOf),
    0,
  );
  const qualifiedPipeline = latestRecordsByDealId(records.filter(isMarketingPipelineDeal), asOf).reduce(
    (sum, record) => sum + dealAmount(record),
    0,
  );
  const websiteSessions = websiteSessionsCount(records, asOf);
  const organicTraffic = semrushOrganicTraffic(records, asOf);
  const webflowFormSubmissions = webflowFormSubmissionCount(records, asOf);
  const hubspotLeadConversions = hubspotLeadConversionCount(records, periodStart, asOf);
  const posthogEvents = posthogMarketingEvents(records, periodStart, asOf);
  const posthogEventPageviews = posthogPageviewEventCount(posthogEvents);
  const posthogEventConversions = posthogMarketingConversionEventCount(posthogEvents);
  const posthogPageviews = posthogEventPageviews > 0 ? posthogEventPageviews : posthogSnapshotPageviews(records, asOf);
  const posthogConversions =
    posthogEventConversions > 0 ? posthogEventConversions : posthogSnapshotConversions(records, asOf);
  const googleSearchConsoleRecords = records.filter(
    (record) => recordIsProvider(record, IntegrationProvider.GOOGLE_SEARCH_CONSOLE),
  );
  const googleSearchConsoleRows = latestGoogleSearchConsoleRowsById(
    googleSearchConsoleRecords.filter((record) => !recordIsObjectType(record, "snapshot")),
    asOf,
  );
  const snapshotSearchClickCount = latestSnapshotMetric(
    googleSearchConsoleRecords,
    searchClicksValue,
    asOf,
  );
  const snapshotSearchImpressionCount = latestSnapshotMetric(
    googleSearchConsoleRecords,
    searchImpressionsValue,
    asOf,
  );
  const hasGoogleSearchConsoleSnapshotMetric =
    snapshotSearchClickCount !== null || snapshotSearchImpressionCount !== null;
  const searchClickCount = hasGoogleSearchConsoleSnapshotMetric
    ? snapshotSearchClickCount ?? 0
    : googleSearchConsoleRows.reduce((sum, record) => sum + searchClicks(record), 0);
  const searchImpressionCount = hasGoogleSearchConsoleSnapshotMetric
    ? snapshotSearchImpressionCount ?? 0
    : googleSearchConsoleRows.reduce((sum, record) => sum + searchImpressions(record), 0);
  const identifiedVisitors = new Set(
    records.map(identifiedVisitorKey).filter((key): key is string => Boolean(key)),
  ).size;
  const currency = currencyFrom(records);

  return {
    ratio: acquisitionSpend > 0 ? roundRatio(qualifiedPipeline / acquisitionSpend) : null,
    qualifiedPipeline: roundMoney(qualifiedPipeline),
    acquisitionSpend: roundMoney(acquisitionSpend),
    websiteSessions,
    webflowFormSubmissions,
    hubspotLeadConversions,
    posthogPageviews,
    posthogConversions,
    organicTraffic,
    searchClicks: searchClickCount,
    searchImpressions: searchImpressionCount,
    identifiedVisitors,
    currency,
  };
}

function marketingWebsiteTrafficValue(value: ReturnType<typeof computeMarketingPipelineEfficiency>) {
  const count = value.websiteSessions + value.organicTraffic;
  return {
    count: count > 0 ? count : value.searchClicks > 0 ? value.searchClicks : value.posthogPageviews,
    websiteSessions: value.websiteSessions,
    posthogPageviews: value.posthogPageviews,
    organicTraffic: value.organicTraffic,
    searchClicks: value.searchClicks,
    searchImpressions: value.searchImpressions,
  };
}

function marketingConversionRateValue(value: ReturnType<typeof computeMarketingPipelineEfficiency>) {
  const conversions = value.webflowFormSubmissions + value.hubspotLeadConversions + value.posthogConversions;
  const websiteSessions =
    value.websiteSessions > 0
      ? value.websiteSessions
      : value.organicTraffic > 0
        ? value.organicTraffic
        : value.searchClicks > 0
          ? value.searchClicks
          : value.posthogPageviews;
  return {
    rate:
      websiteSessions > 0
        ? roundRatio((conversions / websiteSessions) * 100)
        : null,
    conversions,
    websiteSessions,
    webflowFormSubmissions: value.webflowFormSubmissions,
    hubspotLeadConversions: value.hubspotLeadConversions,
    posthogConversions: value.posthogConversions,
    identifiedVisitors: value.identifiedVisitors,
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
  const queryProviders = [...requiredProviders, IntegrationProvider.META_PAGE, IntegrationProvider.POSTHOG];
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
  const marketingAsOf = earlierDate(inclusivePeriodEnd(input.periodEnd), now);
  const value = computeMarketingPipelineEfficiency(records, input.periodStart, marketingAsOf);
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

  const supplementalMetrics = [
    {
      metricKey: "marketing.website_traffic",
      unit: "count",
      value: marketingWebsiteTrafficValue(value),
      calculationVersion: MARKETING_WEBSITE_TRAFFIC_CALCULATION_VERSION,
    },
    {
      metricKey: "marketing.conversion_rate",
      unit: "percent",
      value: marketingConversionRateValue(value),
      calculationVersion: MARKETING_CONVERSION_RATE_CALCULATION_VERSION,
    },
  ];

  for (const supplementalMetric of supplementalMetrics) {
    const supplementalMetricValue = await upsertCanonicalMetric({
      canonicalMetrics,
      context,
      metricKey: supplementalMetric.metricKey,
      department: "marketing",
      unit: supplementalMetric.unit,
      value: supplementalMetric.value,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status,
      confidence: confidenceFor(records),
      warnings,
      calculationVersion: supplementalMetric.calculationVersion,
      now,
    });
    await replaceLineage({
      metricLineage,
      metricValueId: supplementalMetricValue.id,
      records,
      calculationVersion: supplementalMetric.calculationVersion,
      asOf: now,
    });
  }

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
    nestedRecordFromKey(source, "account"),
    nestedRecordFromKey(source, "company"),
    nestedRecordFromKey(source, "customer"),
  ]);
  const associationSources = sources.flatMap((source) => {
    const associations = nestedRecordFromKey(source, "associations");
    return [
      associations,
      nestedRecordFromKey(associations, "companies"),
      nestedRecordFromKey(associations, "company"),
      nestedRecordFromKey(associations, "accounts"),
      nestedRecordFromKey(associations, "account"),
      nestedRecordFromKey(source, "companies"),
      nestedRecordFromKey(source, "accounts"),
    ];
  });
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
      "accountIds",
      "account_ids",
      "companyIds",
      "company_ids",
      "customerIds",
      "customer_ids",
      "associatedAccountIds",
      "associated_account_ids",
      "associatedCompanyIds",
      "associated_company_ids",
      "associatedCustomerIds",
      "associated_customer_ids",
    ]) ??
    firstValueFromSources(nestedSources, [
      "id",
      "stripeCustomerId",
      "stripe_customer_id",
    ]) ??
    firstValueFromSources(associationSources, [
      "companies",
      "company",
      "accounts",
      "account",
      "results",
      "data",
      "ids",
      "id",
    ]);

  return normalizeFirstLookup(id) ?? normalizeFirstAssociationLookup(id);
}

function statusText(value: unknown, seen = new WeakSet<object>()): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  const candidates = textEnvelopeCandidates(record);
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

function supportClosedAtOrBefore(record: RawSourceRecordRow, asOf: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  return firstDateAtOrBefore(
    asOf,
    ...valuesFromSources(sources, [
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
  ) !== null;
}

function isPylonSupportRecord(record: RawSourceRecordRow): boolean {
  return (
    recordIsProvider(record, IntegrationProvider.PYLON) &&
    recordIsObjectType(record, "conversation", "ticket", "issue")
  );
}

function isCustomerSupportRecord(record: RawSourceRecordRow): boolean {
  return (
    isPylonSupportRecord(record) ||
    (recordIsProvider(record, IntegrationProvider.HUBSPOT) && recordIsObjectType(record, "ticket"))
  );
}

function supportRecordId(record: RawSourceRecordRow): string | null {
  if (!isCustomerSupportRecord(record)) return null;
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const id = firstValueFromSources(sources, [
    "conversationId",
    "conversation_id",
    "ticketId",
    "ticket_id",
    "issueId",
    "issue_id",
    "pylonConversationId",
    "pylon_conversation_id",
    "pylonTicketId",
    "pylon_ticket_id",
    "hubspotTicketId",
    "hubspot_ticket_id",
    "id",
  ]);
  const payloadId = normalizeLookup(id);
  if (payloadId) return payloadId;
  const externalId = normalizeLookup(record.externalId);
  if (externalId) return externalId.split(":").filter(Boolean).pop() ?? externalId;
  return normalizeLookup(record.id);
}

function supportRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestCustomerSupportRecordsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestById = new Map<string, RawSourceRecordRow>();
  const unkeyedRecords: RawSourceRecordRow[] = [];
  for (const record of records) {
    if (!isCustomerSupportRecord(record)) continue;
    const supportId = supportRecordId(record);
    if (!supportId) {
      unkeyedRecords.push(record);
      continue;
    }
    const current = latestById.get(supportId);
    if (!current || supportRevisionTimestampAsOf(record, asOf) >= supportRevisionTimestampAsOf(current, asOf)) {
      latestById.set(supportId, record);
    }
  }
  return [...latestById.values(), ...unkeyedRecords];
}

function isOpenSupportIssue(record: RawSourceRecordRow, asOf: Date): boolean {
  if (!isCustomerSupportRecord(record)) return false;
  if (supportClosedAtOrBefore(record, asOf)) return false;

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
  const supportRecords = sources.map((source) => nestedRecordFromKey(source, "support"));
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
  const dataValue = firstValueFromSources([record], ["data"]);
  const dataRecord = nestedRecord(dataValue);
  const dataAttributesValue = firstValueFromSources([dataRecord], ["attributes"]);
  const dataAttributes = nestedRecord(dataAttributesValue);
  const values = [
    firstValueFromSources([record], ["value"]),
    firstValueFromSources([record], ["tags"]),
    firstValueFromSources([record], ["labels"]),
    firstValueFromSources([record], ["items"]),
    dataValue,
    firstValueFromSources([dataAttributes], ["value"]),
    firstValueFromSources([dataRecord], ["value"]),
    dataAttributesValue,
    nonEmptyRecord(dataRecord),
    nonEmptyRecord(dataAttributes),
    nonEmptyRecord(nestedRecordFromKey(record, "attributes")),
    nonEmptyRecord(nestedRecordFromKey(record, "values")),
    nonEmptyRecord(nestedRecordFromKey(record, "fields")),
  ].flatMap((candidate) => tagValueCandidates(candidate, seen));

  seen.delete(value);
  return values;
}

function normalizedTagValues(value: unknown): string[] {
  return tagValueCandidates(value)
    .map((tag) => normalizeLookup(tag))
    .filter((tag): tag is string => tag !== null);
}

function isEscalation(record: RawSourceRecordRow, asOf: Date): boolean {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  if (
    supportClosedAtOrBefore(record, asOf) ||
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
  const priority =
    normalizeLookup(firstValueFromSources(sources, [
      "priority",
      "ticketPriority",
      "ticket_priority",
      "hs_ticket_priority",
    ])) ?? "";

  if (recordIsProvider(record, IntegrationProvider.SLACK)) {
    const escalationFlag = [
      "escalation",
      "isEscalation",
      "is_escalation",
      "escalated",
      "customerEscalation",
      "customer_escalation",
    ].some((key) => booleanFrom(firstValueFromSources(sources, [key])) === true);
    return (
      escalationFlag ||
      type.includes("escalation") ||
      tags.some((tag) => tag.toLowerCase().includes("escalation"))
    );
  }

  if (isCustomerSupportRecord(record)) {
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
  const activeUsers = observedNonNegativeIntegerFrom(
    firstValueFromSources(sources, [
      "activeUsers",
      "active_users",
      "weeklyActiveUsers",
      "weekly_active_users",
    ]),
  );
  const daysSinceLastActive = observedNonNegativeIntegerFrom(
    firstValueFromSources(sources, [
      "daysSinceLastActive",
      "days_since_last_active",
      "inactiveDays",
      "inactive_days",
    ]),
  );
  const lastActiveAt = firstDateAtOrBefore(
    asOf,
    ...valuesFromSources(sources, [
      "lastActiveAt",
      "last_active_at",
      "lastSeenAt",
      "last_seen_at",
      "lastActivityAt",
      "last_activity_at",
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
      recordIsObjectType(record, "calendar_event", "email_thread", "document", "event", "thread", "file")) ||
    (recordIsProvider(record, IntegrationProvider.SLACK) && recordIsObjectType(record, "message", "thread"));
  if (!supported) return false;

  return Boolean(accountIdFromPayload(record));
}

function collaborationSignalEventId(record: RawSourceRecordRow): string | null {
  if (recordIsProvider(record, IntegrationProvider.SLACK)) {
    return slackCollaborationEventId(record);
  }
  if (recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE)) {
    return googleWorkspaceCollaborationEventId(record);
  }
  return null;
}

function collaborationSignalObjectType(record: RawSourceRecordRow): string {
  return collaborationObjectType(record);
}

function collaborationSignalDeduplicationKey(record: RawSourceRecordRow): string | null {
  if (!isCollaborationSignal(record)) return null;
  const accountId = accountIdFromPayload(record);
  const eventId = collaborationSignalEventId(record);
  if (accountId && eventId) {
    return `${recordProvider(record) ?? "UNKNOWN"}:${collaborationSignalObjectType(record)}:${accountId}:${eventId}`;
  }
  return rawRecordDeduplicationKey(record);
}

function collaborationSignalRevisionTimestampAsOf(record: RawSourceRecordRow, asOf: Date): number {
  return (
    rawRevisionTimestampAsOf(record.sourceUpdatedAt, asOf) ??
    rawRevisionTimestampAsOf(record.occurredAt, asOf) ??
    rawRevisionTimestampAsOf(record.sourceCreatedAt, asOf) ??
    0
  );
}

function latestCollaborationSignalsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = collaborationSignalDeduplicationKey(record);
    if (!key) continue;
    const current = latestByKey.get(key);
    if (
      !current ||
      collaborationSignalRevisionTimestampAsOf(record, asOf) >=
        collaborationSignalRevisionTimestampAsOf(current, asOf)
    ) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function escalationSignalDeduplicationKey(record: RawSourceRecordRow): string {
  const accountId = accountIdFromPayload(record);
  const eventId = collaborationSignalEventId(record);
  if (accountId && eventId) {
    return `${recordProvider(record) ?? "UNKNOWN"}:${collaborationObjectType(record)}:${accountId}:${eventId}`;
  }
  return rawRecordDeduplicationKey(record);
}

function latestEscalationSignalsById(records: RawSourceRecordRow[], asOf: Date): RawSourceRecordRow[] {
  const latestByKey = new Map<string, RawSourceRecordRow>();
  for (const record of records) {
    const key = escalationSignalDeduplicationKey(record);
    const current = latestByKey.get(key);
    if (
      !current ||
      collaborationSignalRevisionTimestampAsOf(record, asOf) >=
        collaborationSignalRevisionTimestampAsOf(current, asOf)
    ) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()];
}

function computeRetentionRisk(records: RawSourceRecordRow[], periodStart: Date, asOf: Date) {
  const supportRecords = latestCustomerSupportRecordsById(records, asOf);
  const supportIssues = supportRecords.filter((record) => isOpenSupportIssue(record, asOf));
  const nonSupportEscalations = latestEscalationSignalsById(
    records.filter((record) => !isCustomerSupportRecord(record) && isEscalation(record, asOf)),
    asOf,
  );
  const escalations = [
    ...supportRecords.filter((record) => isEscalation(record, asOf)),
    ...nonSupportEscalations,
  ];
  const billingRiskRecords = records.filter(isBillingRisk);
  const lowUsageRecords = records.filter((record) => isLowUsage(record, asOf));
  const collaborationSignals = latestCollaborationSignalsById(
    records.filter(
      (record) =>
        !recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE) ||
        collaborationTimestampIsWithinPeriod(record, periodStart, asOf),
    ),
    asOf,
  );
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
        ])
      : null;
  const openSupportIssueCount = pylonSnapshotOpenSupportIssues ?? supportIssues.length;
  const escalationCount = pylonSnapshotEscalations ?? escalations.length;

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
  const score = Math.min(
    100,
    Math.round(
      openSupportIssueCount * 12 +
        escalationCount * 18 +
        billingRiskAccounts.size * 20 +
        lowUsageAccounts.size * 18,
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

function customerSuccessAccountIdentity(record: RawSourceRecordRow): string | null {
  const accountId = accountIdFromPayload(record);
  if (accountId) return accountId;
  if (recordIsProvider(record, IntegrationProvider.STRIPE)) {
    return (
      stripeCustomerId(record) ??
      stripeCustomerEmail(record) ??
      stripeCustomerEmailDomain(record) ??
      stripeSubscriptionId(record)
    );
  }
  if (recordIsProvider(record, IntegrationProvider.HUBSPOT)) {
    return hubspotDealCustomerIdentity(record);
  }
  return null;
}

function customerSuccessAccountIdentities(records: RawSourceRecordRow[]): Set<string> {
  return new Set(
    records
      .map(customerSuccessAccountIdentity)
      .filter((identity): identity is string => Boolean(identity)),
  );
}

function customerSuccessCustomerHealthValue(
  risk: ReturnType<typeof computeRetentionRisk>,
  records: RawSourceRecordRow[],
) {
  const accountCount = customerSuccessAccountIdentities(records).size;
  return {
    score: Math.max(0, 100 - risk.score),
    riskScore: risk.score,
    accountCount,
    healthyAccounts: Math.max(0, accountCount - risk.atRiskAccounts),
    atRiskAccounts: risk.atRiskAccounts,
    openSupportIssues: risk.openSupportIssues,
    escalations: risk.escalations,
    accountsWithBillingRisk: risk.accountsWithBillingRisk,
    lowUsageAccounts: risk.lowUsageAccounts,
  };
}

function isPosthogCustomerUsageRecord(record: RawSourceRecordRow): boolean {
  return (
    recordIsProvider(record, IntegrationProvider.POSTHOG) &&
    Boolean(accountIdFromPayload(record)) &&
    recordIsObjectType(
      record,
      "account_usage",
      "account_activity",
      "customer_activity",
      "product_usage",
      "user_activity",
      "event",
    )
  );
}

function customerSuccessCustomerActivityValue(
  records: RawSourceRecordRow[],
  periodStart: Date,
  asOf: Date,
) {
  const supportRecords = latestCustomerSupportRecordsById(records, asOf);
  const supportInteractions = supportRecords.length;
  const productUsageRecords = records.filter(isPosthogCustomerUsageRecord);
  const collaborationSignals = latestCollaborationSignalsById(
    records.filter(
      (record) =>
        !recordIsProvider(record, IntegrationProvider.GOOGLE_WORKSPACE) ||
        collaborationTimestampIsWithinPeriod(record, periodStart, asOf),
    ),
    asOf,
  );
  const activeAccountIds = customerSuccessAccountIdentities([
    ...productUsageRecords,
    ...collaborationSignals,
    ...supportRecords,
  ]);

  return {
    count: supportInteractions + productUsageRecords.length + collaborationSignals.length,
    supportInteractions,
    productUsageRecords: productUsageRecords.length,
    collaborationSignals: collaborationSignals.length,
    activeAccounts: activeAccountIds.size,
  };
}

function isActiveStripeCustomerRecord(record: RawSourceRecordRow, asOf: Date): boolean {
  return (
    recordIsProvider(record, IntegrationProvider.STRIPE) &&
    recordIsObjectType(record, "subscription") &&
    !isInactiveStripeSubscription(record, asOf) &&
    !isFutureTrialStripeSubscription(record, asOf) &&
    !isFutureStartStripeSubscription(record, asOf)
  );
}

function stripeSubscriptionCancellationAt(record: RawSourceRecordRow): Date | null {
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const stripeSources = [...sources, ...subscriptionSources];
  return firstDateFrom(
    ...valuesFromSources(stripeSources, [
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

function isChurnedStripeCustomerRecord(
  record: RawSourceRecordRow,
  periodStart: Date,
  asOf: Date,
): boolean {
  if (!recordIsProvider(record, IntegrationProvider.STRIPE) || !recordIsObjectType(record, "subscription")) {
    return false;
  }

  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const subscriptionSources = sources.map((source) => nestedRecordFromKey(source, "subscription"));
  const status = normalizeStageKey(firstValueFromSources([...sources, ...subscriptionSources], ["status"]));
  const cancellationAt = stripeSubscriptionCancellationAt(record);
  if (cancellationAt) {
    return cancellationAt.getTime() >= periodStart.getTime() && cancellationAt.getTime() <= asOf.getTime();
  }
  if (!["canceled", "cancelled"].includes(status)) return false;

  const churnedAt = stripeSubscriptionInactiveAt(record);
  if (!churnedAt) return recordFactTimestampAsOf(record, asOf) >= periodStart.getTime();
  return churnedAt.getTime() >= periodStart.getTime() && churnedAt.getTime() <= asOf.getTime();
}

function isActiveHubspotCustomerRecord(record: RawSourceRecordRow, asOf: Date): boolean {
  return (
    recordIsProvider(record, IntegrationProvider.HUBSPOT) &&
    recordIsObjectType(record, "deal", "subscription_deal") &&
    Boolean(hubspotRecurringRevenueAsOf(record, asOf))
  );
}

function isChurnedHubspotCustomerRecord(
  record: RawSourceRecordRow,
  periodStart: Date,
  asOf: Date,
): boolean {
  if (
    !recordIsProvider(record, IntegrationProvider.HUBSPOT) ||
    !recordIsObjectType(record, "deal", "company", "customer", "account")
  ) {
    return false;
  }
  const payload = asRecord(record.payload);
  const sources = wrapperSources(payload);
  const lifecycleSources = sources.flatMap((source) => [
    source,
    nestedRecordFromKey(source, "company"),
    nestedRecordFromKey(source, "customer"),
    nestedRecordFromKey(source, "account"),
    nestedRecordFromKey(source, "lifecycle"),
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

  const churnedAt = firstDateAtOrBefore(
    asOf,
    ...valuesFromSources(lifecycleSources, [
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
  );
  if (!churnedAt) return recordFactTimestampAsOf(record, asOf) >= periodStart.getTime();
  return churnedAt.getTime() >= periodStart.getTime();
}

function customerSuccessRetentionCounts(
  records: RawSourceRecordRow[],
  periodStart: Date,
  asOf: Date,
) {
  const retainedCustomerIds = new Set<string>();
  const churnedCustomerIds = new Set<string>();

  for (const record of records) {
    const identity = customerSuccessAccountIdentity(record);
    if (!identity) continue;
    if (isChurnedStripeCustomerRecord(record, periodStart, asOf) || isChurnedHubspotCustomerRecord(record, periodStart, asOf)) {
      churnedCustomerIds.add(identity);
      continue;
    }
    if (isActiveStripeCustomerRecord(record, asOf) || isActiveHubspotCustomerRecord(record, asOf)) {
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
    customerBase,
    churnedCustomers,
    retainedCustomers,
  };
}

function customerSuccessChurnRateValue(
  records: RawSourceRecordRow[],
  periodStart: Date,
  asOf: Date,
) {
  const counts = customerSuccessRetentionCounts(records, periodStart, asOf);
  return {
    rate: counts.customerBase > 0 ? roundRatio((counts.churnedCustomers / counts.customerBase) * 100) : null,
    churnedCustomers: counts.churnedCustomers,
    retainedCustomers: counts.retainedCustomers,
    customerBase: counts.customerBase,
  };
}

function customerSuccessRetentionRateValue(
  records: RawSourceRecordRow[],
  periodStart: Date,
  asOf: Date,
) {
  const counts = customerSuccessRetentionCounts(records, periodStart, asOf);
  return {
    rate: counts.customerBase > 0 ? roundRatio((counts.retainedCustomers / counts.customerBase) * 100) : null,
    retainedCustomers: counts.retainedCustomers,
    churnedCustomers: counts.churnedCustomers,
    customerBase: counts.customerBase,
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
  const queryProviders = [...requiredProviders, IntegrationProvider.HUBSPOT];
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
  const value = computeRetentionRisk(records, input.periodStart, now);
  const confidence = confidenceFor(records);
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
    confidence,
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

  const supplementalMetrics = [
    {
      metricKey: "customer_success.customer_health",
      unit: "score",
      value: customerSuccessCustomerHealthValue(value, records),
      calculationVersion: CUSTOMER_SUCCESS_CUSTOMER_HEALTH_CALCULATION_VERSION,
    },
    {
      metricKey: "customer_success.customer_activity",
      unit: "count",
      value: customerSuccessCustomerActivityValue(records, input.periodStart, now),
      calculationVersion: CUSTOMER_SUCCESS_CUSTOMER_ACTIVITY_CALCULATION_VERSION,
    },
    {
      metricKey: "customer_success.churn_rate",
      unit: "percent",
      value: customerSuccessChurnRateValue(records, input.periodStart, now),
      calculationVersion: CUSTOMER_SUCCESS_CHURN_RATE_CALCULATION_VERSION,
    },
    {
      metricKey: "customer_success.retention_rate",
      unit: "percent",
      value: customerSuccessRetentionRateValue(records, input.periodStart, now),
      calculationVersion: CUSTOMER_SUCCESS_RETENTION_RATE_CALCULATION_VERSION,
    },
  ];

  for (const supplementalMetric of supplementalMetrics) {
    const supplementalMetricValue = await upsertCanonicalMetric({
      canonicalMetrics,
      context,
      metricKey: supplementalMetric.metricKey,
      department: "customer-success",
      unit: supplementalMetric.unit,
      value: supplementalMetric.value,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status,
      confidence,
      warnings,
      calculationVersion: supplementalMetric.calculationVersion,
      now,
    });
    await replaceLineage({
      metricLineage,
      metricValueId: supplementalMetricValue.id,
      records,
      calculationVersion: supplementalMetric.calculationVersion,
      asOf: now,
    });
  }

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

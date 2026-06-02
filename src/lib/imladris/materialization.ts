import {
  ImladrisMetricStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
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
  "incompleteexpired",
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
  IntegrationProvider.REDDIT,
] as const;

interface ImladrisActorContext {
  userId: string | null;
  organizationId: string | null;
}

interface RawSourceRecordRow {
  id: string;
  provider: IntegrationProvider;
  objectType: string;
  externalId: string;
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
  return asRecord(value);
}

function dateFrom(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / 86_400_000);
}

function isCompletedLinearIssue(record: RawSourceRecordRow): boolean {
  const payload = asRecord(record.payload);
  const state = payload.state;
  const completedStateNames = ["done", "completed", "complete"];
  if (typeof state === "string") {
    return completedStateNames.includes(state.trim().toLowerCase());
  }
  const stateRecord = nestedRecord(state);
  const stateType = stateRecord.type;
  if (typeof stateType === "string" && stateType.trim().toLowerCase() === "completed") {
    return true;
  }
  const stateName = stateRecord.name;
  if (typeof stateName === "string" && completedStateNames.includes(stateName.trim().toLowerCase())) {
    return true;
  }
  return Boolean(payload.completedAt ?? payload.completed_at);
}

function linearCycleTimeDays(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  return daysBetween(
    dateFrom(payload.createdAt ?? payload.created_at ?? record.sourceCreatedAt),
    dateFrom(payload.completedAt ?? payload.completed_at ?? record.occurredAt ?? record.sourceUpdatedAt),
  );
}

function isMergedPullRequest(record: RawSourceRecordRow): boolean {
  const payload = asRecord(record.payload);
  return payload.merged === true || Boolean(payload.mergedAt ?? payload.merged_at);
}

function sourceKeyForProvider(
  provider: IntegrationProvider,
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
  switch (provider) {
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
    default:
      return "posthog";
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeDeliveryHealth(records: RawSourceRecordRow[]) {
  const linearIssues = records.filter(
    (record) => record.provider === IntegrationProvider.LINEAR && record.objectType === "issue",
  );
  const completedLinearIssues = linearIssues.filter(isCompletedLinearIssue);
  const mergedPullRequests = records.filter(
    (record) =>
      record.provider === IntegrationProvider.GITHUB &&
      record.objectType === "pull_request" &&
      isMergedPullRequest(record),
  );
  const productEvents = records.filter(
    (record) => record.provider === IntegrationProvider.POSTHOG && record.objectType === "event",
  );
  const cycleTimes = completedLinearIssues
    .map(linearCycleTimeDays)
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
  const providerCount = new Set(records.map((record) => record.provider)).size;
  return Math.min(0.95, Number((0.55 + providerCount * 0.12).toFixed(2)));
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    const withoutCurrency = trimmed.replace(/[$,\s]/g, "");
    const normalized = /^\(.+\)$/.test(withoutCurrency)
      ? `-${withoutCurrency.slice(1, -1)}`
      : withoutCurrency;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function currencyFrom(records: RawSourceRecordRow[]): string {
  for (const record of records) {
    const payload = asRecord(record.payload);
    const properties = nestedRecord(payload.properties);
    const summary = nestedRecord(payload.summary);
    const metrics = nestedRecord(payload.metrics);
    const currency =
      payload.currency ??
      payload.currencyCode ??
      payload.currency_code ??
      properties.currency ??
      properties.currencyCode ??
      properties.currency_code ??
      properties.hs_currency ??
      summary.currency ??
      summary.currencyCode ??
      summary.currency_code ??
      metrics.currency ??
      metrics.currencyCode ??
      metrics.currency_code;
    if (typeof currency === "string" && currency.trim()) {
      return currency.toUpperCase();
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
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim();
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
  const [, domain] = email.split("@");
  const normalized = normalizeLookup(domain);
  if (!normalized || GENERIC_EMAIL_DOMAINS.has(normalized)) return null;
  return normalized;
}

function scopeKeyForContext(context: ImladrisActorContext): string {
  if (context.organizationId) return `org:${context.organizationId}`;
  if (context.userId) return `user:${context.userId}`;
  return "global";
}

function providerWindowWhere(input: {
  providers: IntegrationProvider[];
  context: ImladrisActorContext;
  periodStart: Date;
  periodEnd: Date;
}) {
  return {
    provider: {
      in: input.providers,
    },
    scopeKey: scopeKeyForContext(input.context),
    OR: [
      { userId: input.context.userId },
      ...(input.context.organizationId
        ? [{ organizationId: input.context.organizationId }]
        : []),
    ],
    AND: [
      {
        OR: [
          { occurredAt: { gte: input.periodStart, lte: input.periodEnd } },
          { sourceUpdatedAt: { gte: input.periodStart, lte: input.periodEnd } },
        ],
      },
    ],
  };
}

async function replaceLineage(input: {
  metricLineage: MetricLineageDelegate;
  metricValueId: string;
  records: RawSourceRecordRow[];
  calculationVersion: string;
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
      sourceType: record.objectType,
      sourceId: record.externalId,
      capturedAt: dateFrom(record.occurredAt ?? record.sourceUpdatedAt),
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

  const records = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: [
        IntegrationProvider.LINEAR,
        IntegrationProvider.GITHUB,
        IntegrationProvider.POSTHOG,
      ],
      context: input.context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });

  const value = computeDeliveryHealth(records);
  const status =
    records.length > 0 ? ImladrisMetricStatus.READY : ImladrisMetricStatus.MISSING;
  const warnings =
    records.length > 0
      ? []
      : ["No Linear, GitHub, or PostHog raw records were available for this period."];
  const metricValue = await canonicalMetrics.upsert({
    where: {
      organizationId_userId_metricKey_periodEnd_calculationVersion: {
        organizationId: input.context.organizationId,
        userId: input.context.userId,
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
      computedAt: input.now ?? new Date(),
      userId: input.context.userId,
      organizationId: input.context.organizationId,
    },
    update: {
      value,
      periodStart: input.periodStart,
      status,
      confidence: confidenceFor(records),
      warnings,
      computedAt: input.now ?? new Date(),
    },
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: DEVELOPMENT_CALCULATION_VERSION,
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
  if (!["company", "account", "contact"].includes(record.objectType)) return null;
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const id =
    payload.companyId ??
    payload.company_id ??
    payload.accountId ??
    payload.account_id ??
    payload.id ??
    properties.companyId ??
    properties.company_id ??
    properties.accountId ??
    properties.account_id ??
    properties.hs_object_id ??
    properties.id;
  return normalizeIdentifier(id) ?? normalizeIdentifier(record.externalId);
}

function activationAccountId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const id =
    properties.hubspotCompanyId ??
    properties.hubspot_company_id ??
    properties.companyId ??
    properties.company_id ??
    properties.accountId ??
    properties.account_id ??
    payload.accountId ??
    payload.account_id ??
    payload.companyId ??
    payload.company_id ??
    payload.distinct_id;
  return normalizeIdentifier(id);
}

function isActivationEvent(record: RawSourceRecordRow): boolean {
  if (record.provider !== IntegrationProvider.POSTHOG || record.objectType !== "event") {
    return false;
  }
  const eventName = asRecord(record.payload).event;
  return (
    typeof eventName === "string" &&
    ["activation_completed", "activated", "account_activated"].includes(
      eventName.trim().toLowerCase(),
    )
  );
}

function computeActivationRate(records: RawSourceRecordRow[]) {
  const eligibleAccountIds = new Set(
    records
      .filter((record) => record.provider === IntegrationProvider.HUBSPOT)
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

  const records = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: [IntegrationProvider.HUBSPOT, IntegrationProvider.POSTHOG],
      context: input.context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });

  const value = computeActivationRate(records);
  const status =
    value.eligibleAccounts > 0
      ? ImladrisMetricStatus.READY
      : ImladrisMetricStatus.MISSING;
  const warnings =
    status === ImladrisMetricStatus.READY
      ? []
      : ["No HubSpot account cohort was available for activation-rate materialization."];
  const metricValue = await canonicalMetrics.upsert({
    where: {
      organizationId_userId_metricKey_periodEnd_calculationVersion: {
        organizationId: input.context.organizationId,
        userId: input.context.userId,
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
      computedAt: input.now ?? new Date(),
      userId: input.context.userId,
      organizationId: input.context.organizationId,
    },
    update: {
      value,
      periodStart: input.periodStart,
      status,
      confidence: confidenceFor(records),
      warnings,
      computedAt: input.now ?? new Date(),
    },
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: PRODUCT_ACTIVATION_CALCULATION_VERSION,
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
  const properties = nestedRecord(payload.properties);
  return numberFrom(
    payload.amount ??
      payload.netAmount ??
      payload.net_amount ??
      payload.value ??
      properties.amount ??
      properties.netAmount ??
      properties.net_amount ??
      properties.value,
  );
}

function balanceAmount(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  return numberFrom(
    payload.availableBalance ??
      payload.available_balance ??
      payload.currentBalance ??
      payload.current_balance ??
      payload.balance ??
      properties.availableBalance ??
      properties.available_balance ??
      properties.currentBalance ??
      properties.current_balance ??
      properties.balance,
  );
}

function stripeMrrAmount(record: RawSourceRecordRow): number | null {
  const payload = asRecord(record.payload);
  if (isInactiveStripeSubscription(record)) return null;
  return numberFrom(
    payload.monthlyRecurringRevenue ??
      payload.monthly_recurring_revenue ??
      payload.mrr ??
      payload.amountMonthly ??
      payload.amount_monthly,
  );
}

function isInactiveStripeSubscription(record: RawSourceRecordRow): boolean {
  const payload = asRecord(record.payload);
  const status = payload.status;
  return INACTIVE_STRIPE_SUBSCRIPTION_STATUSES.has(normalizeStageKey(status));
}

function stripeCustomerId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const customer = asRecord(payload.customer);
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
  const customer = asRecord(payload.customer);
  return normalizeLookup(
    payload.customerEmail ??
      payload.customer_email ??
      payload.email ??
      customer.email,
  );
}

function stripeCustomerEmailDomain(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const explicitDomain = normalizeLookup(payload.emailDomain ?? payload.email_domain);
  if (explicitDomain && !GENERIC_EMAIL_DOMAINS.has(explicitDomain)) return explicitDomain;
  return normalizeEmailDomain(stripeCustomerEmail(record));
}

function hubspotDealEmail(record: RawSourceRecordRow): string | null {
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

function hubspotDealEmailDomain(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const explicitDomain = normalizeLookup(
    payload.emailDomain ??
      payload.email_domain ??
      payload.companyDomain ??
      payload.company_domain ??
      payload.domain ??
      properties.companyDomain ??
      properties.domain,
  );
  if (explicitDomain && !GENERIC_EMAIL_DOMAINS.has(explicitDomain)) return explicitDomain;
  return normalizeEmailDomain(hubspotDealEmail(record));
}

function hubspotStripeCustomerId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  return normalizeLookup(
    payload.stripeCustomerId ??
      payload.stripe_customer_id ??
      payload.customerId ??
      payload.customer_id ??
      properties.stripeCustomerId ??
      properties.stripe_customer_id,
  );
}

function isLinkedHubspotDeal(
  record: RawSourceRecordRow,
  stripeRefs: {
    customerIds: Set<string>;
    emails: Set<string>;
    domains: Set<string>;
  },
): boolean {
  const customerId = hubspotStripeCustomerId(record);
  const email = hubspotDealEmail(record);
  const emailDomain = hubspotDealEmailDomain(record);
  return (
    Boolean(customerId && stripeRefs.customerIds.has(customerId)) ||
    Boolean(email && stripeRefs.emails.has(email)) ||
    Boolean(emailDomain && stripeRefs.domains.has(emailDomain))
  );
}

function hubspotRecurringRevenue(record: RawSourceRecordRow): {
  mrr: number;
  arr: number;
} | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const stage = normalizeStageKey(
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
  if (stage && !["closedwon", "won"].includes(stage)) {
    return null;
  }
  const recurringFlag =
    payload.recurringRevenue ??
    payload.recurring_revenue ??
    properties.recurringRevenue ??
    properties.recurring_revenue;
  if (recurringFlag === false) return null;
  const explicitMrr = numberFrom(
    payload.monthlyRecurringRevenue ??
      payload.monthly_recurring_revenue ??
      payload.mrr ??
      payload.amountMonthly ??
      payload.amount_monthly ??
      properties.monthlyRecurringRevenue ??
      properties.monthly_recurring_revenue ??
      properties.mrr ??
      properties.amountMonthly ??
      properties.amount_monthly,
  );
  if (explicitMrr !== null) {
    const mrr = Math.max(0, explicitMrr);
    return { mrr, arr: mrr * 12 };
  }
  const annualValue = numberFrom(
    payload.recurringRevenueAmount ??
      payload.recurring_revenue_amount ??
      payload.annualRecurringRevenue ??
      payload.annual_recurring_revenue ??
      payload.arr ??
      payload.amount ??
      properties.recurringRevenueAmount ??
      properties.recurring_revenue_amount ??
      properties.annualRecurringRevenue ??
      properties.annual_recurring_revenue ??
      properties.arr ??
      properties.amount,
  );
  if (annualValue === null) return null;
  const arr = Math.max(0, annualValue);
  return { mrr: arr / 12, arr };
}

function buildStripeRefs(records: RawSourceRecordRow[]) {
  const stripeRecords = records.filter(
    (record) =>
      record.provider === IntegrationProvider.STRIPE &&
      (record.objectType === "active_customer_ref" ||
        (record.objectType === "subscription" && !isInactiveStripeSubscription(record))),
  );
  return {
    customerIds: new Set(
      stripeRecords.map(stripeCustomerId).filter((value): value is string => Boolean(value)),
    ),
    emails: new Set(
      stripeRecords.map(stripeCustomerEmail).filter((value): value is string => Boolean(value)),
    ),
    domains: new Set(
      stripeRecords.map(stripeCustomerEmailDomain).filter((value): value is string => Boolean(value)),
    ),
  };
}

function computeMrrBreakdown(records: RawSourceRecordRow[]) {
  const stripeMrr = records
    .filter((record) => record.provider === IntegrationProvider.STRIPE)
    .reduce((sum, record) => sum + (stripeMrrAmount(record) ?? 0), 0);
  const stripeArr = stripeMrr * 12;
  const stripeRefs = buildStripeRefs(records);
  let hubspotSubscriptionMrr = 0;
  let hubspotSubscriptionArr = 0;
  let hubspotOnlySubscriptionMrr = 0;
  let hubspotOnlySubscriptionArr = 0;
  let excludedLinkedHubspotSubscriptionMrr = 0;
  let excludedLinkedHubspotSubscriptionArr = 0;

  for (const record of records) {
    if (
      record.provider !== IntegrationProvider.HUBSPOT ||
      !["deal", "subscription_deal"].includes(record.objectType)
    ) {
      continue;
    }
    const recurringRevenue = hubspotRecurringRevenue(record);
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

function computeFinanceValues(records: RawSourceRecordRow[]) {
  const mercuryTransactions = records.filter(
    (record) =>
      record.provider === IntegrationProvider.MERCURY &&
      ["transaction", "bank_transaction"].includes(record.objectType),
  );
  const cashOutflow = mercuryTransactions.reduce((sum, record) => {
    const amount = transactionAmount(record);
    return amount && amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
  const mercuryCashInflow = mercuryTransactions.reduce((sum, record) => {
    const amount = transactionAmount(record);
    return amount && amount > 0 ? sum + amount : sum;
  }, 0);
  const stripeMrr = records
    .filter((record) => record.provider === IntegrationProvider.STRIPE)
    .reduce((sum, record) => sum + (stripeMrrAmount(record) ?? 0), 0);
  const mrr = computeMrrBreakdown(records);
  const cashInflow = mercuryCashInflow + stripeMrr;
  const netBurn = Math.max(0, cashOutflow - cashInflow);
  const cashBalance =
    records
      .filter(
        (record) =>
          record.provider === IntegrationProvider.MERCURY &&
          ["account_balance", "balance"].includes(record.objectType),
      )
      .map(balanceAmount)
      .filter((amount): amount is number => typeof amount === "number")
      .at(-1) ?? 0;
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
  return input.canonicalMetrics.upsert({
    where: {
      organizationId_userId_metricKey_periodEnd_calculationVersion: {
        organizationId: input.context.organizationId,
        userId: input.context.userId,
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
      userId: input.context.userId,
      organizationId: input.context.organizationId,
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

  const records = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: [
        IntegrationProvider.MERCURY,
        IntegrationProvider.STRIPE,
        IntegrationProvider.HUBSPOT,
      ],
      context: input.context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const values = computeFinanceValues(records);
  const confidence = confidenceFor(records);
  const status =
    records.length > 0 ? ImladrisMetricStatus.READY : ImladrisMetricStatus.MISSING;
  const warnings =
    status === ImladrisMetricStatus.READY
      ? []
      : ["No Mercury, Stripe, or HubSpot raw records were available for finance materialization."];
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
      now: input.now,
    });
    await replaceLineage({
      metricLineage,
      metricValueId: metricValue.id,
      records,
      calculationVersion: metricInput.calculationVersion,
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
  if (record.provider !== IntegrationProvider.HUBSPOT || record.objectType !== "deal") {
    return false;
  }
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const stage = normalizeStageKey(
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
  if (TERMINAL_DEAL_STAGE_KEYS.has(stage) || stage === "appointmentscheduled") {
    return false;
  }
  return [
    "qualified",
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
  const properties = nestedRecord(payload.properties);
  return numberFrom(payload.amount ?? properties.amount) ?? 0;
}

function dealIdFromRecord(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const id =
    payload.dealId ??
    payload.deal_id ??
    payload.hubspotDealId ??
    payload.hubspot_deal_id ??
    payload.id ??
    properties.dealId ??
    properties.deal_id ??
    properties.hubspotDealId ??
    properties.hubspot_deal_id ??
    properties.hs_object_id ??
    properties.id;
  return normalizeIdentifier(id) ?? normalizeIdentifier(record.externalId);
}

function linkedDealId(record: RawSourceRecordRow): string | null {
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const id =
    payload.dealId ??
    payload.deal_id ??
    payload.hubspotDealId ??
    payload.hubspot_deal_id ??
    properties.dealId ??
    properties.deal_id ??
    properties.hubspotDealId ??
    properties.hubspot_deal_id;
  return normalizeIdentifier(id);
}

function computeQualifiedPipeline(records: RawSourceRecordRow[]) {
  const qualifiedDeals = records.filter(isQualifiedPipelineDeal);
  const qualifiedDealIds = new Set(
    qualifiedDeals.map(dealIdFromRecord).filter((id): id is string => Boolean(id)),
  );
  const collaborationTouches = records.filter((record) => {
    if (
      record.provider !== IntegrationProvider.GOOGLE_WORKSPACE &&
      record.provider !== IntegrationProvider.SLACK
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

  const records = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: [
        IntegrationProvider.HUBSPOT,
        IntegrationProvider.GOOGLE_WORKSPACE,
        IntegrationProvider.SLACK,
      ],
      context: input.context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const value = computeQualifiedPipeline(records);
  const status =
    records.length > 0 ? ImladrisMetricStatus.READY : ImladrisMetricStatus.MISSING;
  const warnings =
    status === ImladrisMetricStatus.READY
      ? []
      : ["No HubSpot, Google Workspace, or Slack raw records were available for sales materialization."];
  const metricValue = await upsertCanonicalMetric({
    canonicalMetrics,
    context: input.context,
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
    now: input.now,
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: SALES_QUALIFIED_PIPELINE_CALCULATION_VERSION,
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
  const properties = nestedRecord(payload.properties);
  const summary = nestedRecord(payload.summary);
  const metrics = nestedRecord(payload.metrics);
  const costMicros = numberFrom(
    payload.costMicros ??
      payload.cost_micros ??
      payload.spendMicros ??
      payload.spend_micros ??
      payload.totalSpendMicros ??
      payload.total_spend_micros ??
      properties.costMicros ??
      properties.cost_micros ??
      properties.spendMicros ??
      properties.spend_micros ??
      properties.totalSpendMicros ??
      properties.total_spend_micros ??
      summary.costMicros ??
      summary.cost_micros ??
      summary.spendMicros ??
      summary.spend_micros ??
      summary.totalSpendMicros ??
      summary.total_spend_micros ??
      metrics.costMicros ??
      metrics.cost_micros,
  );
  if (costMicros !== null) {
    return costMicros / 1_000_000;
  }
  return numberFrom(
    payload.totalSpend30d ??
      payload.total_spend_30d ??
      payload.totalSpend ??
      payload.total_spend ??
      payload.spend ??
      payload.amountSpent ??
      payload.amount_spent ??
      payload.cost ??
      properties.totalSpend30d ??
      properties.total_spend_30d ??
      properties.totalSpend ??
      properties.total_spend ??
      properties.spend ??
      properties.amountSpent ??
      properties.amount_spent ??
      properties.cost ??
      summary.totalSpend30d ??
      summary.total_spend_30d ??
      summary.totalSpend ??
      summary.total_spend ??
      summary.spend ??
      summary.cost ??
      metrics.totalSpend30d ??
      metrics.total_spend_30d ??
      metrics.totalSpend ??
      metrics.total_spend ??
      metrics.spend ??
      metrics.cost,
  );
}

function acquisitionSpendForProvider(
  records: RawSourceRecordRow[],
  provider: (typeof PAID_AD_PROVIDERS)[number],
): number {
  const providerRecords = records.filter((record) => record.provider === provider);
  const snapshotAmounts = providerRecords
    .filter((record) => record.objectType === "snapshot")
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
  const properties = nestedRecord(payload.properties);
  const summary = nestedRecord(payload.summary);
  const metrics = nestedRecord(payload.metrics);
  return numberFrom(
    payload.sessions30d ??
      payload.sessions_30d ??
      payload.sessions ??
      payload.users30d ??
      payload.users_30d ??
      payload.users ??
      payload.activeUsers ??
      payload.active_users ??
      properties.sessions30d ??
      properties.sessions_30d ??
      properties.sessions ??
      properties.users30d ??
      properties.users_30d ??
      properties.users ??
      properties.activeUsers ??
      properties.active_users ??
      summary.sessions30d ??
      summary.sessions_30d ??
      summary.sessions ??
      summary.users30d ??
      summary.users_30d ??
      summary.users ??
      summary.activeUsers ??
      summary.active_users ??
      metrics.sessions30d ??
      metrics.sessions_30d ??
      metrics.sessions ??
      metrics.users30d ??
      metrics.users_30d ??
      metrics.users ??
      metrics.activeUsers ??
      metrics.active_users,
  );
}

function websiteSessionsCount(records: RawSourceRecordRow[]): number {
  const googleAnalyticsRecords = records.filter(
    (record) => record.provider === IntegrationProvider.GOOGLE_ANALYTICS,
  );
  const snapshotCounts = googleAnalyticsRecords
    .filter((record) => record.objectType === "snapshot")
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
  const properties = nestedRecord(payload.properties);
  const summary = nestedRecord(payload.summary);
  const metrics = nestedRecord(payload.metrics);
  return numberFrom(
    payload.organicTraffic ??
      payload.organic_traffic ??
      payload.traffic ??
      payload.visits ??
      properties.organicTraffic ??
      properties.organic_traffic ??
      properties.traffic ??
      properties.visits ??
      summary.organicTraffic ??
      summary.organic_traffic ??
      summary.traffic ??
      summary.visits ??
      metrics.organicTraffic ??
      metrics.organic_traffic ??
      metrics.traffic ??
      metrics.visits,
  );
}

function semrushOrganicTraffic(records: RawSourceRecordRow[]): number {
  const semrushRecords = records.filter(
    (record) => record.provider === IntegrationProvider.SEMRUSH,
  );
  const snapshotCounts = semrushRecords
    .filter((record) => record.objectType === "snapshot")
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
  const webflowRecords = records.filter((record) => record.provider === IntegrationProvider.WEBFLOW);
  const snapshotCounts = webflowRecords
    .filter((record) => record.objectType === "snapshot")
    .map((record) => {
      const payload = asRecord(record.payload);
      const properties = nestedRecord(payload.properties);
      const summary = nestedRecord(payload.summary);
      const metrics = nestedRecord(payload.metrics);
      return numberFrom(
        payload.totalFormSubmissions ??
          payload.total_form_submissions ??
          properties.totalFormSubmissions ??
          properties.total_form_submissions ??
          summary.totalFormSubmissions ??
          summary.total_form_submissions ??
          metrics.totalFormSubmissions ??
          metrics.total_form_submissions,
      );
    })
    .filter((count): count is number => typeof count === "number");
  if (snapshotCounts.length > 0) {
    return snapshotCounts.reduce((sum, count) => sum + count, 0);
  }

  return webflowRecords
    .filter((record) => record.objectType === "form_submission")
    .reduce((sum, record) => {
      const payload = asRecord(record.payload);
      return sum + (numberFrom(payload.count ?? payload.submissions) ?? 0);
    }, 0);
}

function searchClicks(record: RawSourceRecordRow): number {
  if (record.provider !== IntegrationProvider.GOOGLE_SEARCH_CONSOLE) return 0;
  return numberFrom(asRecord(record.payload).clicks) ?? 0;
}

function searchImpressions(record: RawSourceRecordRow): number {
  if (record.provider !== IntegrationProvider.GOOGLE_SEARCH_CONSOLE) return 0;
  return numberFrom(asRecord(record.payload).impressions) ?? 0;
}

function isIdentifiedVisitor(record: RawSourceRecordRow): boolean {
  if (record.provider !== IntegrationProvider.UNIFY) return false;
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const payloadAccount = nestedRecord(payload.account);
  const payloadCompany = nestedRecord(payload.company);
  const propertiesAccount = nestedRecord(properties.account);
  const propertiesCompany = nestedRecord(properties.company);
  const identified = payload.identified ?? properties.identified;
  if (identified !== null && identified !== undefined) return Boolean(identified);
  return Boolean(
    payload.companyId ??
      payload.company_id ??
      payload.accountId ??
      payload.account_id ??
      payload.companyDomain ??
      payload.company_domain ??
      payload.domain ??
      properties.companyId ??
      properties.company_id ??
      properties.accountId ??
      properties.account_id ??
      properties.companyDomain ??
      properties.company_domain ??
      properties.domain ??
      payloadAccount.id ??
      payloadAccount.domain ??
      payloadCompany.id ??
      payloadCompany.domain ??
      propertiesAccount.id ??
      propertiesAccount.domain ??
      propertiesCompany.id ??
      propertiesCompany.domain,
  );
}

function isMarketingPipelineDeal(record: RawSourceRecordRow): boolean {
  if (record.provider !== IntegrationProvider.HUBSPOT || record.objectType !== "deal") {
    return false;
  }
  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const stage = normalizeStageKey(
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
  if (TERMINAL_DEAL_STAGE_KEYS.has(stage) || stage === "appointmentscheduled") {
    return false;
  }
  const source = String(
    payload.originalSource ??
      payload.original_source ??
      payload.source ??
      properties.originalSource ??
      properties.original_source ??
      properties.source ??
      "",
  ).toLowerCase();
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
    (record) => record.provider === IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
  );
  const googleSearchConsoleSummaryRecords = googleSearchConsoleRecords.filter(
    (record) => record.objectType === "snapshot",
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

  const records = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: [
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
      ],
      context: input.context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const value = computeMarketingPipelineEfficiency(records);
  const status =
    records.length > 0 ? ImladrisMetricStatus.READY : ImladrisMetricStatus.MISSING;
  const warnings =
    status === ImladrisMetricStatus.READY
      ? []
      : ["No acquisition, traffic, visitor, or HubSpot raw records were available for marketing materialization."];
  const metricValue = await upsertCanonicalMetric({
    canonicalMetrics,
    context: input.context,
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
    now: input.now,
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: MARKETING_PIPELINE_EFFICIENCY_CALCULATION_VERSION,
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
  const properties = nestedRecord(payload.properties);
  const payloadAccount = nestedRecord(payload.account);
  const payloadCompany = nestedRecord(payload.company);
  const payloadCustomer = nestedRecord(payload.customer);
  const propertiesAccount = nestedRecord(properties.account);
  const propertiesCompany = nestedRecord(properties.company);
  const propertiesCustomer = nestedRecord(properties.customer);
  const id =
    payload.accountId ??
    payload.account_id ??
    payload.companyId ??
    payload.company_id ??
    payload.customerId ??
    payload.customer_id ??
    payload.stripeCustomerId ??
    payload.stripe_customer_id ??
    properties.accountId ??
    properties.account_id ??
    properties.companyId ??
    properties.company_id ??
    properties.customerId ??
    properties.customer_id ??
    properties.stripeCustomerId ??
    properties.stripe_customer_id ??
    payloadAccount.id ??
    payloadCompany.id ??
    payloadCustomer.id ??
    payloadCustomer.stripeCustomerId ??
    payloadCustomer.stripe_customer_id ??
    propertiesAccount.id ??
    propertiesCompany.id ??
    propertiesCustomer.id ??
    propertiesCustomer.stripeCustomerId ??
    propertiesCustomer.stripe_customer_id;

  return normalizeIdentifier(id);
}

function isClosedStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;

  const normalizedStatus = status.trim().toLowerCase();
  return (
    normalizedStatus.length > 0 &&
    ["closed", "resolved", "done", "complete", "completed", "cancelled", "canceled"].includes(normalizedStatus)
  );
}

function isOpenSupportIssue(record: RawSourceRecordRow): boolean {
  if (record.provider !== IntegrationProvider.PYLON) return false;
  if (!["conversation", "ticket", "issue"].includes(record.objectType)) return false;

  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  return !isClosedStatus(
    payload.status ??
      payload.state ??
      properties.status ??
      properties.state,
  );
}

function isEscalation(record: RawSourceRecordRow): boolean {
  if (record.provider !== IntegrationProvider.SLACK) return false;

  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const type = String(
    payload.type ??
      payload.kind ??
      payload.category ??
      properties.type ??
      properties.kind ??
      properties.category ??
      "",
  ).toLowerCase();
  const rawTags = Array.isArray(payload.tags)
    ? payload.tags
    : Array.isArray(properties.tags)
      ? properties.tags
      : [];
  const tags = rawTags.map(String);

  return (
    !isClosedStatus(
      payload.status ??
        payload.state ??
        properties.status ??
        properties.state,
    ) &&
    (payload.escalation === true ||
      properties.escalation === true ||
      type.includes("escalation") ||
      tags.some((tag) => tag.toLowerCase().includes("escalation")))
  );
}

function isBillingRisk(record: RawSourceRecordRow): boolean {
  if (record.provider !== IntegrationProvider.STRIPE) return false;

  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const status = normalizeStageKey(
    payload.status ??
      payload.collectionStatus ??
      payload.collection_status ??
      properties.status ??
      properties.collectionStatus ??
      properties.collection_status,
  );
  return ["pastdue", "unpaid", "incomplete", "paymentfailed"].includes(status);
}

function isLowUsage(record: RawSourceRecordRow): boolean {
  if (record.provider !== IntegrationProvider.POSTHOG) return false;

  const payload = asRecord(record.payload);
  const properties = nestedRecord(payload.properties);
  const activeUsers = numberFrom(
    payload.activeUsers ??
      payload.active_users ??
      payload.weeklyActiveUsers ??
      payload.weekly_active_users ??
      properties.activeUsers ??
      properties.active_users ??
      properties.weeklyActiveUsers ??
      properties.weekly_active_users,
  );
  const daysSinceLastActive = numberFrom(
    payload.daysSinceLastActive ??
      payload.days_since_last_active ??
      payload.inactiveDays ??
      payload.inactive_days ??
      properties.daysSinceLastActive ??
      properties.days_since_last_active ??
      properties.inactiveDays ??
      properties.inactive_days,
  );

  return (
    (activeUsers !== null && activeUsers <= 1) ||
    (daysSinceLastActive !== null && daysSinceLastActive >= 14)
  );
}

function isCollaborationSignal(record: RawSourceRecordRow): boolean {
  const supported =
    (record.provider === IntegrationProvider.GOOGLE_WORKSPACE &&
      ["calendar_event", "email_thread", "document"].includes(record.objectType)) ||
    (record.provider === IntegrationProvider.SLACK && record.objectType === "message");
  if (!supported) return false;

  return Boolean(accountIdFromPayload(record));
}

function computeRetentionRisk(records: RawSourceRecordRow[]) {
  const supportIssues = records.filter(isOpenSupportIssue);
  const escalations = records.filter(isEscalation);
  const billingRiskRecords = records.filter(isBillingRisk);
  const lowUsageRecords = records.filter(isLowUsage);
  const collaborationSignals = records.filter(isCollaborationSignal);

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
      supportIssues.length * 12 +
        escalations.length * 18 +
        billingRiskAccounts.size * 20 +
        lowUsageAccounts.size * 18 +
        collaborationOffset,
    ),
  );

  return {
    score,
    atRiskAccounts: atRiskAccountIds.size,
    openSupportIssues: supportIssues.length,
    escalations: escalations.length,
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

  const records = await rawRecords.findMany({
    where: providerWindowWhere({
      providers: [
        IntegrationProvider.PYLON,
        IntegrationProvider.POSTHOG,
        IntegrationProvider.SLACK,
        IntegrationProvider.GOOGLE_WORKSPACE,
        IntegrationProvider.STRIPE,
      ],
      context: input.context,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  });
  const value = computeRetentionRisk(records);
  const status =
    records.length > 0 ? ImladrisMetricStatus.READY : ImladrisMetricStatus.MISSING;
  const warnings =
    status === ImladrisMetricStatus.READY
      ? []
      : ["No Pylon, PostHog, Slack, Google Workspace, or Stripe raw records were available for customer-success materialization."];
  const metricValue = await upsertCanonicalMetric({
    canonicalMetrics,
    context: input.context,
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
    now: input.now,
  });

  await replaceLineage({
    metricLineage,
    metricValueId: metricValue.id,
    records,
    calculationVersion: CUSTOMER_SUCCESS_RETENTION_RISK_CALCULATION_VERSION,
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

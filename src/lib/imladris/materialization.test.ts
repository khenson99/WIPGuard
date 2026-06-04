import { describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import {
  materializeImladrisCustomerSuccessMetrics,
  materializeImladrisDevelopmentMetrics,
  materializeImladrisFinanceMetrics,
  materializeImladrisMarketingMetrics,
  materializeImladrisProductActivationMetric,
  materializeImladrisSalesMetrics,
} from "@/lib/imladris/materialization";

const CONTEXT = {
  userId: "user_1",
  organizationId: "org_1",
};
const SCOPED_RAW_RECORD_FILTERS = [
  { scopeKey: "org:org_1", organizationId: "org_1" },
  { scopeKey: "org:org_1", userId: "user_1" },
  { scopeKey: "user:user_1", userId: "user_1" },
  { scopeKey: "global", userId: null, organizationId: null },
];

type RawSourceRecordFixture = {
  id: string;
  provider: IntegrationProvider;
  objectType: string;
  externalId: string;
  occurredAt: Date | null;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  payload: Record<string, unknown>;
};

function createPrismaMock() {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async (): Promise<RawSourceRecordFixture[]> => [
        {
          id: "raw_linear_1",
          provider: IntegrationProvider.LINEAR,
          objectType: "issue",
          externalId: "LIN-1",
          occurredAt: new Date("2026-05-15T10:00:00.000Z"),
          sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-05-15T10:00:00.000Z"),
          payload: {
            id: "LIN-1",
            state: { type: "completed" },
            createdAt: "2026-05-10T10:00:00.000Z",
            completedAt: "2026-05-15T10:00:00.000Z",
          },
        },
        {
          id: "raw_github_1",
          provider: IntegrationProvider.GITHUB,
          objectType: "pull_request",
          externalId: "repo/pull/7",
          occurredAt: new Date("2026-05-18T10:00:00.000Z"),
          sourceCreatedAt: new Date("2026-05-16T10:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-05-18T10:00:00.000Z"),
          payload: {
            number: 7,
            merged: true,
            created_at: "2026-05-16T10:00:00.000Z",
            merged_at: "2026-05-18T10:00:00.000Z",
          },
        },
        {
          id: "raw_posthog_1",
          provider: IntegrationProvider.POSTHOG,
          objectType: "event",
          externalId: "evt_1",
          occurredAt: new Date("2026-05-19T10:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: null,
          payload: {
            event: "activation_completed",
            distinct_id: "acct_1",
          },
        },
      ]),
    },
    imladrisCanonicalMetricValue: {
      upsert: vi.fn(async ({ create }) => ({ id: "metric_1", ...create })),
    },
    imladrisMetricLineage: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

function createActivationPrismaMock() {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async (): Promise<RawSourceRecordFixture[]> => [
        {
          id: "raw_hubspot_1",
          provider: IntegrationProvider.HUBSPOT,
          objectType: "company",
          externalId: "acct_1",
          occurredAt: new Date("2026-05-03T10:00:00.000Z"),
          sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
          payload: { id: "acct_1", name: "Aperture" },
        },
        {
          id: "raw_hubspot_2",
          provider: IntegrationProvider.HUBSPOT,
          objectType: "company",
          externalId: "acct_2",
          occurredAt: new Date("2026-05-04T10:00:00.000Z"),
          sourceCreatedAt: new Date("2026-05-04T10:00:00.000Z"),
          sourceUpdatedAt: new Date("2026-05-04T10:00:00.000Z"),
          payload: { id: "acct_2", name: "Black Mesa" },
        },
        {
          id: "raw_posthog_activation_1",
          provider: IntegrationProvider.POSTHOG,
          objectType: "event",
          externalId: "evt_activation_1",
          occurredAt: new Date("2026-05-05T10:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: null,
          payload: {
            event: "activation_completed",
            distinct_id: "acct_1",
            properties: { hubspotCompanyId: "acct_1" },
          },
        },
      ]),
    },
    imladrisCanonicalMetricValue: {
      upsert: vi.fn(async ({ create }) => ({ id: "metric_activation_1", ...create })),
    },
    imladrisMetricLineage: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

function createFinancePrismaMock() {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async () => [
        {
          id: "raw_mercury_balance_1",
          provider: IntegrationProvider.MERCURY,
          objectType: "account_balance",
          externalId: "balance_1",
          occurredAt: new Date("2026-05-29T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
          payload: {
            availableBalance: 500_000,
            currency: "USD",
          },
        },
        {
          id: "raw_mercury_txn_1",
          provider: IntegrationProvider.MERCURY,
          objectType: "transaction",
          externalId: "txn_1",
          occurredAt: new Date("2026-05-05T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
          payload: {
            amount: -160_000,
            category: "payroll",
            currency: "USD",
          },
        },
        {
          id: "raw_mercury_txn_2",
          provider: IntegrationProvider.MERCURY,
          objectType: "transaction",
          externalId: "txn_2",
          occurredAt: new Date("2026-05-20T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
          payload: {
            amount: 40_000,
            category: "refund",
            currency: "USD",
          },
        },
        {
          id: "raw_stripe_sub_1",
          provider: IntegrationProvider.STRIPE,
          objectType: "subscription",
          externalId: "sub_1",
          occurredAt: new Date("2026-05-10T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
          payload: {
            status: "active",
            customerId: "cus_linked",
            customerEmail: "finance@example.com",
            monthlyRecurringRevenue: 30_000,
            currency: "USD",
          },
        },
        {
          id: "raw_hubspot_deal_1",
          provider: IntegrationProvider.HUBSPOT,
          objectType: "deal",
          externalId: "deal_1",
          occurredAt: new Date("2026-05-12T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
          payload: {
            amount: 15_000,
            dealstage: "closedwon",
            recurringRevenue: true,
            currency: "USD",
          },
        },
        {
          id: "raw_hubspot_deal_2",
          provider: IntegrationProvider.HUBSPOT,
          objectType: "deal",
          externalId: "deal_2",
          occurredAt: new Date("2026-05-13T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-13T00:00:00.000Z"),
          payload: {
            amount: 12_000,
            monthlyRecurringRevenue: 750,
            dealstage: "closedwon",
            recurringRevenue: true,
            currency: "USD",
          },
        },
        {
          id: "raw_hubspot_deal_linked",
          provider: IntegrationProvider.HUBSPOT,
          objectType: "deal",
          externalId: "deal_linked",
          occurredAt: new Date("2026-05-14T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
          payload: {
            amount: 6_000,
            dealstage: "closedwon",
            recurringRevenue: true,
            stripeCustomerId: "cus_linked",
            primaryContactEmail: "finance@example.com",
            currency: "USD",
          },
        },
      ]),
    },
    imladrisCanonicalMetricValue: {
      upsert: vi.fn(async ({ create }) => {
        const metricKey = String(create.metricKey);
        return {
          id: `metric_${metricKey.replaceAll(".", "_")}`,
          ...create,
        };
      }),
    },
    imladrisMetricLineage: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

function createEmptyFinancePrismaMock() {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async () => []),
    },
    imladrisCanonicalMetricValue: {
      upsert: vi.fn(async ({ create }) => {
        const metricKey = String(create.metricKey);
        return {
          id: `metric_${metricKey.replaceAll(".", "_")}`,
          ...create,
        };
      }),
    },
    imladrisMetricLineage: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

function createSalesPrismaMock() {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async () => [
        {
          id: "raw_hubspot_pipeline_1",
          provider: IntegrationProvider.HUBSPOT,
          objectType: "deal",
          externalId: "deal_qualified_1",
          occurredAt: new Date("2026-05-03T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
          payload: {
            amount: 120_000,
            dealstage: "qualified",
            pipeline: "new-business",
            companyId: "acct_1",
            currency: "USD",
          },
        },
        {
          id: "raw_hubspot_pipeline_2",
          provider: IntegrationProvider.HUBSPOT,
          objectType: "deal",
          externalId: "deal_discovery_1",
          occurredAt: new Date("2026-05-05T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
          payload: {
            amount: 50_000,
            dealstage: "appointmentscheduled",
            companyId: "acct_2",
            currency: "USD",
          },
        },
        {
          id: "raw_google_meeting_1",
          provider: IntegrationProvider.GOOGLE_WORKSPACE,
          objectType: "calendar_event",
          externalId: "meeting_1",
          occurredAt: new Date("2026-05-15T17:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-15T17:00:00.000Z"),
          payload: {
            dealId: "deal_qualified_1",
            attendees: ["buyer@example.com", "ae@example.com"],
          },
        },
        {
          id: "raw_slack_thread_1",
          provider: IntegrationProvider.SLACK,
          objectType: "thread",
          externalId: "thread_1",
          occurredAt: new Date("2026-05-16T17:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-16T17:00:00.000Z"),
          payload: {
            dealId: "deal_qualified_1",
            messageCount: 8,
          },
        },
      ]),
    },
    imladrisCanonicalMetricValue: {
      upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_qualified_pipeline", ...create })),
    },
    imladrisMetricLineage: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

function createMarketingPrismaMock() {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async (): Promise<RawSourceRecordFixture[]> => [
        {
          id: "raw_google_ads_1",
          provider: IntegrationProvider.GOOGLE_ADS,
          objectType: "campaign_metric",
          externalId: "gads_1",
          occurredAt: new Date("2026-05-08T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
          payload: {
            spend: 10_000,
            clicks: 900,
            currency: "USD",
          },
        },
        {
          id: "raw_meta_ads_1",
          provider: IntegrationProvider.META_ADS,
          objectType: "campaign_metric",
          externalId: "meta_1",
          occurredAt: new Date("2026-05-09T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-09T00:00:00.000Z"),
          payload: {
            amountSpent: 5_000,
            clicks: 500,
            currency: "USD",
          },
        },
        {
          id: "raw_reddit_ads_1",
          provider: IntegrationProvider.REDDIT,
          objectType: "campaign_metric",
          externalId: "reddit_1",
          occurredAt: new Date("2026-05-09T12:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-09T12:00:00.000Z"),
          payload: {
            spend: 2_500,
            clicks: 250,
            currency: "USD",
          },
        },
        {
          id: "raw_ga_1",
          provider: IntegrationProvider.GOOGLE_ANALYTICS,
          objectType: "traffic_summary",
          externalId: "ga_1",
          occurredAt: new Date("2026-05-10T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
          payload: {
            sessions: 2_000,
            conversions: 40,
          },
        },
        {
          id: "raw_webflow_1",
          provider: IntegrationProvider.WEBFLOW,
          objectType: "snapshot",
          externalId: "webflow_snapshot_1",
          occurredAt: new Date("2026-05-10T12:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-10T12:00:00.000Z"),
          payload: {
            siteName: "Imladris",
            totalPages: 12,
            publishedPages: 10,
            totalFormSubmissions: 25,
          },
        },
        {
          id: "raw_coda_1",
          provider: IntegrationProvider.CODA,
          objectType: "lead_intelligence_summary",
          externalId: "coda_1",
          occurredAt: new Date("2026-05-10T18:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-10T18:00:00.000Z"),
          payload: {
            scoredLeadCount: 14,
            qualifiedLeadCount: 6,
          },
        },
        {
          id: "raw_semrush_1",
          provider: IntegrationProvider.SEMRUSH,
          objectType: "domain_organic",
          externalId: "semrush_1",
          occurredAt: new Date("2026-05-11T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
          payload: {
            organicTraffic: 500,
            keywordCount: 120,
          },
        },
        {
          id: "raw_gsc_1",
          provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
          objectType: "query",
          externalId: "gsc_1",
          occurredAt: new Date("2026-05-11T12:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-11T12:00:00.000Z"),
          payload: {
            query: "imladris analytics",
            clicks: 120,
            impressions: 2400,
          },
        },
        {
          id: "raw_unify_1",
          provider: IntegrationProvider.UNIFY,
          objectType: "visitor",
          externalId: "visitor_1",
          occurredAt: new Date("2026-05-12T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
          payload: {
            companyId: "acct_1",
            identified: true,
          },
        },
        {
          id: "raw_unify_2",
          provider: IntegrationProvider.UNIFY,
          objectType: "visitor",
          externalId: "visitor_2",
          occurredAt: new Date("2026-05-13T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-13T00:00:00.000Z"),
          payload: {
            companyId: "acct_2",
            identified: true,
          },
        },
        {
          id: "raw_hubspot_marketing_deal_1",
          provider: IntegrationProvider.HUBSPOT,
          objectType: "deal",
          externalId: "deal_marketing_1",
          occurredAt: new Date("2026-05-14T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
          payload: {
            amount: 90_000,
            dealstage: "qualified",
            originalSource: "paid",
            currency: "USD",
          },
        },
      ]),
    },
    imladrisCanonicalMetricValue: {
      upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_pipeline_efficiency", ...create })),
    },
    imladrisMetricLineage: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

function createCustomerSuccessPrismaMock() {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async (): Promise<RawSourceRecordFixture[]> => [
        {
          id: "raw_pylon_issue_1",
          provider: IntegrationProvider.PYLON,
          objectType: "conversation",
          externalId: "conv_1",
          occurredAt: new Date("2026-05-10T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
          payload: {
            accountId: "acct_1",
            status: "open",
            priority: "high",
            sentiment: "negative",
          },
        },
        {
          id: "raw_pylon_issue_2",
          provider: IntegrationProvider.PYLON,
          objectType: "conversation",
          externalId: "conv_2",
          occurredAt: new Date("2026-05-11T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
          payload: {
            accountId: "acct_1",
            status: "open",
            priority: "normal",
          },
        },
        {
          id: "raw_posthog_usage_1",
          provider: IntegrationProvider.POSTHOG,
          objectType: "account_usage",
          externalId: "usage_1",
          occurredAt: new Date("2026-05-17T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-17T00:00:00.000Z"),
          payload: {
            accountId: "acct_1",
            activeUsers: 1,
            daysSinceLastActive: 21,
          },
        },
        {
          id: "raw_slack_escalation_1",
          provider: IntegrationProvider.SLACK,
          objectType: "thread",
          externalId: "thread_escalation_1",
          occurredAt: new Date("2026-05-18T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-18T00:00:00.000Z"),
          payload: {
            accountId: "acct_1",
            type: "escalation",
            status: "open",
          },
        },
        {
          id: "raw_workspace_meeting_1",
          provider: IntegrationProvider.GOOGLE_WORKSPACE,
          objectType: "calendar_event",
          externalId: "event_1",
          occurredAt: new Date("2026-05-22T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-22T00:00:00.000Z"),
          payload: {
            accountId: "acct_1",
            eventType: "renewal_review",
          },
        },
        {
          id: "raw_stripe_subscription_1",
          provider: IntegrationProvider.STRIPE,
          objectType: "subscription",
          externalId: "sub_risk_1",
          occurredAt: new Date("2026-05-24T00:00:00.000Z"),
          sourceCreatedAt: null,
          sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
          payload: {
            accountId: "acct_1",
            status: "past_due",
          },
        },
      ]),
    },
    imladrisCanonicalMetricValue: {
      upsert: vi.fn(async ({ create }) => ({
        id: "metric_customer_success_retention_risk",
        ...create,
      })),
    },
    imladrisMetricLineage: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async ({ data }) => ({ count: data.length })),
    },
  };
}

describe("Imladris canonical materialization", () => {
  it("materializes development delivery health from Linear, GitHub, and PostHog raw records", async () => {
    const prisma = createPrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "development.delivery_health",
      status: "READY",
      rawRecordCount: 3,
    });
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        provider: {
          in: [
            IntegrationProvider.LINEAR,
            IntegrationProvider.GITHUB,
            IntegrationProvider.POSTHOG,
          ],
        },
        OR: SCOPED_RAW_RECORD_FILTERS,
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId_metricKey_periodEnd_calculationVersion: {
          organizationId: "org_1",
          userId: "user_1",
          metricKey: "development.delivery_health",
          periodEnd,
          calculationVersion: "development-delivery-health-v1",
        },
      },
      create: expect.objectContaining({
        metricKey: "development.delivery_health",
        department: "development",
        unit: "score",
        status: "READY",
        confidence: expect.any(Number),
        periodStart,
        periodEnd,
        userId: "user_1",
        organizationId: "org_1",
        value: expect.objectContaining({
          score: expect.any(Number),
          completedLinearIssues: 1,
          mergedPullRequests: 1,
          productEvents: 1,
        }),
      }),
      update: expect.objectContaining({
        status: "READY",
        value: expect.objectContaining({
          completedLinearIssues: 1,
          mergedPullRequests: 1,
          productEvents: 1,
        }),
      }),
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          metricValueId: "metric_1",
          rawRecordId: "raw_linear_1",
          sourceKey: "linear",
          sourceType: "issue",
          sourceId: "LIN-1",
        }),
        expect.objectContaining({
          metricValueId: "metric_1",
          rawRecordId: "raw_github_1",
          sourceKey: "github",
          sourceType: "pull_request",
          sourceId: "repo/pull/7",
        }),
        expect.objectContaining({
          metricValueId: "metric_1",
          rawRecordId: "raw_posthog_1",
          sourceKey: "posthog",
          sourceType: "event",
          sourceId: "evt_1",
        }),
      ]),
    });
  });

  it("normalizes provider envelopes before development materialization", async () => {
    const prisma = createPrismaMock();
    const records: unknown[] = [
      {
        id: "raw_wrapped_linear_issue",
        provider: { value: "linear" },
        objectType: { data: { type: "issue" } },
        externalId: { data: { id: "LIN-42" } },
        occurredAt: new Date("2026-05-15T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-15T10:00:00.000Z"),
        payload: {
          id: "LIN-42",
          state: { type: "completed" },
          createdAt: "2026-05-10T10:00:00.000Z",
          completedAt: "2026-05-15T10:00:00.000Z",
        },
      },
      {
        id: "raw_lower_github_pr",
        provider: "github",
        objectType: "pull_request",
        externalId: "repo/pull/42",
        occurredAt: new Date("2026-05-18T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-16T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-18T10:00:00.000Z"),
        payload: {
          number: 42,
          merged: true,
          created_at: "2026-05-16T10:00:00.000Z",
          merged_at: "2026-05-18T10:00:00.000Z",
        },
      },
      {
        id: "raw_camel_posthog_event",
        provider: "postHog",
        objectType: "event",
        externalId: "evt_provider_wrapped",
        occurredAt: new Date("2026-05-19T10:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        payload: {
          event: "activation_completed",
          distinct_id: "acct_1",
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(records as never);
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "development.delivery_health",
      status: "READY",
      rawRecordCount: 3,
      value: expect.objectContaining({
        completedLinearIssues: 1,
        mergedPullRequests: 1,
        productEvents: 1,
      }),
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_wrapped_linear_issue",
          sourceKey: "linear",
        }),
        expect.objectContaining({
          rawRecordId: "raw_lower_github_pr",
          sourceKey: "github",
        }),
        expect.objectContaining({
          rawRecordId: "raw_camel_posthog_event",
          sourceKey: "posthog",
        }),
      ]),
    });
  });

  it("queries raw records through the current organization scope and legacy user scope", async () => {
    const prisma = createPrismaMock();

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: SCOPED_RAW_RECORD_FILTERS,
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
  });

  it("materializes organization metrics from current org raw records and legacy user raw records", async () => {
    const prisma = createPrismaMock();

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: SCOPED_RAW_RECORD_FILTERS,
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
  });

  it("does not count string false GitHub merge timestamps as merged pull requests", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_github_string_false_merge",
        provider: IntegrationProvider.GITHUB,
        objectType: "pull_request",
        externalId: "repo/pull/false-merge",
        occurredAt: new Date("2026-05-18T10:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-18T10:00:00.000Z"),
        payload: {
          merged: false,
          mergedAt: "false",
        },
      },
    ] as never);

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      mergedPullRequests: 0,
    });
  });

  it("reads wrapped GitHub merge fields before calculating delivery health", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_github_wrapped_merge",
        provider: IntegrationProvider.GITHUB,
        objectType: "pull_request",
        externalId: "repo/pull/wrapped-merge",
        occurredAt: new Date("2026-05-18T10:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        payload: {
          values: {
            mergedAt: "2026-05-18T10:00:00.000Z",
          },
        },
      },
    ] as never);

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      mergedPullRequests: 1,
    });
  });

  it("does not count future Linear completion or GitHub merge timestamps as completed delivery", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_future_completed_at",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-FUTURE-COMPLETION",
        occurredAt: new Date("2026-05-18T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-15T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-18T10:00:00.000Z"),
        payload: {
          id: "LIN-FUTURE-COMPLETION",
          state: { type: "completed", name: "Done" },
          completedAt: "2099-01-01T00:00:00.000Z",
        },
      },
      {
        id: "raw_github_future_merged_at",
        provider: IntegrationProvider.GITHUB,
        objectType: "pull_request",
        externalId: "repo/pull/future-merge",
        occurredAt: new Date("2026-05-18T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-16T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-18T10:00:00.000Z"),
        payload: {
          number: 99,
          merged: true,
          mergedAt: "2099-01-01T00:00:00.000Z",
        },
      },
    ]);

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      completedLinearIssues: 0,
      mergedPullRequests: 0,
    });
  });

  it("normalizes blank materialization context before querying raw records and writing canonical metrics", async () => {
    const prisma = createPrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: {
        userId: " user_1 ",
        organizationId: "   ",
      },
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          { scopeKey: "user:user_1", userId: "user_1" },
          { scopeKey: "global", userId: null, organizationId: null },
        ],
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId_metricKey_periodEnd_calculationVersion: {
            organizationId: null,
            userId: "user_1",
            metricKey: "development.delivery_health",
            periodEnd,
            calculationVersion: "development-delivery-health-v1",
          },
        },
        create: expect.objectContaining({
          userId: "user_1",
          organizationId: null,
        }),
      }),
    );
  });

  it("uses an explicit global raw-record scope when no tenant context is present", async () => {
    const prisma = createPrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: {
        userId: null,
        organizationId: null,
      },
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ scopeKey: "global", userId: null, organizationId: null }],
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId_metricKey_periodEnd_calculationVersion: {
            organizationId: null,
            userId: null,
            metricKey: "development.delivery_health",
            periodEnd,
            calculationVersion: "development-delivery-health-v1",
          },
        },
        create: expect.objectContaining({
          userId: null,
          organizationId: null,
        }),
      }),
    );
  });

  it("queries raw records created in the materialization period", async () => {
    const prisma = createPrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: [
          {
            OR: expect.arrayContaining([
              { sourceCreatedAt: { gte: periodStart, lte: periodEnd } },
            ]),
          },
        ],
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
  });

  it("uses sourceCreatedAt as lineage capture time when provider records only expose creation time", async () => {
    const prisma = createPrismaMock();
    const sourceCreatedAt = new Date("2026-05-12T09:00:00.000Z");
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_created_only",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-CREATED",
        occurredAt: null,
        sourceCreatedAt,
        sourceUpdatedAt: null,
        payload: {
          id: "LIN-CREATED",
          state: { type: "completed" },
          createdAt: "2026-05-12T09:00:00.000Z",
        },
      },
    ]);

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rawRecordId: "raw_linear_created_only",
          capturedAt: sourceCreatedAt,
        }),
      ],
    });
  });

  it("falls back to source update time for lineage when occurrence time is malformed", async () => {
    const prisma = createPrismaMock();
    const sourceUpdatedAt = new Date("2026-05-15T10:00:00.000Z");
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_bad_occurrence",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-BAD-OCCURRED",
        occurredAt: "not-a-date" as never,
        sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
        sourceUpdatedAt,
        payload: {
          id: "LIN-BAD-OCCURRED",
          state: { type: "completed" },
          createdAt: "2026-05-10T10:00:00.000Z",
          completedAt: "2026-05-15T10:00:00.000Z",
        },
      },
    ]);

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rawRecordId: "raw_linear_bad_occurrence",
          capturedAt: sourceUpdatedAt,
        }),
      ],
    });
  });

  it("ignores future occurrence times when choosing lineage capture time", async () => {
    const prisma = createPrismaMock();
    const sourceUpdatedAt = new Date("2026-05-15T10:00:00.000Z");
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_future_occurrence",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-FUTURE-OCCURRED",
        occurredAt: new Date("2099-01-01T00:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
        sourceUpdatedAt,
        payload: {
          id: "LIN-FUTURE-OCCURRED",
          state: { type: "completed" },
          createdAt: "2026-05-10T10:00:00.000Z",
          completedAt: "2026-05-15T10:00:00.000Z",
        },
      },
    ]);

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rawRecordId: "raw_linear_future_occurrence",
          capturedAt: sourceUpdatedAt,
        }),
      ],
    });
  });

  it("ignores raw records that are not observable at materialization time", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_future_only",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-FUTURE-ONLY",
        occurredAt: new Date("2099-01-01T00:00:00.000Z"),
        sourceCreatedAt: new Date("2098-12-31T00:00:00.000Z"),
        sourceUpdatedAt: new Date("2099-01-01T00:00:00.000Z"),
        payload: {
          id: "LIN-FUTURE-ONLY",
          state: { type: "completed" },
          createdAt: "2098-12-31T00:00:00.000Z",
          completedAt: "2099-01-01T00:00:00.000Z",
        },
      },
    ]);

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "MISSING",
      rawRecordCount: 0,
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "MISSING",
          confidence: 0,
          warnings: ["No Linear, GitHub, or PostHog raw records were available for this period."],
        }),
      }),
    );
    expect(prisma.imladrisMetricLineage.createMany).not.toHaveBeenCalled();
  });

  it("falls back to raw record timestamps when Linear payload cycle timestamps are malformed", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_malformed_payload_dates",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-BAD-DATES",
        occurredAt: new Date("2026-05-15T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-15T10:00:00.000Z"),
        payload: {
          id: "LIN-BAD-DATES",
          state: { type: "completed" },
          createdAt: "not-a-date",
          completedAt: "also-not-a-date",
        },
      },
    ]);

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          value: expect.objectContaining({
            completedLinearIssues: 1,
            averageLinearCycleTimeDays: 5,
          }),
        }),
        update: expect.objectContaining({
          value: expect.objectContaining({
            completedLinearIssues: 1,
            averageLinearCycleTimeDays: 5,
          }),
        }),
      }),
    );
  });

  it("parses Unix-second Linear payload timestamps before calculating cycle time", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_unix_seconds_cycle_time",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-UNIX-SECONDS",
        occurredAt: new Date("2026-05-15T10:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        payload: {
          id: "LIN-UNIX-SECONDS",
          state: { type: "completed" },
          createdAt: new Date("2026-05-10T10:00:00.000Z").getTime() / 1000,
          completedAt: new Date("2026-05-15T10:00:00.000Z").getTime() / 1000,
        },
      },
    ]);

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          value: expect.objectContaining({
            completedLinearIssues: 1,
            averageLinearCycleTimeDays: 5,
          }),
        }),
        update: expect.objectContaining({
          value: expect.objectContaining({
            completedLinearIssues: 1,
            averageLinearCycleTimeDays: 5,
          }),
        }),
      }),
    );
  });

  it("parses decimal Unix-second Linear payload timestamps before calculating cycle time", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_decimal_unix_seconds_cycle_time",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-DECIMAL-UNIX-SECONDS",
        occurredAt: new Date("2026-05-16T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-15T10:00:00.000Z"),
        sourceUpdatedAt: null,
        payload: {
          id: "LIN-DECIMAL-UNIX-SECONDS",
          state: { type: "completed" },
          createdAt: "1778407200.25",
          completedAt: "1778839200.25",
        },
      },
    ]);

    await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          value: expect.objectContaining({
            completedLinearIssues: 1,
            averageLinearCycleTimeDays: 5,
          }),
        }),
        update: expect.objectContaining({
          value: expect.objectContaining({
            completedLinearIssues: 1,
            averageLinearCycleTimeDays: 5,
          }),
        }),
      }),
    );
  });

  it("reads wrapped Linear completion fields before calculating delivery health", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_wrapped_completion",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-WRAPPED-COMPLETION",
        occurredAt: new Date("2026-05-15T10:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        payload: {
          id: "LIN-WRAPPED-COMPLETION",
          values: {
            state: { type: "completed" },
            createdAt: "2026-05-10T10:00:00.000Z",
            completedAt: "2026-05-15T10:00:00.000Z",
          },
        },
      },
    ]);

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      completedLinearIssues: 1,
      averageLinearCycleTimeDays: 5,
    });
  });

  it("marks development metrics partial when required provider families are incomplete", async () => {
    const prisma = createPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_linear_only",
        provider: IntegrationProvider.LINEAR,
        objectType: "issue",
        externalId: "LIN-ONLY",
        occurredAt: new Date("2026-05-15T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-15T10:00:00.000Z"),
        payload: {
          id: "LIN-ONLY",
          state: { type: "completed" },
          createdAt: "2026-05-10T10:00:00.000Z",
          completedAt: "2026-05-15T10:00:00.000Z",
        },
      },
    ]);

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "development.delivery_health",
      status: "PARTIAL",
      rawRecordCount: 1,
      value: expect.objectContaining({
        completedLinearIssues: 1,
        mergedPullRequests: 0,
        productEvents: 0,
      }),
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "PARTIAL",
          warnings: [
            "Development Delivery Health is missing GitHub and PostHog raw records for this period.",
          ],
        }),
        update: expect.objectContaining({
          status: "PARTIAL",
          warnings: [
            "Development Delivery Health is missing GitHub and PostHog raw records for this period.",
          ],
        }),
      }),
    );
  });

  it("normalizes Linear completion states before calculating delivery health", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_linear_formatted_done_state",
            provider: IntegrationProvider.LINEAR,
            objectType: "issue",
            externalId: "LIN-FORMATTED",
            occurredAt: new Date("2026-05-15T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-15T10:00:00.000Z"),
            payload: {
              id: "LIN-FORMATTED",
              state: " done ",
              createdAt: "2026-05-10T10:00:00.000Z",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_development_formatted_state", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      completedLinearIssues: 1,
    });
  });

  it("unwraps scalar Linear completion state fields before calculating delivery health", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_linear_scalar_done_state",
            provider: IntegrationProvider.LINEAR,
            objectType: "issue",
            externalId: "LIN-SCALAR-DONE",
            occurredAt: new Date("2026-05-15T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-15T10:00:00.000Z"),
            payload: {
              id: "LIN-SCALAR-DONE",
              state: { value: " done " },
              createdAt: "2026-05-10T10:00:00.000Z",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_development_scalar_state", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      completedLinearIssues: 1,
    });
  });

  it("does not count string false Linear completion timestamps as completed issues", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_linear_string_false_completion",
            provider: IntegrationProvider.LINEAR,
            objectType: "issue",
            externalId: "LIN-FALSE-COMPLETION",
            occurredAt: new Date("2026-05-15T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-15T10:00:00.000Z"),
            payload: {
              id: "LIN-FALSE-COMPLETION",
              state: { name: "Started" },
              createdAt: "2026-05-10T10:00:00.000Z",
              completedAt: "false",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_development_false_completion", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      completedLinearIssues: 0,
    });
  });

  it("reads Linear state names before calculating delivery health", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_linear_done_state_name",
            provider: IntegrationProvider.LINEAR,
            objectType: "issue",
            externalId: "LIN-DONE-NAME",
            occurredAt: new Date("2026-05-15T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-10T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-15T10:00:00.000Z"),
            payload: {
              id: "LIN-DONE-NAME",
              state: { name: "Done" },
              createdAt: "2026-05-10T10:00:00.000Z",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_development_state_name", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisDevelopmentMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      completedLinearIssues: 1,
    });
  });

  it("materializes product activation rate from HubSpot accounts and PostHog activation events", async () => {
    const prisma = createActivationPrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "product.activation_rate",
      status: "READY",
      rawRecordCount: 3,
      value: {
        rate: 50,
        activatedAccounts: 1,
        eligibleAccounts: 2,
      },
    });
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        provider: {
          in: [IntegrationProvider.HUBSPOT, IntegrationProvider.POSTHOG],
        },
        OR: SCOPED_RAW_RECORD_FILTERS,
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId_metricKey_periodEnd_calculationVersion: {
          organizationId: "org_1",
          userId: "user_1",
          metricKey: "product.activation_rate",
          periodEnd,
          calculationVersion: "product-activation-rate-v1",
        },
      },
      create: expect.objectContaining({
        metricKey: "product.activation_rate",
        department: "development",
        unit: "percent",
        status: "READY",
        value: {
          rate: 50,
          activatedAccounts: 1,
          eligibleAccounts: 2,
        },
      }),
      update: expect.objectContaining({
        status: "READY",
        value: {
          rate: 50,
          activatedAccounts: 1,
          eligibleAccounts: 2,
        },
      }),
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          metricValueId: "metric_activation_1",
          rawRecordId: "raw_hubspot_1",
          sourceKey: "hubspot",
          sourceType: "company",
          sourceId: "acct_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_activation_1",
          rawRecordId: "raw_posthog_activation_1",
          sourceKey: "posthog",
          sourceType: "event",
          sourceId: "evt_activation_1",
        }),
      ]),
    });
  });

  it("normalizes provider envelopes before product activation materialization", async () => {
    const prisma = createActivationPrismaMock();
    const records: unknown[] = [
      {
        id: "raw_wrapped_hubspot_account_1",
        provider: { value: "hubspot" },
        objectType: "company",
        externalId: "acct_wrapped_1",
        occurredAt: new Date("2026-05-03T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
        payload: { id: "acct_wrapped_1", name: "Aperture" },
      },
      {
        id: "raw_lower_hubspot_account_2",
        provider: "hubspot",
        objectType: "company",
        externalId: "acct_wrapped_2",
        occurredAt: new Date("2026-05-04T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-04T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-04T10:00:00.000Z"),
        payload: { id: "acct_wrapped_2", name: "Black Mesa" },
      },
      {
        id: "raw_camel_posthog_activation",
        provider: "postHog",
        objectType: "event",
        externalId: "evt_wrapped_activation",
        occurredAt: new Date("2026-05-05T10:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        payload: {
          event: "activation_completed",
          distinct_id: "acct_wrapped_1",
          properties: { hubspotCompanyId: "acct_wrapped_1" },
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(records as never);
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "product.activation_rate",
      status: "READY",
      rawRecordCount: 3,
      value: {
        rate: 50,
        activatedAccounts: 1,
        eligibleAccounts: 2,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_wrapped_hubspot_account_1",
          sourceKey: "hubspot",
        }),
        expect.objectContaining({
          rawRecordId: "raw_camel_posthog_activation",
          sourceKey: "posthog",
        }),
      ]),
    });
  });

  it("normalizes account identifiers before matching product activations", async () => {
    const prisma = createActivationPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_hubspot_spaced_account",
        provider: IntegrationProvider.HUBSPOT,
        objectType: "company",
        externalId: "acct_1",
        occurredAt: new Date("2026-05-03T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
        payload: { id: " acct_1 ", name: "Aperture" },
      },
      {
        id: "raw_hubspot_unactivated_account",
        provider: IntegrationProvider.HUBSPOT,
        objectType: "company",
        externalId: "acct_2",
        occurredAt: new Date("2026-05-04T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-04T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-04T10:00:00.000Z"),
        payload: { id: "acct_2", name: "Black Mesa" },
      },
      {
        id: "raw_posthog_activation_matching_account",
        provider: IntegrationProvider.POSTHOG,
        objectType: "event",
        externalId: "evt_activation_matching_account",
        occurredAt: new Date("2026-05-05T10:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        payload: {
          event: "activation_completed",
          distinct_id: "acct_1",
          properties: { hubspotCompanyId: "acct_1" },
        },
      },
    ]);

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      rate: 50,
      activatedAccounts: 1,
      eligibleAccounts: 2,
    });
  });

  it("normalizes event names before matching product activations", async () => {
    const prisma = createActivationPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_hubspot_account_for_formatted_activation",
        provider: IntegrationProvider.HUBSPOT,
        objectType: "company",
        externalId: "acct_1",
        occurredAt: new Date("2026-05-03T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
        payload: { id: "acct_1", name: "Aperture" },
      },
      {
        id: "raw_hubspot_unactivated_account_for_formatted_activation",
        provider: IntegrationProvider.HUBSPOT,
        objectType: "company",
        externalId: "acct_2",
        occurredAt: new Date("2026-05-04T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-04T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-04T10:00:00.000Z"),
        payload: { id: "acct_2", name: "Black Mesa" },
      },
      {
        id: "raw_posthog_formatted_activation_event",
        provider: IntegrationProvider.POSTHOG,
        objectType: "event",
        externalId: "evt_formatted_activation_event",
        occurredAt: new Date("2026-05-05T10:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        payload: {
          event: " activation_completed ",
          distinct_id: "acct_1",
          properties: { hubspotCompanyId: "acct_1" },
        },
      },
    ]);

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      rate: 50,
      activatedAccounts: 1,
      eligibleAccounts: 2,
    });
  });

  it("reads snake_case account identifiers before matching product activations", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_account_for_snake_case_activation",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "company",
            externalId: "acct_1",
            occurredAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
            payload: { id: "acct_1", name: "Aperture" },
          },
          {
            id: "raw_hubspot_unactivated_account_for_snake_case_activation",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "company",
            externalId: "acct_2",
            occurredAt: new Date("2026-05-04T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-04T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-04T10:00:00.000Z"),
            payload: { id: "acct_2", name: "Black Mesa" },
          },
          {
            id: "raw_posthog_snake_case_activation_account",
            provider: IntegrationProvider.POSTHOG,
            objectType: "event",
            externalId: "evt_snake_case_activation_account",
            occurredAt: new Date("2026-05-05T10:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              event: "activation_completed",
              account_id: "acct_1",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_activation_snake_case", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      rate: 50,
      activatedAccounts: 1,
      eligibleAccounts: 2,
    });
  });

  it("reads nested snake_case account identifiers before matching product activations", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_account_for_nested_snake_case_activation",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "company",
            externalId: "acct_1",
            occurredAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
            payload: { id: "acct_1", name: "Aperture" },
          },
          {
            id: "raw_hubspot_unactivated_account_for_nested_snake_case_activation",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "company",
            externalId: "acct_2",
            occurredAt: new Date("2026-05-04T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-04T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-04T10:00:00.000Z"),
            payload: { id: "acct_2", name: "Black Mesa" },
          },
          {
            id: "raw_posthog_nested_snake_case_activation_account",
            provider: IntegrationProvider.POSTHOG,
            objectType: "event",
            externalId: "evt_nested_snake_case_activation_account",
            occurredAt: new Date("2026-05-05T10:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              event: "activation_completed",
              properties: {
                hubspot_company_id: "acct_1",
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_activation_nested_snake_case", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      rate: 50,
      activatedAccounts: 1,
      eligibleAccounts: 2,
    });
  });

  it("reads nested HubSpot account identifiers before matching product activations", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_nested_activation_account",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "company",
            externalId: "hubspot_record_nested_activation_account",
            occurredAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
            payload: {
              properties: {
                hs_object_id: "acct_nested",
              },
              name: "Aperture",
            },
          },
          {
            id: "raw_posthog_nested_activation_account",
            provider: IntegrationProvider.POSTHOG,
            objectType: "event",
            externalId: "evt_nested_activation_account",
            occurredAt: new Date("2026-05-05T10:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              event: "activation_completed",
              properties: {
                hubspotCompanyId: "acct_nested",
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_activation_nested_account", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      rate: 100,
      activatedAccounts: 1,
      eligibleAccounts: 1,
    });
  });

  it("reads wrapped account identifiers and event names before matching product activations", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_wrapped_activation_account",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "company",
            externalId: "hubspot_record_wrapped_activation_account",
            occurredAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
            payload: {
              values: {
                hs_object_id: "acct_wrapped_activation",
              },
              name: "Aperture",
            },
          },
          {
            id: "raw_posthog_wrapped_activation_account",
            provider: IntegrationProvider.POSTHOG,
            objectType: "event",
            externalId: "evt_wrapped_activation_account",
            occurredAt: new Date("2026-05-05T10:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              attributes: {
                event: " activation_completed ",
              },
              fields: {
                hubspot_company_id: "acct_wrapped_activation",
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_activation_wrapped_account", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      rate: 100,
      activatedAccounts: 1,
      eligibleAccounts: 1,
    });
  });

  it("unwraps scalar account identifiers and event names before matching product activations", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_scalar_wrapped_activation_account",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "company",
            externalId: "hubspot_record_scalar_wrapped_activation_account",
            occurredAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
            payload: {
              companyId: {
                data: {
                  attributes: {
                    value: "acct_scalar_wrapped_activation",
                  },
                },
              },
              name: "Aperture",
            },
          },
          {
            id: "raw_posthog_scalar_wrapped_activation_account",
            provider: IntegrationProvider.POSTHOG,
            objectType: "event",
            externalId: "evt_scalar_wrapped_activation_account",
            occurredAt: new Date("2026-05-05T10:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              event: { value: " activation_completed " },
              distinct_id: { value: "acct_scalar_wrapped_activation" },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_activation_scalar_wrapped", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      rate: 100,
      activatedAccounts: 1,
      eligibleAccounts: 1,
    });
  });

  it("marks product activation partial when PostHog activation events are missing", async () => {
    const prisma = createActivationPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_hubspot_activation_cohort_only",
        provider: IntegrationProvider.HUBSPOT,
        objectType: "company",
        externalId: "acct_1",
        occurredAt: new Date("2026-05-03T10:00:00.000Z"),
        sourceCreatedAt: new Date("2026-05-03T10:00:00.000Z"),
        sourceUpdatedAt: new Date("2026-05-03T10:00:00.000Z"),
        payload: { id: "acct_1", name: "Aperture" },
      },
    ]);

    const result = await materializeImladrisProductActivationMetric({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "product.activation_rate",
      status: "PARTIAL",
      rawRecordCount: 1,
      value: {
        rate: 0,
        activatedAccounts: 0,
        eligibleAccounts: 1,
      },
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "PARTIAL",
          warnings: [
            "Activation Rate is missing PostHog raw records for this period.",
          ],
        }),
      }),
    );
  });

  it("materializes finance dashboard metrics from Mercury, Stripe, and HubSpot raw records", async () => {
    const prisma = createFinancePrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results).toEqual([
      expect.objectContaining({
        metricKey: "finance.net_burn",
        status: "READY",
        value: {
          amount: 90_000,
          currency: "USD",
          cashOutflow: 160_000,
          cashInflow: 70_000,
        },
      }),
      expect.objectContaining({
        metricKey: "finance.cash_runway_months",
        status: "READY",
        value: {
          months: 5.56,
          cashBalance: 500_000,
          netBurn: 90_000,
          currency: "USD",
        },
      }),
      expect.objectContaining({
        metricKey: "revenue.mrr",
        status: "READY",
        value: {
          amount: 32_000,
          arr: 384_000,
          currency: "USD",
          stripeMrr: 30_000,
          stripeArr: 360_000,
          hubspotSubscriptionMrr: 2_500,
          hubspotSubscriptionArr: 30_000,
          hubspotOnlySubscriptionMrr: 2_000,
          hubspotOnlySubscriptionArr: 24_000,
          hubspotRecurringRevenue: 2_000,
          excludedLinkedHubspotSubscriptionMrr: 500,
          excludedLinkedHubspotSubscriptionArr: 6_000,
        },
      }),
    ]);
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        provider: {
          in: [
            IntegrationProvider.MERCURY,
            IntegrationProvider.STRIPE,
            IntegrationProvider.HUBSPOT,
          ],
        },
        OR: SCOPED_RAW_RECORD_FILTERS,
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId_metricKey_periodEnd_calculationVersion: {
            organizationId: "org_1",
            userId: "user_1",
            metricKey: "finance.cash_runway_months",
            periodEnd,
            calculationVersion: "finance-cash-runway-v1",
          },
        },
        create: expect.objectContaining({
          metricKey: "finance.cash_runway_months",
          department: "finance",
          unit: "months",
          status: "READY",
        }),
      }),
    );
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId_metricKey_periodEnd_calculationVersion: {
            organizationId: "org_1",
            userId: "user_1",
            metricKey: "revenue.mrr",
            periodEnd,
            calculationVersion: "revenue-mrr-v1",
          },
        },
        create: expect.objectContaining({
          metricKey: "revenue.mrr",
          department: "finance",
          unit: "currency",
          status: "READY",
        }),
      }),
    );
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          sourceKey: "mercury",
          sourceType: "account_balance",
          sourceId: "balance_1",
        }),
        expect.objectContaining({
          sourceKey: "stripe",
          sourceType: "subscription",
          sourceId: "sub_1",
        }),
        expect.objectContaining({
          sourceKey: "hubspot",
          sourceType: "deal",
          sourceId: "deal_1",
        }),
      ]),
    });
  });

  it("normalizes provider envelopes before finance materialization", async () => {
    const prisma = createFinancePrismaMock();
    const records: unknown[] = [
      {
        id: "raw_wrapped_mercury_balance",
        provider: { value: "mercury" },
        objectType: "account_balance",
        externalId: "balance_wrapped_provider",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          availableBalance: 100_000,
          currency: "USD",
        },
      },
      {
        id: "raw_lower_mercury_outflow",
        provider: "mercury",
        objectType: "transaction",
        externalId: "txn_wrapped_provider_outflow",
        occurredAt: new Date("2026-05-05T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
        payload: {
          amount: -20_000,
          currency: "USD",
        },
      },
      {
        id: "raw_wrapped_stripe_subscription",
        provider: { data: { attributes: { value: "stripe" } } },
        objectType: "subscription",
        externalId: "sub_wrapped_provider",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
        payload: {
          status: "active",
          customerId: "cus_wrapped_provider",
          monthlyRecurringRevenue: 1_000,
          currency: "USD",
        },
      },
      {
        id: "raw_lower_hubspot_subscription",
        provider: "hubspot",
        objectType: "deal",
        externalId: "deal_wrapped_provider",
        occurredAt: new Date("2026-05-12T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
        payload: {
          dealstage: "closedwon",
          monthlyRecurringRevenue: 500,
          recurringRevenue: true,
          currency: "USD",
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(records as never);
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")).toMatchObject({
      status: "READY",
      value: {
        cashBalance: 100_000,
        netBurn: 19_000,
      },
    });
    expect(results.find((result) => result.metricKey === "revenue.mrr")).toMatchObject({
      status: "READY",
      value: {
        amount: 1_500,
        stripeMrr: 1_000,
        hubspotOnlySubscriptionMrr: 500,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_wrapped_mercury_balance",
          sourceKey: "mercury",
        }),
        expect.objectContaining({
          rawRecordId: "raw_wrapped_stripe_subscription",
          sourceKey: "stripe",
        }),
        expect.objectContaining({
          rawRecordId: "raw_lower_hubspot_subscription",
          sourceKey: "hubspot",
        }),
      ]),
    });
  });

  it("trims and uppercases provider currency codes before writing finance metrics", async () => {
    const prisma = createFinancePrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_mercury_currency_balance",
        provider: IntegrationProvider.MERCURY,
        objectType: "account_balance",
        externalId: "balance_currency",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          availableBalance: 500_000,
          currency: " usd ",
        },
      },
      {
        id: "raw_mercury_currency_outflow",
        provider: IntegrationProvider.MERCURY,
        objectType: "transaction",
        externalId: "txn_currency_outflow",
        occurredAt: new Date("2026-05-05T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
        payload: {
          amount: -1_000,
          category: "software",
          currency: " usd ",
        },
      },
      {
        id: "raw_stripe_currency_sub",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_currency",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
        payload: {
          status: "active",
          customerId: "cus_currency",
          customerEmail: "currency@example.com",
          monthlyRecurringRevenue: 100,
          currency: " usd ",
        },
      },
      {
        id: "raw_hubspot_currency_deal",
        provider: IntegrationProvider.HUBSPOT,
        objectType: "deal",
        externalId: "deal_currency",
        occurredAt: new Date("2026-05-12T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
        payload: {
          amount: 1_200,
          dealstage: "closedwon",
          recurringRevenue: true,
          stripeCustomerId: "cus_currency",
          primaryContactEmail: "currency@example.com",
          currency: " usd ",
        },
      },
    ]);

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      currency: "USD",
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      currency: "USD",
    });
    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      currency: "USD",
    });
  });

  it("unwraps scalar provider currency envelopes before writing finance metrics", async () => {
    const rawRecords: RawSourceRecordFixture[] = [
      {
        id: "raw_mercury_wrapped_currency_balance",
        provider: IntegrationProvider.MERCURY,
        objectType: "account_balance",
        externalId: "balance_wrapped_currency",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          availableBalance: 500_000,
          currency: { data: { attributes: { value: " eur " } } },
        },
      },
      {
        id: "raw_mercury_wrapped_currency_outflow",
        provider: IntegrationProvider.MERCURY,
        objectType: "transaction",
        externalId: "txn_wrapped_currency_outflow",
        occurredAt: new Date("2026-05-05T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
        payload: {
          amount: -1_000,
          category: "software",
          currency: { value: " eur " },
        },
      },
      {
        id: "raw_stripe_wrapped_currency_sub",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_wrapped_currency",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
        payload: {
          status: "active",
          customerId: "cus_wrapped_currency",
          monthlyRecurringRevenue: 100,
          currency: { value: " eur " },
        },
      },
    ];
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => rawRecords),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      currency: "EUR",
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      currency: "EUR",
    });
    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      currency: "EUR",
    });
  });

  it("normalizes raw object type formatting before computing finance metrics", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_account_balance_camel",
            provider: IntegrationProvider.MERCURY,
            objectType: " AccountBalance ",
            externalId: "balance_camel",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 500_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_bank_transaction_camel",
            provider: IntegrationProvider.MERCURY,
            objectType: " BankTransaction ",
            externalId: "txn_camel",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              amount: -100_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")).toMatchObject({
      value: {
        amount: 100_000,
        cashOutflow: 100_000,
        cashInflow: 0,
      },
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")).toMatchObject({
      value: {
        months: 5,
        cashBalance: 500_000,
        netBurn: 100_000,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          sourceType: "account_balance",
          sourceId: "balance_camel",
        }),
      ]),
    });
  });

  it("unwraps scalar raw object type envelopes before computing finance metrics", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_wrapped_balance_type",
            provider: IntegrationProvider.MERCURY,
            objectType: { value: " AccountBalance " },
            externalId: "balance_wrapped_type",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 500_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_wrapped_transaction_type",
            provider: IntegrationProvider.MERCURY,
            objectType: { data: { attributes: { value: " BankTransaction " } } },
            externalId: "txn_wrapped_type",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              amount: -100_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_wrapped_subscription_type",
            provider: IntegrationProvider.STRIPE,
            objectType: { value: " Subscription " },
            externalId: "sub_wrapped_type",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrapped_type",
              monthlyRecurringRevenue: 10_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")).toMatchObject({
      value: {
        amount: 90_000,
        cashOutflow: 100_000,
        cashInflow: 10_000,
      },
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")).toMatchObject({
      value: {
        months: 5.56,
        cashBalance: 500_000,
        netBurn: 90_000,
      },
    });
    expect(results.find((result) => result.metricKey === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_000,
        arr: 120_000,
        stripeMrr: 10_000,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          sourceType: "account_balance",
          sourceId: "balance_wrapped_type",
        }),
        expect.objectContaining({
          sourceType: "bank_transaction",
          sourceId: "txn_wrapped_type",
        }),
        expect.objectContaining({
          sourceType: "subscription",
          sourceId: "sub_wrapped_type",
        }),
      ]),
    });
  });

  it("unwraps scalar raw external ID envelopes before finance raw-record deduplication", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_wrapped_external_id_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_wrapped_external_id",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 500_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_wrapped_external_id_old",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: { value: "txn_wrapped_external_id" },
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              amount: -100_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_wrapped_external_id_current",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: { data: { attributes: { value: "txn_wrapped_external_id" } } },
            occurredAt: new Date("2026-05-21T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
            payload: {
              amount: -50_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")).toMatchObject({
      rawRecordCount: 2,
      value: {
        amount: 50_000,
        cashOutflow: 50_000,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_mercury_wrapped_external_id_current",
          sourceId: "txn_wrapped_external_id",
        }),
      ]),
    });
  });

  it("ignores non-recurring Stripe object rows with MRR-like fields before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_charge_with_mrr_alias",
            provider: IntegrationProvider.STRIPE,
            objectType: "charge",
            externalId: "ch_mrr_alias",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "succeeded",
              monthlyRecurringRevenue: 99_000,
              amount: 99_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("does not double-count Stripe revenue summaries with underlying subscription rows", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_revenue_summary_with_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "revenue_summary",
            externalId: "stripe:revenue_summary:with_subscription",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              mrr: 42_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_subscription_in_summary",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_in_summary",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_in_summary",
              monthlyRecurringRevenue: 42_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
    });
    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      cashInflow: 42_000,
    });
  });

  it("uses the latest Stripe revenue summary instead of adding stale summaries", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_revenue_summary_stale",
            provider: IntegrationProvider.STRIPE,
            objectType: "revenue_summary",
            externalId: "stripe:revenue_summary:stale",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              mrr: 40_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_revenue_summary_current",
            provider: IntegrationProvider.STRIPE,
            objectType: "revenue_summary",
            externalId: "stripe:revenue_summary:current",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              mrr: 42_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
    });
    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      cashInflow: 42_000,
    });
  });

  it("ignores future-dated Stripe revenue summaries when choosing the latest summary", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_revenue_summary_current_period",
            provider: IntegrationProvider.STRIPE,
            objectType: "revenue_summary",
            externalId: "stripe:revenue_summary:2026-05",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              mrr: 42_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_revenue_summary_next_period",
            provider: IntegrationProvider.STRIPE,
            objectType: "revenue_summary",
            externalId: "stripe:revenue_summary:2026-06",
            occurredAt: new Date("2026-06-05T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              mrr: 99_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
    });
    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      cashInflow: 42_000,
    });
  });

  it("excludes HubSpot recurring revenue linked by Stripe active customer references", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_revenue_summary",
            provider: IntegrationProvider.STRIPE,
            objectType: "revenue_summary",
            externalId: "stripe:revenue_summary:2026-05",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              mrr: 42_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_active_customer_ref",
            provider: IntegrationProvider.STRIPE,
            objectType: "active_customer_ref",
            externalId: "stripe:active_customer_ref:cus_123",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              customerId: "cus_123",
              email: "finance@example.com",
              emailDomain: "example.com",
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_linked_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_linked_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              stripeCustomerId: "cus_123",
              primaryContactEmail: "finance@example.com",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
      hubspotSubscriptionMrr: 1_000,
      hubspotSubscriptionArr: 12_000,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
      excludedLinkedHubspotSubscriptionMrr: 1_000,
      excludedLinkedHubspotSubscriptionArr: 12_000,
    });
  });

  it("keeps HubSpot recurring revenue linked only by Stripe active customer references when Stripe revenue is missing", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_active_customer_ref_without_revenue",
            provider: IntegrationProvider.STRIPE,
            objectType: "active_customer_ref",
            externalId: "stripe:active_customer_ref:cus_missing_revenue",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              customerId: "cus_missing_revenue",
              email: "finance-missing-revenue@example.com",
              emailDomain: "example.com",
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_linked_subscription_deal_without_stripe_revenue",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_linked_subscription_without_stripe_revenue",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              stripeCustomerId: "cus_missing_revenue",
              primaryContactEmail: "finance-missing-revenue@example.com",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 0,
      stripeArr: 0,
      hubspotSubscriptionMrr: 1_000,
      hubspotSubscriptionArr: 12_000,
      hubspotOnlySubscriptionMrr: 1_000,
      hubspotOnlySubscriptionArr: 12_000,
      excludedLinkedHubspotSubscriptionMrr: 0,
      excludedLinkedHubspotSubscriptionArr: 0,
    });
  });

  it("excludes HubSpot recurring revenue linked by nested Stripe customer references", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_revenue_summary_nested_ref",
            provider: IntegrationProvider.STRIPE,
            objectType: "revenue_summary",
            externalId: "stripe:revenue_summary:nested_ref",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              mrr: 42_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_active_customer_nested_ref",
            provider: IntegrationProvider.STRIPE,
            objectType: "active_customer_ref",
            externalId: "stripe:active_customer_ref:nested",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              properties: {
                customer_id: "cus_nested_ref",
                customer_email: "nested-finance@example.com",
                email_domain: "example.com",
                customer: {
                  id: "cus_nested_ref",
                  email: "nested-finance@example.com",
                },
              },
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_linked_nested_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_linked_nested_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              stripeCustomerId: "cus_nested_ref",
              primaryContactEmail: "nested-finance@example.com",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
      hubspotSubscriptionMrr: 1_000,
      hubspotSubscriptionArr: 12_000,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
      excludedLinkedHubspotSubscriptionMrr: 1_000,
      excludedLinkedHubspotSubscriptionArr: 12_000,
    });
  });

  it("excludes HubSpot recurring revenue linked by wrapped Stripe customer references", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_revenue_summary_wrapped_ref",
            provider: IntegrationProvider.STRIPE,
            objectType: "revenue_summary",
            externalId: "stripe:revenue_summary:wrapped_ref",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              mrr: 42_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_active_customer_wrapped_ref",
            provider: IntegrationProvider.STRIPE,
            objectType: "active_customer_ref",
            externalId: "stripe:active_customer_ref:wrapped",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              values: {
                customer_id: "cus_wrapped_ref",
                customer_email: "wrapped-finance@example.com",
                email_domain: "example.com",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_linked_wrapped_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_linked_wrapped_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              values: {
                stripeCustomerId: "cus_wrapped_ref",
                primaryContactEmail: "wrapped-finance@example.com",
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
      hubspotSubscriptionMrr: 1_000,
      hubspotSubscriptionArr: 12_000,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
      excludedLinkedHubspotSubscriptionMrr: 1_000,
      excludedLinkedHubspotSubscriptionArr: 12_000,
    });
  });

  it("excludes HubSpot recurring revenue linked by nested Stripe subscription customers", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_nested_customer_ref",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "stripe:subscription:nested_customer_ref",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              monthlyRecurringRevenue: 42_000,
              subscription: {
                customer: {
                  id: "cus_subscription_nested_ref",
                  email: "subscription-nested@example.com",
                },
              },
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_subscription_customer_linked_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_subscription_customer_linked",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              stripeCustomerId: "cus_subscription_nested_ref",
              primaryContactEmail: "subscription-nested@example.com",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
      hubspotSubscriptionMrr: 1_000,
      hubspotSubscriptionArr: 12_000,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
      excludedLinkedHubspotSubscriptionMrr: 1_000,
      excludedLinkedHubspotSubscriptionArr: 12_000,
    });
  });

  it("excludes HubSpot recurring revenue linked by Stripe subscription identifiers", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_identifier_ref",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_identifier_ref",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              id: "sub_identifier_ref",
              status: "active",
              customerId: "cus_identifier_ref",
              monthlyRecurringRevenue: 42_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_subscription_identifier_linked_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_subscription_identifier_linked",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              dealstage: "closedwon",
              recurringRevenue: true,
              monthlyRecurringRevenue: 12_000,
              stripeSubscriptionId: "sub_identifier_ref",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
      hubspotSubscriptionMrr: 12_000,
      hubspotSubscriptionArr: 144_000,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
      excludedLinkedHubspotSubscriptionMrr: 12_000,
      excludedLinkedHubspotSubscriptionArr: 144_000,
    });
  });

  it("excludes HubSpot recurring revenue linked by provider-prefixed Stripe subscription external IDs", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_prefixed_subscription_identifier_ref",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "stripe:subscription:sub_external_identifier_ref",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_external_identifier_ref",
              monthlyRecurringRevenue: 42_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_external_subscription_identifier_linked_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_external_subscription_identifier_linked",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              dealstage: "closedwon",
              recurringRevenue: true,
              monthlyRecurringRevenue: 12_000,
              stripe_subscription_id: "sub_external_identifier_ref",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 42_000,
      arr: 504_000,
      stripeMrr: 42_000,
      stripeArr: 504_000,
      hubspotSubscriptionMrr: 12_000,
      hubspotSubscriptionArr: 144_000,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
      excludedLinkedHubspotSubscriptionMrr: 12_000,
      excludedLinkedHubspotSubscriptionArr: 144_000,
    });
  });

  it("deduplicates raw records returned from current org scope and legacy user scope before finance materialization", async () => {
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_main",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: "org_1",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 500_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_org",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_duplicate_scope",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_duplicate",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_legacy_user",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_duplicate_scope",
            scopeKey: "user:user_1",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_duplicate",
              monthlyRecurringRevenue: 60_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_closed_won",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: "org_1",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              monthlyRecurringRevenue: 750,
              dealstage: "closedwon",
              recurringRevenue: true,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${String(create.metricKey).replaceAll(".", "_")}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")).toMatchObject({
      status: "READY",
      rawRecordCount: 3,
      value: {
        amount: 30_750,
        arr: 369_000,
        stripeMrr: 30_000,
        hubspotSubscriptionMrr: 750,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.not.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_stripe_sub_legacy_user",
        }),
      ]),
    });
  });

  it("does not collapse distinct finance raw records that are missing provider external IDs", async () => {
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_missing_external_id",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_main",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 500_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_missing_external_id_1",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: " ",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_missing_external_id_1",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_missing_external_id_2",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "",
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_missing_external_id_2",
              monthlyRecurringRevenue: 15_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${String(create.metricKey).replaceAll(".", "_")}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")).toMatchObject({
      status: "PARTIAL",
      rawRecordCount: 3,
      value: {
        amount: 45_000,
        arr: 540_000,
        stripeMrr: 45_000,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_stripe_sub_missing_external_id_1",
          sourceId: "raw_stripe_sub_missing_external_id_1",
        }),
        expect.objectContaining({
          rawRecordId: "raw_stripe_sub_missing_external_id_2",
          sourceId: "raw_stripe_sub_missing_external_id_2",
        }),
      ]),
    });
  });

  it("does not collapse distinct Mercury balances that are missing provider external IDs", async () => {
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_missing_external_id_1",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "",
            occurredAt: new Date("2026-05-28T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-28T00:00:00.000Z"),
            payload: {
              availableBalance: 500_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_balance_missing_external_id_2",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 250_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${String(create.metricKey).replaceAll(".", "_")}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")).toMatchObject({
      status: "PARTIAL",
      rawRecordCount: 2,
      value: {
        cashBalance: 750_000,
      },
    });
  });

  it("ignores wrong-scope raw records returned by the data layer before finance materialization", async () => {
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_main",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: "org_1",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 500_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_valid_scope",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_valid_scope",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: "org_1",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_valid_scope",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_wrong_org",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrong_org",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: "other_org",
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrong_org",
              monthlyRecurringRevenue: 99_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_wrong_scope_key",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrong_scope_key",
            scopeKey: "org:other_org",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrong_scope_key",
              monthlyRecurringRevenue: 88_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_closed_won",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: "org_1",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              monthlyRecurringRevenue: 750,
              dealstage: "closedwon",
              recurringRevenue: true,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${String(create.metricKey).replaceAll(".", "_")}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")).toMatchObject({
      value: {
        amount: 30_750,
        arr: 369_000,
        stripeMrr: 30_000,
        hubspotSubscriptionMrr: 750,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.not.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_stripe_sub_wrong_org",
        }),
        expect.objectContaining({
          rawRecordId: "raw_stripe_sub_wrong_scope_key",
        }),
      ]),
    });
  });

  it("ignores user-owned raw records with non-user scope keys before finance materialization", async () => {
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_user_scope",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_main_user_scope",
            scopeKey: "user:user_1",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 500_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_user_scope",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_user_scope",
            scopeKey: "user:user_1",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_user_scope",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_wrong_user_scope_key",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrong_user_scope_key",
            scopeKey: "org:other_org",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrong_user_scope_key",
              monthlyRecurringRevenue: 88_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_deal_user_scope",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_closed_won_user_scope",
            scopeKey: "user:user_1",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              monthlyRecurringRevenue: 750,
              dealstage: "closedwon",
              recurringRevenue: true,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${String(create.metricKey).replaceAll(".", "_")}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: {
        userId: " user_1 ",
        organizationId: "   ",
      },
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")).toMatchObject({
      value: {
        amount: 30_750,
        arr: 369_000,
        stripeMrr: 30_000,
        hubspotSubscriptionMrr: 750,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.not.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_stripe_sub_wrong_user_scope_key",
        }),
      ]),
    });
  });

  it("uses source update time when choosing the latest duplicate mutable raw record", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_stale_revision",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_revisioned",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_revisioned",
              monthlyRecurringRevenue: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_subscription_current_revision",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_revisioned",
            occurredAt: new Date("2026-05-01T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_revisioned",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")).toMatchObject({
      rawRecordCount: 1,
      value: {
        amount: 30_000,
        arr: 360_000,
        stripeMrr: 30_000,
        stripeArr: 360_000,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_stripe_subscription_current_revision",
        }),
      ]),
    });
  });

  it("ignores future source update times when choosing duplicate mutable raw records", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_current_revision",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_future_revisioned",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_future_revisioned",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_subscription_future_skew_revision",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_future_revisioned",
            occurredAt: new Date("2026-05-01T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2099-01-01T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_future_revisioned",
              monthlyRecurringRevenue: 10_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")).toMatchObject({
      rawRecordCount: 1,
      value: {
        amount: 30_000,
        arr: 360_000,
        stripeMrr: 30_000,
        stripeArr: 360_000,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_stripe_subscription_current_revision",
        }),
      ]),
    });
  });

  it("materializes HubSpot subscriptionDeals raw rows as canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_subscription_deal_row",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "subscription_deal",
            externalId: "hubspot:subscription_deal:sub_deal_1",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              dealId: "sub_deal_1",
              amount: 24_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              primaryContactEmail: "buyer@example.com",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 2_000,
      arr: 24_000,
      hubspotSubscriptionMrr: 2_000,
      hubspotSubscriptionArr: 24_000,
      hubspotOnlySubscriptionMrr: 2_000,
      hubspotOnlySubscriptionArr: 24_000,
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_hubspot_subscription_deal_row",
          sourceKey: "hubspot",
          sourceType: "subscription_deal",
        }),
      ]),
    });
  });

  it("parses formatted currency strings before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_formatted",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_formatted",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: "USD 0.24M",
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_formatted_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_formatted_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: "-$100,000.00",
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_iso_formatted_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_iso_formatted_outflow",
            occurredAt: new Date("2026-05-06T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-06T00:00:00.000Z"),
            payload: {
              amount: "USD -50k",
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_formatted_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_formatted_mrr",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              monthlyRecurringRevenue: "$20,000.00",
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_sub_iso_formatted_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_iso_formatted_mrr",
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              status: "active",
              monthlyRecurringRevenue: "15k USD",
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_deal_formatted_arr",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_formatted_arr",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: "$12k",
              dealstage: "closedwon",
              recurringRevenue: true,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 115_000,
      cashOutflow: 150_000,
      cashInflow: 35_000,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 2.09,
      cashBalance: 240_000,
      netBurn: 115_000,
    });
    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 36_000,
      arr: 432_000,
      stripeMrr: 35_000,
      stripeArr: 420_000,
      hubspotOnlySubscriptionMrr: 1_000,
      hubspotOnlySubscriptionArr: 12_000,
    });
  });

  it("parses Unicode-minus currency strings before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_unicode_minus",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_unicode_minus",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: "USD 240k",
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_unicode_minus_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_unicode_minus_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: "USD −50k",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 50_000,
      cashOutflow: 50_000,
      cashInflow: 0,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 4.8,
      cashBalance: 240_000,
      netBurn: 50_000,
    });
  });

  it("parses compact ISO-currency strings without separators before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_compact_iso_no_separator",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_compact_iso_no_separator",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: "USD240k",
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_compact_iso_no_separator_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_compact_iso_no_separator_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: "USD−50k",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 50_000,
      cashOutflow: 50_000,
      cashInflow: 0,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 4.8,
      cashBalance: 240_000,
      netBurn: 50_000,
    });
  });

  it("parses trailing compact ISO-currency strings without separators before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_trailing_compact_iso",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_trailing_compact_iso",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: "240kUSD",
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_trailing_compact_iso_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_trailing_compact_iso_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: "−50kUSD",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 50_000,
      cashOutflow: 50_000,
      cashInflow: 0,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 4.8,
      cashBalance: 240_000,
      netBurn: 50_000,
    });
  });

  it("parses apostrophe-grouped currency strings before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_apostrophe_grouped",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_apostrophe_grouped",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: "CHF 240’000",
              currency: "CHF",
            },
          },
          {
            id: "raw_mercury_txn_apostrophe_grouped_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_apostrophe_grouped_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: "CHF −50’000",
              currency: "CHF",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 50_000,
      cashOutflow: 50_000,
      cashInflow: 0,
      currency: "CHF",
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 4.8,
      cashBalance: 240_000,
      netBurn: 50_000,
      currency: "CHF",
    });
  });

  it("parses decimal-comma currency strings before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_decimal_comma",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_decimal_comma",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: "EUR 240.000,00",
              currency: "EUR",
            },
          },
          {
            id: "raw_mercury_txn_decimal_comma_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_decimal_comma_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: "EUR −50.000,00",
              currency: "EUR",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 50_000,
      cashOutflow: 50_000,
      cashInflow: 0,
      currency: "EUR",
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 4.8,
      cashBalance: 240_000,
      netBurn: 50_000,
      currency: "EUR",
    });
  });

  it("parses plain comma-decimal currency strings before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_plain_decimal_comma",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_plain_decimal_comma",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: "EUR 240000,00",
              currency: "EUR",
            },
          },
          {
            id: "raw_mercury_txn_plain_decimal_comma_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_plain_decimal_comma_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: "EUR −50,25",
              currency: "EUR",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 50.25,
      cashOutflow: 50.25,
      cashInflow: 0,
      currency: "EUR",
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 4776.12,
      cashBalance: 240_000,
      netBurn: 50.25,
      currency: "EUR",
    });
  });

  it("parses trailing-sign currency strings before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_trailing_sign",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_trailing_sign",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: "USD 240k",
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_trailing_sign_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_trailing_sign_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: "USD 50k-",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 50_000,
      cashOutflow: 50_000,
      cashInflow: 0,
      currency: "USD",
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 4.8,
      cashBalance: 240_000,
      netBurn: 50_000,
      currency: "USD",
    });
  });

  it("reads nested explicit Stripe MRR fields before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_properties_explicit_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_properties_explicit_mrr",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_properties_explicit_mrr",
              properties: {
                mrr: "USD 12k",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_subscription_explicit_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_subscription_explicit_mrr",
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_subscription_explicit_mrr",
              subscription: {
                monthlyRecurringRevenue: "$8,000.00",
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 20_000,
      arr: 240_000,
      stripeMrr: 20_000,
      stripeArr: 240_000,
    });
  });

  it("reads wrapped explicit Stripe MRR fields before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_wrapped_explicit_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrapped_explicit_mrr",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrapped_explicit_mrr",
              values: {
                mrr: "USD 14k",
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 14_000,
      arr: 168_000,
      stripeMrr: 14_000,
      stripeArr: 168_000,
    });
  });

  it("unwraps scalar Stripe MRR field envelopes before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_scalar_wrapped_explicit_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_scalar_wrapped_explicit_mrr",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_scalar_wrapped_explicit_mrr",
              mrr: { data: { attributes: { value: "USD 14k" } } },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 14_000,
      arr: 168_000,
      stripeMrr: 14_000,
      stripeArr: 168_000,
    });
  });

  it("reads JSON:API data attribute Stripe MRR fields before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_json_api_explicit_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_json_api_explicit_mrr",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              data: {
                type: "subscriptions",
                id: "sub_json_api_explicit_mrr",
                attributes: {
                  status: "active",
                  customerId: "cus_json_api_explicit_mrr",
                  mrr: "USD 16k",
                  currency: "USD",
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 16_000,
      arr: 192_000,
      stripeMrr: 16_000,
      stripeArr: 192_000,
    });
  });

  it("unwraps single-value JSON:API Stripe MRR attributes before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_json_api_value_explicit_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_json_api_value_explicit_mrr",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              data: {
                type: "subscriptions",
                id: "sub_json_api_value_explicit_mrr",
                attributes: {
                  value: {
                    status: "active",
                    customerId: "cus_json_api_value_explicit_mrr",
                    mrr: "USD 18k",
                    currency: "USD",
                  },
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 18_000,
      arr: 216_000,
      stripeMrr: 18_000,
      stripeArr: 216_000,
    });
  });

  it("reads explicit Mercury transaction amount aliases before finance materialization", async () => {
    const prisma = createFinancePrismaMock();
    const rawRecords = [
      {
        id: "raw_mercury_balance_amount_aliases",
        provider: IntegrationProvider.MERCURY,
        objectType: "account_balance",
        externalId: "balance_amount_aliases",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          balance: 100_000,
          currency: "USD",
        },
      },
      {
        id: "raw_mercury_decimal_outflow",
        provider: IntegrationProvider.MERCURY,
        objectType: "transaction",
        externalId: "txn_decimal_outflow",
        occurredAt: new Date("2026-05-05T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
        payload: {
          amount_decimal: "-1200.50",
          currency: "USD",
        },
      },
      {
        id: "raw_mercury_cents_outflow",
        provider: IntegrationProvider.MERCURY,
        objectType: "transaction",
        externalId: "txn_cents_outflow",
        occurredAt: new Date("2026-05-06T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-06T00:00:00.000Z"),
        payload: {
          amount_cents: -125_000,
          currency: "USD",
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(rawRecords as never);

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 2450.5,
      cashOutflow: 2450.5,
      cashInflow: 0,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 100_000,
      netBurn: 2450.5,
      months: 40.81,
    });
  });

  it("reads split Mercury debit and credit amount fields before finance materialization", async () => {
    const prisma = createFinancePrismaMock();
    const rawRecords = [
      {
        id: "raw_mercury_balance_split_amounts",
        provider: IntegrationProvider.MERCURY,
        objectType: "account_balance",
        externalId: "balance_split_amounts",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          balance: 100_000,
          currency: "USD",
        },
      },
      {
        id: "raw_mercury_debit_outflow",
        provider: IntegrationProvider.MERCURY,
        objectType: "transaction",
        externalId: "txn_debit_outflow",
        occurredAt: new Date("2026-05-05T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
        payload: {
          debitAmount: "1,200.50",
          currency: "USD",
        },
      },
      {
        id: "raw_mercury_credit_inflow",
        provider: IntegrationProvider.MERCURY,
        objectType: "transaction",
        externalId: "txn_credit_inflow",
        occurredAt: new Date("2026-05-06T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-06T00:00:00.000Z"),
        payload: {
          creditAmount: "300.00",
          currency: "USD",
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(rawRecords as never);

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 900.5,
      cashOutflow: 1200.5,
      cashInflow: 300,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 100_000,
      netBurn: 900.5,
      months: 111.05,
    });
  });

  it("reads split Mercury debit and credit cent fields before finance materialization", async () => {
    const prisma = createFinancePrismaMock();
    const rawRecords = [
      {
        id: "raw_mercury_balance_split_cent_amounts",
        provider: IntegrationProvider.MERCURY,
        objectType: "account_balance",
        externalId: "balance_split_cent_amounts",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          balance: 100_000,
          currency: "USD",
        },
      },
      {
        id: "raw_mercury_debit_cent_outflow",
        provider: IntegrationProvider.MERCURY,
        objectType: "transaction",
        externalId: "txn_debit_cent_outflow",
        occurredAt: new Date("2026-05-05T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
        payload: {
          debitAmountCents: 120_050,
          currency: "USD",
        },
      },
      {
        id: "raw_mercury_credit_cent_inflow",
        provider: IntegrationProvider.MERCURY,
        objectType: "transaction",
        externalId: "txn_credit_cent_inflow",
        occurredAt: new Date("2026-05-06T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-06T00:00:00.000Z"),
        payload: {
          creditAmountCents: 30_000,
          currency: "USD",
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(rawRecords as never);

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 900.5,
      cashOutflow: 1200.5,
      cashInflow: 300,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 100_000,
      netBurn: 900.5,
      months: 111.05,
    });
  });

  it("materializes Stripe subscription item prices as canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_item_price",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_item_price",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_item_price",
              currency: "USD",
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("unwraps object-shaped Stripe recurring intervals before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_object_recurring_interval",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_object_recurring_interval",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_object_recurring_interval",
              currency: "USD",
              items: {
                data: [
                  {
                    quantity: 2,
                    price: {
                      unit_amount: 120_000,
                      recurring: {
                        interval: { value: "year" },
                        interval_count: { value: 1 },
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 200,
      arr: 2_400,
      stripeMrr: 200,
      stripeArr: 2_400,
    });
  });

  it("normalizes plural Stripe recurring intervals before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_plural_recurring_interval",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_plural_recurring_interval",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_plural_recurring_interval",
              currency: "USD",
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 2_400_000,
                      recurring: {
                        interval: "years",
                        interval_count: 2,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("normalizes named Stripe recurring cadences before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_named_recurring_cadence",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_named_recurring_cadence",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_named_recurring_cadence",
              currency: "USD",
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 300_000,
                      recurring: {
                        interval: "quarterly",
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("excludes deleted Stripe subscription items before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_deleted_subscription_item",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_deleted_subscription_item",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_deleted_subscription_item",
              currency: "USD",
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 100_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                  {
                    deleted: true,
                    quantity: 1,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("materializes wrapped Stripe subscription item prices as canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_wrapped_subscription_item_price",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrapped_item_price",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrapped_item_price",
              currency: "USD",
              values: {
                items: {
                  data: [
                    {
                      quantity: 3,
                      price: {
                        unit_amount: 50_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("unwraps scalar Stripe subscription item containers before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_scalar_item_container",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_scalar_item_container",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_scalar_item_container",
              currency: "USD",
              items: {
                value: {
                  data: [
                    {
                      quantity: { value: 2 },
                      price: {
                        unit_amount: { value: 80_000 },
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_600,
      arr: 19_200,
      stripeMrr: 1_600,
      stripeArr: 19_200,
    });
  });

  it("materializes wrapped Stripe subscription item field prices as canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_wrapped_subscription_item_fields",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrapped_item_fields",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrapped_item_fields",
              currency: "USD",
              items: {
                data: [
                  {
                    values: {
                      quantity: 2,
                      price: {
                        unit_amount: 50_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("materializes nested Stripe subscription item prices as canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_nested_subscription_item_price",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_nested_item_price",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_nested_item_price",
              currency: "USD",
              subscription: {
                items: {
                  data: [
                    {
                      quantity: 2,
                      price: {
                        unit_amount: 75_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("materializes JSON:API wrapped Stripe item price attributes as canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_json_api_item_price",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_json_api_item_price",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_json_api_item_price",
              currency: "USD",
              items: {
                data: [
                  {
                    quantity: 2,
                    price: {
                      data: {
                        type: "prices",
                        id: "price_json_api_item_price",
                        attributes: {
                          unit_amount: 75_000,
                          recurring: {
                            interval: "month",
                            interval_count: 1,
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("does not double-count expanded Stripe latest invoice lines when subscription items exist", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_item_and_latest_invoice_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_item_and_latest_invoice_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_item_and_latest_invoice_line",
              currency: "USD",
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 100_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("falls back to Stripe latest invoice lines when subscription items are partial", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_partial_item_latest_invoice_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_partial_item_latest_invoice_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_partial_item_latest_invoice_line",
              currency: "USD",
              items: {
                data: [
                  {
                    id: "si_partial_without_price",
                    quantity: 1,
                  },
                ],
              },
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("uses Stripe latest invoice lines for partial items without dropping usable subscription items", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_mixed_items_and_invoice_lines",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_mixed_items_and_invoice_lines",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_mixed_items_and_invoice_lines",
              currency: "USD",
              items: {
                data: [
                  {
                    id: "si_expanded_price",
                    quantity: 1,
                    price: {
                      unit_amount: 100_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                  {
                    id: "si_partial_price",
                    quantity: 1,
                  },
                ],
              },
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      subscription_item: "si_expanded_price",
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                    {
                      amount: 200_000,
                      quantity: 1,
                      subscription_item: "si_partial_price",
                      price: {
                        unit_amount: 200_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 3_000,
      arr: 36_000,
      stripeMrr: 3_000,
      stripeArr: 36_000,
    });
  });

  it("matches Stripe parent subscription item invoice lines to partial subscription items", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_parent_subscription_item_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_parent_subscription_item_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_parent_subscription_item_line",
              currency: "USD",
              items: {
                data: [
                  {
                    id: "si_parent_expanded_price",
                    quantity: 1,
                    price: {
                      unit_amount: 100_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                  {
                    id: "si_parent_partial_price",
                    quantity: 1,
                  },
                ],
              },
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      parent: {
                        type: "subscription_item_details",
                        subscription_item_details: {
                          subscription_item: "si_parent_expanded_price",
                        },
                      },
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                    {
                      amount: 200_000,
                      quantity: 1,
                      parent: {
                        type: "subscription_item_details",
                        subscription_item_details: {
                          subscription_item: "si_parent_partial_price",
                        },
                      },
                      price: {
                        unit_amount: 200_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 3_000,
      arr: 36_000,
      stripeMrr: 3_000,
      stripeArr: 36_000,
    });
  });

  it("matches camelCase Stripe parent subscription item invoice lines to partial subscription items", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_parent_subscription_item_line_camel",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_parent_subscription_item_line_camel",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_parent_subscription_item_line_camel",
              currency: "USD",
              items: {
                data: [
                  {
                    id: "si_parent_camel_expanded_price",
                    quantity: 1,
                    price: {
                      unitAmount: 100_000,
                      recurring: {
                        interval: "month",
                        intervalCount: 1,
                      },
                    },
                  },
                  {
                    id: "si_parent_camel_partial_price",
                    quantity: 1,
                  },
                ],
              },
              latestInvoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      parent: {
                        type: "subscription_item_details",
                        subscriptionItemDetails: {
                          subscriptionItem: "si_parent_camel_expanded_price",
                        },
                      },
                      price: {
                        unitAmount: 100_000,
                        recurring: {
                          interval: "month",
                          intervalCount: 1,
                        },
                      },
                    },
                    {
                      amount: 200_000,
                      quantity: 1,
                      parent: {
                        type: "subscription_item_details",
                        subscriptionItemDetails: {
                          subscriptionItem: "si_parent_camel_partial_price",
                        },
                      },
                      price: {
                        unitAmount: 200_000,
                        recurring: {
                          interval: "month",
                          intervalCount: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 3_000,
      arr: 36_000,
      stripeMrr: 3_000,
      stripeArr: 36_000,
    });
  });

  it("materializes Stripe latest invoice line prices as canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_line_price",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_line_price",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_line_price",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      quantity: 2,
                      price: {
                        unit_amount: 50_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("materializes Stripe latest invoice line pricing fields as canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_line_pricing",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_line_pricing",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_line_pricing",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      quantity: 2,
                      pricing: {
                        unit_amount_decimal: "50000",
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("amortizes annual Stripe latest invoice line pricing fields before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_line_annual_pricing",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_line_annual_pricing",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_line_annual_pricing",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      quantity: 1,
                      pricing: {
                        unit_amount_decimal: "120000",
                        recurring: {
                          interval: "year",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 100,
      arr: 1_200,
      stripeMrr: 100,
      stripeArr: 1_200,
    });
  });

  it("excludes one-time Stripe latest invoice lines before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_one_time_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_one_time_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_one_time_line",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                    {
                      amount: 50_000,
                      quantity: 1,
                      price: {
                        type: "one_time",
                        unit_amount: 50_000,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("unwraps one-time Stripe latest invoice line price types before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_wrapped_one_time_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_wrapped_one_time_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_wrapped_one_time_line",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                    {
                      amount: 50_000,
                      quantity: 1,
                      price: {
                        type: { value: "one_time" },
                        unit_amount: 50_000,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("excludes one-time Stripe latest invoice line pricing fields before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_one_time_pricing_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_one_time_pricing_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_one_time_pricing_line",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      pricing: {
                        unit_amount_decimal: "100000",
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                    {
                      quantity: 1,
                      pricing: {
                        type: "one_time",
                        unit_amount_decimal: "50000",
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("excludes Stripe latest invoice item lines before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_item_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_item_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_item_line",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      type: "subscription",
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                    {
                      amount: 50_000,
                      quantity: 1,
                      type: "invoiceitem",
                      price: {
                        unit_amount: 50_000,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("excludes Stripe parent invoice item lines before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_parent_invoice_item_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_parent_invoice_item_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_parent_invoice_item_line",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      parent: {
                        type: "subscription_item_details",
                        subscription_item_details: {
                          subscription_item: "si_parent_subscription_item",
                        },
                      },
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                    {
                      amount: 50_000,
                      quantity: 1,
                      parent: {
                        type: "invoice_item_details",
                        invoice_item_details: {
                          invoice_item: "ii_one_time_support",
                        },
                      },
                      price: {
                        unit_amount: 50_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("excludes Stripe latest invoice proration lines before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_proration_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_proration_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_proration_line",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      type: "subscription",
                      price: {
                        unit_amount: 100_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                    {
                      amount: 20_000,
                      proration: true,
                      quantity: 1,
                      type: "subscription",
                      price: {
                        unit_amount: 20_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("excludes camelCase Stripe parent proration lines before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_parent_camel_proration_line",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_parent_camel_proration_line",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_parent_camel_proration_line",
              currency: "USD",
              latestInvoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 1,
                      parent: {
                        type: "subscription_item_details",
                        subscriptionItemDetails: {
                          subscriptionItem: "si_parent_camel_recurring",
                        },
                      },
                      price: {
                        unitAmount: 100_000,
                        recurring: {
                          interval: "month",
                          intervalCount: 1,
                        },
                      },
                    },
                    {
                      amount: 20_000,
                      quantity: 1,
                      parent: {
                        type: "subscription_item_details",
                        subscriptionItemDetails: {
                          proration: true,
                          subscriptionItem: "si_parent_camel_proration",
                        },
                      },
                      price: {
                        unitAmount: 20_000,
                        recurring: {
                          interval: "month",
                          intervalCount: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("does not multiply Stripe latest invoice line total amounts by quantity", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_line_total_amount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_line_total_amount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_line_total_amount",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 2,
                      period: {
                        start: 1_778_112_000,
                        end: 1_780_704_000,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("prefers Stripe latest invoice line total amounts over unit prices before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_line_amount_over_price",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_line_amount_over_price",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_line_amount_over_price",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 100_000,
                      quantity: 2,
                      price: {
                        unit_amount: 75_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("amortizes annual Stripe latest invoice line total amounts before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_latest_invoice_line_annual_total",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_latest_invoice_line_annual_total",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_latest_invoice_line_annual_total",
              currency: "USD",
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 1_200_000,
                      period: {
                        start: "2026-01-01T00:00:00.000Z",
                        end: "2027-01-01T00:00:00.000Z",
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 1_000,
      stripeArr: 12_000,
    });
  });

  it("subtracts Stripe subscription discounts before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_discounted_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_discounted",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_discounted",
              currency: "USD",
              discount: {
                coupon: {
                  percent_off: 20,
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_200,
      arr: 14_400,
      stripeMrr: 1_200,
      stripeArr: 14_400,
    });
  });

  it("ignores expired Stripe subscription discounts before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_expired_discounted_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_expired_discounted",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_expired_discounted",
              currency: "USD",
              discount: {
                end: "2026-05-15T00:00:00.000Z",
                coupon: {
                  percent_off: 20,
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("ignores future Stripe subscription discounts before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_future_discounted_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_future_discounted",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_future_discounted",
              currency: "USD",
              discount: {
                start: "2026-06-01T00:00:00.000Z",
                coupon: {
                  percent_off: 20,
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("ignores one-time Stripe subscription coupons before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_once_coupon_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_once_coupon",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_once_coupon",
              currency: "USD",
              discount: {
                coupon: {
                  duration: "once",
                  percent_off: 20,
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("unwraps scalar one-time Stripe coupon durations before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_scalar_once_coupon_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_scalar_once_coupon",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_scalar_once_coupon",
              currency: "USD",
              discount: {
                coupon: {
                  duration: { value: "once" },
                  percent_off: 20,
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("ignores elapsed repeating Stripe subscription coupons before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_elapsed_repeating_coupon_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_elapsed_repeating_coupon",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_elapsed_repeating_coupon",
              currency: "USD",
              discount: {
                start: "2026-01-01T00:00:00.000Z",
                coupon: {
                  duration: "repeating",
                  duration_in_months: 3,
                  percent_off: 20,
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_500,
      arr: 18_000,
      stripeMrr: 1_500,
      stripeArr: 18_000,
    });
  });

  it("subtracts wrapped Stripe subscription discounts before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_wrapped_discounted_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrapped_discounted",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrapped_discounted",
              currency: "USD",
              values: {
                discount: {
                  coupon: {
                    percent_off: 20,
                  },
                },
                items: {
                  data: [
                    {
                      quantity: 3,
                      price: {
                        unit_amount: 50_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_200,
      arr: 14_400,
      stripeMrr: 1_200,
      stripeArr: 14_400,
    });
  });

  it("unwraps scalar Stripe subscription discount containers before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_scalar_discount_container",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_scalar_discount_container",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_scalar_discount_container",
              currency: "USD",
              discounts: {
                value: {
                  data: [
                    {
                      coupon: {
                        percent_off: { value: 20 },
                      },
                    },
                  ],
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_200,
      arr: 14_400,
      stripeMrr: 1_200,
      stripeArr: 14_400,
    });
  });

  it("subtracts wrapped Stripe subscription discount coupon fields before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_wrapped_discount_coupon_fields",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrapped_discount_coupon_fields",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrapped_discount_coupon_fields",
              currency: "USD",
              discount: {
                values: {
                  coupon: {
                    percent_off: 20,
                  },
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_200,
      arr: 14_400,
      stripeMrr: 1_200,
      stripeArr: 14_400,
    });
  });

  it("subtracts JSON:API wrapped Stripe subscription discount coupon fields before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_json_api_discount_coupon_fields",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_json_api_discount_coupon_fields",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_json_api_discount_coupon_fields",
              currency: "USD",
              discount: {
                coupon: {
                  data: {
                    type: "coupons",
                    id: "coupon_json_api_percent_off",
                    attributes: {
                      percent_off: 20,
                    },
                  },
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_200,
      arr: 14_400,
      stripeMrr: 1_200,
      stripeArr: 14_400,
    });
  });

  it("subtracts nested Stripe subscription discounts before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_nested_discounted_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_nested_discounted",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_nested_discounted",
              currency: "USD",
              subscription: {
                discount: {
                  coupon: {
                    percent_off: 20,
                  },
                },
                items: {
                  data: [
                    {
                      quantity: 3,
                      price: {
                        unit_amount: 50_000,
                        recurring: {
                          interval: "month",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_200,
      arr: 14_400,
      stripeMrr: 1_200,
      stripeArr: 14_400,
    });
  });

  it("normalizes percent-formatted Stripe subscription discounts before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_percent_string_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_percent_string_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_percent_string_discount",
              currency: "USD",
              discount: {
                coupon: {
                  percent_off: "20%",
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_200,
      arr: 14_400,
      stripeMrr: 1_200,
      stripeArr: 14_400,
    });
  });

  it("normalizes text percent Stripe subscription discounts before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_text_percent_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_text_percent_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_text_percent_discount",
              currency: "USD",
              discount: {
                coupon: {
                  percent_off: "20 percent",
                },
              },
              items: {
                data: [
                  {
                    quantity: 3,
                    price: {
                      unit_amount: 50_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_200,
      arr: 14_400,
      stripeMrr: 1_200,
      stripeArr: 14_400,
    });
  });

  it("amortizes annual fixed Stripe discounts before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_annual_fixed_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_annual_fixed_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_annual_fixed_discount",
              currency: "USD",
              discount: {
                coupon: {
                  amount_off: 120_000,
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 1_200_000,
                      recurring: {
                        interval: "year",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("ignores deleted Stripe subscription items before amortizing fixed discounts", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_deleted_item_fixed_discount_divisor",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_deleted_item_fixed_discount_divisor",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_deleted_item_fixed_discount_divisor",
              currency: "USD",
              discount: {
                coupon: {
                  amount_off: 10_000,
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 100_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                  {
                    deleted: true,
                    quantity: 1,
                    price: {
                      unit_amount: 1_200_000,
                      recurring: {
                        interval: "year",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("ignores Stripe latest invoice proration lines before amortizing fixed discounts", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_proration_line_fixed_discount_divisor",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_proration_line_fixed_discount_divisor",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_proration_line_fixed_discount_divisor",
              currency: "USD",
              discount: {
                coupon: {
                  amount_off: 10_000,
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 100_000,
                      recurring: {
                        interval: "month",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
              latest_invoice: {
                lines: {
                  data: [
                    {
                      amount: 20_000,
                      proration: true,
                      quantity: 1,
                      type: "subscription",
                      price: {
                        unit_amount: 20_000,
                        recurring: {
                          interval: "year",
                          interval_count: 1,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("reads Stripe fixed discount currency options before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_currency_option_fixed_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_currency_option_fixed_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_currency_option_fixed_discount",
              currency: "USD",
              discount: {
                coupon: {
                  currency_options: {
                    usd: {
                      amount_off: 120_000,
                    },
                  },
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 1_200_000,
                      recurring: {
                        interval: "year",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("reads JSON:API wrapped Stripe fixed discount currency options before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_json_api_currency_option_fixed_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_json_api_currency_option_fixed_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_json_api_currency_option_fixed_discount",
              currency: "USD",
              discount: {
                coupon: {
                  currency_options: {
                    data: {
                      usd: {
                        data: {
                          type: "coupon_currency_options",
                          attributes: {
                            amount_off: 120_000,
                          },
                        },
                      },
                    },
                  },
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 1_200_000,
                      recurring: {
                        interval: "year",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("unwraps scalar Stripe fixed discount currency options before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_scalar_currency_option_fixed_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_scalar_currency_option_fixed_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_scalar_currency_option_fixed_discount",
              currency: "USD",
              discount: {
                coupon: {
                  currency_options: {
                    value: {
                      usd: {
                        amount_off: { value: 120_000 },
                      },
                    },
                  },
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 1_200_000,
                      recurring: {
                        interval: "year",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("unwraps scalar Stripe subscription currency before fixed discount currency options", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_scalar_currency_fixed_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_scalar_currency_fixed_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_scalar_currency_fixed_discount",
              currency: { value: "USD" },
              discount: {
                coupon: {
                  currency_options: {
                    usd: {
                      amount_off: 120_000,
                    },
                  },
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 1_200_000,
                      recurring: {
                        interval: "year",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("uses Stripe item price currency before fixed discount currency options", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_price_currency_fixed_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_price_currency_fixed_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_price_currency_fixed_discount",
              discount: {
                coupon: {
                  currency_options: {
                    usd: {
                      amount_off: 120_000,
                    },
                  },
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      currency: { value: "USD" },
                      unit_amount: 1_200_000,
                      recurring: {
                        interval: "year",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("matches Stripe fixed discount currency options case-insensitively before canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_upper_currency_option_fixed_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_upper_currency_option_fixed_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_upper_currency_option_fixed_discount",
              currency: "USD",
              discount: {
                coupon: {
                  currency_options: {
                    USD: {
                      amount_off: 120_000,
                    },
                  },
                },
              },
              items: {
                data: [
                  {
                    quantity: 1,
                    price: {
                      unit_amount: 1_200_000,
                      recurring: {
                        interval: "year",
                        interval_count: 1,
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("amortizes annual fixed Stripe discounts with wrapped item recurring fields before materializing canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_wrapped_annual_fixed_discount",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrapped_annual_fixed_discount",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_wrapped_annual_fixed_discount",
              currency: "USD",
              discount: {
                coupon: {
                  amount_off: 120_000,
                },
              },
              items: {
                data: [
                  {
                    values: {
                      quantity: 1,
                      price: {
                        unit_amount: 1_200_000,
                        recurring: {
                          interval: "year",
                          interval_count: 1,
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 900,
      arr: 10_800,
      stripeMrr: 900,
      stripeArr: 10_800,
    });
  });

  it("reads nested Mercury finance fields before materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_nested",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_nested",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              properties: {
                availableBalance: "$240,000.00",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_nested_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_nested_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              properties: {
                amount: "-$120,000.00",
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 120_000,
      cashOutflow: 120_000,
      cashInflow: 0,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 2,
      cashBalance: 240_000,
      netBurn: 120_000,
    });
  });

  it("preserves negative net burn when cash inflow exceeds cash outflow", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_profitable",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_profitable",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              availableBalance: 240_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_profitable_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_profitable_outflow",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              amount: -40_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_txn_profitable_inflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_profitable_inflow",
            occurredAt: new Date("2026-05-15T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
            payload: {
              amount: 90_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: -50_000,
      cashOutflow: 40_000,
      cashInflow: 90_000,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: null,
      cashBalance: 240_000,
      netBurn: -50_000,
    });
  });

  it("reads nested currency fields before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_nested_currency",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_nested_currency",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              properties: {
                availableBalance: "240000",
                currency: "eur",
              },
            },
          },
          {
            id: "raw_mercury_txn_nested_currency",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_nested_currency",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              properties: {
                amount: "-120000",
                currency: "eur",
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      currency: "EUR",
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      currency: "EUR",
    });
  });

  it("reads wrapped currency fields before finance materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_balance_wrapped_currency",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_wrapped_currency",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              values: {
                availableBalance: "240000",
                currency: "eur",
              },
            },
          },
          {
            id: "raw_mercury_txn_wrapped_currency",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_wrapped_currency",
            occurredAt: new Date("2026-05-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-05T00:00:00.000Z"),
            payload: {
              attributes: {
                amount: "-120000",
                currency: "eur",
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      currency: "EUR",
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      currency: "EUR",
    });
  });

  it("sums Mercury account balances before calculating cash runway", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_checking_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:checking",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              accountId: "checking",
              balance: 100_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_treasury_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:treasury",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:01:00.000Z"),
            payload: {
              accountId: "treasury",
              balance: 250_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_outflow_multi_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_multi_balance_outflow",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              amount: -100_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_snapshot_with_account_balances",
            provider: IntegrationProvider.MERCURY,
            objectType: "snapshot",
            externalId: "mercury:snapshot:with-account-balances",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:02:00.000Z"),
            payload: {
              cashFlow: {
                totalBalance: 350_000,
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 350_000,
      netBurn: 100_000,
      months: 3.5,
    });
  });

  it("reads wrapped Mercury account balances and transactions before calculating cash runway", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_wrapped_checking_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:wrapped-checking",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              values: {
                account: {
                  id: "wrapped-checking",
                },
                balance: 100_000,
                balanceAsOf: "2026-05-29T00:00:00.000Z",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_wrapped_treasury_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:wrapped-treasury",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:01:00.000Z"),
            payload: {
              attributes: {
                accountId: "wrapped-treasury",
                availableBalance: 250_000,
                effectiveAt: "2026-05-29T00:01:00.000Z",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_wrapped_outflow_multi_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_wrapped_multi_balance_outflow",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              fields: {
                amountCents: -10_000_000,
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 350_000,
      netBurn: 100_000,
      months: 3.5,
    });
  });

  it("uses the latest Mercury account balance per account before calculating cash runway", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_checking_old_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:checking",
            occurredAt: new Date("2026-05-15T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
            payload: {
              accountId: "checking",
              balance: 80_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_savings_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:savings",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              accountId: "savings",
              balance: 50_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_checking_new_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:checking",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              accountId: "checking",
              balance: 100_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_latest_balance_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_latest_balance_outflow",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              amount: -50_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 150_000,
      netBurn: 50_000,
      months: 3,
    });
  });

  it("prefers Mercury balance update timestamps over generic occurrence dates", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_checking_stale_balance_with_newer_occurrence",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:checking:stale",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
            payload: {
              accountId: "checking",
              balance: 80_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_checking_current_balance_with_older_occurrence",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:checking:current",
            occurredAt: new Date("2026-05-01T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              accountId: "checking",
              balance: 100_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_savings_balance_for_update_timestamp",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "mercury:account_balance:savings:update-timestamp",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              accountId: "savings",
              balance: 50_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_update_timestamp_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_update_timestamp_outflow",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              amount: -50_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 150_000,
      netBurn: 50_000,
      months: 3,
    });
  });

  it("uses Mercury snapshot cash totals when account balances are absent", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_snapshot_cash_flow",
            provider: IntegrationProvider.MERCURY,
            objectType: "snapshot",
            externalId: "mercury:snapshot:2026-05",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              cashFlow: {
                totalBalance: 480_000,
                bankCash: 180_000,
                treasuryCash: 300_000,
              },
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_snapshot_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_snapshot_outflow",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              amount: -120_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 480_000,
      netBurn: 120_000,
      months: 4,
    });
  });

  it("ignores Mercury transaction cash totals when account balances are absent", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_transaction_with_cash_total",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_with_cash_total",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              amount: -100_000,
              cashFlow: {
                totalCash: 999_000,
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 0,
      netBurn: 100_000,
      months: 0,
    });
  });

  it("reads wrapped Mercury snapshot cash totals when account balances are absent", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_wrapped_snapshot_cash_flow",
            provider: IntegrationProvider.MERCURY,
            objectType: "snapshot",
            externalId: "mercury:snapshot:wrapped-cash",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              values: {
                cashFlow: {
                  bankCash: 180_000,
                  treasuryCash: 300_000,
                },
              },
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_wrapped_snapshot_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_wrapped_snapshot_outflow",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              amount: -120_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 480_000,
      netBurn: 120_000,
      months: 4,
    });
  });

  it("uses the latest Mercury snapshot cash total when account balances are absent", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_snapshot_newer_cash_flow",
            provider: IntegrationProvider.MERCURY,
            objectType: "snapshot",
            externalId: "mercury:snapshot:2026-05-29",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              cashFlow: {
                totalBalance: 480_000,
              },
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_snapshot_older_cash_flow",
            provider: IntegrationProvider.MERCURY,
            objectType: "snapshot",
            externalId: "mercury:snapshot:2026-05-15",
            occurredAt: new Date("2026-05-15T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
            payload: {
              cashFlow: {
                totalBalance: 120_000,
              },
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_snapshot_latest_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_snapshot_latest_outflow",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              amount: -120_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 480_000,
      netBurn: 120_000,
      months: 4,
    });
  });

  it("keeps durable finance state records while ignoring out-of-period transactions", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mercury_current_balance",
            provider: IntegrationProvider.MERCURY,
            objectType: "account_balance",
            externalId: "balance_current_period",
            occurredAt: new Date("2026-05-29T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
            payload: {
              accountId: "checking",
              balance: 100_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_current_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_current_period_outflow",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              amount: -100_000,
              currency: "USD",
            },
          },
          {
            id: "raw_mercury_prior_period_outflow",
            provider: IntegrationProvider.MERCURY,
            objectType: "transaction",
            externalId: "txn_prior_period_outflow",
            occurredAt: new Date("2026-04-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-04-20T00:00:00.000Z"),
            payload: {
              amount: -1_000_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_prior_period_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_prior_period",
            occurredAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-04-30T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_prior_period",
              monthlyRecurringRevenue: 50_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 50_000,
      arr: 600_000,
    });
    expect(results.find((result) => result.metricKey === "finance.net_burn")?.value).toMatchObject({
      amount: 50_000,
      cashOutflow: 100_000,
      cashInflow: 50_000,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      cashBalance: 100_000,
      netBurn: 50_000,
      months: 2,
    });
    expect(results.find((result) => result.metricKey === "revenue.mrr")?.rawRecordCount).toBe(3);
  });

  it("excludes inactive Stripe subscriptions with formatted statuses from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_unpaid_formatted_status",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_unpaid_formatted_status",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: " unpaid ",
              customerId: "cus_unpaid",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("keeps Stripe subscriptions canceled after the reporting period in canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_canceled_after_period",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_canceled_after_period",
            occurredAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-06-02T00:00:00.000Z"),
            payload: {
              status: "canceled",
              canceled_at: "2026-06-02T00:00:00.000Z",
              customerId: "cus_canceled_after_period",
              monthlyRecurringRevenue: 25_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 25_000,
      arr: 300_000,
      stripeMrr: 25_000,
      stripeArr: 300_000,
    });
  });

  it("excludes active Stripe subscriptions scheduled to cancel inside the reporting period from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_scheduled_cancel_in_period",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_scheduled_cancel_in_period",
            occurredAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
            payload: {
              status: "active",
              cancel_at: "2026-05-15T00:00:00.000Z",
              customerId: "cus_scheduled_cancel",
              monthlyRecurringRevenue: 25_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes active Stripe subscriptions with nested current period end dates before the report", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_nested_period_ended",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_nested_period_ended",
            occurredAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
            payload: {
              status: "active",
              subscription: {
                current_period: {
                  end_date: "2026-05-15T00:00:00.000Z",
                },
              },
              customerId: "cus_nested_period_ended",
              monthlyRecurringRevenue: 25_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_top_level_period_ended",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_top_level_period_ended",
            occurredAt: new Date("2026-04-16T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-04-16T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-16T00:00:00.000Z"),
            payload: {
              status: "active",
              currentPeriod: {
                endDate: "2026-05-16T00:00:00.000Z",
              },
              customerId: "cus_top_level_period_ended",
              monthlyRecurringRevenue: 15_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_period_end_alias",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_period_end_alias",
            occurredAt: new Date("2026-04-17T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-04-17T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-17T00:00:00.000Z"),
            payload: {
              status: "active",
              current_period_end: "2026-05-17T00:00:00.000Z",
              customerId: "cus_period_end_alias",
              monthlyRecurringRevenue: 10_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes inactive Stripe subscriptions with display statuses from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_incomplete_expired_display_status",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_incomplete_expired_display_status",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: " incomplete expired ",
              customerId: "cus_incomplete_expired",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes inactive Stripe subscriptions with object-shaped statuses from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_canceled_object_status",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_canceled_object_status",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: { name: "Canceled" },
              customerId: "cus_canceled_object_status",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes inactive Stripe subscriptions with nested statuses from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_properties_unpaid_status",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_properties_unpaid_status",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              properties: {
                status: "unpaid",
              },
              customerId: "cus_properties_unpaid",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_subscription_paused_status",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_subscription_paused_status",
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              subscription: {
                status: "paused",
              },
              customerId: "cus_subscription_paused",
              monthlyRecurringRevenue: 20_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes inactive Stripe subscriptions with wrapped statuses from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_wrapped_canceled_status",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrapped_canceled_status",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              values: {
                status: "canceled",
              },
              customerId: "cus_wrapped_canceled",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes future-trial Stripe subscriptions from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_future_trial_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_future_trial",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "trialing",
              customerId: "cus_future_trial",
              monthlyRecurringRevenue: 30_000,
              trial_end: "2026-06-15T00:00:00.000Z",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes active Stripe subscriptions that start after the reporting period", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_future_start_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_future_start",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_future_start",
              monthlyRecurringRevenue: 30_000,
              current_period_start: "2026-06-01T00:00:00.000Z",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes active Stripe subscriptions with nested future current period start dates", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_nested_future_start_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_nested_future_start",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              subscription: {
                status: "active",
                currentPeriod: {
                  startDate: "2026-06-01T00:00:00.000Z",
                },
              },
              customerId: "cus_nested_future_start",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_top_level_future_start_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_top_level_future_start",
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: {
              status: "active",
              currentPeriod: {
                startDate: "2026-06-01T00:00:00.000Z",
              },
              customerId: "cus_top_level_future_start",
              monthlyRecurringRevenue: 20_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("unwraps Stripe trial end date envelopes before canonical MRR materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_wrapped_past_trial_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_wrapped_past_trial",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "trialing",
              customerId: "cus_wrapped_past_trial",
              monthlyRecurringRevenue: 30_000,
              trial_end: { data: { attributes: { value: "2026-05-15T00:00:00.000Z" } } },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 30_000,
      arr: 360_000,
      stripeMrr: 30_000,
      stripeArr: 360_000,
    });
  });

  it("excludes trialing Stripe subscriptions without trial end timestamps from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_unknown_trial_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_unknown_trial",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "trialing",
              customerId: "cus_unknown_trial",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("clamps negative explicit Stripe subscription MRR before canonical materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_negative_mrr",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_negative_mrr",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_negative_mrr",
              monthlyRecurringRevenue: "($3,000.00)",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      stripeMrr: 0,
      stripeArr: 0,
    });
  });

  it("excludes incomplete and paused Stripe subscriptions from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_active_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_active",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_active",
              monthlyRecurringRevenue: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_incomplete_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_incomplete",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "incomplete",
              customerId: "cus_incomplete",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_stripe_paused_subscription",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_paused",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "paused",
              customerId: "cus_paused",
              monthlyRecurringRevenue: 20_000,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 10_000,
      arr: 120_000,
      stripeMrr: 10_000,
      stripeArr: 120_000,
    });
  });

  it("keeps HubSpot recurring revenue when the matching Stripe subscription is inactive", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_canceled_link",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_canceled_link",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: " canceled ",
              customerId: "cus_canceled",
              customerEmail: "billing@inactive.example",
              monthlyRecurringRevenue: 30_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_deal_matching_inactive_stripe",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_matching_inactive_stripe",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              stripeCustomerId: "cus_canceled",
              primaryContactEmail: "billing@inactive.example",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 0,
      stripeArr: 0,
      hubspotOnlySubscriptionMrr: 1_000,
      hubspotOnlySubscriptionArr: 12_000,
      excludedLinkedHubspotSubscriptionMrr: 0,
      excludedLinkedHubspotSubscriptionArr: 0,
    });
  });

  it("keeps HubSpot recurring revenue when the matching Stripe subscription is a future trial", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_future_trial_link",
            provider: IntegrationProvider.STRIPE,
            objectType: "subscription",
            externalId: "sub_future_trial_link",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: {
              status: "trialing",
              customerId: "cus_future_trial_link",
              customerEmail: "billing@trial.example",
              monthlyRecurringRevenue: 30_000,
              trial_end: "2026-06-15T00:00:00.000Z",
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_deal_matching_future_trial_stripe",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_matching_future_trial_stripe",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              stripeCustomerId: "cus_future_trial_link",
              primaryContactEmail: "billing@trial.example",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      stripeMrr: 0,
      stripeArr: 0,
      hubspotOnlySubscriptionMrr: 1_000,
      hubspotOnlySubscriptionArr: 12_000,
      excludedLinkedHubspotSubscriptionMrr: 0,
      excludedLinkedHubspotSubscriptionArr: 0,
    });
  });

  it("normalizes HubSpot subscription deal stages before canonical MRR calculation", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_formatted_closed_won_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_formatted_closed_won",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: " closedwon ",
              recurringRevenue: true,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      hubspotSubscriptionMrr: 1_000,
      hubspotSubscriptionArr: 12_000,
      hubspotOnlySubscriptionMrr: 1_000,
      hubspotOnlySubscriptionArr: 12_000,
    });
  });

  it("excludes HubSpot recurring revenue that starts after the reporting period", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_future_start_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_future_start_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              subscriptionStartDate: "2026-06-01T00:00:00.000Z",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      hubspotSubscriptionMrr: 0,
      hubspotSubscriptionArr: 0,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
    });
  });

  it("excludes HubSpot recurring revenue that ended before the reporting period", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_ended_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_ended_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "closedwon",
              recurringRevenue: true,
              subscriptionEndDate: "2026-04-30T00:00:00.000Z",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      hubspotSubscriptionMrr: 0,
      hubspotSubscriptionArr: 0,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
    });
  });

  it("excludes HubSpot recurring revenue with nested future subscription start dates", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_nested_future_start_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_nested_future_start_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              properties: {
                amount: 12_000,
                dealstage: "closedwon",
                recurringRevenue: true,
                subscription: {
                  startDate: "2026-06-01T00:00:00.000Z",
                },
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      hubspotSubscriptionMrr: 0,
      hubspotSubscriptionArr: 0,
      hubspotOnlySubscriptionMrr: 0,
      hubspotOnlySubscriptionArr: 0,
    });
  });

  it("recognizes human-readable closed-won stages before canonical MRR calculation", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_human_closed_won_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_human_closed_won",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              dealstage: "Closed Won",
              recurringRevenue: true,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      hubspotSubscriptionMrr: 1_000,
      hubspotOnlySubscriptionMrr: 1_000,
    });
  });

  it("excludes HubSpot subscription revenue that closes after the reporting period", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_future_closed_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_future_closed_subscription",
            occurredAt: new Date("2026-06-02T00:00:00.000Z"),
            sourceCreatedAt: new Date("2026-04-15T00:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-06-02T00:00:00.000Z"),
            payload: {
              amount: 120_000,
              dealstage: "Closed Won",
              closed_at: "2026-06-02T00:00:00.000Z",
              recurringRevenue: true,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-06-03T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      hubspotSubscriptionMrr: 0,
      hubspotOnlySubscriptionMrr: 0,
    });
  });

  it("excludes non-won HubSpot stage labels before canonical MRR calculation", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_stage_label_qualified_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_stage_label_qualified_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 12_000,
              stageLabel: "Sales Qualified Lead",
              recurringRevenue: true,
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      hubspotSubscriptionMrr: 0,
      hubspotOnlySubscriptionMrr: 0,
    });
  });

  it("excludes HubSpot deals with string false recurring flags before canonical MRR calculation", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_string_false_recurring_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_string_false_recurring",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 120_000,
              dealstage: "closedwon",
              recurringRevenue: "false",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      hubspotSubscriptionMrr: 0,
      hubspotOnlySubscriptionMrr: 0,
    });
  });

  it("excludes HubSpot deals with object-shaped false recurring flags before canonical MRR calculation", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_object_false_recurring_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_object_false_recurring",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 120_000,
              dealstage: "closedwon",
              recurringRevenue: { value: false },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      hubspotSubscriptionMrr: 0,
      hubspotOnlySubscriptionMrr: 0,
    });
  });

  it("excludes closed-won HubSpot deals without recurring evidence from canonical MRR", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_closed_won_one_time_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_closed_won_one_time",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: 120_000,
              dealstage: "closedwon",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 0,
      arr: 0,
      hubspotSubscriptionMrr: 0,
      hubspotOnlySubscriptionMrr: 0,
    });
  });

  it("reads nested HubSpot subscription fields before canonical MRR calculation", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_nested_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_nested_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              properties: {
                amount: "12000",
                dealstage: "closedwon",
                recurringRevenue: true,
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      hubspotSubscriptionMrr: 1_000,
      hubspotOnlySubscriptionMrr: 1_000,
    });
  });

  it("reads wrapped HubSpot subscription fields before canonical MRR calculation", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_wrapped_subscription_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_wrapped_subscription",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              values: {
                amount: "12000",
                dealstage: "closedwon",
                recurringRevenue: true,
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: `metric_${create.metricKey}`, ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 1_000,
      arr: 12_000,
      hubspotSubscriptionMrr: 1_000,
      hubspotOnlySubscriptionMrr: 1_000,
    });
  });

  it("sets missing finance metrics to zero confidence when no source records exist", async () => {
    const prisma = createEmptyFinancePrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.map((result) => result.status)).toEqual(["MISSING", "MISSING", "MISSING"]);
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledTimes(3);
    for (const call of prisma.imladrisCanonicalMetricValue.upsert.mock.calls) {
      expect(call[0].create).toMatchObject({
        status: "MISSING",
        confidence: 0,
        warnings: ["No Mercury, Stripe, or HubSpot raw records were available for finance materialization."],
      });
      expect(call[0].update).toMatchObject({
        status: "MISSING",
        confidence: 0,
      });
    }
    expect(prisma.imladrisMetricLineage.createMany).not.toHaveBeenCalled();
  });

  it("marks finance metrics partial when only one required provider family is present", async () => {
    const prisma = createFinancePrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_mercury_balance_only",
        provider: IntegrationProvider.MERCURY,
        objectType: "account_balance",
        externalId: "balance_only",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          availableBalance: 500_000,
          currency: "USD",
        },
      },
    ]);

    const results = await materializeImladrisFinanceMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(results.map((result) => result.status)).toEqual(["PARTIAL", "PARTIAL", "PARTIAL"]);
    for (const call of prisma.imladrisCanonicalMetricValue.upsert.mock.calls) {
      expect(call[0].create).toMatchObject({
        status: "PARTIAL",
        warnings: [
          "Finance metrics are missing Stripe and HubSpot raw records for this period.",
        ],
      });
      expect(call[0].update).toMatchObject({
        status: "PARTIAL",
        warnings: [
          "Finance metrics are missing Stripe and HubSpot raw records for this period.",
        ],
      });
    }
  });

  it("materializes qualified sales pipeline from HubSpot and collaboration raw records", async () => {
    const prisma = createSalesPrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "sales.qualified_pipeline",
      status: "READY",
      rawRecordCount: 4,
      value: {
        amount: 120_000,
        currency: "USD",
        qualifiedDealCount: 1,
        collaborationTouchCount: 2,
        collaborationCoverage: 1,
      },
    });
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        provider: {
          in: [
            IntegrationProvider.HUBSPOT,
            IntegrationProvider.GOOGLE_WORKSPACE,
            IntegrationProvider.SLACK,
          ],
        },
        OR: SCOPED_RAW_RECORD_FILTERS,
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId_metricKey_periodEnd_calculationVersion: {
          organizationId: "org_1",
          userId: "user_1",
          metricKey: "sales.qualified_pipeline",
          periodEnd,
          calculationVersion: "sales-qualified-pipeline-v1",
        },
      },
      create: expect.objectContaining({
        metricKey: "sales.qualified_pipeline",
        department: "sales",
        unit: "currency",
        status: "READY",
        value: {
          amount: 120_000,
          currency: "USD",
          qualifiedDealCount: 1,
          collaborationTouchCount: 2,
          collaborationCoverage: 1,
        },
      }),
      update: expect.objectContaining({
        status: "READY",
        value: {
          amount: 120_000,
          currency: "USD",
          qualifiedDealCount: 1,
          collaborationTouchCount: 2,
          collaborationCoverage: 1,
        },
      }),
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          metricValueId: "metric_sales_qualified_pipeline",
          rawRecordId: "raw_hubspot_pipeline_1",
          sourceKey: "hubspot",
          sourceType: "deal",
          sourceId: "deal_qualified_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_sales_qualified_pipeline",
          rawRecordId: "raw_google_meeting_1",
          sourceKey: "googleWorkspace",
          sourceType: "calendar_event",
          sourceId: "meeting_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_sales_qualified_pipeline",
          rawRecordId: "raw_slack_thread_1",
          sourceKey: "slack",
          sourceType: "thread",
          sourceId: "thread_1",
        }),
      ]),
    });
  });

  it("normalizes provider envelopes before sales pipeline materialization", async () => {
    const prisma = createSalesPrismaMock();
    const records: unknown[] = [
      {
        id: "raw_wrapped_hubspot_pipeline",
        provider: { value: "hubspot" },
        objectType: "deal",
        externalId: "deal_provider_wrapped",
        occurredAt: new Date("2026-05-03T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          amount: 75_000,
          dealstage: "qualified",
          currency: "USD",
        },
      },
      {
        id: "raw_camel_google_workspace_meeting",
        provider: "googleWorkspace",
        objectType: "calendar_event",
        externalId: "meeting_provider_wrapped",
        occurredAt: new Date("2026-05-15T17:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-15T17:00:00.000Z"),
        payload: {
          dealId: "deal_provider_wrapped",
        },
      },
      {
        id: "raw_lower_slack_thread",
        provider: "slack",
        objectType: "thread",
        externalId: "thread_provider_wrapped",
        occurredAt: new Date("2026-05-16T17:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-16T17:00:00.000Z"),
        payload: {
          dealId: "deal_provider_wrapped",
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(records as never);

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "sales.qualified_pipeline",
      status: "READY",
      rawRecordCount: 3,
      value: {
        amount: 75_000,
        currency: "USD",
        qualifiedDealCount: 1,
        collaborationTouchCount: 2,
        collaborationCoverage: 1,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_wrapped_hubspot_pipeline",
          sourceKey: "hubspot",
        }),
        expect.objectContaining({
          rawRecordId: "raw_camel_google_workspace_meeting",
          sourceKey: "googleWorkspace",
        }),
        expect.objectContaining({
          rawRecordId: "raw_lower_slack_thread",
          sourceKey: "slack",
        }),
      ]),
    });
  });

  it("marks sales pipeline partial when collaboration providers are missing", async () => {
    const prisma = createSalesPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_hubspot_pipeline_only",
        provider: IntegrationProvider.HUBSPOT,
        objectType: "deal",
        externalId: "deal_qualified_only",
        occurredAt: new Date("2026-05-03T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          amount: 120_000,
          dealstage: "qualified",
          pipeline: "new-business",
          companyId: "acct_1",
          currency: "USD",
        },
      },
    ]);

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "sales.qualified_pipeline",
      status: "PARTIAL",
      rawRecordCount: 1,
      value: expect.objectContaining({
        amount: 120_000,
        collaborationTouchCount: 0,
        collaborationCoverage: 0,
      }),
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "PARTIAL",
          warnings: [
            "Qualified Pipeline is missing Google Workspace and Slack raw records for this period.",
          ],
        }),
      }),
    );
  });

  it("normalizes HubSpot deal stages before calculating qualified sales pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_formatted_qualified_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_formatted_qualified",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              id: "deal_formatted_qualified",
              amount: 50_000,
              dealstage: " qualified ",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_formatted_stage", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      amount: 50_000,
      qualifiedDealCount: 1,
    });
  });

  it("recognizes human-readable qualified stages before calculating sales pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_human_qualified_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_human_qualified",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              id: "deal_human_qualified",
              amount: 50_000,
              dealstage: "Sales Qualified Lead",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_human_stage", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      amount: 50_000,
      qualifiedDealCount: 1,
    });
  });

  it("recognizes HubSpot SQL stage abbreviations before calculating sales pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_sql_qualified_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_sql_qualified",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              id: "deal_sql_qualified",
              amount: 50_000,
              dealstage: "SQL",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_sql_stage", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      amount: 50_000,
      qualifiedDealCount: 1,
    });
  });

  it("recognizes qualified stage labels before calculating sales pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_stage_label_qualified_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_stage_label_qualified",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              id: "deal_stage_label_qualified",
              amount: 50_000,
              stageLabel: "Sales Qualified Lead",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_stage_label", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      amount: 50_000,
      qualifiedDealCount: 1,
    });
  });

  it("reads nested HubSpot deal fields before calculating sales pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_nested_qualified_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_nested_qualified",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              properties: {
                hs_object_id: "deal_nested_qualified",
                amount: "50000",
                dealstage: "qualified",
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_nested_deal", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      amount: 50_000,
      qualifiedDealCount: 1,
    });
  });

  it("reads HubSpot deal amount aliases before calculating sales pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_projected_amount_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_projected_amount",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              properties: {
                hs_object_id: "deal_projected_amount",
                hs_projected_amount: "$40k",
                dealstage: "qualified",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_weighted_amount_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_weighted_amount",
            occurredAt: new Date("2026-05-21T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
            payload: {
              weightedAmount: "USD 35k",
              dealstage: "proposal",
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_home_currency_amount_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_home_currency_amount",
            occurredAt: new Date("2026-05-22T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-22T00:00:00.000Z"),
            payload: {
              properties: {
                amountInHomeCurrency: "25000",
                stageLabel: "Sales Qualified Lead",
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_amount_aliases", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      amount: 100_000,
      qualifiedDealCount: 3,
    });
  });

  it("clamps negative HubSpot deal amounts before calculating sales pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_negative_qualified_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_negative_qualified",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              amount: -50_000,
              dealstage: "qualified",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_negative_deal", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      amount: 0,
      qualifiedDealCount: 1,
    });
  });

  it("normalizes deal identifiers before calculating sales collaboration coverage", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_qualified_deal_spaced_id",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_spaced_id",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              id: " deal_spaced_id ",
              amount: 50_000,
              dealstage: "qualified",
              currency: "USD",
            },
          },
          {
            id: "raw_google_touch_matching_unspaced_deal_id",
            provider: IntegrationProvider.GOOGLE_WORKSPACE,
            objectType: "calendar_event",
            externalId: "meeting_matching_unspaced_deal_id",
            occurredAt: new Date("2026-05-21T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
            payload: {
              dealId: "deal_spaced_id",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_spaced_deal_id", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      qualifiedDealCount: 1,
      collaborationTouchCount: 1,
      collaborationCoverage: 1,
    });
  });

  it("normalizes numeric deal identifiers before calculating sales collaboration coverage", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_qualified_deal_numeric_id",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "hubspot:deal:42",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              id: 42,
              amount: 50_000,
              dealstage: "qualified",
              currency: "USD",
            },
          },
          {
            id: "raw_google_touch_matching_numeric_deal_id",
            provider: IntegrationProvider.GOOGLE_WORKSPACE,
            objectType: "calendar_event",
            externalId: "meeting_matching_numeric_deal_id",
            occurredAt: new Date("2026-05-21T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
            payload: {
              dealId: "42",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_numeric_deal_id", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      qualifiedDealCount: 1,
      collaborationTouchCount: 1,
      collaborationCoverage: 1,
    });
  });

  it("reads nested snake_case deal identifiers before calculating sales collaboration coverage", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_qualified_deal_nested_link",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_nested_link",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              id: "deal_nested_link",
              amount: 50_000,
              dealstage: "qualified",
              currency: "USD",
            },
          },
          {
            id: "raw_slack_touch_nested_snake_case_deal_id",
            provider: IntegrationProvider.SLACK,
            objectType: "thread",
            externalId: "thread_nested_snake_case_deal_id",
            occurredAt: new Date("2026-05-21T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
            payload: {
              properties: {
                deal_id: "deal_nested_link",
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_nested_deal_id", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      qualifiedDealCount: 1,
      collaborationTouchCount: 1,
      collaborationCoverage: 1,
    });
  });

  it("reads wrapped sales deal fields and collaboration deal identifiers before calculating coverage", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_wrapped_qualified_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "hubspot:deal:wrapped",
            occurredAt: new Date("2026-05-20T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
            payload: {
              values: {
                hs_object_id: "deal_wrapped_link",
                amount: "75000",
                dealstage: "qualified",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_slack_touch_wrapped_deal_id",
            provider: IntegrationProvider.SLACK,
            objectType: "thread",
            externalId: "thread_wrapped_deal_id",
            occurredAt: new Date("2026-05-21T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
            payload: {
              fields: {
                deal_id: "deal_wrapped_link",
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_sales_wrapped_deal_id", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisSalesMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      amount: 75_000,
      qualifiedDealCount: 1,
      collaborationTouchCount: 1,
      collaborationCoverage: 1,
    });
  });

  it("materializes marketing pipeline efficiency from acquisition and pipeline raw records", async () => {
    const prisma = createMarketingPrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "marketing.pipeline_efficiency",
      status: "READY",
      rawRecordCount: 11,
      value: {
        ratio: 5.14,
        qualifiedPipeline: 90_000,
        acquisitionSpend: 17_500,
        websiteSessions: 2_000,
        webflowFormSubmissions: 25,
        organicTraffic: 500,
        searchClicks: 120,
        searchImpressions: 2400,
        identifiedVisitors: 2,
        currency: "USD",
      },
    });
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        provider: {
          in: [
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
            IntegrationProvider.META_PAGE,
          ],
        },
        OR: SCOPED_RAW_RECORD_FILTERS,
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId_metricKey_periodEnd_calculationVersion: {
          organizationId: "org_1",
          userId: "user_1",
          metricKey: "marketing.pipeline_efficiency",
          periodEnd,
          calculationVersion: "marketing-pipeline-efficiency-v1",
        },
      },
      create: expect.objectContaining({
        metricKey: "marketing.pipeline_efficiency",
        department: "marketing",
        unit: "ratio",
        status: "READY",
        value: {
          ratio: 5.14,
          qualifiedPipeline: 90_000,
          acquisitionSpend: 17_500,
          websiteSessions: 2_000,
          webflowFormSubmissions: 25,
          organicTraffic: 500,
          searchClicks: 120,
          searchImpressions: 2400,
          identifiedVisitors: 2,
          currency: "USD",
        },
      }),
      update: expect.objectContaining({
        status: "READY",
        value: {
          ratio: 5.14,
          qualifiedPipeline: 90_000,
          acquisitionSpend: 17_500,
          websiteSessions: 2_000,
          webflowFormSubmissions: 25,
          organicTraffic: 500,
          searchClicks: 120,
          searchImpressions: 2400,
          identifiedVisitors: 2,
          currency: "USD",
        },
      }),
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          metricValueId: "metric_marketing_pipeline_efficiency",
          rawRecordId: "raw_google_ads_1",
          sourceKey: "googleAds",
          sourceType: "campaign_metric",
          sourceId: "gads_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_marketing_pipeline_efficiency",
          rawRecordId: "raw_ga_1",
          sourceKey: "googleAnalytics",
          sourceType: "traffic_summary",
          sourceId: "ga_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_marketing_pipeline_efficiency",
          rawRecordId: "raw_webflow_1",
          sourceKey: "webflow",
          sourceType: "snapshot",
          sourceId: "webflow_snapshot_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_marketing_pipeline_efficiency",
          rawRecordId: "raw_reddit_ads_1",
          sourceKey: "reddit",
          sourceType: "campaign_metric",
          sourceId: "reddit_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_marketing_pipeline_efficiency",
          rawRecordId: "raw_semrush_1",
          sourceKey: "semrush",
          sourceType: "domain_organic",
          sourceId: "semrush_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_marketing_pipeline_efficiency",
          rawRecordId: "raw_gsc_1",
          sourceKey: "googleSearchConsole",
          sourceType: "query",
          sourceId: "gsc_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_marketing_pipeline_efficiency",
          rawRecordId: "raw_unify_1",
          sourceKey: "unify",
          sourceType: "visitor",
          sourceId: "visitor_1",
        }),
      ]),
    });
  });

  it("normalizes provider envelopes before marketing materialization", async () => {
    const prisma = createMarketingPrismaMock();
    const records: unknown[] = [
      {
        id: "raw_camel_google_ads_marketing",
        provider: "googleAds",
        objectType: "campaign_metric",
        externalId: "gads_provider_wrapped",
        occurredAt: new Date("2026-05-08T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
        payload: { spend: 1_000, currency: "USD" },
      },
      {
        id: "raw_wrapped_meta_ads_marketing",
        provider: { value: "metaAds" },
        objectType: "campaign_metric",
        externalId: "meta_provider_wrapped",
        occurredAt: new Date("2026-05-09T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-09T00:00:00.000Z"),
        payload: { amountSpent: 500, currency: "USD" },
      },
      {
        id: "raw_camel_meta_page_marketing",
        provider: "metaPage",
        objectType: "campaign_metric",
        externalId: "meta_page_provider_wrapped",
        occurredAt: new Date("2026-05-09T06:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-09T06:00:00.000Z"),
        payload: { spend: 250, currency: "USD" },
      },
      {
        id: "raw_lower_reddit_marketing",
        provider: "reddit",
        objectType: "campaign_metric",
        externalId: "reddit_provider_wrapped",
        occurredAt: new Date("2026-05-09T12:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-09T12:00:00.000Z"),
        payload: { spend: 250, currency: "USD" },
      },
      {
        id: "raw_camel_google_analytics_marketing",
        provider: "googleAnalytics",
        objectType: "traffic_summary",
        externalId: "ga_provider_wrapped",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
        payload: { sessions: 300 },
      },
      {
        id: "raw_lower_webflow_marketing",
        provider: "webflow",
        objectType: "snapshot",
        externalId: "webflow_provider_wrapped",
        occurredAt: new Date("2026-05-10T12:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-10T12:00:00.000Z"),
        payload: { totalFormSubmissions: 7 },
      },
      {
        id: "raw_lower_coda_marketing",
        provider: "coda",
        objectType: "lead_intelligence_summary",
        externalId: "coda_provider_wrapped",
        occurredAt: new Date("2026-05-10T18:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-10T18:00:00.000Z"),
        payload: { scoredLeadCount: 1 },
      },
      {
        id: "raw_lower_semrush_marketing",
        provider: "semrush",
        objectType: "domain_organic",
        externalId: "semrush_provider_wrapped",
        occurredAt: new Date("2026-05-11T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
        payload: { organicTraffic: 80 },
      },
      {
        id: "raw_camel_gsc_marketing",
        provider: "googleSearchConsole",
        objectType: "query",
        externalId: "gsc_provider_wrapped",
        occurredAt: new Date("2026-05-11T12:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-11T12:00:00.000Z"),
        payload: { clicks: 12, impressions: 120 },
      },
      {
        id: "raw_lower_unify_marketing",
        provider: "unify",
        objectType: "visitor",
        externalId: "visitor_provider_wrapped",
        occurredAt: new Date("2026-05-12T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
        payload: { companyId: "acct_provider_wrapped", identified: true },
      },
      {
        id: "raw_lower_hubspot_marketing",
        provider: "hubspot",
        objectType: "deal",
        externalId: "deal_provider_wrapped_marketing",
        occurredAt: new Date("2026-05-14T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
        payload: {
          amount: 10_000,
          dealstage: "qualified",
          originalSource: "paid",
          currency: "USD",
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(records as never);

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "marketing.pipeline_efficiency",
      status: "READY",
      rawRecordCount: 11,
      value: {
        ratio: 5,
        qualifiedPipeline: 10_000,
        acquisitionSpend: 2_000,
        websiteSessions: 300,
        webflowFormSubmissions: 7,
        organicTraffic: 80,
        searchClicks: 12,
        searchImpressions: 120,
        identifiedVisitors: 1,
        currency: "USD",
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_camel_google_ads_marketing",
          sourceKey: "googleAds",
        }),
        expect.objectContaining({
          rawRecordId: "raw_camel_gsc_marketing",
          sourceKey: "googleSearchConsole",
        }),
        expect.objectContaining({
          rawRecordId: "raw_lower_hubspot_marketing",
          sourceKey: "hubspot",
        }),
      ]),
    });
  });

  it("treats Meta Page raw records as Meta acquisition coverage", async () => {
    const prisma = createMarketingPrismaMock();
    const baseRecords = await prisma.imladrisRawSourceRecord.findMany();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(
      baseRecords.map((record) =>
        record.provider === IntegrationProvider.META_ADS
          ? {
              ...record,
              id: "raw_meta_page_1",
              provider: IntegrationProvider.META_PAGE,
              externalId: "meta_page_1",
            }
          : record,
      ),
    );

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "marketing.pipeline_efficiency",
      status: "READY",
      value: expect.objectContaining({
        acquisitionSpend: 17_500,
        ratio: 5.14,
      }),
    });
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        provider: {
          in: expect.arrayContaining([
            IntegrationProvider.META_ADS,
            IntegrationProvider.META_PAGE,
          ]),
        },
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_meta_page_1",
          sourceKey: "metaAds",
          sourceId: "meta_page_1",
        }),
      ]),
    });
  });

  it("marks marketing pipeline efficiency partial when required acquisition sources are missing", async () => {
    const prisma = createMarketingPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_google_ads_only",
        provider: IntegrationProvider.GOOGLE_ADS,
        objectType: "campaign_metric",
        externalId: "gads_only",
        occurredAt: new Date("2026-05-08T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
        payload: {
          spend: 10_000,
          clicks: 900,
          currency: "USD",
        },
      },
    ]);

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "marketing.pipeline_efficiency",
      status: "PARTIAL",
      rawRecordCount: 1,
      value: expect.objectContaining({
        acquisitionSpend: 10_000,
        qualifiedPipeline: 0,
      }),
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "PARTIAL",
          warnings: [
            "Pipeline Efficiency is missing Google Analytics, Meta Ads, Reddit, Google Search Console, SEMrush, Coda, Webflow, Unify, and HubSpot raw records for this period.",
          ],
        }),
      }),
    );
  });

  it("uses Google Search Console snapshot totals instead of double-counting dimension rows", async () => {
    const prisma = createMarketingPrismaMock();
    const baseRecords = await prisma.imladrisRawSourceRecord.findMany();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValue([
      {
        id: "raw_gsc_snapshot",
        provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        objectType: "snapshot",
        externalId: "googleSearchConsole:snapshot",
        occurredAt: new Date("2026-05-11T11:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-11T11:00:00.000Z"),
        payload: {
          clicks: 120,
          impressions: 2400,
        },
      },
      ...baseRecords,
      {
        id: "raw_gsc_page_1",
        provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        objectType: "top_page",
        externalId: "gsc_page_1",
        occurredAt: new Date("2026-05-11T13:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-11T13:00:00.000Z"),
        payload: {
          page: "https://example.com/pricing",
          clicks: 80,
          impressions: 1600,
        },
      },
    ] as never);

    const periodEnd = new Date("2026-05-29T00:00:00.000Z");
    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      searchClicks: 120,
      searchImpressions: 2400,
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          value: expect.objectContaining({
            searchClicks: 120,
            searchImpressions: 2400,
          }),
        }),
        update: expect.objectContaining({
          value: expect.objectContaining({
            searchClicks: 120,
            searchImpressions: 2400,
          }),
        }),
      }),
    );
  });

  it("reads nested Google Search Console metrics before calculating search totals", async () => {
    const prisma = createMarketingPrismaMock();
    const baseRecords = await prisma.imladrisRawSourceRecord.findMany();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValue([
      {
        id: "raw_gsc_nested_metrics_snapshot",
        provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        objectType: "snapshot",
        externalId: "googleSearchConsole:snapshot:nested_metrics",
        occurredAt: new Date("2026-05-11T11:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-11T11:00:00.000Z"),
        payload: {
          metrics: {
            clicks: 321,
            impressions: 6_543,
          },
        },
      },
      ...baseRecords,
    ] as never);

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      searchClicks: 321,
      searchImpressions: 6_543,
    });
  });

  it("reads wrapped Google Search Console metrics before calculating search totals", async () => {
    const prisma = createMarketingPrismaMock();
    const baseRecords = await prisma.imladrisRawSourceRecord.findMany();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValue([
      {
        id: "raw_gsc_wrapped_metrics_snapshot",
        provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
        objectType: "snapshot",
        externalId: "googleSearchConsole:snapshot:wrapped_metrics",
        occurredAt: new Date("2026-05-11T11:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-11T11:00:00.000Z"),
        payload: {
          values: {
            metrics: {
              searchClicks: 432,
              searchImpressions: 7_654,
            },
          },
        },
      },
      ...baseRecords,
    ] as never);

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      searchClicks: 432,
      searchImpressions: 7_654,
    });
  });

  it("reads nested Unify visitor identity fields before calculating identified visitors", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_unify_nested_visitor",
            provider: IntegrationProvider.UNIFY,
            objectType: "visitor",
            externalId: "visitor_nested",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              properties: {
                companyId: "acct_nested",
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_nested_unify", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      identifiedVisitors: 1,
    });
  });

  it("reads wrapped Unify visitor identity fields before calculating identified visitors", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_unify_wrapped_visitor",
            provider: IntegrationProvider.UNIFY,
            objectType: "visitor",
            externalId: "visitor_wrapped",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              values: {
                company: {
                  accountId: "acct_wrapped",
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_wrapped_unify", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      identifiedVisitors: 1,
    });
  });

  it("ignores blank Unify visitor identity fields before calculating identified visitors", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_unify_blank_visitor_identity",
            provider: IntegrationProvider.UNIFY,
            objectType: "visitor",
            externalId: "visitor_blank_identity",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              companyId: " ",
              company_domain: "\t",
              properties: {
                accountId: "",
                domain: "   ",
                company: {
                  id: "\n",
                  domain: " ",
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_blank_unify", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      identifiedVisitors: 0,
    });
  });

  it("honors string false Unify visitor identity flags before inferring identified visitors", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_unify_string_false_visitor",
            provider: IntegrationProvider.UNIFY,
            objectType: "visitor",
            externalId: "visitor_string_false",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              identified: "false",
              companyId: "acct_should_not_count",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_string_false_unify", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      identifiedVisitors: 0,
    });
  });

  it("uses synced ad snapshot spend instead of double-counting campaign rows", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_snapshot_spend",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "snapshot",
            externalId: "googleAds:snapshot:2026-05-01:2026-05-29",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              totalSpend30d: 12_500,
              currency: "USD",
            },
          },
          {
            id: "raw_google_ads_campaign_spend",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign",
            externalId: "googleAds:campaign:brand",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              name: "Brand",
              spend: 5_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_snapshot_spend_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_snapshot_spend",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 50_000,
              dealstage: "qualified",
              originalSource: "paid search",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_snapshot_spend", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      acquisitionSpend: 12_500,
      qualifiedPipeline: 50_000,
      ratio: 4,
    });
  });

  it("uses synced Google Analytics snapshot sessions instead of partial channel rows", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_ga_snapshot_sessions",
            provider: IntegrationProvider.GOOGLE_ANALYTICS,
            objectType: "snapshot",
            externalId: "googleAnalytics:snapshot:2026-05-01:2026-05-29",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              sessions30d: 4_200,
            },
          },
          {
            id: "raw_ga_channel_sessions",
            provider: IntegrationProvider.GOOGLE_ANALYTICS,
            objectType: "traffic_by_channel",
            externalId: "googleAnalytics:traffic_by_channel:Organic Search",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              channel: "Organic Search",
              sessions: 2_100,
            },
          },
          {
            id: "raw_hubspot_snapshot_sessions_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_snapshot_sessions",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 50_000,
              dealstage: "qualified",
              originalSource: "organic search",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_snapshot_sessions", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      websiteSessions: 4_200,
      qualifiedPipeline: 50_000,
    });
  });

  it("floors fractional Google Analytics snapshot sessions before marketing materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_ga_fractional_snapshot_sessions",
            provider: IntegrationProvider.GOOGLE_ANALYTICS,
            objectType: "snapshot",
            externalId: "googleAnalytics:snapshot:fractional",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              sessions30d: 4_200.9,
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_fractional_sessions", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      websiteSessions: 4_200,
    });
  });

  it("uses synced SEMrush snapshot organic traffic instead of competitor rows", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_semrush_snapshot_traffic",
            provider: IntegrationProvider.SEMRUSH,
            objectType: "snapshot",
            externalId: "semrush:snapshot:2026-05-01:2026-05-29",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              domain: "example.com",
              organicTraffic: 1_800,
            },
          },
          {
            id: "raw_semrush_competitor_traffic",
            provider: IntegrationProvider.SEMRUSH,
            objectType: "organic_competitor",
            externalId: "semrush:organic_competitor:competitor.com",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              domain: "competitor.com",
              organicTraffic: 500,
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_semrush_snapshot", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      organicTraffic: 1_800,
    });
  });

  it("reads wrapped traffic snapshot totals before marketing materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_ga_wrapped_snapshot_sessions",
            provider: IntegrationProvider.GOOGLE_ANALYTICS,
            objectType: "snapshot",
            externalId: "googleAnalytics:snapshot:wrapped",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              values: {
                metrics: {
                  sessions30d: 5_500,
                },
              },
            },
          },
          {
            id: "raw_semrush_wrapped_snapshot_traffic",
            provider: IntegrationProvider.SEMRUSH,
            objectType: "snapshot",
            externalId: "semrush:snapshot:wrapped",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              attributes: {
                summary: {
                  organicTraffic: 2_400,
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_wrapped_traffic", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      websiteSessions: 5_500,
      organicTraffic: 2_400,
    });
  });

  it("uses zero Webflow snapshot submissions instead of child rows", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_webflow_snapshot_zero_submissions",
            provider: IntegrationProvider.WEBFLOW,
            objectType: "snapshot",
            externalId: "webflow:snapshot:2026-05-01:2026-05-29",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              totalFormSubmissions: 0,
            },
          },
          {
            id: "raw_webflow_child_submission_count",
            provider: IntegrationProvider.WEBFLOW,
            objectType: "form_submission",
            externalId: "webflow:form_submission:demo",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              formName: "Demo",
              count: 3,
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_webflow_snapshot", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      webflowFormSubmissions: 0,
    });
  });

  it("counts Webflow form submission rows when snapshot totals are absent", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_webflow_child_submission_1",
            provider: IntegrationProvider.WEBFLOW,
            objectType: "form_submission",
            externalId: "webflow:form_submission:demo:1",
            occurredAt: new Date("2026-05-20T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-20T12:00:00.000Z"),
            payload: {
              formName: "Demo",
              submittedAt: "2026-05-20T12:00:00.000Z",
            },
          },
          {
            id: "raw_webflow_child_submission_2",
            provider: IntegrationProvider.WEBFLOW,
            objectType: "form_submission",
            externalId: "webflow:form_submission:demo:2",
            occurredAt: new Date("2026-05-21T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-21T12:00:00.000Z"),
            payload: {
              formName: "Demo",
              submittedAt: "2026-05-21T12:00:00.000Z",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_webflow_children", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      webflowFormSubmissions: 2,
    });
  });

  it("reads wrapped Webflow snapshot submission totals before marketing materialization", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_webflow_wrapped_snapshot_submissions",
            provider: IntegrationProvider.WEBFLOW,
            objectType: "snapshot",
            externalId: "webflow:snapshot:wrapped",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              values: {
                metrics: {
                  totalFormSubmissions: 7,
                },
              },
            },
          },
          {
            id: "raw_webflow_child_submission_wrapped_snapshot",
            provider: IntegrationProvider.WEBFLOW,
            objectType: "form_submission",
            externalId: "webflow:form_submission:wrapped-snapshot",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              count: 99,
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_webflow_wrapped_snapshot", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      webflowFormSubmissions: 7,
    });
  });

  it("reads wrapped Webflow form submission row counts when snapshot totals are absent", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_webflow_wrapped_child_submission_count",
            provider: IntegrationProvider.WEBFLOW,
            objectType: "form_submission",
            externalId: "webflow:form_submission:wrapped-count",
            occurredAt: new Date("2026-05-29T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-29T12:00:00.000Z"),
            payload: {
              fields: {
                metrics: {
                  submissions: 4,
                },
              },
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_webflow_wrapped_child", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      webflowFormSubmissions: 4,
    });
  });

  it("normalizes Google Ads costMicros before calculating marketing pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_micros",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_micros",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              costMicros: 10_000_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_marketing_micros_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_micros",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 1_000,
              dealstage: "qualified",
              originalSource: "paid",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_micros", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      acquisitionSpend: 10,
      qualifiedPipeline: 1_000,
      ratio: 100,
    });
  });

  it("reads nested ad metrics spend micros before calculating marketing pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_nested_spend_micros",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_nested_spend_micros",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              metrics: {
                spendMicros: 7_500_000,
              },
              currency: "USD",
            },
          },
          {
            id: "raw_meta_ads_nested_total_spend_micros",
            provider: IntegrationProvider.META_ADS,
            objectType: "campaign_metric",
            externalId: "meta_nested_total_spend_micros",
            occurredAt: new Date("2026-05-09T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-09T00:00:00.000Z"),
            payload: {
              metrics: {
                totalSpendMicros: 2_500_000,
              },
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_marketing_nested_spend_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_nested_spend",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 1_000,
              dealstage: "qualified",
              originalSource: "paid",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_nested_micros", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      acquisitionSpend: 10,
      qualifiedPipeline: 1_000,
      ratio: 100,
    });
  });

  it("reads wrapped ad spend fields before calculating marketing pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_values_spend",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_values_spend",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              values: {
                costMicros: 6_000_000,
              },
              currency: "USD",
            },
          },
          {
            id: "raw_meta_ads_attributes_spend",
            provider: IntegrationProvider.META_ADS,
            objectType: "campaign_metric",
            externalId: "meta_attributes_spend",
            occurredAt: new Date("2026-05-09T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-09T00:00:00.000Z"),
            payload: {
              attributes: {
                totalSpend: "2,500.00",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_reddit_ads_fields_spend",
            provider: IntegrationProvider.REDDIT,
            objectType: "campaign_metric",
            externalId: "reddit_fields_spend",
            occurredAt: new Date("2026-05-09T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-09T12:00:00.000Z"),
            payload: {
              fields: {
                spend: "$1,500.00",
              },
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_marketing_wrapped_spend_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_wrapped_spend",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 40_000,
              dealstage: "qualified",
              originalSource: "paid",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_wrapped_spend", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      acquisitionSpend: 4_006,
      qualifiedPipeline: 40_000,
      ratio: 9.99,
    });
  });

  it("clamps negative marketing counters and spend before calculating pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_negative_spend",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_negative_spend",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: { spend: -10_000, currency: "USD" },
          },
          {
            id: "raw_meta_ads_negative_spend",
            provider: IntegrationProvider.META_ADS,
            objectType: "campaign_metric",
            externalId: "meta_negative_spend",
            occurredAt: new Date("2026-05-09T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-09T00:00:00.000Z"),
            payload: { amountSpent: "-5000", currency: "USD" },
          },
          {
            id: "raw_reddit_ads_negative_micros",
            provider: IntegrationProvider.REDDIT,
            objectType: "campaign_metric",
            externalId: "reddit_negative_micros",
            occurredAt: new Date("2026-05-09T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-09T12:00:00.000Z"),
            payload: { costMicros: -2_500_000, currency: "USD" },
          },
          {
            id: "raw_ga_negative_sessions",
            provider: IntegrationProvider.GOOGLE_ANALYTICS,
            objectType: "snapshot",
            externalId: "ga_negative_sessions",
            occurredAt: new Date("2026-05-10T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T00:00:00.000Z"),
            payload: { sessions: -2_000 },
          },
          {
            id: "raw_gsc_negative_counts",
            provider: IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
            objectType: "snapshot",
            externalId: "gsc_negative_counts",
            occurredAt: new Date("2026-05-10T06:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-10T06:00:00.000Z"),
            payload: { clicks: -120, impressions: -2_400 },
          },
          {
            id: "raw_semrush_negative_traffic",
            provider: IntegrationProvider.SEMRUSH,
            objectType: "snapshot",
            externalId: "semrush_negative_traffic",
            occurredAt: new Date("2026-05-11T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T00:00:00.000Z"),
            payload: { organicTraffic: -500 },
          },
          {
            id: "raw_coda_negative_fixture",
            provider: IntegrationProvider.CODA,
            objectType: "lead_intelligence_summary",
            externalId: "coda_negative_fixture",
            occurredAt: new Date("2026-05-11T06:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T06:00:00.000Z"),
            payload: { scoredLeadCount: 1 },
          },
          {
            id: "raw_webflow_negative_submissions",
            provider: IntegrationProvider.WEBFLOW,
            objectType: "snapshot",
            externalId: "webflow_negative_submissions",
            occurredAt: new Date("2026-05-11T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-11T12:00:00.000Z"),
            payload: { totalFormSubmissions: -25 },
          },
          {
            id: "raw_unify_identified_negative_fixture",
            provider: IntegrationProvider.UNIFY,
            objectType: "visitor",
            externalId: "visitor_negative_fixture",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: { identified: true, companyId: "acct_1" },
          },
          {
            id: "raw_hubspot_marketing_negative_fixture",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_negative_fixture",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 90_000,
              dealstage: "qualified",
              originalSource: "paid",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_negative_inputs", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "READY",
      value: {
        ratio: null,
        qualifiedPipeline: 90_000,
        acquisitionSpend: 0,
        websiteSessions: 0,
        webflowFormSubmissions: 0,
        organicTraffic: 0,
        searchClicks: 0,
        searchImpressions: 0,
        identifiedVisitors: 1,
        currency: "USD",
      },
    });
  });

  it("clamps negative HubSpot deal amounts before calculating marketing pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_negative_marketing_deal",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_negative_marketing_deal",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              spend: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_marketing_negative_deal_amount",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_negative_amount",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: -90_000,
              dealstage: "qualified",
              originalSource: "paid",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_negative_deal", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      qualifiedPipeline: 0,
      acquisitionSpend: 10_000,
      ratio: 0,
    });
  });

  it("reads nested HubSpot marketing deal fields before calculating pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_nested_marketing_deal",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_nested_marketing_deal",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              spend: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_nested_marketing_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_nested_marketing",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              properties: {
                amount: "50000",
                dealstage: "qualified",
                originalSource: "paid search",
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_nested_deal", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      acquisitionSpend: 10_000,
      qualifiedPipeline: 50_000,
      ratio: 5,
    });
  });

  it("reads wrapped HubSpot marketing deal fields before calculating pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_wrapped_marketing_deal",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_wrapped_marketing_deal",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              spend: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_wrapped_marketing_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_wrapped_marketing",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              values: {
                amount: "60000",
                dealstage: "qualified",
                originalSource: "paid social",
              },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_wrapped_deal", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      acquisitionSpend: 10_000,
      qualifiedPipeline: 60_000,
      ratio: 6,
    });
  });

  it("unwraps scalar HubSpot marketing source fields before calculating pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_scalar_marketing_source",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_scalar_marketing_source",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              spend: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_scalar_marketing_source_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_scalar_marketing_source",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: "70000",
              dealstage: "qualified",
              originalSource: { value: " paid search " },
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_scalar_source", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      acquisitionSpend: 10_000,
      qualifiedPipeline: 70_000,
      ratio: 7,
    });
  });

  it("normalizes HubSpot deal stages before excluding closed marketing pipeline", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_marketing_formatted_stage",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_marketing_formatted_stage",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              spend: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_marketing_formatted_closed_stage_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_formatted_closed_stage",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 50_000,
              dealstage: " closedlost ",
              originalSource: "paid",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_formatted_stage", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      qualifiedPipeline: 0,
      acquisitionSpend: 10_000,
      ratio: 0,
    });
  });

  it("excludes terminal marketing deals before calculating pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_terminal_pipeline",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_terminal_pipeline",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              spend: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_marketing_closed_won_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_closed_won",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 50_000,
              dealstage: "Closed Won",
              originalSource: "paid search",
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_marketing_churn_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_churn",
            occurredAt: new Date("2026-05-15T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
            payload: {
              amount: 25_000,
              dealstage: "churn",
              originalSource: "organic",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_terminal_pipeline", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      qualifiedPipeline: 0,
      acquisitionSpend: 10_000,
      ratio: 0,
    });
  });

  it("excludes marketing deals with terminal stage labels before calculating pipeline efficiency", async () => {
    const prisma = {
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_google_ads_stage_label_pipeline",
            provider: IntegrationProvider.GOOGLE_ADS,
            objectType: "campaign_metric",
            externalId: "gads_stage_label_pipeline",
            occurredAt: new Date("2026-05-08T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
            payload: {
              spend: 10_000,
              currency: "USD",
            },
          },
          {
            id: "raw_hubspot_marketing_closed_stage_label_deal",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_marketing_closed_stage_label",
            occurredAt: new Date("2026-05-14T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-14T00:00:00.000Z"),
            payload: {
              amount: 50_000,
              stageLabel: "Closed Won",
              originalSource: "paid search",
              currency: "USD",
            },
          },
        ]),
      },
      imladrisCanonicalMetricValue: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_marketing_stage_label_pipeline", ...create })),
      },
      imladrisMetricLineage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
      },
    };

    const result = await materializeImladrisMarketingMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      qualifiedPipeline: 0,
      acquisitionSpend: 10_000,
      ratio: 0,
    });
  });

  it("materializes customer-success retention risk from support, usage, collaboration, and billing raw records", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    const periodStart = new Date("2026-05-01T00:00:00.000Z");
    const periodEnd = new Date("2026-05-29T00:00:00.000Z");

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart,
      periodEnd,
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "customer_success.retention_risk",
      status: "READY",
      rawRecordCount: 6,
      value: {
        score: 100,
        atRiskAccounts: 1,
        openSupportIssues: 2,
        escalations: 2,
        accountsWithBillingRisk: 1,
        lowUsageAccounts: 1,
        collaborationSignals: 1,
      },
    });
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        provider: {
          in: [
            IntegrationProvider.PYLON,
            IntegrationProvider.POSTHOG,
            IntegrationProvider.SLACK,
            IntegrationProvider.GOOGLE_WORKSPACE,
            IntegrationProvider.STRIPE,
          ],
        },
        OR: SCOPED_RAW_RECORD_FILTERS,
      }),
      orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId_metricKey_periodEnd_calculationVersion: {
          organizationId: "org_1",
          userId: "user_1",
          metricKey: "customer_success.retention_risk",
          periodEnd,
          calculationVersion: "customer-success-retention-risk-v1",
        },
      },
      create: expect.objectContaining({
        metricKey: "customer_success.retention_risk",
        department: "customer-success",
        unit: "score",
        status: "READY",
        value: {
          score: 100,
          atRiskAccounts: 1,
          openSupportIssues: 2,
          escalations: 2,
          accountsWithBillingRisk: 1,
          lowUsageAccounts: 1,
          collaborationSignals: 1,
        },
      }),
      update: expect.objectContaining({
        status: "READY",
        value: {
          score: 100,
          atRiskAccounts: 1,
          openSupportIssues: 2,
          escalations: 2,
          accountsWithBillingRisk: 1,
          lowUsageAccounts: 1,
          collaborationSignals: 1,
        },
      }),
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          metricValueId: "metric_customer_success_retention_risk",
          rawRecordId: "raw_pylon_issue_1",
          sourceKey: "pylon",
          sourceType: "conversation",
          sourceId: "conv_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_customer_success_retention_risk",
          rawRecordId: "raw_posthog_usage_1",
          sourceKey: "posthog",
          sourceType: "account_usage",
          sourceId: "usage_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_customer_success_retention_risk",
          rawRecordId: "raw_workspace_meeting_1",
          sourceKey: "googleWorkspace",
          sourceType: "calendar_event",
          sourceId: "event_1",
        }),
        expect.objectContaining({
          metricValueId: "metric_customer_success_retention_risk",
          rawRecordId: "raw_stripe_subscription_1",
          sourceKey: "stripe",
          sourceType: "subscription",
          sourceId: "sub_risk_1",
        }),
      ]),
    });
  });

  it("normalizes provider envelopes before customer-success materialization", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    const records: unknown[] = [
      {
        id: "raw_wrapped_pylon_support",
        provider: { value: "pylon" },
        objectType: "conversation",
        externalId: "conv_provider_wrapped",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_provider_wrapped",
          status: "open",
          priority: "high",
        },
      },
      {
        id: "raw_camel_posthog_usage",
        provider: "postHog",
        objectType: "account_usage",
        externalId: "usage_provider_wrapped",
        occurredAt: new Date("2026-05-17T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-17T00:00:00.000Z"),
        payload: {
          accountId: "acct_provider_wrapped",
          activeUsers: 1,
          daysSinceLastActive: 21,
        },
      },
      {
        id: "raw_lower_slack_collaboration",
        provider: "slack",
        objectType: "message",
        externalId: "slack_provider_wrapped",
        occurredAt: new Date("2026-05-18T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-18T00:00:00.000Z"),
        payload: {
          accountId: "acct_provider_wrapped",
          type: "customer_update",
        },
      },
      {
        id: "raw_camel_workspace_collaboration",
        provider: "googleWorkspace",
        objectType: "calendar_event",
        externalId: "workspace_provider_wrapped",
        occurredAt: new Date("2026-05-22T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-22T00:00:00.000Z"),
        payload: {
          accountId: "acct_provider_wrapped",
        },
      },
      {
        id: "raw_lower_stripe_billing",
        provider: "stripe",
        objectType: "subscription",
        externalId: "sub_provider_wrapped",
        occurredAt: new Date("2026-05-24T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
        payload: {
          accountId: "acct_provider_wrapped",
          status: "past_due",
        },
      },
    ];
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce(records as never);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "customer_success.retention_risk",
      status: "READY",
      rawRecordCount: 5,
      value: {
        score: 68,
        atRiskAccounts: 1,
        openSupportIssues: 1,
        escalations: 1,
        accountsWithBillingRisk: 1,
        lowUsageAccounts: 1,
        collaborationSignals: 2,
      },
    });
    expect(prisma.imladrisMetricLineage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          rawRecordId: "raw_wrapped_pylon_support",
          sourceKey: "pylon",
        }),
        expect.objectContaining({
          rawRecordId: "raw_camel_posthog_usage",
          sourceKey: "posthog",
        }),
        expect.objectContaining({
          rawRecordId: "raw_camel_workspace_collaboration",
          sourceKey: "googleWorkspace",
        }),
      ]),
    });
  });

  it("marks customer-success retention risk partial when usage and billing providers are missing", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_only",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_only",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: "open",
          priority: "high",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      metricKey: "customer_success.retention_risk",
      status: "PARTIAL",
      rawRecordCount: 1,
      value: expect.objectContaining({
        atRiskAccounts: 1,
        openSupportIssues: 1,
        accountsWithBillingRisk: 0,
        lowUsageAccounts: 0,
      }),
    });
    expect(prisma.imladrisCanonicalMetricValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "PARTIAL",
          warnings: [
            "Retention Risk is missing PostHog, Slack, Google Workspace, and Stripe raw records for this period.",
          ],
        }),
      }),
    );
  });

  it("normalizes account identifiers before de-duping customer-success risk accounts", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_spaced_account",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_spaced_account",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: " acct_1 ",
          status: "open",
          priority: "high",
          sentiment: "negative",
        },
      },
      {
        id: "raw_posthog_usage_matching_account",
        provider: IntegrationProvider.POSTHOG,
        objectType: "account_usage",
        externalId: "usage_matching_account",
        occurredAt: new Date("2026-05-17T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-17T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          activeUsers: 1,
          daysSinceLastActive: 21,
        },
      },
      {
        id: "raw_stripe_subscription_matching_account",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_matching_account",
        occurredAt: new Date("2026-05-24T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: "past_due",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      accountsWithBillingRisk: 1,
      lowUsageAccounts: 1,
    });
  });

  it("normalizes numeric account identifiers before de-duping customer-success risk accounts", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_numeric_account",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_numeric_account",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: 42,
          status: "open",
        },
      },
      {
        id: "raw_posthog_usage_numeric_account",
        provider: IntegrationProvider.POSTHOG,
        objectType: "account_usage",
        externalId: "usage_numeric_account",
        occurredAt: new Date("2026-05-17T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-17T00:00:00.000Z"),
        payload: {
          account_id: 42,
          activeUsers: 1,
        },
      },
      {
        id: "raw_stripe_subscription_numeric_account",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_numeric_account",
        occurredAt: new Date("2026-05-24T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
        payload: {
          customer: {
            id: 42,
          },
          status: "past_due",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      accountsWithBillingRisk: 1,
      lowUsageAccounts: 1,
    });
  });

  it("reads wrapped account identifiers before de-duping customer-success risk accounts", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_values_account",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_values_account",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          values: {
            accountId: "acct_wrapped",
            status: "open",
            priority: "high",
          },
        },
      },
      {
        id: "raw_posthog_usage_attributes_account",
        provider: IntegrationProvider.POSTHOG,
        objectType: "account_usage",
        externalId: "usage_attributes_account",
        occurredAt: new Date("2026-05-17T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-17T00:00:00.000Z"),
        payload: {
          attributes: {
            account_id: "acct_wrapped",
            activeUsers: 1,
          },
        },
      },
      {
        id: "raw_stripe_subscription_fields_account",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_fields_account",
        occurredAt: new Date("2026-05-24T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
        payload: {
          fields: {
            customerId: "acct_wrapped",
            status: "past_due",
          },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      accountsWithBillingRisk: 1,
      escalations: 1,
      lowUsageAccounts: 1,
    });
  });

  it("counts Slack account-linked messages as customer-success collaboration signals", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_slack_collaboration",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_slack_collaboration",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: "open",
        },
      },
      {
        id: "raw_slack_message_collaboration",
        provider: IntegrationProvider.SLACK,
        objectType: "message",
        externalId: "slack:message:1780240800.000000",
        occurredAt: new Date("2026-05-22T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-22T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          channelName: "customer-success",
          text: "Renewal action plan discussed",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      openSupportIssues: 1,
      collaborationSignals: 1,
      score: 17,
    });
  });

  it("counts urgent Pylon support issues as customer-success escalations", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_urgent_priority",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_urgent_priority",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: "open",
          priority: "urgent",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      openSupportIssues: 1,
      escalations: 1,
      score: 40,
    });
  });

  it("unwraps scalar Pylon priority fields before calculating customer-success escalations", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_scalar_urgent_priority",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_scalar_urgent_priority",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: "open",
          priority: { value: " urgent " },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      openSupportIssues: 1,
      escalations: 1,
      score: 40,
    });
  });

  it("unwraps scalar Pylon tag lists before calculating customer-success escalations", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_scalar_urgent_tags",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_scalar_urgent_tags",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: "open",
          tags: { value: [" bug ", { value: " urgent " }] },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      openSupportIssues: 1,
      escalations: 1,
      score: 40,
    });
  });

  it("uses Pylon snapshot support totals when conversation records are absent", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_snapshot_support_totals",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:2026-05",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          openConversations: 4,
          urgentConversations: 2,
          waitingOnTeam: 1,
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      score: 94,
      atRiskAccounts: 0,
      openSupportIssues: 4,
      escalations: 2,
    });
  });

  it("reads nested Pylon support snapshot totals before calculating retention risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_snapshot_nested_support_totals",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:nested-support",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          support: {
            unresolvedTickets: "4",
            urgentTickets: "2",
          },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      score: 94,
      atRiskAccounts: 0,
      openSupportIssues: 4,
      escalations: 2,
    });
  });

  it("reads wrapped Pylon support snapshot totals before calculating retention risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_snapshot_wrapped_support_totals",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:wrapped-support",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          values: {
            support: {
              unresolvedTickets: "5",
              urgentTickets: "3",
            },
          },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      score: 100,
      atRiskAccounts: 0,
      openSupportIssues: 5,
      escalations: 3,
    });
  });

  it("clamps negative Pylon snapshot support totals before calculating retention risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_snapshot_negative_support_totals",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:negative",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          openConversations: -4,
          urgentConversations: -2,
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      score: 10,
      atRiskAccounts: 0,
      openSupportIssues: 0,
      escalations: 0,
    });
  });

  it("floors fractional Pylon snapshot support totals before calculating retention risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_snapshot_fractional_support_totals",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:fractional",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          openConversations: 4.7,
          urgentConversations: 2.9,
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      score: 94,
      atRiskAccounts: 0,
      openSupportIssues: 4,
      escalations: 2,
    });
  });

  it("uses the latest Pylon snapshot support totals when conversation records are absent", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_snapshot_support_totals_newer",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:2026-05-29",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          openConversations: 4,
          urgentConversations: 2,
        },
      },
      {
        id: "raw_pylon_snapshot_support_totals_older",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:2026-05-15",
        occurredAt: new Date("2026-05-15T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-15T00:00:00.000Z"),
        payload: {
          openConversations: 1,
          urgentConversations: 0,
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      score: 94,
      openSupportIssues: 4,
      escalations: 2,
    });
  });

  it("ignores future Pylon snapshot fact timestamps before choosing support totals", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_snapshot_future_fact",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:future",
        occurredAt: new Date("2026-06-15T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          openConversations: 99,
          urgentConversations: 99,
        },
      },
      {
        id: "raw_pylon_snapshot_current_fact",
        provider: IntegrationProvider.PYLON,
        objectType: "snapshot",
        externalId: "pylon:snapshot:current",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          openConversations: 4,
          urgentConversations: 2,
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      score: 94,
      openSupportIssues: 4,
      escalations: 2,
    });
  });

  it("reads nested account identifiers before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_stripe_subscription_nested_customer",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_nested_customer",
        occurredAt: new Date("2026-05-24T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
        payload: {
          customer: {
            id: "acct_1",
          },
          status: "past_due",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      accountsWithBillingRisk: 1,
    });
  });

  it("reads snake_case weekly active users before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_posthog_usage_snake_case_weekly_active_users",
        provider: IntegrationProvider.POSTHOG,
        objectType: "account_usage",
        externalId: "usage_snake_case_weekly_active_users",
        occurredAt: new Date("2026-05-17T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-17T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          weekly_active_users: 1,
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      lowUsageAccounts: 1,
    });
  });

  it("derives low PostHog usage from stale last-active timestamps", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_posthog_usage_last_active_at",
        provider: IntegrationProvider.POSTHOG,
        objectType: "account_usage",
        externalId: "usage_last_active_at",
        occurredAt: new Date("2026-05-29T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-29T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          lastActiveAt: "2026-05-01T00:00:00.000Z",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      lowUsageAccounts: 1,
    });
  });

  it("reads nested PostHog usage properties before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_posthog_usage_nested_properties",
        provider: IntegrationProvider.POSTHOG,
        objectType: "account_usage",
        externalId: "usage_nested_properties",
        occurredAt: new Date("2026-05-17T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-17T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          properties: {
            active_users: 1,
            days_since_last_active: 21,
          },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      lowUsageAccounts: 1,
    });
  });

  it("reads nested Slack escalation fields before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_slack_nested_escalation",
        provider: IntegrationProvider.SLACK,
        objectType: "thread",
        externalId: "thread_nested_escalation",
        occurredAt: new Date("2026-05-18T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-18T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          properties: {
            type: "customer_escalation",
            status: "open",
          },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      escalations: 1,
    });
  });

  it("normalizes string Slack escalation flags before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_slack_string_escalation_flag",
        provider: IntegrationProvider.SLACK,
        objectType: "thread",
        externalId: "thread_string_escalation_flag",
        occurredAt: new Date("2026-05-18T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-18T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          escalation: "true",
          status: "open",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      escalations: 1,
    });
  });

  it("normalizes closed support statuses before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_closed_with_spaces",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_closed_with_spaces",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: " resolved ",
          priority: "high",
          sentiment: "negative",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 0,
      openSupportIssues: 0,
    });
  });

  it("recognizes display-style closed support statuses before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_resolved_duplicate",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_resolved_duplicate",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: "Resolved - Duplicate",
        },
      },
      {
        id: "raw_pylon_issue_unresolved_open",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_unresolved_open",
        occurredAt: new Date("2026-05-11T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-21T00:00:00.000Z"),
        payload: {
          accountId: "acct_2",
          status: "Unresolved",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      openSupportIssues: 1,
    });
  });

  it("reads nested support statuses before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_nested_closed_status",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_nested_closed_status",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          properties: {
            status: "resolved",
          },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 0,
      openSupportIssues: 0,
    });
  });

  it("unwraps object-shaped closed support statuses before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_pylon_issue_object_closed_status",
        provider: IntegrationProvider.PYLON,
        objectType: "conversation",
        externalId: "conv_object_closed_status",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-20T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: {
            name: "Resolved",
          },
          priority: "high",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 0,
      openSupportIssues: 0,
      escalations: 0,
    });
  });

  it("normalizes Stripe billing statuses before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_stripe_subscription_formatted_billing_risk",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_formatted_billing_risk",
        occurredAt: new Date("2026-05-24T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: " past_due ",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      accountsWithBillingRisk: 1,
    });
  });

  it("reads nested Stripe billing statuses before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_stripe_subscription_nested_billing_risk",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_nested_billing_risk",
        occurredAt: new Date("2026-05-24T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          properties: {
            collection_status: "payment_failed",
          },
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      accountsWithBillingRisk: 1,
    });
  });

  it("normalizes display Stripe billing statuses before calculating customer-success risk", async () => {
    const prisma = createCustomerSuccessPrismaMock();
    prisma.imladrisRawSourceRecord.findMany.mockResolvedValueOnce([
      {
        id: "raw_stripe_subscription_display_billing_risk",
        provider: IntegrationProvider.STRIPE,
        objectType: "subscription",
        externalId: "sub_display_billing_risk",
        occurredAt: new Date("2026-05-24T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-05-24T00:00:00.000Z"),
        payload: {
          accountId: "acct_1",
          status: " payment failed ",
        },
      },
    ]);

    const result = await materializeImladrisCustomerSuccessMetrics({
      prisma: prisma as never,
      context: CONTEXT,
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-05-29T00:00:00.000Z"),
      now: new Date("2026-05-29T12:00:00.000Z"),
    });

    expect(result.value).toMatchObject({
      atRiskAccounts: 1,
      accountsWithBillingRisk: 1,
    });
  });
});

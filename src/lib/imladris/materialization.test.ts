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
          sourceType: " AccountBalance ",
          sourceId: "balance_camel",
        }),
      ]),
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
              availableBalance: "$240,000.00",
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
            id: "raw_hubspot_deal_formatted_arr",
            provider: IntegrationProvider.HUBSPOT,
            objectType: "deal",
            externalId: "deal_formatted_arr",
            occurredAt: new Date("2026-05-12T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-05-12T00:00:00.000Z"),
            payload: {
              amount: "$12,000.00",
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
      amount: 80_000,
      cashOutflow: 100_000,
      cashInflow: 20_000,
    });
    expect(results.find((result) => result.metricKey === "finance.cash_runway_months")?.value).toMatchObject({
      months: 3,
      cashBalance: 240_000,
      netBurn: 80_000,
    });
    expect(results.find((result) => result.metricKey === "revenue.mrr")?.value).toMatchObject({
      amount: 21_000,
      arr: 252_000,
      stripeMrr: 20_000,
      stripeArr: 240_000,
      hubspotOnlySubscriptionMrr: 1_000,
      hubspotOnlySubscriptionArr: 12_000,
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
        score: 85,
        atRiskAccounts: 1,
        openSupportIssues: 2,
        escalations: 1,
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
          score: 85,
          atRiskAccounts: 1,
          openSupportIssues: 2,
          escalations: 1,
          accountsWithBillingRisk: 1,
          lowUsageAccounts: 1,
          collaborationSignals: 1,
        },
      }),
      update: expect.objectContaining({
        status: "READY",
        value: {
          score: 85,
          atRiskAccounts: 1,
          openSupportIssues: 2,
          escalations: 1,
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

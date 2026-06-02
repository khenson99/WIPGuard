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

type RawSourceRecordFixture = {
  id: string;
  provider: IntegrationProvider;
  objectType: string;
  externalId: string;
  occurredAt: Date;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  payload: Record<string, unknown>;
};

function createPrismaMock() {
  return {
    imladrisRawSourceRecord: {
      findMany: vi.fn(async () => [
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
      findMany: vi.fn(async () => [
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
      findMany: vi.fn(async () => [
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
        OR: [{ userId: "user_1" }, { organizationId: "org_1" }],
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
        OR: [{ userId: "user_1" }, { organizationId: "org_1" }],
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
        OR: [{ userId: "user_1" }, { organizationId: "org_1" }],
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
        OR: [{ userId: "user_1" }, { organizationId: "org_1" }],
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
      rawRecordCount: 10,
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
          ],
        },
        OR: [{ userId: "user_1" }, { organizationId: "org_1" }],
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
        OR: [{ userId: "user_1" }, { organizationId: "org_1" }],
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

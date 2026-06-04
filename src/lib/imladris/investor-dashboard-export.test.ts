import { describe, expect, it, vi } from "vitest";
import { buildInvestorDashboardExport } from "@/lib/imladris/investor-dashboard-export";

const context = { userId: "user_1", organizationId: "org_1" };
const periodStart = new Date("2026-02-01T00:00:00.000Z");
const periodEnd = new Date("2026-02-28T23:59:59.999Z");
const computedAt = new Date("2026-02-28T12:00:00.000Z");

function metric(
  metricKey: string,
  value: Record<string, unknown>,
  overrides: Partial<{
    periodStart: Date;
    periodEnd: Date;
    computedAt: Date;
    status: unknown;
    confidence: number;
    warnings: unknown;
    userId: string | null;
    organizationId: string | null;
  }> = {},
) {
  return {
    id: `metric_${metricKey}`,
    metricKey,
    department: metricKey.startsWith("sales.") ? "sales" : "finance",
    unit: metricKey === "finance.cash_runway_months" ? "months" : "currency",
    value,
    periodStart: overrides.periodStart ?? periodStart,
    periodEnd: overrides.periodEnd ?? periodEnd,
    status: overrides.status ?? "READY",
    confidence: overrides.confidence ?? 0.92,
    warnings: overrides.warnings ?? [],
    calculationVersion: `${metricKey}-v1`,
    computedAt: overrides.computedAt ?? computedAt,
    userId: overrides.userId,
    organizationId: overrides.organizationId,
    lineage: [
      {
        sourceKey: metricKey.startsWith("sales.") ? "hubspot" : "stripe",
        sourceType: "raw",
        sourceId: null,
        rawRecordId: "raw_1",
        capturedAt: overrides.computedAt ?? computedAt,
        metadata: { calculationVersion: `${metricKey}-v1` },
      },
    ],
  };
}

describe("buildInvestorDashboardExport", () => {
  it("builds investor summary, weekly trend, and pipeline metrics from Imladris data", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("revenue.mrr", {
            amount: 10_250,
            arr: 123_000,
            currency: "USD",
          }),
          metric("finance.cash_runway_months", {
            months: 12.5,
            cashBalance: 100_000,
            netBurn: 8_000,
            currency: "USD",
          }),
          metric("finance.net_burn", {
            amount: 8_000,
            currency: "USD",
          }),
          metric("sales.qualified_pipeline", {
            amount: 12_000,
            currency: "USD",
            qualifiedDealCount: 1,
            collaborationTouchCount: 2,
            collaborationCoverage: 1,
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_sub_1",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_1",
            occurredAt: new Date("2026-02-03T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-03T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_1",
            },
          },
          {
            id: "raw_sub_2",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_2",
            occurredAt: new Date("2026-02-04T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_2",
            },
          },
          {
            id: "raw_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_1",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 250_000,
              currency: "usd",
            },
          },
          {
            id: "raw_demo",
            provider: "GOOGLE_WORKSPACE",
            objectType: "event",
            externalId: "evt_demo",
            occurredAt: new Date("2026-02-05T17:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-05T17:00:00.000Z"),
            payload: {
              summary: "Demo with Gamma",
            },
          },
          {
            id: "raw_won",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_won",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              dealstage: "closedwon",
              amount: 4_000,
            },
          },
          {
            id: "raw_subscription_deal",
            provider: "HUBSPOT",
            objectType: "subscription_deal",
            externalId: "deal_sub_hubspot",
            occurredAt: new Date("2026-02-07T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-07T20:00:00.000Z"),
            payload: {
              dealstage: "closedwon",
              amount: 3_000,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toEqual({
      arr: 123_000,
      mrr: 10_250,
      activeSubscriptions: 3,
      runwayMonths: 12.5,
      cashBalance: 100_000,
      netBurn: 8_000,
      currency: "USD",
    });
    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 1,
        customers: 1,
        revenue: 2_500,
      },
    ]);
    expect(result.pipeline).toEqual({
      qualifiedPipelineValue: 12_000,
      qualifiedPipelineCount: 1,
      collaborationTouchCount: 2,
      collaborationCoverage: 1,
      currency: "USD",
    });
    expect(result.metrics.map((entry) => entry.key)).toEqual([
      "revenue.mrr",
      "finance.cash_runway_months",
      "finance.net_burn",
      "sales.qualified_pipeline",
    ]);
    expect(result.meta).toEqual({
      servedAt: "2026-06-03T00:00:00.000Z",
      range: "90d",
      from: "2026-02-01",
      to: "2026-02-28",
      source: "imladris-investor-dashboard-export",
      schemaVersion: 1,
    });
    expect(prisma.imladrisCanonicalMetricValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: "org_1" },
            { userId: null, organizationId: "org_1" },
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ],
        }),
      }),
    );
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { scopeKey: "org:org_1", organizationId: "org_1" },
            { scopeKey: "org:org_1", userId: "user_1" },
            { scopeKey: "user:user_1", userId: "user_1" },
            { scopeKey: "global", userId: null, organizationId: null },
          ],
        }),
      }),
    );
  });

  it("ignores future raw duplicate timestamps when counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_current",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_future_skew",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-10T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_future_skew",
            },
          },
          {
            id: "raw_stripe_subscription_future_canceled",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_future_skew",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2099-01-01T00:00:00.000Z"),
            payload: {
              status: "canceled",
              customerId: "cus_future_skew",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("unwraps scalar raw external ID envelopes before deduping active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_wrapped_external_id_old",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: { value: "sub_wrapped_external_id" },
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-10T00:00:00.000Z"),
            payload: {
              status: "active",
            },
          },
          {
            id: "raw_stripe_subscription_wrapped_external_id_current",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: { data: { attributes: { value: "sub_wrapped_external_id" } } },
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T00:00:00.000Z"),
            payload: {
              status: "active",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("does not collapse distinct active subscriptions that are missing provider external IDs", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_subscription_missing_external_id_1",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-10T00:00:00.000Z"),
            payload: {
              status: "active",
            },
          },
          {
            id: "raw_stripe_subscription_missing_external_id_2",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T00:00:00.000Z"),
            payload: {
              status: "active",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(2);
  });

  it("parses accounting-formatted canonical numbers before building investor summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("revenue.mrr", {
            amount: "$10,250",
            arr: "$123,000",
            currency: "USD",
          }),
          metric("finance.cash_runway_months", {
            months: "12.5",
            cashBalance: "$100,000",
            netBurn: "($8,000)",
            currency: "USD",
          }),
          metric("finance.net_burn", {
            amount: "($8,000)",
            currency: "USD",
          }),
          metric("sales.qualified_pipeline", {
            amount: "$12,000",
            qualifiedDealCount: "1",
            collaborationTouchCount: "2",
            collaborationCoverage: "0.75",
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
      runwayMonths: 12.5,
      cashBalance: 100_000,
      netBurn: -8_000,
    });
    expect(result.pipeline).toMatchObject({
      qualifiedPipelineValue: 12_000,
      qualifiedPipelineCount: 1,
      collaborationTouchCount: 2,
      collaborationCoverage: 0.75,
    });
  });

  it("parses ISO currency canonical numbers before building investor summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("revenue.mrr", {
            amount: "USD 10,250",
            arr: "123,000 USD",
            currency: "USD",
          }),
          metric("finance.cash_runway_months", {
            months: "12.5",
            cashBalance: "USD 100,000",
            netBurn: "USD -8,000",
            currency: "USD",
          }),
          metric("finance.net_burn", {
            amount: "USD -8,000",
            currency: "USD",
          }),
          metric("sales.qualified_pipeline", {
            amount: "12,000 USD",
            qualifiedDealCount: "1",
            collaborationTouchCount: "2",
            collaborationCoverage: "0.75",
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
      runwayMonths: 12.5,
      cashBalance: 100_000,
      netBurn: -8_000,
    });
    expect(result.pipeline).toMatchObject({
      qualifiedPipelineValue: 12_000,
      qualifiedPipelineCount: 1,
      collaborationTouchCount: 2,
      collaborationCoverage: 0.75,
    });
  });

  it("parses compact currency canonical numbers before building investor summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("revenue.mrr", {
            amount: "USD 100k",
            arr: "1.2M USD",
            currency: "USD",
          }),
          metric("finance.cash_runway_months", {
            months: "12.5",
            cashBalance: "USD 0.5M",
            netBurn: "USD -80k",
            currency: "USD",
          }),
          metric("finance.net_burn", {
            amount: "USD -80k",
            currency: "USD",
          }),
          metric("sales.qualified_pipeline", {
            amount: "2.5M USD",
            qualifiedDealCount: "1",
            collaborationTouchCount: "2",
            collaborationCoverage: "0.75",
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 1_200_000,
      mrr: 100_000,
      runwayMonths: 12.5,
      cashBalance: 500_000,
      netBurn: -80_000,
    });
    expect(result.pipeline).toMatchObject({
      qualifiedPipelineValue: 2_500_000,
      qualifiedPipelineCount: 1,
      collaborationTouchCount: 2,
      collaborationCoverage: 0.75,
    });
  });

  it("reads snake_case canonical payload aliases before building investor summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("revenue.mrr", {
            amount: 10_250,
            arr: 123_000,
            currency: "USD",
          }),
          metric("finance.cash_runway_months", {
            months: 12.5,
            cash_balance: 100_000,
            net_burn: 8_000,
            currency: "USD",
          }),
          metric("finance.net_burn", {
            net_burn: 9_000,
            currency: "USD",
          }),
          metric("sales.qualified_pipeline", {
            amount: 12_000,
            qualified_deal_count: 3,
            collaboration_touch_count: 7,
            collaboration_coverage: "80%",
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      cashBalance: 100_000,
      netBurn: 9_000,
    });
    expect(result.pipeline).toMatchObject({
      qualifiedPipelineCount: 3,
      collaborationTouchCount: 7,
      collaborationCoverage: 0.8,
    });
  });

  it("unwraps single-value JSON:API canonical metric attributes before investor summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("revenue.mrr", {
            data: {
              type: "canonical_metric_values",
              id: "metric_revenue_mrr_json_api_value",
              attributes: {
                value: {
                  amount: "USD 32k",
                  arr: "USD 384k",
                  currency: "usd",
                },
              },
            },
          }),
          metric("finance.cash_runway_months", {
            data: {
              type: "canonical_metric_values",
              id: "metric_finance_cash_runway_json_api_value",
              attributes: {
                value: {
                  months: "11.5",
                  cash_balance: "USD 920k",
                  net_burn: "USD 80k",
                  currency: "usd",
                },
              },
            },
          }),
          metric("sales.qualified_pipeline", {
            data: {
              type: "canonical_metric_values",
              id: "metric_sales_pipeline_json_api_value",
              attributes: {
                value: {
                  amount: "USD 2.4M",
                  qualified_deal_count: "3.9",
                  collaboration_touch_count: "8.2",
                  collaboration_coverage: "75%",
                  currency: "usd",
                },
              },
            },
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      runwayMonths: 11.5,
      cashBalance: 920_000,
      netBurn: 80_000,
      currency: "USD",
    });
    expect(result.pipeline).toMatchObject({
      qualifiedPipelineValue: 2_400_000,
      qualifiedPipelineCount: 3,
      collaborationTouchCount: 8,
      collaborationCoverage: 0.75,
      currency: "USD",
    });
    expect(result.metrics.find((metric) => metric.key === "revenue.mrr")?.value).toEqual({
      amount: "USD 32k",
      arr: "USD 384k",
      currency: "usd",
    });
  });

  it("unwraps scalar canonical metric field envelopes before investor summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("revenue.mrr", {
            amount: { value: "USD 10,250" },
            arr: { data: { attributes: { value: "USD 123,000" } } },
            currency: { value: "usd" },
          }),
          metric("finance.cash_runway_months", {
            months: { value: "12.5" },
            cashBalance: { data: { value: "USD 100,000" } },
            netBurn: { value: "USD -8,000" },
            currency: { value: "usd" },
          }),
          metric("finance.net_burn", {
            amount: { value: "USD -9,000" },
            currency: { value: "usd" },
          }),
          metric("sales.qualified_pipeline", {
            amount: { value: "USD 12,000" },
            qualifiedDealCount: { value: "3" },
            collaborationTouchCount: { data: { attributes: { value: "7" } } },
            collaborationCoverage: { value: "75%" },
            currency: { value: "usd" },
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
      runwayMonths: 12.5,
      cashBalance: 100_000,
      netBurn: -9_000,
      currency: "USD",
    });
    expect(result.pipeline).toMatchObject({
      qualifiedPipelineValue: 12_000,
      qualifiedPipelineCount: 3,
      collaborationTouchCount: 7,
      collaborationCoverage: 0.75,
      currency: "USD",
    });
  });

  it("floors fractional investor pipeline count payloads before export", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("sales.qualified_pipeline", {
            amount: 12_000,
            qualifiedDealCount: 3.9,
            collaborationTouchCount: 7.8,
            collaborationCoverage: 0.8,
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.pipeline).toMatchObject({
      qualifiedPipelineCount: 3,
      collaborationTouchCount: 7,
      collaborationCoverage: 0.8,
    });
  });

  it("normalizes percent-formatted canonical ratios before building investor pipeline summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("sales.qualified_pipeline", {
            amount: 12_000,
            qualifiedDealCount: 1,
            collaborationTouchCount: 2,
            collaborationCoverage: "75%",
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.pipeline).toMatchObject({
      collaborationCoverage: 0.75,
    });
  });

  it("normalizes percentage-scale canonical ratio strings before building investor pipeline summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("sales.qualified_pipeline", {
            amount: 12_000,
            qualifiedDealCount: 1,
            collaborationTouchCount: 2,
            collaborationCoverage: "75",
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.pipeline).toMatchObject({
      collaborationCoverage: 0.75,
    });
  });

  it("normalizes text percent canonical ratios before building investor pipeline summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric("sales.qualified_pipeline", {
            amount: 12_000,
            qualifiedDealCount: 1,
            collaborationTouchCount: 2,
            collaborationCoverage: "75 percent",
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "90d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.pipeline).toMatchObject({
      collaborationCoverage: 0.75,
    });
  });

  it("exports organization-level canonical metrics and ignores wrong-scope rows", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 99_000,
              arr: 1_188_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:30:00.000Z"),
              userId: "other_user",
              organizationId: "org_1",
            },
          ),
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:00:00.000Z"),
              userId: null,
              organizationId: "org_1",
            },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
    });
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
    });
    expect(prisma.imladrisCanonicalMetricValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: "org_1" },
            { userId: null, organizationId: "org_1" },
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ],
        }),
      }),
    );
  });

  it("normalizes blank export context before querying metrics and raw records", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            {
              userId: "user_1",
              organizationId: null,
            },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context: {
        userId: " user_1 ",
        organizationId: "   ",
      },
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
    });
    expect(prisma.imladrisCanonicalMetricValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ],
        }),
      }),
    );
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { scopeKey: "user:user_1", userId: "user_1" },
            { scopeKey: "global", userId: null, organizationId: null },
          ],
        }),
      }),
    );
  });

  it("ignores user-owned raw records with non-user scope keys before export trends", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_charge_user_scope",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_user_scope",
            scopeKey: "user:user_1",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 250_000,
            },
          },
          {
            id: "raw_charge_wrong_user_scope_key",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_wrong_user_scope_key",
            scopeKey: "org:other_org",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 7_700_000,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context: {
        userId: " user_1 ",
        organizationId: "   ",
      },
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 2_500,
      },
    ]);
  });

  it("prefers user-scoped canonical metrics over organization fallbacks for the same export period", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 99_000,
              arr: 1_188_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:30:00.000Z"),
              userId: null,
              organizationId: "org_1",
            },
          ),
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:00:00.000Z"),
              userId: "user_1",
              organizationId: "org_1",
            },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
    });
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
      computedAt: "2026-02-28T12:00:00.000Z",
    });
  });

  it("does not let newer global canonical metrics override scoped investor export metrics", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 99_000,
              arr: 1_188_000,
              currency: "USD",
            },
            {
              periodStart: new Date("2026-03-01T00:00:00.000Z"),
              periodEnd: new Date("2026-03-31T23:59:59.999Z"),
              computedAt: new Date("2026-04-01T00:00:00.000Z"),
              userId: null,
              organizationId: null,
            },
          ),
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:00:00.000Z"),
              userId: "user_1",
              organizationId: "org_1",
            },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: new Date("2026-03-31T23:59:59.999Z"),
      now: new Date("2026-04-01T12:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
    });
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
      computedAt: "2026-02-28T12:00:00.000Z",
      periodEnd: "2026-02-28T23:59:59.999Z",
    });
  });

  it("uses legacy user-only canonical metrics under organization export context", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 99_000,
              arr: 1_188_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:30:00.000Z"),
              userId: null,
              organizationId: "org_1",
            },
          ),
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:00:00.000Z"),
              userId: "user_1",
              organizationId: null,
            },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(prisma.imladrisCanonicalMetricValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: "org_1" },
            { userId: null, organizationId: "org_1" },
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ],
        }),
      }),
    );
    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
    });
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
      computedAt: "2026-02-28T12:00:00.000Z",
    });
  });

  it("uses global canonical metrics under organization export context when scoped metrics are missing", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:00:00.000Z"),
              userId: null,
              organizationId: null,
            },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
    });
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
      status: "ready",
    });
  });

  it("queries organization exports across current org raw records and legacy user raw records", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { scopeKey: "org:org_1", organizationId: "org_1" },
            { scopeKey: "org:org_1", userId: "user_1" },
            { scopeKey: "user:user_1", userId: "user_1" },
            { scopeKey: "global", userId: null, organizationId: null },
          ],
        }),
      }),
    );
  });

  it("ignores wrong-scope raw records returned by the data layer before export trends", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_charge_valid_scope",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_valid_scope",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: "org_1",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 250_000,
            },
          },
          {
            id: "raw_charge_wrong_org",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_wrong_org",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: "other_org",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 9_900_000,
            },
          },
          {
            id: "raw_charge_wrong_scope_key",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_wrong_scope_key",
            scopeKey: "org:other_org",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 7_700_000,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 2_500,
      },
    ]);
  });

  it("does not let future-period canonical metrics leak into the export", async () => {
    const futurePeriodStart = new Date("2026-03-01T00:00:00.000Z");
    const futurePeriodEnd = new Date("2026-03-31T23:59:59.999Z");
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 99_000,
              arr: 1_188_000,
              currency: "USD",
            },
            {
              periodStart: futurePeriodStart,
              periodEnd: futurePeriodEnd,
              computedAt: new Date("2026-03-31T12:00:00.000Z"),
            },
          ),
          metric("revenue.mrr", {
            amount: 10_250,
            arr: 123_000,
            currency: "USD",
          }),
          metric("finance.cash_runway_months", {
            months: 12.5,
            cashBalance: 100_000,
            netBurn: 8_000,
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.arr).toBe(123_000);
    expect(result.summary.mrr).toBe(10_250);
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
      periodEnd: "2026-02-28T23:59:59.999Z",
    });
    expect(prisma.imladrisCanonicalMetricValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodEnd: { lte: periodEnd },
        }),
      }),
    );
  });

  it("does not let future-computed canonical metrics leak into the export", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 99_999,
              arr: 1_199_988,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-03-02T00:00:00.000Z"),
            },
          ),
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            {
              computedAt: new Date("2026-02-28T12:00:00.000Z"),
            },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(result.summary.arr).toBe(123_000);
    expect(result.summary.mrr).toBe(10_250);
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
      computedAt: "2026-02-28T12:00:00.000Z",
    });
  });

  it("ignores canonical metrics with inverted reporting windows before exporting investor summaries", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 99_999,
              arr: 1_199_988,
              currency: "USD",
            },
            {
              periodStart: new Date("2026-03-01T00:00:00.000Z"),
              periodEnd,
              computedAt: new Date("2026-02-28T12:30:00.000Z"),
            },
          ),
          metric("revenue.mrr", {
            amount: 10_250,
            arr: 123_000,
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(result.summary.arr).toBe(123_000);
    expect(result.summary.mrr).toBe(10_250);
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
      periodStart: "2026-02-01T00:00:00.000Z",
      periodEnd: "2026-02-28T23:59:59.999Z",
    });
  });

  it("normalizes canonical metric confidence before exporting investor metrics", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            { confidence: 1.6 },
          ),
          metric(
            "finance.net_burn",
            {
              amount: 8_000,
              currency: "USD",
            },
            { confidence: Number.NaN },
          ),
          metric(
            "sales.qualified_pipeline",
            {
              amount: 12_000,
              currency: "USD",
            },
            { confidence: -0.3 },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      confidence: 1,
    });
    expect(result.metrics.find((entry) => entry.key === "finance.net_burn")).toMatchObject({
      confidence: 0,
    });
    expect(result.metrics.find((entry) => entry.key === "sales.qualified_pipeline")).toMatchObject({
      confidence: 0,
    });
  });

  it("normalizes canonical metric warnings before exporting investor metrics", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            { warnings: "Stripe sync is partial." },
          ),
          metric(
            "sales.qualified_pipeline",
            {
              amount: 12_000,
              currency: "USD",
            },
            { warnings: [" HubSpot coverage is partial. ", "", 42, null, "Slack context is missing."] },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      warnings: ["Stripe sync is partial."],
    });
    expect(result.metrics.find((entry) => entry.key === "sales.qualified_pipeline")).toMatchObject({
      warnings: ["HubSpot coverage is partial.", "Slack context is missing."],
    });
  });

  it("treats malformed canonical metric statuses as missing before exporting investor metrics", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 10_250,
              arr: 123_000,
              currency: "USD",
            },
            { status: 42 },
          ),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      status: "missing",
    });
    expect(result.summary).toMatchObject({
      arr: 0,
      mrr: 0,
    });
  });

  it("selects the latest canonical metric even when the data layer returns rows out of order", async () => {
    const olderPeriodStart = new Date("2026-01-01T00:00:00.000Z");
    const olderPeriodEnd = new Date("2026-01-31T23:59:59.999Z");
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => [
          metric(
            "revenue.mrr",
            {
              amount: 5_000,
              arr: 60_000,
              currency: "USD",
            },
            {
              periodStart: olderPeriodStart,
              periodEnd: olderPeriodEnd,
              computedAt: new Date("2026-01-31T12:00:00.000Z"),
            },
          ),
          metric("revenue.mrr", {
            amount: 10_250,
            arr: 123_000,
            currency: "USD",
          }),
        ]),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => []),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary).toMatchObject({
      arr: 123_000,
      mrr: 10_250,
    });
    expect(result.metrics.find((entry) => entry.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 10_250,
        arr: 123_000,
        currency: "USD",
      },
      periodEnd: "2026-02-28T23:59:59.999Z",
    });
  });

  it("excludes incomplete and paused Stripe subscriptions from active subscription counts", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_sub_active",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_active",
            occurredAt: new Date("2026-02-03T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-03T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_active",
            },
          },
          {
            id: "raw_sub_incomplete",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_incomplete",
            occurredAt: new Date("2026-02-04T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T00:00:00.000Z"),
            payload: {
              status: "incomplete",
              customerId: "cus_incomplete",
            },
          },
          {
            id: "raw_sub_paused",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_paused",
            occurredAt: new Date("2026-02-05T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-05T00:00:00.000Z"),
            payload: {
              status: "paused",
              customerId: "cus_paused",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("uses source-created timestamps when raw records do not expose occurrence or update times", async () => {
    const sourceCreatedAt = new Date("2026-02-10T12:00:00.000Z");
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_created_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_created_only",
            occurredAt: null,
            sourceCreatedAt,
            sourceUpdatedAt: null,
            payload: {
              status: "succeeded",
              amount: 50_000,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 500,
      },
    ]);
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { occurredAt: { gte: periodStart, lte: periodEnd } },
                { sourceUpdatedAt: { gte: periodStart, lte: periodEnd } },
                { sourceCreatedAt: { gte: periodStart, lte: periodEnd } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("does not let payload dates outside the requested range leak into weekly export points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_future_payload_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_future_payload",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              created: "2026-03-03T00:00:00.000Z",
              amountDecimal: "500.25",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([]);
  });

  it("does not let wrapped payload dates outside the requested range leak into weekly export points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_wrapped_future_payload_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_wrapped_future_payload",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              values: {
                status: "succeeded",
                created: "2026-03-03T00:00:00.000Z",
                amountDecimal: "500.25",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([]);
  });

  it("does not let an out-of-range duplicate raw record replace an in-range export fact", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_current_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_duplicate",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 250_000,
            },
          },
          {
            id: "raw_future_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_duplicate",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-20T00:00:00.000Z"),
            payload: {
              status: "succeeded",
              created: "2026-03-04T12:00:00.000Z",
              amount: 999_000,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 2500,
      },
    ]);
  });

  it("does not collapse distinct raw export facts that are missing provider external IDs", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_missing_external_id_charge_1",
            provider: "STRIPE",
            objectType: "charge",
            externalId: " ",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 250_000,
            },
          },
          {
            id: "raw_missing_external_id_charge_2",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "",
            occurredAt: new Date("2026-02-05T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-05T12:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount: 125_000,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 3750,
      },
    ]);
  });

  it("does not count active subscriptions whose business date is outside the requested range", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_future_payload_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_future_payload",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "active",
              created: "2026-03-03T00:00:00.000Z",
              customerId: "cus_future_payload",
            },
          },
          {
            id: "raw_current_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_current",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-12T09:00:00.000Z"),
            payload: {
              status: "active",
              created: "2026-02-12T09:00:00.000Z",
              customerId: "cus_current",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("normalizes raw provider and object type values before investor fact analysis", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_mixed_subscription",
            provider: " stripe ",
            objectType: " Subscription ",
            externalId: " sub_mixed ",
            occurredAt: new Date("2026-02-03T00:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-03T00:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_mixed",
            },
          },
          {
            id: "raw_mixed_charge",
            provider: "stripe",
            objectType: "Charge",
            externalId: " ch_mixed ",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "paid",
              amountDecimal: "500.25",
            },
          },
          {
            id: "raw_mixed_demo",
            provider: " google_workspace ",
            objectType: " Calendar Event ",
            externalId: " evt_mixed ",
            occurredAt: new Date("2026-02-05T17:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-05T17:00:00.000Z"),
            payload: {
              summary: "Demo with Gamma",
            },
          },
          {
            id: "raw_mixed_won",
            provider: "hubspot",
            objectType: "Deal",
            externalId: " deal_mixed ",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              dealstage: "closed won",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 1,
        customers: 1,
        revenue: 500.25,
      },
    ]);
  });

  it("normalizes camelCase raw provider values before investor fact analysis", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_camel_provider_demo",
            provider: "googleWorkspace",
            objectType: "calendar_event",
            externalId: "evt_camel_provider_demo",
            occurredAt: new Date("2026-02-05T17:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-05T17:00:00.000Z"),
            payload: {
              summary: "Demo with Gamma",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 1,
        customers: 0,
        revenue: 0,
      },
    ]);
  });

  it("unwraps scalar raw provider and object type values before investor fact analysis", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_scalar_type_charge",
            provider: { value: "stripe" },
            objectType: { data: { attributes: { value: "Charge" } } },
            externalId: "ch_scalar_type",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "paid",
              amountDecimal: "500.25",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
    ]);
  });

  it("unwraps JSON API raw object type resources before investor fact analysis", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_jsonapi_type_charge",
            provider: "stripe",
            objectType: { data: { type: "Charge" } },
            externalId: "ch_jsonapi_type",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
            payload: {
              status: "paid",
              amountDecimal: "500.25",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
    ]);
  });

  it("reads nested HubSpot demo text aliases before building investor weekly points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_nested_hubspot_demo",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_nested_demo",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              properties: {
                description: "Product demo with Delta",
                stage_label: "Evaluation",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 1,
        customers: 0,
        revenue: 0,
      },
    ]);
  });

  it("uses nested calendar event start times before building investor weekly demo points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_nested_start_demo",
            provider: "GOOGLE_WORKSPACE",
            objectType: "calendar_event",
            externalId: "evt_nested_start_demo",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              summary: "Demo with Echo",
              start: {
                dateTime: "2026-02-05T17:00:00.000Z",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 1,
        customers: 0,
        revenue: 0,
      },
    ]);
  });

  it("reads wrapped calendar event demo text before building investor weekly points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_wrapped_calendar_demo",
            provider: "GOOGLE_WORKSPACE",
            objectType: "calendar_event",
            externalId: "evt_wrapped_calendar_demo",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              values: {
                summary: "Demo with Foxtrot",
                start: {
                  dateTime: "2026-02-05T17:00:00.000Z",
                },
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 1,
        customers: 0,
        revenue: 0,
      },
    ]);
  });

  it("unwraps scalar calendar event demo text before building investor weekly points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_scalar_calendar_demo",
            provider: "GOOGLE_WORKSPACE",
            objectType: "calendar_event",
            externalId: "evt_scalar_calendar_demo",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              summary: { value: "Demo with Golf" },
              start: {
                dateTime: "2026-02-05T17:00:00.000Z",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 1,
        customers: 0,
        revenue: 0,
      },
    ]);
  });

  it("normalizes HubSpot recurring flags before investor active subscription counts", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_string_recurring",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_string_recurring",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              recurringRevenue: " true ",
              amount: "12000",
              email: "buyer@example.com",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("unwraps object-shaped HubSpot recurring flags before investor active subscription counts", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_object_recurring",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_object_recurring",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              recurringRevenue: { value: true },
              amount: "12000",
              email: "buyer@example.com",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("reads wrapped HubSpot recurring flags before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_wrapped_subscription",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_wrapped_subscription",
            occurredAt: new Date("2026-02-08T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-08T20:00:00.000Z"),
            payload: {
              values: {
                recurringRevenue: " true ",
                customer_id: "cus_wrapped_hubspot_subscription",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("reads nested Stripe subscription status and customer identifiers before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_nested_active_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_nested_active",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              properties: {
                status: "active",
                customer_id: "cus_nested_active",
              },
            },
          },
          {
            id: "raw_nested_canceled_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_nested_canceled",
            occurredAt: new Date("2026-02-07T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-07T20:00:00.000Z"),
            payload: {
              properties: {
                status: "canceled",
                customer_id: "cus_nested_canceled",
              },
            },
          },
          {
            id: "raw_hubspot_linked_subscription",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_linked_nested_subscription",
            occurredAt: new Date("2026-02-08T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-08T20:00:00.000Z"),
            payload: {
              recurringRevenue: true,
              stripe_customer_id: "cus_nested_active",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("excludes Stripe subscriptions with nested inactive statuses before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_active_subscription_for_nested_status",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_active_for_nested_status",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              status: "active",
              customerId: "cus_active_for_nested_status",
            },
          },
          {
            id: "raw_properties_unpaid_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_properties_unpaid",
            occurredAt: new Date("2026-02-07T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-07T20:00:00.000Z"),
            payload: {
              properties: {
                status: "unpaid",
              },
              customerId: "cus_properties_unpaid",
            },
          },
          {
            id: "raw_subscription_paused_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_subscription_paused",
            occurredAt: new Date("2026-02-08T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-08T20:00:00.000Z"),
            payload: {
              subscription: {
                status: "paused",
              },
              customerId: "cus_subscription_paused",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("unwraps object-shaped Stripe subscription statuses before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_object_status_active_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_object_status_active",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              status: { name: "Active" },
              customerId: "cus_object_status_active",
            },
          },
          {
            id: "raw_object_status_canceled_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_object_status_canceled",
            occurredAt: new Date("2026-02-07T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-07T20:00:00.000Z"),
            payload: {
              status: { name: "Canceled" },
              customerId: "cus_object_status_canceled",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("reads wrapped Stripe subscription statuses before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_values_active_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_values_active",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              values: {
                status: "active",
                customer_id: "cus_values_active",
              },
            },
          },
          {
            id: "raw_fields_canceled_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_fields_canceled",
            occurredAt: new Date("2026-02-07T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-07T20:00:00.000Z"),
            payload: {
              fields: {
                status: "canceled",
                customer_id: "cus_fields_canceled",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("reads nested Stripe subscription customer objects before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_subscription_nested_customer_object",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_nested_customer_object",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              status: "active",
              subscription: {
                customer: {
                  id: "cus_nested_subscription_object",
                  email: "nested-subscription@example.com",
                },
              },
            },
          },
          {
            id: "raw_hubspot_linked_nested_customer_object",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_linked_nested_customer_object",
            occurredAt: new Date("2026-02-08T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-08T20:00:00.000Z"),
            payload: {
              recurringRevenue: true,
              stripe_customer_id: "cus_nested_subscription_object",
              primary_contact_email: "nested-subscription@example.com",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("uses Stripe subscription lifecycle dates before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_subscription_lifecycle_date",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_lifecycle_date",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              status: "active",
              customerId: "cus_lifecycle",
              current_period_start: "2026-02-03T00:00:00.000Z",
            },
          },
          {
            id: "raw_subscription_nested_lifecycle_date",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_nested_lifecycle_date",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            payload: {
              properties: {
                status: "active",
                customer_id: "cus_nested_lifecycle",
                current_period_start: "2026-02-04T00:00:00.000Z",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(2);
  });

  it("links HubSpot subscriptions by nested snake_case contact email before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_email_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_email_linked",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              status: "active",
              customerEmail: "buyer@example.com",
            },
          },
          {
            id: "raw_hubspot_nested_email_subscription",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_nested_email_subscription",
            occurredAt: new Date("2026-02-08T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-08T20:00:00.000Z"),
            payload: {
              recurringRevenue: true,
              properties: {
                contact_email: "buyer@example.com",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("unwraps scalar subscription emails before counting active subscriptions", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_stripe_scalar_email_subscription",
            provider: "STRIPE",
            objectType: "subscription",
            externalId: "sub_scalar_email_linked",
            occurredAt: new Date("2026-02-06T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
            payload: {
              status: "active",
              customerEmail: { value: "buyer@example.com" },
            },
          },
          {
            id: "raw_hubspot_scalar_email_subscription",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_scalar_email_subscription",
            occurredAt: new Date("2026-02-08T20:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-08T20:00:00.000Z"),
            payload: {
              recurringRevenue: true,
              properties: {
                contact_email: {
                  data: {
                    attributes: {
                      value: "buyer@example.com",
                    },
                  },
                },
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.summary.activeSubscriptions).toBe(1);
  });

  it("counts explicit decimal Stripe charge amounts without treating them as cents", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_decimal_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_decimal_amount",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              amountDecimal: "500.25",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
    ]);
  });

  it("subtracts refunded Stripe charge amounts before building investor weekly revenue", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_partially_refunded_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_partially_refunded",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              amountDecimal: "500.25",
              amount_refunded: 20_025,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 300,
      },
    ]);
  });

  it("reads Stripe charge amounts and refunds from nested provider properties", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_nested_properties_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_nested_properties",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              properties: {
                status: "succeeded",
                amount_decimal: "500.25",
                amount_refunded: 20_025,
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 300,
      },
    ]);
  });

  it("reads wrapped Stripe charge amounts and statuses before building investor weekly revenue", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_values_wrapped_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_values_wrapped",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              values: {
                status: "succeeded",
                amount_decimal: "500.25",
                amount_refunded: 20_025,
              },
            },
          },
          {
            id: "raw_fields_failed_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_fields_failed",
            occurredAt: new Date("2026-02-12T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-12T09:00:00.000Z"),
            payload: {
              fields: {
                status: "failed",
                amount_decimal: "999.99",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 300,
      },
    ]);
  });

  it("reads JSON:API data attribute Stripe charge fields before building investor weekly revenue", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_json_api_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_json_api",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              data: {
                type: "charges",
                id: "ch_json_api",
                attributes: {
                  status: "succeeded",
                  amount_decimal: "750.50",
                  amount_refunded: 25_050,
                },
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 500,
      },
    ]);
  });

  it("unwraps single-value JSON:API Stripe charge attributes before building investor weekly revenue", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_json_api_value_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_json_api_value",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              data: {
                type: "charges",
                id: "ch_json_api_value",
                attributes: {
                  value: {
                    status: "succeeded",
                    amount_decimal: "750.50",
                    amount_refunded: 25_050,
                  },
                },
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 500,
      },
    ]);
  });

  it("reads fallback Stripe charge amount aliases before building investor weekly revenue", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_net_amount_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_net_amount",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              net_amount: 50_025,
            },
          },
          {
            id: "raw_nested_value_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_nested_value",
            occurredAt: new Date("2026-02-12T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-12T09:00:00.000Z"),
            payload: {
              properties: {
                status: "succeeded",
                value: 25_000,
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 750.25,
      },
    ]);
  });

  it("reads captured Stripe charge amounts before building investor weekly revenue", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_captured_amount_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_captured_amount",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              amount_captured: 50_025,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
    ]);
  });

  it("reads alternate Stripe refund amount aliases before building investor weekly revenue", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_refund_amount_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_refund_amount",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              amountDecimal: "500.25",
              refund_amount: 20_025,
            },
          },
          {
            id: "raw_nested_refund_amount_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_nested_refund_amount",
            occurredAt: new Date("2026-02-12T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-12T09:00:00.000Z"),
            payload: {
              properties: {
                status: "succeeded",
                amount_decimal: "300.00",
                refundAmount: 10_000,
              },
            },
          },
          {
            id: "raw_refund_amount_cents_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_refund_amount_cents",
            occurredAt: new Date("2026-02-13T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-13T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              amountDecimal: "200.00",
              amount_refunded_cents: 5_025,
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 649.75,
      },
    ]);
  });

  it("does not let negative Stripe refund amounts inflate investor weekly revenue", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_negative_refund_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_negative_refund",
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              amountDecimal: "500.25",
              amount_refunded: "-20025",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
    ]);
  });

  it("parses numeric-string payload timestamps before building investor weekly points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_numeric_string_created_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_numeric_string_created",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              created: String(new Date("2026-02-04T12:00:00.000Z").getTime() / 1000),
              amountDecimal: "500.25",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
    ]);
  });

  it("parses decimal Unix-string payload timestamps before building investor weekly points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_decimal_unix_created_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_decimal_unix_created",
            occurredAt: null,
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              created: "1770206400.5",
              amountDecimal: "500.25",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
    ]);
  });

  it("uses nested HubSpot close dates before fallback raw timestamps for weekly customer points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_hubspot_nested_closedate_deal",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_nested_closedate",
            occurredAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceCreatedAt: new Date("2026-02-04T12:00:00.000Z"),
            sourceUpdatedAt: new Date("2026-02-19T09:00:00.000Z"),
            payload: {
              properties: {
                dealstage: "closedwon",
                closedate: "2026-02-18T15:30:00.000Z",
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-16",
        demos: 0,
        customers: 1,
        revenue: 0,
      },
    ]);
  });

  it("unwraps provider date envelopes before building investor weekly points", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_wrapped_created_charge",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_wrapped_created",
            occurredAt: new Date("2026-02-20T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-20T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              created: { data: { attributes: { value: "2026-02-04T12:00:00.000Z" } } },
              amountDecimal: "500.25",
            },
          },
          {
            id: "raw_wrapped_closedate_deal",
            provider: "HUBSPOT",
            objectType: "deal",
            externalId: "deal_wrapped_closedate",
            occurredAt: new Date("2026-02-21T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-21T09:00:00.000Z"),
            payload: {
              properties: {
                dealstage: "closedwon",
                closedate: { value: "2026-02-18T15:30:00.000Z" },
              },
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-02",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
      {
        week: "2026-02-16",
        demos: 0,
        customers: 1,
        revenue: 0,
      },
    ]);
  });

  it("deduplicates raw records returned from current org scope and legacy user scope", async () => {
    const prisma = {
      imladrisCanonicalMetricValue: {
        findMany: vi.fn(async () => []),
      },
      imladrisRawSourceRecord: {
        findMany: vi.fn(async () => [
          {
            id: "raw_charge_org",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_duplicate_scope",
            scopeKey: "org:org_1",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-02-11T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-11T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              amountDecimal: "500.25",
            },
          },
          {
            id: "raw_charge_legacy_user",
            provider: "STRIPE",
            objectType: "charge",
            externalId: "ch_duplicate_scope",
            scopeKey: "user:user_1",
            userId: "user_1",
            organizationId: null,
            occurredAt: new Date("2026-02-12T09:00:00.000Z"),
            sourceCreatedAt: null,
            sourceUpdatedAt: new Date("2026-02-12T09:00:00.000Z"),
            payload: {
              status: "succeeded",
              amountDecimal: "999.75",
            },
          },
        ]),
      },
    };

    const result = await buildInvestorDashboardExport({
      prisma: prisma as never,
      context,
      range: "30d",
      fromDate: periodStart,
      toDate: periodEnd,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    expect(result.weekly).toEqual([
      {
        week: "2026-02-09",
        demos: 0,
        customers: 0,
        revenue: 500.25,
      },
    ]);
  });
});

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

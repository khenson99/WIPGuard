import { describe, expect, it, vi } from "vitest";
import { buildInvestorDashboardExport } from "@/lib/imladris/investor-dashboard-export";

const context = { userId: "user_1", organizationId: "org_1" };
const periodStart = new Date("2026-02-01T00:00:00.000Z");
const periodEnd = new Date("2026-02-28T23:59:59.999Z");
const computedAt = new Date("2026-02-28T12:00:00.000Z");

function metric(metricKey: string, value: Record<string, unknown>) {
  return {
    id: `metric_${metricKey}`,
    metricKey,
    department: metricKey.startsWith("sales.") ? "sales" : "finance",
    unit: metricKey === "finance.cash_runway_months" ? "months" : "currency",
    value,
    periodStart,
    periodEnd,
    status: "READY",
    confidence: 0.92,
    warnings: [],
    calculationVersion: `${metricKey}-v1`,
    computedAt,
    lineage: [
      {
        sourceKey: metricKey.startsWith("sales.") ? "hubspot" : "stripe",
        sourceType: "raw",
        sourceId: null,
        rawRecordId: "raw_1",
        capturedAt: computedAt,
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
          userId: "user_1",
          organizationId: "org_1",
        }),
      }),
    );
    expect(prisma.imladrisRawSourceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scopeKey: "org:org_1",
          OR: [{ userId: "user_1" }, { organizationId: "org_1" }],
        }),
      }),
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const prismaMock = {
  user: {
    findUnique: vi.fn(),
  },
  imladrisCanonicalMetricValue: {
    findMany: vi.fn(),
  },
  imladrisRawSourceRecord: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const { GET, OPTIONS } = await import("./route");

const allowedOrigin = "https://vigilant-invention-j1n5g1p.pages.github.io";

function canonicalMetric(input: {
  id: string;
  metricKey: string;
  department: string;
  unit: string;
  value: Record<string, unknown>;
  calculationVersion?: string;
}) {
  return {
    id: input.id,
    metricKey: input.metricKey,
    department: input.department,
    unit: input.unit,
    value: input.value,
    periodStart: new Date("2026-02-01T00:00:00.000Z"),
    periodEnd: new Date("2026-02-28T23:59:59.999Z"),
    status: "READY",
    confidence: 0.92,
    warnings: [],
    calculationVersion: input.calculationVersion ?? `${input.metricKey}-v1`,
    computedAt: new Date("2026-02-28T12:00:00.000Z"),
    lineage: [],
  };
}

function request(
  url = "https://wipguard.test/api/external/finance-dashboard?range=180d",
  headers: Record<string, string> = {},
) {
  return new NextRequest(url, { method: "GET", headers });
}

describe("external finance dashboard export", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
    vi.clearAllMocks();
    process.env.FINANCE_DASHBOARD_EXPORT_TOKEN = "test-export-token";
    process.env.FINANCE_DASHBOARD_PASSWORD_HASH =
      "ed2814b9fdf92b9693e2249637833b4441c1b63143a3d072c043f8715081b533";
    process.env.FINANCE_DASHBOARD_ALLOWED_ORIGINS = allowedOrigin;
    process.env.INTEGRATION_OWNER_USER_ID = "owner_1";
    delete process.env.MERCURY_API_TOKEN;
    prismaMock.user.findUnique.mockResolvedValue({ organizationId: "org_1" });
    prismaMock.imladrisCanonicalMetricValue.findMany.mockResolvedValue([
      canonicalMetric({
        id: "metric_revenue_mrr",
        metricKey: "revenue.mrr",
        department: "finance",
        unit: "currency",
        value: { amount: 10_250, arr: 123_000, currency: "USD" },
        calculationVersion: "revenue-mrr-v1",
      }),
      canonicalMetric({
        id: "metric_revenue_arr",
        metricKey: "revenue.arr",
        department: "finance",
        unit: "currency",
        value: { amount: 123_000, currency: "USD" },
      }),
      canonicalMetric({
        id: "metric_total_revenue",
        metricKey: "revenue.total_revenue",
        department: "finance",
        unit: "currency",
        value: { amount: 141_000, subscriptionRevenue: 123_000, servicesRevenue: 18_000, currency: "USD" },
      }),
      canonicalMetric({
        id: "metric_subscription_revenue",
        metricKey: "revenue.subscription_revenue",
        department: "finance",
        unit: "currency",
        value: { amount: 123_000, currency: "USD" },
      }),
      canonicalMetric({
        id: "metric_services_revenue",
        metricKey: "revenue.services_revenue",
        department: "finance",
        unit: "currency",
        value: { amount: 18_000, currency: "USD" },
      }),
      canonicalMetric({
        id: "metric_active_subscriptions",
        metricKey: "revenue.active_subscriptions",
        department: "finance",
        unit: "count",
        value: { count: 2 },
      }),
      canonicalMetric({
        id: "metric_customer_count",
        metricKey: "revenue.customer_count",
        department: "finance",
        unit: "count",
        value: { count: 2 },
      }),
      canonicalMetric({
        id: "metric_cash_balance",
        metricKey: "finance.cash_balance",
        department: "finance",
        unit: "currency",
        value: { amount: 100_000, currency: "USD" },
      }),
      canonicalMetric({
        id: "metric_runway",
        metricKey: "finance.cash_runway_months",
        department: "finance",
        unit: "months",
        value: { months: 12.5, cashBalance: 100_000, netBurn: 8_000, currency: "USD" },
        calculationVersion: "finance-cash-runway-v1",
      }),
      canonicalMetric({
        id: "metric_net_burn",
        metricKey: "finance.net_burn",
        department: "finance",
        unit: "currency",
        value: { amount: 8_000, currency: "USD" },
        calculationVersion: "finance-net-burn-v1",
      }),
      canonicalMetric({
        id: "metric_expenses",
        metricKey: "finance.expenses",
        department: "finance",
        unit: "currency",
        value: { amount: 42_500, currency: "USD" },
      }),
      canonicalMetric({
        id: "metric_gross_margin",
        metricKey: "finance.gross_margin",
        department: "finance",
        unit: "percent",
        value: { rate: 84 },
      }),
      canonicalMetric({
        id: "metric_pipeline",
        metricKey: "sales.qualified_pipeline",
        department: "sales",
        unit: "currency",
        value: {
          amount: 12_000,
          qualifiedDealCount: 1,
          collaborationTouchCount: 2,
          collaborationCoverage: 1,
          currency: "USD",
        },
        calculationVersion: "sales-qualified-pipeline-v1",
      }),
      canonicalMetric({
        id: "metric_demos",
        metricKey: "sales.demos",
        department: "sales",
        unit: "count",
        value: { count: 5 },
      }),
      canonicalMetric({
        id: "metric_website_traffic",
        metricKey: "marketing.website_traffic",
        department: "marketing",
        unit: "count",
        value: { count: 6_432 },
      }),
      canonicalMetric({
        id: "metric_conversion_rate",
        metricKey: "marketing.conversion_rate",
        department: "marketing",
        unit: "percent",
        value: { rate: 0.92 },
      }),
      canonicalMetric({
        id: "metric_pipeline_efficiency",
        metricKey: "marketing.pipeline_efficiency",
        department: "marketing",
        unit: "ratio",
        value: { rate: 0.31 },
      }),
      canonicalMetric({
        id: "metric_activation_rate",
        metricKey: "product.activation_rate",
        department: "product",
        unit: "percent",
        value: { rate: 0.73 },
      }),
      canonicalMetric({
        id: "metric_customer_health",
        metricKey: "customer_success.customer_health",
        department: "customer_success",
        unit: "score",
        value: { score: 82 },
      }),
      canonicalMetric({
        id: "metric_customer_activity",
        metricKey: "customer_success.customer_activity",
        department: "customer_success",
        unit: "count",
        value: { count: 43 },
      }),
      canonicalMetric({
        id: "metric_churn_rate",
        metricKey: "customer_success.churn_rate",
        department: "customer_success",
        unit: "percent",
        value: { rate: 5 },
      }),
      canonicalMetric({
        id: "metric_retention_rate",
        metricKey: "customer_success.retention_rate",
        department: "customer_success",
        unit: "percent",
        value: { rate: 95 },
      }),
      canonicalMetric({
        id: "metric_retention_risk",
        metricKey: "customer_success.retention_risk",
        department: "customer_success",
        unit: "count",
        value: { count: 1 },
      }),
    ]);
    prismaMock.imladrisRawSourceRecord.findMany.mockResolvedValue([
      {
        id: "raw_sub_1",
        provider: "STRIPE",
        objectType: "subscription",
        externalId: "sub_1",
        occurredAt: new Date("2026-02-03T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-02-03T00:00:00.000Z"),
        payload: { status: "active", customerId: "cus_1" },
      },
      {
        id: "raw_sub_2",
        provider: "STRIPE",
        objectType: "subscription",
        externalId: "sub_2",
        occurredAt: new Date("2026-02-04T00:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-02-04T00:00:00.000Z"),
        payload: { status: "active", customerId: "cus_2" },
      },
      {
        id: "raw_charge",
        provider: "STRIPE",
        objectType: "charge",
        externalId: "ch_1",
        occurredAt: new Date("2026-02-04T12:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-02-04T12:00:00.000Z"),
        payload: { status: "succeeded", amount: 250_000, currency: "usd" },
      },
      {
        id: "raw_demo",
        provider: "GOOGLE_WORKSPACE",
        objectType: "event",
        externalId: "evt_demo",
        occurredAt: new Date("2026-02-05T17:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-02-05T17:00:00.000Z"),
        payload: { summary: "Demo with Gamma" },
      },
      {
        id: "raw_won",
        provider: "HUBSPOT",
        objectType: "deal",
        externalId: "deal_won",
        occurredAt: new Date("2026-02-06T20:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-02-06T20:00:00.000Z"),
        payload: { dealstage: "closedwon", amount: 4_000 },
      },
      {
        id: "raw_subscription_deal",
        provider: "HUBSPOT",
        objectType: "subscription_deal",
        externalId: "deal_sub_hubspot",
        occurredAt: new Date("2026-02-07T20:00:00.000Z"),
        sourceCreatedAt: null,
        sourceUpdatedAt: new Date("2026-02-07T20:00:00.000Z"),
        payload: { dealstage: "closedwon", amount: 3_000 },
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns CORS headers for the private GitHub Pages origin", async () => {
    const response = await OPTIONS(
      request("https://wipguard.test/api/external/finance-dashboard", {
        origin: allowedOrigin,
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    expect(response.headers.get("access-control-allow-headers")).toContain("x-finance-dashboard-token");
    expect(response.headers.get("access-control-allow-headers")).toContain("x-finance-dashboard-password");
  });

  it("rejects requests without the scoped export token", async () => {
    const response = await GET(
      request("https://wipguard.test/api/external/finance-dashboard", {
        origin: allowedOrigin,
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.imladrisCanonicalMetricValue.findMany).not.toHaveBeenCalled();
    expect(prismaMock.imladrisRawSourceRecord.findMany).not.toHaveBeenCalled();
  });

  it("serves the canonical Imladris export for authorized dashboard requests", async () => {
    const response = await GET(
      request("https://wipguard.test/api/external/finance-dashboard?range=90d", {
        origin: allowedOrigin,
        "x-finance-dashboard-token": "test-export-token",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    const body = await response.json();
    expect(body.mercury).toBeUndefined();
    expect(body.summary).toEqual({
      arr: 123_000,
      mrr: 10_250,
      totalRevenue: 141_000,
      subscriptionRevenue: 123_000,
      servicesRevenue: 18_000,
      activeSubscriptions: 2,
      stripeSubscriptions: 0,
      hubspotOnlySubscriptions: 0,
      customers: 2,
      stripeCustomers: 0,
      hubspotOnlyCustomers: 0,
      runwayMonths: 12.5,
      cashBalance: 100_000,
      netBurn: 8_000,
      cashOutflow: 0,
      cashInflow: 0,
      expenses: 42_500,
      grossMargin: 84,
      grossMarginRevenue: 0,
      costOfGoodsSold: 0,
      qualifiedPipelineCount: 1,
      collaborationTouchCount: 2,
      collaborationCoverage: 1,
      demos: 5,
      scheduledDemos: 0,
      requestedDemos: 0,
      hubspotDemoDeals: 0,
      hubspotDemoMeetings: 0,
      calendarDemoEvents: 0,
      webflowDemoRequests: 0,
      websiteTraffic: 6_432,
      websiteSessions: 0,
      organicTraffic: 0,
      searchClicks: 0,
      searchImpressions: 0,
      conversionRate: 0.92,
      conversions: 0,
      webflowFormSubmissions: 0,
      hubspotLeadConversions: 0,
      identifiedVisitors: 0,
      pipelineEfficiency: 0.31,
      acquisitionSpend: 0,
      activationRate: 0.73,
      activatedAccounts: 0,
      eligibleAccounts: 0,
      customerHealth: 82,
      customerActivity: 43,
      supportInteractions: 0,
      productUsageRecords: 0,
      collaborationSignals: 0,
      atRiskAccounts: 0,
      openSupportIssues: 0,
      churnRate: 5,
      retentionRate: 95,
      retentionRiskScore: 0,
      retentionRiskAccounts: 0,
      currency: "USD",
    });
    expect(body.weekly).toEqual([
      { week: "2026-02-02", demos: 1, customers: 1, revenue: 2_500 },
    ]);
    expect(body.pipeline).toEqual({
      qualifiedPipelineValue: 12_000,
      qualifiedPipelineCount: 1,
      collaborationTouchCount: 2,
      collaborationCoverage: 1,
      currency: "USD",
    });
    expect(body.metrics.map((entry: { key: string }) => entry.key)).toEqual([
      "revenue.mrr",
      "revenue.arr",
      "revenue.total_revenue",
      "revenue.subscription_revenue",
      "revenue.services_revenue",
      "revenue.active_subscriptions",
      "revenue.customer_count",
      "finance.cash_balance",
      "finance.cash_runway_months",
      "finance.net_burn",
      "finance.expenses",
      "finance.gross_margin",
      "sales.qualified_pipeline",
      "sales.demos",
      "marketing.website_traffic",
      "marketing.conversion_rate",
      "marketing.pipeline_efficiency",
      "product.activation_rate",
      "customer_success.customer_health",
      "customer_success.customer_activity",
      "customer_success.churn_rate",
      "customer_success.retention_rate",
      "customer_success.retention_risk",
    ]);
    expect(body.meta).toMatchObject({
      range: "90d",
      source: "imladris-investor-dashboard-export",
      schemaVersion: 1,
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "owner_1" },
      select: { organizationId: true },
    });
  });

  it("serves the canonical Imladris export for password-authorized dashboard requests", async () => {
    const response = await GET(
      request("https://wipguard.test/api/external/finance-dashboard?range=90d", {
        origin: allowedOrigin,
        "x-finance-dashboard-password": ["born", "to", "flow"].join(""),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    const body = await response.json();
    expect(body.mercury).toBeUndefined();
    expect(body.summary.mrr).toBe(10_250);
    expect(body.meta.range).toBe("90d");
    expect(prismaMock.imladrisCanonicalMetricValue.findMany).toHaveBeenCalled();
  });

  it("returns 503 when the external export owner is not configured", async () => {
    delete process.env.INTEGRATION_OWNER_USER_ID;

    const response = await GET(
      request("https://wipguard.test/api/external/finance-dashboard?range=90d", {
        origin: allowedOrigin,
        "x-finance-dashboard-token": "test-export-token",
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    expect(response.headers.get("cache-control")).toBe("no-cache, no-store");
    expect(await response.json()).toEqual({
      error: "Finance dashboard export owner is not configured",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

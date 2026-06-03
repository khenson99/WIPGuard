import { beforeEach, describe, expect, it, vi } from "vitest";
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

function request(
  url = "https://wipguard.test/api/external/finance-dashboard?range=180d",
  headers: Record<string, string> = {},
) {
  return new NextRequest(url, { method: "GET", headers });
}

describe("external finance dashboard export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FINANCE_DASHBOARD_EXPORT_TOKEN = "test-export-token";
    process.env.FINANCE_DASHBOARD_PASSWORD_HASH =
      "ed2814b9fdf92b9693e2249637833b4441c1b63143a3d072c043f8715081b533";
    process.env.FINANCE_DASHBOARD_ALLOWED_ORIGINS = allowedOrigin;
    process.env.INTEGRATION_OWNER_USER_ID = "owner_1";
    delete process.env.MERCURY_API_TOKEN;
    prismaMock.user.findUnique.mockResolvedValue({ organizationId: "org_1" });
    prismaMock.imladrisCanonicalMetricValue.findMany.mockResolvedValue([
      {
        id: "metric_revenue_mrr",
        metricKey: "revenue.mrr",
        department: "finance",
        unit: "currency",
        value: { amount: 10_250, arr: 123_000, currency: "USD" },
        periodStart: new Date("2026-02-01T00:00:00.000Z"),
        periodEnd: new Date("2026-02-28T23:59:59.999Z"),
        status: "READY",
        confidence: 0.92,
        warnings: [],
        calculationVersion: "revenue-mrr-v1",
        computedAt: new Date("2026-02-28T12:00:00.000Z"),
        lineage: [],
      },
      {
        id: "metric_runway",
        metricKey: "finance.cash_runway_months",
        department: "finance",
        unit: "months",
        value: { months: 12.5, cashBalance: 100_000, netBurn: 8_000, currency: "USD" },
        periodStart: new Date("2026-02-01T00:00:00.000Z"),
        periodEnd: new Date("2026-02-28T23:59:59.999Z"),
        status: "READY",
        confidence: 0.92,
        warnings: [],
        calculationVersion: "finance-cash-runway-v1",
        computedAt: new Date("2026-02-28T12:00:00.000Z"),
        lineage: [],
      },
      {
        id: "metric_net_burn",
        metricKey: "finance.net_burn",
        department: "finance",
        unit: "currency",
        value: { amount: 8_000, currency: "USD" },
        periodStart: new Date("2026-02-01T00:00:00.000Z"),
        periodEnd: new Date("2026-02-28T23:59:59.999Z"),
        status: "READY",
        confidence: 0.92,
        warnings: [],
        calculationVersion: "finance-net-burn-v1",
        computedAt: new Date("2026-02-28T12:00:00.000Z"),
        lineage: [],
      },
      {
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
        periodStart: new Date("2026-02-01T00:00:00.000Z"),
        periodEnd: new Date("2026-02-28T23:59:59.999Z"),
        status: "READY",
        confidence: 0.92,
        warnings: [],
        calculationVersion: "sales-qualified-pipeline-v1",
        computedAt: new Date("2026-02-28T12:00:00.000Z"),
        lineage: [],
      },
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
      activeSubscriptions: 3,
      runwayMonths: 12.5,
      cashBalance: 100_000,
      netBurn: 8_000,
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
      "finance.cash_runway_months",
      "finance.net_burn",
      "sales.qualified_pipeline",
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

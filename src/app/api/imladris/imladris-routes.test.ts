import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({
    user: {
      id: "user_1",
      email: "founder@example.com",
      organizationId: "org_1",
    },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: vi.fn(async () => []),
    },
    analyticsSnapshot: {
      findMany: vi.fn(async () => []),
    },
    imladrisSourceSyncRun: {
      findMany: vi.fn(async () => []),
    },
    imladrisCanonicalMetricValue: {
      findMany: vi.fn(async () => []),
    },
  },
}));

describe("Imladris API routes", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("serves source readiness for every required provider", async () => {
    const { GET } = await import("@/app/api/imladris/sources/route");
    const response = await GET(new NextRequest("http://localhost/api/imladris/sources"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.product).toBe("Imladris");
    expect(payload.sources.map((source: { key: string }) => source.key)).toEqual([
      "hubspot",
      "stripe",
      "pylon",
      "posthog",
      "linear",
      "slack",
      "googleWorkspace",
      "github",
      "googleAnalytics",
      "googleSearchConsole",
      "googleAds",
      "metaAds",
      "reddit",
      "semrush",
      "coda",
      "webflow",
      "unify",
      "mercury",
    ]);
  });

  it("serves canonical operating metrics without task-derived keys", async () => {
    const { GET } = await import("@/app/api/imladris/metrics/route");
    const response = await GET(new NextRequest("http://localhost/api/imladris/metrics"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.metrics.map((metric: { key: string }) => metric.key)).toContain(
      "development.delivery_health",
    );
    expect(payload.metrics.map((metric: { key: string }) => metric.key)).not.toContain(
      "ceo.throughput_30d",
    );
  });

  it("serves operating and department dashboards from canonical metric definitions", async () => {
    const operatingRoute = await import("@/app/api/imladris/dashboards/operating/route");
    const operatingResponse = await operatingRoute.GET(
      new NextRequest("http://localhost/api/imladris/dashboards/operating"),
    );
    const operatingPayload = await operatingResponse.json();

    expect(operatingResponse.status).toBe(200);
    expect(operatingPayload.dashboard.id).toBe("operating");
    expect(operatingPayload.dashboard.metricKeys).toContain("development.delivery_health");

    const departmentRoute = await import("@/app/api/imladris/dashboards/[department]/route");
    const developmentResponse = await departmentRoute.GET(
      new NextRequest("http://localhost/api/imladris/dashboards/development"),
      { params: Promise.resolve({ department: "development" }) },
    );
    const developmentPayload = await developmentResponse.json();

    expect(developmentResponse.status).toBe(200);
    expect(developmentPayload.dashboard.sourceKeys).toEqual(["linear", "github", "posthog"]);
  });
});

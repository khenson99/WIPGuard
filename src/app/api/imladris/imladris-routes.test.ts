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
    financialGoal: {
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock("@/lib/imladris/company-readiness-setup", () => ({
  runCompanyReadinessSetup: vi.fn(async () => ({
    setup: {
      snapshotsUsed: [],
      metricsMaterialized: [],
      goalsCreated: [],
      unresolvedActions: [],
      unresolvedBlockers: [],
    },
    dashboard: {
      dashboard: { id: "company" },
      summary: {},
      goalProgress: [],
      goalRecommendations: [],
      healthBands: [],
      sourceCoverage: [],
      boardReadiness: {
        status: "ready",
        score: 100,
        blockers: [],
        caveats: [],
        requiredActions: [],
        requiredActionCount: 0,
      },
      metrics: [],
      trust: { summary: {}, warnings: [], caveats: [] },
    },
  })),
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

  it("serves the company tracker dashboard from canonical company metrics", async () => {
    const route = await import("@/app/api/imladris/dashboards/company/route");
    const response = await route.GET(
      new NextRequest("http://localhost/api/imladris/dashboards/company"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.product).toBe("Imladris");
    expect(payload).toEqual(
      expect.objectContaining({
        generatedAt: expect.any(String),
        dashboard: expect.any(Object),
        summary: expect.any(Object),
        goalProgress: expect.any(Array),
        healthBands: expect.any(Array),
        metrics: expect.any(Array),
        trust: expect.any(Object),
      }),
    );
    expect(payload.dashboard.id).toBe("company");
    expect(payload.summary).toBeTruthy();
    expect(payload.goalProgress).toEqual([]);
    expect(payload.trust.summary.missing).toBeGreaterThan(0);
  });

  it("rejects unauthenticated company tracker requests", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const route = await import("@/app/api/imladris/dashboards/company/route");
    const response = await route.GET(
      new NextRequest("http://localhost/api/imladris/dashboards/company"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("runs authenticated company readiness setup", async () => {
    const { runCompanyReadinessSetup } = await import("@/lib/imladris/company-readiness-setup");
    const route = await import("@/app/api/imladris/dashboards/company/readiness/setup/route");
    const response = await route.POST(
      new NextRequest("http://localhost/api/imladris/dashboards/company/readiness/setup"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(runCompanyReadinessSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          userId: "user_1",
          organizationId: "org_1",
        },
      }),
    );
    expect(payload.product).toBe("Imladris");
    expect(payload.setup).toEqual(
      expect.objectContaining({
        snapshotsUsed: [],
        goalsCreated: [],
      }),
    );
    expect(payload.boardReadiness.status).toBe("ready");
  });

  it("rejects unauthenticated company readiness setup requests", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const route = await import("@/app/api/imladris/dashboards/company/readiness/setup/route");
    const response = await route.POST(
      new NextRequest("http://localhost/api/imladris/dashboards/company/readiness/setup"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});

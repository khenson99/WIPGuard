import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { approveCeoReportRun, createMonthlyInvestorReportRun, loadCeoMetricSnapshot } from "@/lib/ceo/service";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsSnapshot: {
      findMany: vi.fn(),
    },
    ceoMetricDefinition: {
      upsert: vi.fn(),
    },
    ceoMetricValueSnapshot: {
      create: vi.fn(),
    },
    ceoMetricSourceLineage: {
      createMany: vi.fn(),
    },
    retentionTenantCurrent: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    ceoReportRun: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

function snapshot(providerKey: string, payload: unknown) {
  return {
    id: `${providerKey}-snapshot`,
    providerKey,
    status: AnalyticsSnapshotStatus.SUCCESS,
    capturedAt: new Date("2026-05-01T11:30:00.000Z"),
    expiresAt: new Date("2026-05-02T11:30:00.000Z"),
    lastError: null,
    payload,
  };
}

function errorSnapshot(providerKey: string, lastError = "Request timed out after 10000ms") {
  return {
    id: `${providerKey}-snapshot`,
    providerKey,
    status: AnalyticsSnapshotStatus.ERROR,
    capturedAt: new Date("2026-05-01T11:30:00.000Z"),
    expiresAt: new Date("2026-05-02T11:30:00.000Z"),
    lastError,
    payload: null,
  };
}

function reportRunRow(input?: {
  readiness?: { status: "board_ready" | "not_board_final"; ready: boolean; summary: string; failingGates: unknown[] };
  boardFinalOverrideReason?: string | null;
}) {
  const readiness =
    input?.readiness ?? {
      status: "board_ready" as const,
      ready: true,
      summary: "Board-ready",
      failingGates: [],
    };

  return {
    id: "run-1",
    packSlug: "investor-update",
    packName: "Investor Update",
    generatedAt: new Date("2026-05-01T12:00:00.000Z"),
    metricPayload: [],
    deterministicNotes: ["No material metric variances were detected."],
    markdown: "# Investor Update",
    csv: "Metric,Value",
    slideJson: {
      title: "Investor Update",
      generatedAt: "2026-05-01T12:00:00.000Z",
      readiness,
      sections: [],
      notes: [],
    },
    boardFinalAt: null,
    boardFinalApprovedById: null,
    boardFinalOverrideReason: input?.boardFinalOverrideReason ?? null,
  };
}

describe("loadCeoMetricSnapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    vi.mocked(prisma.ceoMetricDefinition.upsert).mockImplementation(((input: { where: { key: string } }) =>
      Promise.resolve({
        id: `definition-${input.where.key}`,
        key: input.where.key,
      })) as never);
    vi.mocked(prisma.retentionTenantCurrent.count).mockResolvedValue(4 as never);
    vi.mocked(prisma.retentionTenantCurrent.findFirst).mockResolvedValue({
      id: "retention-current-1",
      lastMaterializedAt: new Date("2026-05-01T11:30:00.000Z"),
      updatedAt: new Date("2026-05-01T11:30:00.000Z"),
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes every default-pack core metric through explicit calculators with lineage", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      snapshot("mercury", {
        cashFlow: {
          bankCash: 23456,
          treasuryCash: 100000,
          totalCash: 123456,
          totalBalance: 123456,
          netBurn: 10000,
          outflows30d: 160000,
          inflows30d: 70000,
          expenses: 160000,
          costOfGoodsSold: 2000,
        },
      }),
      snapshot("stripe", {
        revenue: { mrr: 20000, mrrChange: 1500 },
        subscriptions: {
          active: 1,
          activeCustomerRefs: [{ customerId: "cus_linked", email: "finance@example.com", emailDomain: "example.com" }],
        },
      }),
      snapshot("hubspot", {
        repScoreboard: [{ totalPipeline: 90000 }, { totalPipeline: 10000 }],
        subscriptionDeals: [
          {
            dealId: "hs-only",
            dealName: "HubSpot Only",
            stageLabel: "Subscriptions",
            amount: 5000,
            stripeCustomerId: null,
            primaryContactEmail: "ops@example-subscription.com",
          },
          {
            dealId: "hs-linked",
            dealName: "HubSpot Linked",
            stageLabel: "Subscriptions",
            amount: 3000,
            stripeCustomerId: "cus_linked",
            primaryContactEmail: "finance@example.com",
          },
        ],
        demoCount: 2,
        eligibleAccounts: 16,
        servicesRevenue: 18000,
        churnRate: 5,
        retentionRate: 95,
      }),
      snapshot("pylon", { openIssues: 7 }),
      snapshot("googleAnalytics", { sessions30d: 5432 }),
      snapshot("googleSearchConsole", { clicks: 120, impressions: 2400 }),
      snapshot("semrush", { organicTraffic: 1000 }),
      snapshot("webflow", { site: "connected", formSubmissions: 50, demoRequests: 3 }),
      snapshot("coda", { campaignPlan: "connected" }),
      snapshot("unify", { identifiedVisitors: 20 }),
      snapshot("googleAds", { totalSpend30d: 400 }),
      snapshot("metaAds", { totalSpend30d: 700 }),
      snapshot("redditAds", { totalSpend30d: 200 }),
      snapshot("googleWorkspace", { enabledRules: 4, demoMeetings: 1, customerMeetings30d: 5 }),
      snapshot("slack", { enabledRules: 4, customerMessages30d: 11 }),
      snapshot("linear", { completedIssues30d: 12 }),
      snapshot("github", { mergedPullRequests30d: 10 }),
      snapshot("posthog", { activatedAccounts30d: 8, activeAccounts30d: 20 }),
    ] as never);

    const payload = await loadCeoMetricSnapshot({
      userId: "user-1",
      organizationId: "org-1",
      persist: false,
    });

    const metricByKey = new Map(payload.metrics.map((metric) => [metric.definition.key, metric]));
    expect(metricByKey.get("ceo.flow_reliability_score")).toBeUndefined();
    expect(metricByKey.get("ceo.throughput_30d")).toBeUndefined();
    expect(metricByKey.get("ceo.overdue_open_tasks")).toBeUndefined();
    expect(metricByKey.get("development.delivery_health")?.value).toBe(100);
    expect(metricByKey.get("development.delivery_health")?.lineage.map((lineage) => lineage.sourceKey)).toEqual([
      "linear",
      "github",
      "posthog",
    ]);
    expect(metricByKey.get("finance.cash_balance")?.value).toBe(123456);
    expect(metricByKey.get("finance.cash_balance")?.details).toEqual([
      { key: "bankCash", label: "Bank cash", value: 23456, unit: "currency" },
      { key: "treasuryCash", label: "Treasury cash", value: 100000, unit: "currency" },
      { key: "totalCash", label: "Total cash", value: 123456, unit: "currency" },
    ]);
    expect(metricByKey.get("finance.cash_runway_months")?.value).toBe(12.35);
    expect(metricByKey.get("finance.net_burn")?.value).toBe(10000);
    expect(metricByKey.get("finance.expenses")?.value).toBe(160000);
    expect(metricByKey.get("finance.gross_margin")?.value).toBe(90);
    expect(metricByKey.get("revenue.mrr")?.value).toBe(20416.67);
    expect(metricByKey.get("revenue.mrr")?.delta).toBe(1500);
    expect(metricByKey.get("revenue.mrr")?.details).toEqual([
      { key: "stripeMrr", label: "Stripe MRR", value: 20000, unit: "currency" },
      { key: "hubspotOnlySubscriptionMrr", label: "HubSpot-only subscription MRR", value: 416.67, unit: "currency" },
      {
        key: "excludedLinkedHubspotSubscriptionMrr",
        label: "Linked HubSpot subscription MRR excluded",
        value: 250,
        unit: "currency",
      },
      { key: "totalMrr", label: "Total MRR", value: 20416.67, unit: "currency" },
    ]);
    expect(metricByKey.get("revenue.arr")?.value).toBe(245000);
    expect(metricByKey.get("revenue.subscription_revenue")?.value).toBe(245000);
    expect(metricByKey.get("revenue.services_revenue")?.value).toBe(18000);
    expect(metricByKey.get("revenue.active_subscriptions")?.value).toBe(2);
    expect(metricByKey.get("revenue.customer_count")?.value).toBe(2);
    expect(metricByKey.get("sales.qualified_pipeline")?.value).toBe(100000);
    expect(metricByKey.get("sales.demos")?.value).toBe(6);
    expect(metricByKey.get("marketing.website_traffic")?.value).toBe(6432);
    expect(metricByKey.get("marketing.conversion_rate")?.value).toBe(0.92);
    expect(metricByKey.get("marketing.pipeline_efficiency")?.value).toBe(76.92);
    expect(metricByKey.get("product.activation_rate")?.value).toBe(50);
    expect(metricByKey.get("customer_success.customer_health")?.value).toBe(25);
    expect(metricByKey.get("customer_success.customer_activity")?.value).toBe(43);
    expect(metricByKey.get("customer_success.churn_rate")?.value).toBe(5);
    expect(metricByKey.get("customer_success.retention_rate")?.value).toBe(95);
    expect(metricByKey.get("customer_success.retention_risk")?.value).toBe(4);
    expect(payload.readiness.status).toBe("board_ready");
    expect(payload.reportPacks.map((pack) => pack.slug)).toEqual([
      "weekly-exec",
      "board-meeting",
      "investor-update",
      "custom-metric-snapshot",
    ]);
  });

  it("keeps canonical marketing efficiency board-ready when optional Reddit Ads is errored", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      snapshot("mercury", {
        cashFlow: {
          bankCash: 23456,
          treasuryCash: 100000,
          totalCash: 123456,
          totalBalance: 123456,
          netBurn: 10000,
          outflows30d: 160000,
          inflows30d: 70000,
          expenses: 160000,
          costOfGoodsSold: 2000,
        },
      }),
      snapshot("stripe", {
        revenue: { mrr: 20000, mrrChange: 1500 },
        subscriptions: {
          active: 1,
          activeCustomerRefs: [{ customerId: "cus_linked", email: "finance@example.com", emailDomain: "example.com" }],
        },
      }),
      snapshot("hubspot", {
        repScoreboard: [{ totalPipeline: 90000 }, { totalPipeline: 10000 }],
        subscriptionDeals: [
          {
            dealId: "hs-only",
            dealName: "HubSpot Only",
            stageLabel: "Subscriptions",
            amount: 5000,
            stripeCustomerId: null,
            primaryContactEmail: "ops@example-subscription.com",
          },
        ],
        demoCount: 2,
        eligibleAccounts: 16,
        servicesRevenue: 18000,
        churnRate: 5,
        retentionRate: 95,
      }),
      snapshot("pylon", { openIssues: 7 }),
      snapshot("googleAnalytics", { sessions30d: 5432 }),
      snapshot("googleSearchConsole", { clicks: 120, impressions: 2400 }),
      snapshot("semrush", { organicTraffic: 1000 }),
      snapshot("webflow", { site: "connected", formSubmissions: 50, demoRequests: 3 }),
      snapshot("coda", { campaignPlan: "connected" }),
      snapshot("unify", { identifiedVisitors: 20 }),
      snapshot("googleAds", { totalSpend30d: 400 }),
      snapshot("metaAds", { totalSpend30d: 700 }),
      errorSnapshot("redditAds"),
      snapshot("googleWorkspace", { enabledRules: 4, demoMeetings: 1, customerMeetings30d: 5 }),
      snapshot("slack", { enabledRules: 4, customerMessages30d: 11 }),
      snapshot("linear", { completedIssues30d: 12 }),
      snapshot("github", { mergedPullRequests30d: 10 }),
      snapshot("posthog", { activatedAccounts30d: 8, activeAccounts30d: 20 }),
    ] as never);

    const payload = await loadCeoMetricSnapshot({
      userId: "user-1",
      organizationId: "org-1",
      persist: false,
    });

    const metricByKey = new Map(payload.metrics.map((metric) => [metric.definition.key, metric]));
    const pipelineEfficiency = metricByKey.get("marketing.pipeline_efficiency");
    const socialHealth = metricByKey.get("domain.social-media.health");
    const firstFindManyCall = vi.mocked(prisma.analyticsSnapshot.findMany).mock.calls[0]?.[0] as
      | { where?: { providerKey?: { in?: string[] } } }
      | undefined;
    const requestedSources = firstFindManyCall?.where?.providerKey?.in;

    expect(requestedSources).toContain("redditAds");
    expect(pipelineEfficiency?.value).toBe(90.91);
    expect(pipelineEfficiency?.trust.status).toBe("fresh");
    expect(pipelineEfficiency?.trust.warnings.join(" ")).toContain("Optional source redditAds errored");
    expect(pipelineEfficiency?.lineage.map((lineage) => lineage.sourceKey)).toEqual([
      "googleAnalytics",
      "googleSearchConsole",
      "googleAds",
      "metaAds",
      "semrush",
      "coda",
      "webflow",
      "unify",
      "hubspot",
      "redditAds",
    ]);
    expect(socialHealth?.value).toBe(100);
    expect(socialHealth?.trust.status).toBe("fresh");
    expect(socialHealth?.trust.warnings.join(" ")).toContain("Optional source redditAds errored");
    expect(payload.readiness.status).toBe("board_ready");
  });

  it("normalizes aliased analytics snapshots before calculating CEO metrics", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      snapshot("google_analytics", { sessions30d: 5432 }),
      snapshot("webflow", { site: "connected" }),
    ] as never);

    const payload = await loadCeoMetricSnapshot({
      userId: "user-1",
      organizationId: "org-1",
      persist: false,
    });

    const firstFindManyCall = vi.mocked(prisma.analyticsSnapshot.findMany).mock.calls[0]?.[0] as
      | { where?: { providerKey?: { in?: string[] } } }
      | undefined;
    const requestedSources = firstFindManyCall?.where?.providerKey?.in ?? [];
    const metricByKey = new Map(payload.metrics.map((metric) => [metric.definition.key, metric]));
    const websiteTraffic = metricByKey.get("marketing.website_traffic");
    const websiteHealth = metricByKey.get("domain.website-traffic.health");

    expect(requestedSources).toContain("googleAnalytics");
    expect(requestedSources).toContain("google_analytics");
    expect(websiteTraffic?.value).toBe(5432);
    expect(websiteTraffic?.lineage.map((lineage) => lineage.sourceKey)).toContain("googleAnalytics");
    expect(websiteHealth?.trust.status).toBe("fresh");
  });

  it("ignores future-dated analytics snapshots before calculating CEO metrics", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      snapshot("googleAnalytics", { sessions30d: 5432 }),
      {
        ...snapshot("googleAnalytics", { sessions30d: 999999 }),
        id: "googleAnalytics-future-snapshot",
        capturedAt: new Date("2026-05-02T11:30:00.000Z"),
        expiresAt: new Date("2026-05-03T11:30:00.000Z"),
      },
    ] as never);

    const payload = await loadCeoMetricSnapshot({
      userId: "user-1",
      organizationId: "org-1",
      persist: false,
    });

    const firstFindManyCall = vi.mocked(prisma.analyticsSnapshot.findMany).mock.calls[0]?.[0] as
      | { where?: { capturedAt?: { lte?: Date } } }
      | undefined;
    const metricByKey = new Map(payload.metrics.map((metric) => [metric.definition.key, metric]));
    const websiteTraffic = metricByKey.get("marketing.website_traffic");

    expect(firstFindManyCall?.where?.capturedAt?.lte).toEqual(new Date("2026-05-01T12:00:00.000Z"));
    expect(websiteTraffic?.value).toBe(5432);
    expect(websiteTraffic?.lineage).toEqual([
      expect.objectContaining({
        sourceId: "googleAnalytics-snapshot",
        capturedAt: "2026-05-01T11:30:00.000Z",
      }),
    ]);
  });

  it("derives finance forecast health from Stripe and Mercury snapshots", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      snapshot("mercury", {
        cashFlow: {
          bankCash: 23456,
          treasuryCash: 100000,
          totalCash: 123456,
          totalBalance: 123456,
        },
      }),
      snapshot("stripe", {
        revenue: { mrr: 20000, mrrChange: 1500 },
        subscriptions: {
          active: 1,
          activeCustomerRefs: [{ customerId: "cus_linked", email: "finance@example.com", emailDomain: "example.com" }],
        },
      }),
      snapshot("hubspot", {
        repScoreboard: [{ totalPipeline: 90000 }, { totalPipeline: 10000 }],
        subscriptionDeals: [],
      }),
      snapshot("pylon", { openIssues: 7 }),
      snapshot("googleAnalytics", { sessions30d: 5432 }),
      snapshot("webflow", { site: "connected" }),
      snapshot("googleAds", { totalSpend30d: 400 }),
      snapshot("metaAds", { totalSpend30d: 700 }),
      snapshot("googleWorkspace", { enabledRules: 4 }),
      snapshot("slack", { enabledRules: 4 }),
      snapshot("linear", { completedIssues30d: 12 }),
      snapshot("github", { mergedPullRequests30d: 10 }),
      snapshot("posthog", { activatedAccounts30d: 8 }),
    ] as never);

    const payload = await loadCeoMetricSnapshot({
      userId: "user-1",
      organizationId: "org-1",
      persist: false,
    });

    const firstFindManyCall = vi.mocked(prisma.analyticsSnapshot.findMany).mock.calls[0]?.[0] as
      | { where?: { providerKey?: { in?: string[] } } }
      | undefined;
    const requestedSources = firstFindManyCall?.where?.providerKey?.in ?? [];
    const metricByKey = new Map(payload.metrics.map((metric) => [metric.definition.key, metric]));
    const forecastHealth = metricByKey.get("source.finance-forecast.health");

    expect(requestedSources).toContain("stripe");
    expect(requestedSources).toContain("mercury");
    expect(requestedSources).not.toContain("financeForecast");
    expect(forecastHealth?.trust.status).toBe("fresh");
    expect(forecastHealth?.lineage.map((lineage) => lineage.sourceKey)).toEqual(["stripe", "mercury"]);
    expect(forecastHealth?.value).toBe(100);
  });
});

describe("createMonthlyInvestorReportRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T09:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses the current month's investor update instead of creating duplicates", async () => {
    const existing = reportRunRow();
    vi.mocked(prisma.ceoReportRun.findFirst).mockResolvedValue(existing as never);

    const result = await createMonthlyInvestorReportRun({
      userId: "owner-1",
      organizationId: "org-1",
      now: new Date("2026-06-15T09:00:00.000Z"),
    });

    expect(result.created).toBe(false);
    expect(result.periodStart).toBe("2026-06-01T00:00:00.000Z");
    expect(result.periodEnd).toBe("2026-07-01T00:00:00.000Z");
    expect(result.run.id).toBe("run-1");
    expect(prisma.ceoReportRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          packSlug: "investor-update",
          generatedAt: {
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lt: new Date("2026-07-01T00:00:00.000Z"),
          },
          OR: [{ userId: "owner-1" }, { organizationId: "org-1" }],
        }),
        orderBy: { generatedAt: "desc" },
      }),
    );
    expect(prisma.ceoReportRun.create).not.toHaveBeenCalled();
  });
});

describe("approveCeoReportRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T13:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("approves a board-ready report without an override reason", async () => {
    const existing = reportRunRow();
    vi.mocked(prisma.ceoReportRun.findFirst).mockResolvedValue(existing as never);
    vi.mocked(prisma.ceoReportRun.update).mockResolvedValue({
      ...existing,
      boardFinalAt: new Date("2026-05-01T13:00:00.000Z"),
      boardFinalApprovedById: "admin-1",
      boardFinalOverrideReason: null,
    } as never);

    const result = await approveCeoReportRun({
      userId: "admin-1",
      organizationId: "org-1",
      runId: "run-1",
    });

    expect(prisma.ceoReportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: {
          boardFinalAt: new Date("2026-05-01T13:00:00.000Z"),
          boardFinalApprovedById: "admin-1",
          boardFinalOverrideReason: null,
        },
      }),
    );
    expect(result.boardFinal).toEqual({
      approvedAt: "2026-05-01T13:00:00.000Z",
      approvedById: "admin-1",
      overrideReason: null,
    });
  });

  it("rejects a non-board-ready report without an override reason", async () => {
    const existing = reportRunRow({
      readiness: {
        status: "not_board_final",
        ready: false,
        summary: "Not board-final: 1 readiness gate is failing.",
        failingGates: [
          {
            metricKey: "finance.cash_balance",
            label: "Cash Balance",
            reason: "Metric source trust is stale.",
          },
        ],
      },
    });
    vi.mocked(prisma.ceoReportRun.findFirst).mockResolvedValue(existing as never);

    await expect(
      approveCeoReportRun({
        userId: "admin-1",
        organizationId: "org-1",
        runId: "run-1",
      }),
    ).rejects.toThrow("Board-final approval requires board-ready report or override reason");

    expect(prisma.ceoReportRun.update).not.toHaveBeenCalled();
  });

  it("records an explicit override reason when approving a non-board-ready report", async () => {
    const existing = reportRunRow({
      readiness: {
        status: "not_board_final",
        ready: false,
        summary: "Not board-final: 1 readiness gate is failing.",
        failingGates: [
          {
            metricKey: "finance.cash_balance",
            label: "Cash Balance",
            reason: "Metric source trust is stale.",
          },
        ],
      },
    });
    vi.mocked(prisma.ceoReportRun.findFirst).mockResolvedValue(existing as never);
    vi.mocked(prisma.ceoReportRun.update).mockResolvedValue({
      ...existing,
      boardFinalAt: new Date("2026-05-01T13:00:00.000Z"),
      boardFinalApprovedById: "admin-1",
      boardFinalOverrideReason: "Reviewed stale finance source against bank export.",
    } as never);

    const result = await approveCeoReportRun({
      userId: "admin-1",
      organizationId: "org-1",
      runId: "run-1",
      overrideReason: " Reviewed stale finance source against bank export. ",
    });

    expect(prisma.ceoReportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          boardFinalAt: new Date("2026-05-01T13:00:00.000Z"),
          boardFinalApprovedById: "admin-1",
          boardFinalOverrideReason: "Reviewed stale finance source against bank export.",
        },
      }),
    );
    expect(result.boardFinal?.overrideReason).toBe("Reviewed stale finance source against bank export.");
  });
});

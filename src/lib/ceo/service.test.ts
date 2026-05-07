import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";
import { loadCeoMetricSnapshot } from "@/lib/ceo/service";
import { computeDecisionDashboard } from "@/lib/analytics/decision-dashboard";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/analytics/decision-dashboard", () => ({
  computeDecisionDashboard: vi.fn(),
}));

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

describe("loadCeoMetricSnapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.ceoMetricDefinition.upsert).mockImplementation(((input: { where: { key: string } }) =>
      Promise.resolve({
        id: `definition-${input.where.key}`,
        key: input.where.key,
      })) as never);
    vi.mocked(computeDecisionDashboard).mockResolvedValue({
      asOf: "2026-05-01T12:00:00.000Z",
      northStar: {
        flowReliabilityScore: 87,
        throughput30d: 12,
        throughputTrendPct: 25,
      },
      supportingMetrics: {
        overdueOpenTasks: 3,
      },
    } as never);
    vi.mocked(prisma.retentionTenantCurrent.count).mockResolvedValue(4 as never);
    vi.mocked(prisma.retentionTenantCurrent.findFirst).mockResolvedValue({
      id: "retention-current-1",
      lastMaterializedAt: new Date("2026-05-01T11:30:00.000Z"),
      updatedAt: new Date("2026-05-01T11:30:00.000Z"),
    } as never);
  });

  it("computes every default-pack core metric through explicit calculators with lineage", async () => {
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
      }),
      snapshot("pylon", { openIssues: 7 }),
      snapshot("googleAnalytics", { sessions30d: 5432 }),
      snapshot("webflow", { site: "connected" }),
      snapshot("googleAds", { totalSpend30d: 400 }),
      snapshot("metaAds", { totalSpend30d: 700 }),
      snapshot("redditAds", { totalSpend30d: 200 }),
      snapshot("googleWorkspace", { enabledRules: 4 }),
      snapshot("slack", { enabledRules: 4 }),
    ] as never);

    const payload = await loadCeoMetricSnapshot({
      userId: "user-1",
      organizationId: "org-1",
      persist: false,
    });

    const metricByKey = new Map(payload.metrics.map((metric) => [metric.definition.key, metric]));
    expect(metricByKey.get("ceo.flow_reliability_score")?.value).toBe(87);
    expect(metricByKey.get("ceo.flow_reliability_score")?.lineage[0]?.sourceKey).toBe("wipguard");
    expect(metricByKey.get("ceo.throughput_30d")?.value).toBe(12);
    expect(metricByKey.get("ceo.throughput_30d")?.delta).toBe(25);
    expect(metricByKey.get("ceo.overdue_open_tasks")?.value).toBe(3);
    expect(metricByKey.get("finance.cash_balance")?.value).toBe(123456);
    expect(metricByKey.get("finance.cash_balance")?.details).toEqual([
      { key: "bankCash", label: "Bank cash", value: 23456, unit: "currency" },
      { key: "treasuryCash", label: "Treasury cash", value: 100000, unit: "currency" },
      { key: "totalCash", label: "Total cash", value: 123456, unit: "currency" },
    ]);
    expect(metricByKey.get("finance.mrr")?.value).toBe(25000);
    expect(metricByKey.get("finance.mrr")?.delta).toBe(1500);
    expect(metricByKey.get("finance.mrr")?.details).toEqual([
      { key: "stripeMrr", label: "Stripe MRR", value: 20000, unit: "currency" },
      { key: "hubspotOnlySubscriptionMrr", label: "HubSpot-only subscription MRR", value: 5000, unit: "currency" },
      {
        key: "excludedLinkedHubspotSubscriptionMrr",
        label: "Linked HubSpot subscription MRR excluded",
        value: 3000,
        unit: "currency",
      },
      { key: "totalMrr", label: "Total MRR", value: 25000, unit: "currency" },
    ]);
    expect(metricByKey.get("sales.open_pipeline_value")?.value).toBe(100000);
    expect(metricByKey.get("retention.at_risk_accounts")?.value).toBe(4);
    expect(metricByKey.get("customer_success.support_load")?.value).toBe(7);
    expect(metricByKey.get("website.sessions")?.value).toBe(5432);
    expect(metricByKey.get("social.paid_spend")?.value).toBe(1300);
    expect(payload.readiness.status).toBe("board_ready");
    expect(payload.reportPacks.map((pack) => pack.slug)).toEqual([
      "weekly-exec",
      "board-meeting",
      "investor-update",
      "custom-metric-snapshot",
    ]);
  });

  it("keeps social metrics board-ready when optional Reddit Ads is errored", async () => {
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
      }),
      snapshot("pylon", { openIssues: 7 }),
      snapshot("googleAnalytics", { sessions30d: 5432 }),
      snapshot("webflow", { site: "connected" }),
      snapshot("googleAds", { totalSpend30d: 400 }),
      snapshot("metaAds", { totalSpend30d: 700 }),
      errorSnapshot("redditAds"),
      snapshot("googleWorkspace", { enabledRules: 4 }),
      snapshot("slack", { enabledRules: 4 }),
    ] as never);

    const payload = await loadCeoMetricSnapshot({
      userId: "user-1",
      organizationId: "org-1",
      persist: false,
    });

    const metricByKey = new Map(payload.metrics.map((metric) => [metric.definition.key, metric]));
    const paidSpend = metricByKey.get("social.paid_spend");
    const socialHealth = metricByKey.get("domain.social-media.health");
    const firstFindManyCall = vi.mocked(prisma.analyticsSnapshot.findMany).mock.calls[0]?.[0] as
      | { where?: { providerKey?: { in?: string[] } } }
      | undefined;
    const requestedSources = firstFindManyCall?.where?.providerKey?.in;

    expect(requestedSources).toContain("redditAds");
    expect(paidSpend?.value).toBe(1100);
    expect(paidSpend?.trust.status).toBe("fresh");
    expect(paidSpend?.trust.warnings.join(" ")).toContain("Optional source redditAds errored");
    expect(paidSpend?.lineage.map((lineage) => lineage.sourceKey)).toEqual([
      "googleAds",
      "metaAds",
      "redditAds",
    ]);
    expect(socialHealth?.value).toBe(100);
    expect(socialHealth?.trust.status).toBe("fresh");
    expect(socialHealth?.trust.warnings.join(" ")).toContain("Optional source redditAds errored");
    expect(payload.readiness.status).toBe("board_ready");
  });
});

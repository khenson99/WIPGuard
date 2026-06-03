import { describe, expect, it, vi } from "vitest";
import { buildCompanyTrackerDashboard } from "@/lib/imladris/company-tracker";
import type { CompanyTrackerPrisma } from "@/lib/imladris/company-tracker";

const CONTEXT = {
  userId: "user_1",
  organizationId: "org_1",
};

function metricRow(input: {
  id?: string;
  metricKey: string;
  value: Record<string, unknown>;
  status?: string;
  confidence?: number;
  warnings?: string[];
  periodEnd?: Date;
  userId?: string | null;
  organizationId?: string | null;
  lineage?: Array<Record<string, unknown>>;
}) {
  return {
    id: input.id ?? `metric_${input.metricKey.replaceAll(".", "_")}`,
    metricKey: input.metricKey,
    department: input.metricKey.startsWith("sales.") ? "sales" : "finance",
    unit: input.metricKey === "finance.cash_runway_months" ? "months" : "currency",
    value: input.value,
    periodStart: new Date("2026-05-01T00:00:00.000Z"),
    periodEnd: input.periodEnd ?? new Date("2026-05-31T23:59:59.999Z"),
    status: input.status ?? "READY",
    confidence: input.confidence ?? 0.92,
    warnings: input.warnings ?? [],
    calculationVersion: `${input.metricKey}-v1`,
    computedAt: new Date("2026-06-01T00:00:00.000Z"),
    userId: input.userId,
    organizationId: input.organizationId,
    lineage: input.lineage ?? [
      {
        sourceKey: "stripe",
        sourceType: "raw",
        sourceId: "sub_1",
        rawRecordId: "raw_1",
        capturedAt: new Date("2026-05-31T00:00:00.000Z"),
        metadata: {},
      },
    ],
  };
}

function prismaMock(options?: { canonicalRows?: unknown[]; goals?: unknown[]; snapshots?: unknown[] }) {
  return {
    imladrisCanonicalMetricValue: {
      findMany: vi.fn(async () => options?.canonicalRows ?? []),
    },
    financialGoal: {
      findMany: vi.fn(async () => options?.goals ?? []),
    },
    analyticsSnapshot: {
      findMany: vi.fn(async () => options?.snapshots ?? []),
    },
  };
}

describe("buildCompanyTrackerDashboard", () => {
  it("builds founder cockpit summary, goal progress, health bands, and trust from canonical metrics", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
        }),
        metricRow({
          id: "metric_revenue_mrr_previous",
          metricKey: "revenue.mrr",
          value: { amount: 25_000, arr: 300_000, currency: "USD" },
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
        }),
        metricRow({
          metricKey: "finance.cash_runway_months",
          value: {
            months: 8.5,
            cashBalance: 765_000,
            netBurn: 90_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            amount: 90_000,
            cashOutflow: 160_000,
            cashInflow: 70_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "sales.qualified_pipeline",
          value: {
            amount: 1_000_000,
            qualifiedDealCount: 7,
            collaborationCoverage: 0.84,
            currency: "USD",
          },
        }),
      ],
      goals: [
        {
          id: "goal_arr",
          metric: "ARR",
          targetValue: 500_000,
          deadline: new Date("2026-12-31T00:00:00.000Z"),
          status: "ACTIVE",
        },
        {
          id: "goal_burn",
          metric: "BURN_RATE",
          targetValue: 80_000,
          deadline: new Date("2026-12-31T00:00:00.000Z"),
          status: "ACTIVE",
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      runwayMonths: 8.5,
      cashBalance: 765_000,
      netBurn: 90_000,
      qualifiedPipeline: 1_000_000,
      activeSubscriptions: 42,
      currency: "USD",
    });
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_arr",
        metric: "ARR",
        currentValue: 384_000,
        progressPct: 76.8,
        status: "active",
      }),
      expect.objectContaining({
        id: "goal_burn",
        metric: "BURN_RATE",
        currentValue: 90_000,
        direction: "lower",
        progressPct: 88.89,
      }),
    ]);
    expect(dashboard.healthBands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "runway",
          status: "watch",
          formula: "finance.cash_runway_months.value.months",
        }),
        expect.objectContaining({
          id: "burn_multiple",
          value: 1.07,
          formula: "finance.net_burn.value.amount / net new ARR",
        }),
        expect.objectContaining({
          id: "pipeline_coverage",
          value: 2.6,
          formula: "sales.qualified_pipeline.value.amount / revenue.mrr.value.arr",
        }),
      ]),
    );
    expect(dashboard.trust.summary.ready).toBeGreaterThan(0);
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      status: "ready",
      sourceLineageCount: 1,
    });
  });

  it("does not fabricate missing canonical values and propagates stale or error trust", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "finance.net_burn",
          status: "STALE",
          warnings: ["Mercury source data is stale."],
          value: { amount: 125_000, currency: "USD" },
        }),
        metricRow({
          metricKey: "customer_success.retention_risk",
          status: "ERROR",
          warnings: ["Pylon source failed during materialization."],
          value: { riskScore: 92 },
        }),
      ],
      goals: [
        {
          id: "goal_arr",
          metric: "ARR",
          targetValue: 500_000,
          deadline: new Date("2026-01-01T00:00:00.000Z"),
          status: "ACTIVE",
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary.arr).toBeNull();
    expect(dashboard.summary.mrr).toBeNull();
    expect(dashboard.goalProgress[0]).toMatchObject({
      id: "goal_arr",
      currentValue: null,
      progressPct: 0,
      status: "missed",
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      status: "missing",
      value: null,
      warnings: ["Canonical company metric is missing."],
    });
    expect(dashboard.trust.summary.stale).toBe(1);
    expect(dashboard.trust.summary.error).toBe(1);
    expect(dashboard.trust.warnings).toContain("Mercury source data is stale.");
    expect(dashboard.trust.warnings).toContain("Pylon source failed during materialization.");
  });

  it("uses the live analytics metrics layer when canonical company rows are not materialized yet", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "stripe",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            revenue: {
              mrr: 32_000,
              mrrChange: 0,
              totalRevenue30d: 37_000,
              totalRevenuePrev30d: 34_000,
              revenueGrowth: 0.08,
              avgRevenuePerCustomer: 800,
            },
            subscriptions: {
              active: 42,
              pastDue: 0,
              canceled: 0,
              trialing: 0,
              churnRate: 0.02,
              recentChurnEvents: [],
            },
            payments: {
              succeeded: 20,
              failed: 1,
              successRate: 0.95,
            },
            revenueTrend: [],
          },
        },
        {
          providerKey: "mercury",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            accounts: [],
            cashFlow: {
              totalBalance: 765_000,
              inflows30d: 70_000,
              outflows30d: 160_000,
              netCashFlow: -90_000,
              burnRate: 90_000,
              runway: 8.5,
            },
          },
        },
        {
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            funnel: {
              totalDeals: 1,
              closedWon: 0,
              closedLost: 0,
              unlikely: 0,
              churn: 0,
              activeSubscriptions: 42,
              noShows: 0,
              demoScheduled: 1,
              demoFollowUp: 0,
              avgDealSize: 1_000_000,
              winRate: 0,
              effectiveWinRate: 0,
              noShowRate: 0,
              stages: [],
              dealsBySource: [],
            },
            contacts: {
              totalContacts: 0,
              recentContacts: 0,
              bySource: [],
            },
            deals: [
              {
                dealId: "deal_1",
                dealName: "Expansion",
                stageId: "presentationscheduled",
                stageLabel: "Demo Scheduled",
                amount: 1_000_000,
                source: "Outbound",
                ownerId: "owner_1",
                updatedAt: "2026-05-30T00:00:00.000Z",
                createdAt: "2026-05-01T00:00:00.000Z",
                closedAt: null,
                stripeCustomerId: null,
                pipelineId: "default",
                contactIds: [],
                primaryContactId: null,
                primaryContactEmail: null,
              },
            ],
          },
        },
      ],
      goals: [
        {
          id: "goal_arr",
          userId: "user_1",
          metric: "ARR",
          targetValue: 500_000,
          deadline: new Date("2026-12-31T00:00:00.000Z"),
          status: "ACTIVE",
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      runwayMonths: 8.5,
      cashBalance: 765_000,
      netBurn: 90_000,
      qualifiedPipeline: 1_000_000,
      activeSubscriptions: 42,
      currency: "USD",
    });
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_arr",
        currentValue: 384_000,
        progressPct: 76.8,
      }),
    ]);
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        amount: 32_000,
        arr: 384_000,
        source: "analytics.metrics_layer",
      }),
      sourceLineageCount: 3,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "sales.qualified_pipeline")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        amount: 1_000_000,
        source: "analytics.revenue_dashboard",
      }),
    });
    expect(dashboard.trust.warnings).not.toContain(
      "Canonical revenue.mrr is missing; using latest analytics snapshot stats.",
    );
    expect(dashboard.trust.caveats).toContain(
      "Canonical revenue.mrr is missing; using latest analytics snapshot stats.",
    );
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { userId: "user_1" },
            { user: { organizationId: "org_1" } },
          ]),
          providerKey: {
            in: expect.arrayContaining(["stripe", "mercury", "hubspot", "salesPerformance"]),
          },
        }),
      }),
    );
  });

  it("queries organization-owned analytics snapshots when the current user has no direct snapshot rows", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          userId: "teammate_1",
          providerKey: "stripe",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            revenue: {
              mrr: 32_000,
              mrrChange: 0,
              totalRevenue30d: 37_000,
              totalRevenuePrev30d: 34_000,
              revenueGrowth: 0.08,
              avgRevenuePerCustomer: 800,
            },
            subscriptions: {
              active: 42,
              pastDue: 0,
              canceled: 0,
              trialing: 0,
              churnRate: 0.02,
              recentChurnEvents: [],
            },
            payments: {
              succeeded: 20,
              failed: 1,
              successRate: 0.95,
            },
            revenueTrend: [],
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { userId: "user_1" },
            { user: { organizationId: "org_1" } },
          ]),
        }),
      }),
    );
  });

  it("surfaces errored analytics snapshots without using failed payloads as metric values", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "pylon",
          status: "ERROR",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: "Pylon API token is invalid.",
          payload: null,
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "customer_success.retention_risk")).toMatchObject({
      status: "missing",
      value: null,
    });
    expect(dashboard.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pylon",
          status: "error",
          detail: "Latest analytics snapshot reported an error.",
        }),
      ]),
    );
    expect(dashboard.trust.warnings).toContain("pylon: Pylon API token is invalid.");
  });

  it("connects marketing, activation, and retention metrics to available analytics snapshots", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            funnel: {
              totalDeals: 4,
              closedWon: 0,
              closedLost: 0,
              unlikely: 0,
              churn: 0,
              activeSubscriptions: 4,
              noShows: 0,
              demoScheduled: 1,
              demoFollowUp: 0,
              avgDealSize: 250_000,
              winRate: 0,
              effectiveWinRate: 0,
              noShowRate: 0,
              stages: [],
              dealsBySource: [],
            },
            contacts: {
              totalContacts: 0,
              recentContacts: 0,
              bySource: [],
            },
            deals: [
              {
                dealId: "deal_1",
                dealName: "Expansion",
                stageId: "presentationscheduled",
                stageLabel: "Demo Scheduled",
                amount: 250_000,
                source: "Google Ads",
                ownerId: "owner_1",
                updatedAt: "2026-05-30T00:00:00.000Z",
                createdAt: "2026-05-01T00:00:00.000Z",
                closedAt: null,
                stripeCustomerId: null,
                pipelineId: "default",
                contactIds: [],
                primaryContactId: null,
                primaryContactEmail: null,
              },
            ],
          },
        },
        {
          providerKey: "googleAds",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            totalSpend30d: 20_000,
            totalImpressions: 250_000,
            totalClicks: 1_000,
            totalConversions: 50,
            ctr: 0.004,
            cpc: 20,
            cpa: 400,
            roas: 0,
            campaigns: [],
          },
        },
        {
          providerKey: "metaAds",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            totalSpend30d: 5_000,
            totalImpressions: 80_000,
            totalClicks: 500,
            totalConversions: 20,
            ctr: 0.00625,
            cpc: 10,
            cpa: 250,
            campaigns: [],
          },
        },
        {
          providerKey: "posthog",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            events: [
              { event: "activation_completed", distinct_id: "account_1" },
              { event: "pageview", distinct_id: "account_2" },
            ],
            eventCount: 2,
          },
        },
        {
          providerKey: "pylon",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            openConversations: 3,
            urgentConversations: 1,
            waitingOnTeam: 1,
            resolvedInRange: 8,
            avgFirstResponseMinutes: 45,
            csat: 0.82,
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "marketing.pipeline_efficiency")).toMatchObject({
      status: "partial",
      warnings: [],
      value: expect.objectContaining({
        ratio: 10,
        qualifiedPipeline: 250_000,
        acquisitionSpend: 25_000,
        paidSourceCount: 2,
        source: "analytics.snapshot_pipeline_efficiency",
      }),
    });
    expect(dashboard.metrics.find((metric) => metric.key === "product.activation_rate")).toMatchObject({
      status: "partial",
      warnings: [],
      value: expect.objectContaining({
        rate: 25,
        activatedAccounts: 1,
        eligibleAccounts: 4,
        source: "analytics.snapshot_activation",
      }),
    });
    expect(dashboard.metrics.find((metric) => metric.key === "customer_success.retention_risk")).toMatchObject({
      status: "partial",
      warnings: [],
      value: expect.objectContaining({
        score: 36.6,
        openConversations: 3,
        urgentConversations: 1,
        waitingOnTeam: 1,
        source: "analytics.snapshot_retention_risk",
      }),
    });
    expect(dashboard.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "googleAds", status: "available" }),
        expect.objectContaining({ key: "metaAds", status: "available" }),
        expect.objectContaining({ key: "posthog", status: "available" }),
        expect.objectContaining({ key: "pylon", status: "available" }),
      ]),
    );
    expect(dashboard.trust.warnings).not.toContain(
      "Canonical marketing.pipeline_efficiency is missing; using latest analytics snapshot stats.",
    );
    expect(dashboard.trust.caveats).toEqual(
      expect.arrayContaining([
        "Canonical marketing.pipeline_efficiency is missing; using latest analytics snapshot stats.",
        "Canonical product.activation_rate is missing; using latest analytics snapshot stats.",
        "Canonical customer_success.retention_risk is missing; using latest analytics snapshot stats.",
      ]),
    );
  });

  it("returns board readiness, source coverage, and draft targets when goals are not configured", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "stripe",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            revenue: {
              mrr: 32_000,
              mrrChange: 0.12,
              totalRevenue30d: 37_000,
              totalRevenuePrev30d: 34_000,
              revenueGrowth: 0.08,
              avgRevenuePerCustomer: 800,
            },
            subscriptions: {
              active: 42,
              pastDue: 0,
              canceled: 0,
              trialing: 0,
              churnRate: 0.02,
              recentChurnEvents: [],
            },
            payments: {
              succeeded: 20,
              failed: 1,
              successRate: 0.95,
            },
            revenueTrend: [],
          },
        },
        {
          providerKey: "mercury",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            accounts: [],
            cashFlow: {
              totalBalance: 765_000,
              inflows30d: 70_000,
              outflows30d: 160_000,
              netCashFlow: -90_000,
              burnRate: 90_000,
              runway: 8.5,
            },
          },
        },
        {
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            funnel: {
              totalDeals: 1,
              closedWon: 0,
              closedLost: 0,
              unlikely: 0,
              churn: 0,
              activeSubscriptions: 42,
              noShows: 0,
              demoScheduled: 1,
              demoFollowUp: 0,
              avgDealSize: 1_000_000,
              winRate: 0,
              effectiveWinRate: 0,
              noShowRate: 0,
              stages: [],
              dealsBySource: [],
            },
            contacts: {
              totalContacts: 0,
              recentContacts: 0,
              bySource: [],
            },
            deals: [
              {
                dealId: "deal_1",
                dealName: "Expansion",
                stageId: "presentationscheduled",
                stageLabel: "Demo Scheduled",
                amount: 1_000_000,
                source: "Outbound",
                ownerId: "owner_1",
                updatedAt: "2026-05-30T00:00:00.000Z",
                createdAt: "2026-05-01T00:00:00.000Z",
                closedAt: null,
                stripeCustomerId: null,
                pipelineId: "default",
                contactIds: [],
                primaryContactId: null,
                primaryContactEmail: null,
              },
            ],
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.goalProgress).toEqual([]);
    expect(dashboard.goalRecommendations).toEqual([
      expect.objectContaining({
        metric: "ARR",
        targetValue: 500_000,
        currentValue: 384_000,
        sourceMetricKey: "revenue.mrr",
      }),
      expect.objectContaining({
        metric: "RUNWAY",
        targetValue: 18,
        currentValue: 8.5,
        sourceMetricKey: "finance.cash_runway_months",
      }),
      expect.objectContaining({
        metric: "BURN_RATE",
        targetValue: 42_500,
        currentValue: 90_000,
        direction: "lower",
        sourceMetricKey: "finance.net_burn",
      }),
    ]);
    expect(dashboard.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "stripe", status: "available" }),
        expect.objectContaining({ key: "hubspot", status: "available" }),
        expect.objectContaining({ key: "mercury", status: "available" }),
        expect.objectContaining({ key: "posthog", status: "missing" }),
        expect.objectContaining({ key: "pylon", status: "missing" }),
      ]),
    );
    expect(dashboard.boardReadiness).toMatchObject({
      status: "watch",
      requiredActionCount: 3,
      blockers: [],
    });
    expect(dashboard.boardReadiness.caveats).toContain(
      "Using analytics snapshots for revenue.mrr until canonical materialization catches up.",
    );
  });

  it("keeps revenue missing when analytics snapshots do not include revenue providers", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "mercury",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            accounts: [],
            cashFlow: {
              totalBalance: 765_000,
              inflows30d: 70_000,
              outflows30d: 160_000,
              netCashFlow: -90_000,
              burnRate: 90_000,
              runway: 8.5,
            },
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: null,
      mrr: null,
      runwayMonths: 8.5,
      cashBalance: 765_000,
      netBurn: 90_000,
      qualifiedPipeline: null,
      activeSubscriptions: null,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      status: "missing",
      value: null,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "finance.cash_runway_months")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        months: 8.5,
        source: "analytics.metrics_layer",
      }),
    });
  });

  it("defensively ignores future-period canonical rows when building current company state", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_future",
          metricKey: "revenue.mrr",
          value: {
            amount: 99_000,
            arr: 1_188_000,
            activeSubscriptions: 99,
            currency: "USD",
          },
          periodEnd: new Date("2026-06-30T23:59:59.999Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_current",
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
        }),
      ],
    });
    const now = new Date("2026-06-01T00:00:00.000Z");

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now,
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      periodEnd: "2026-05-31T23:59:59.999Z",
    });
    expect(prisma.imladrisCanonicalMetricValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodEnd: { lte: now },
        }),
      }),
    );
  });

  it("defensively ignores inactive or wrong-user goals returned by the data layer", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
        }),
      ],
      goals: [
        {
          id: "goal_inactive_arr",
          userId: "user_1",
          metric: "ARR",
          targetValue: 100_000,
          deadline: new Date("2026-12-31T00:00:00.000Z"),
          status: "ACHIEVED",
        },
        {
          id: "goal_wrong_user_arr",
          userId: "other_user",
          metric: "ARR",
          targetValue: 200_000,
          deadline: new Date("2026-12-31T00:00:00.000Z"),
          status: "ACTIVE",
        },
        {
          id: "goal_active_arr",
          userId: "user_1",
          metric: "ARR",
          targetValue: 500_000,
          deadline: new Date("2026-12-31T00:00:00.000Z"),
          status: "ACTIVE",
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_active_arr",
        metric: "ARR",
        progressPct: 76.8,
        status: "active",
      }),
    ]);
    expect(dashboard.healthBands.find((band) => band.id === "arr_goal_pacing")).toMatchObject({
      value: 76.8,
      status: "watch",
    });
    expect(prisma.financialGoal.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        status: "ACTIVE",
      },
      orderBy: [{ deadline: "asc" }],
    });
  });

  it("defensively ignores wrong-scope canonical rows returned by the data layer", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_wrong_org",
          metricKey: "revenue.mrr",
          userId: "user_1",
          organizationId: "other_org",
          value: {
            amount: 99_000,
            arr: 1_188_000,
            activeSubscriptions: 99,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_wrong_user",
          metricKey: "revenue.mrr",
          userId: "other_user",
          organizationId: "org_1",
          value: {
            amount: 88_000,
            arr: 1_056_000,
            activeSubscriptions: 88,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_current_scope",
          metricKey: "revenue.mrr",
          userId: "user_1",
          organizationId: "org_1",
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      value: {
        amount: 32_000,
        arr: 384_000,
        activeSubscriptions: 42,
        currency: "USD",
      },
    });
    expect(prisma.imladrisCanonicalMetricValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: "org_1" },
            { userId: null, organizationId: "org_1" },
          ],
        }),
      }),
    );
  });

  it("queries organization-level canonical rows so shared company metrics are visible", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_org",
          metricKey: "revenue.mrr",
          userId: null,
          organizationId: "org_1",
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(prisma.imladrisCanonicalMetricValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { userId: "user_1", organizationId: "org_1" },
            { userId: null, organizationId: "org_1" },
          ],
        }),
      }),
    );
  });

  it("treats negative burn as full progress for lower-is-better goals", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            amount: -10_000,
            cashOutflow: 40_000,
            cashInflow: 50_000,
            currency: "USD",
          },
        }),
      ],
      goals: [
        {
          id: "goal_burn_profitable",
          userId: "user_1",
          metric: "BURN_RATE",
          targetValue: 80_000,
          deadline: new Date("2026-12-31T00:00:00.000Z"),
          status: "ACTIVE",
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_burn_profitable",
        metric: "BURN_RATE",
        currentValue: -10_000,
        direction: "lower",
        progressPct: 100,
        status: "achieved",
      }),
    ]);
  });
});

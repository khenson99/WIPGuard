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
  computedAt?: Date;
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
    computedAt: input.computedAt ?? new Date("2026-06-01T00:00:00.000Z"),
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

function prismaMock(options?: { canonicalRows?: unknown[]; goals?: unknown[] }) {
  return {
    imladrisCanonicalMetricValue: {
      findMany: vi.fn(async () => options?.canonicalRows ?? []),
    },
    financialGoal: {
      findMany: vi.fn(async () => options?.goals ?? []),
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

  it("ignores future-computed canonical rows when building the founder cockpit summary", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "future_revenue_mrr",
          metricKey: "revenue.mrr",
          value: {
            amount: 99_999,
            arr: 1_199_988,
            activeSubscriptions: 999,
            currency: "USD",
          },
          computedAt: new Date("2026-06-02T00:00:00.000Z"),
        }),
        metricRow({
          id: "current_revenue_mrr",
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
          computedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      computedAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("normalizes Unix timestamp canonical metric metadata before founder cockpit selection", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        {
          ...metricRow({
            id: "serialized_revenue_mrr",
            metricKey: "revenue.mrr",
            value: {
              amount: 32_000,
              arr: 384_000,
              activeSubscriptions: 42,
              currency: "USD",
            },
          }),
          periodEnd: "1780271999999",
          computedAt: "1780272000",
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      computedAt: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-05-31T23:59:59.999Z",
    });
  });

  it("normalizes decimal Unix timestamp canonical metric metadata before founder cockpit selection", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        {
          ...metricRow({
            id: "serialized_decimal_revenue_mrr",
            metricKey: "revenue.mrr",
            value: {
              amount: 32_000,
              arr: 384_000,
              activeSubscriptions: 42,
              currency: "USD",
            },
          }),
          periodEnd: "1780271999.999",
          computedAt: "1780272000.5",
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      computedAt: "2026-06-01T00:00:00.500Z",
      periodEnd: "2026-05-31T23:59:59.999Z",
    });
  });

  it("parses formatted accounting numbers before summary and goal calculations", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: "$32,000",
            arr: "$384,000",
            activeSubscriptions: "42",
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            amount: "($10,000)",
            currency: "USD",
          },
        }),
      ],
      goals: [
        {
          id: "goal_burn_profitable",
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
      netBurn: -10_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_burn_profitable",
        currentValue: -10_000,
        progressPct: 100,
        status: "achieved",
      }),
    ]);
  });

  it("uses the first nonblank trimmed currency code in the company summary", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: " ",
          },
        }),
        metricRow({
          metricKey: "finance.cash_runway_months",
          value: {
            months: 8.5,
            cashBalance: 765_000,
            currency: " eur ",
          },
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      mrr: 32_000,
      cashBalance: 765_000,
      currency: "EUR",
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

  it("normalizes canonical metric statuses before building company trust", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "finance.net_burn",
          status: " stale ",
          warnings: ["Mercury sync is outside the freshness SLA."],
          value: { amount: 125_000, currency: "USD" },
        }),
        metricRow({
          metricKey: "customer_success.retention_risk",
          status: " error ",
          warnings: ["Pylon materialization failed."],
          value: { riskScore: 92 },
        }),
        metricRow({
          metricKey: "product.activation_rate",
          status: " partial ",
          warnings: ["PostHog activation coverage is partial."],
          value: { rate: 42 },
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      status: "stale",
    });
    expect(dashboard.metrics.find((metric) => metric.key === "customer_success.retention_risk")).toMatchObject({
      status: "error",
    });
    expect(dashboard.metrics.find((metric) => metric.key === "product.activation_rate")).toMatchObject({
      status: "partial",
    });
    expect(dashboard.trust.summary).toMatchObject({
      stale: 1,
      error: 1,
      partial: 1,
    });
  });

  it("treats malformed canonical metric statuses as missing before building company trust", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "finance.net_burn",
          status: 42 as never,
          value: { amount: 125_000, currency: "USD" },
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      status: "missing",
    });
    expect(dashboard.summary.netBurn).toBeNull();
    expect(dashboard.trust.summary.missing).toBeGreaterThan(0);
  });

  it("normalizes canonical metric confidence before building company tracker metrics", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          confidence: 1.42,
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "finance.net_burn",
          confidence: Number.NaN,
          value: {
            amount: 90_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "sales.qualified_pipeline",
          confidence: -0.2,
          value: {
            amount: 1_000_000,
            currency: "USD",
          },
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      confidence: 1,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      confidence: 0,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "sales.qualified_pipeline")).toMatchObject({
      confidence: 0,
    });
  });

  it("normalizes canonical metric warnings before building company tracker trust", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "finance.net_burn",
          warnings: "Mercury sync is stale." as never,
          value: {
            amount: 90_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "sales.qualified_pipeline",
          warnings: [" HubSpot coverage is partial. ", "", 42, null, "Slack context is missing."] as never,
          value: {
            amount: 1_000_000,
            currency: "USD",
          },
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      warnings: ["Mercury sync is stale."],
    });
    expect(dashboard.metrics.find((metric) => metric.key === "sales.qualified_pipeline")).toMatchObject({
      warnings: ["HubSpot coverage is partial.", "Slack context is missing."],
    });
    expect(dashboard.trust.summary.warnings).toBe(8);
    expect(dashboard.trust.warnings).toContain("Mercury sync is stale.");
    expect(dashboard.trust.warnings).toContain("HubSpot coverage is partial.");
    expect(dashboard.trust.warnings).toContain("Slack context is missing.");
    expect(dashboard.trust.warnings).not.toContain("");
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

  it("defensively ignores active goals with malformed deadlines before calculating pacing", async () => {
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
          id: "goal_bad_deadline_arr",
          userId: "user_1",
          metric: "ARR",
          targetValue: 100_000,
          deadline: "not-a-date",
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
        deadline: "2026-12-31T00:00:00.000Z",
        status: "active",
      }),
    ]);
    expect(dashboard.healthBands.find((band) => band.id === "arr_goal_pacing")).toMatchObject({
      value: 76.8,
      status: "watch",
    });
  });

  it("parses formatted goal targets before calculating pacing", async () => {
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
          id: "goal_arr_formatted_target",
          userId: "user_1",
          metric: "ARR",
          targetValue: "$500,000",
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
        id: "goal_arr_formatted_target",
        targetValue: 500_000,
        currentValue: 384_000,
        progressPct: 76.8,
        status: "active",
      }),
    ]);
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
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
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
            { userId: "user_1", organizationId: null },
            { userId: null, organizationId: null },
          ],
        }),
      }),
    );
  });

  it("normalizes blank dashboard context before querying metrics and goals", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_user_scope",
          metricKey: "revenue.mrr",
          userId: "user_1",
          organizationId: null,
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
        }),
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
      context: {
        userId: " user_1 ",
        organizationId: "   ",
      },
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_arr",
        progressPct: 76.8,
      }),
    ]);
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
    expect(prisma.financialGoal.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        status: "ACTIVE",
      },
      orderBy: [{ deadline: "asc" }],
    });
  });

  it("prefers user-scoped canonical rows over organization fallbacks for the same metric period", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_org_fallback",
          metricKey: "revenue.mrr",
          userId: null,
          organizationId: "org_1",
          value: {
            amount: 99_000,
            arr: 1_188_000,
            activeSubscriptions: 99,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
          computedAt: new Date("2026-06-02T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_user",
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
          computedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-03T00:00:00.000Z"),
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
      computedAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("uses legacy user-only canonical rows under organization context", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_org_fallback",
          metricKey: "revenue.mrr",
          userId: null,
          organizationId: "org_1",
          value: {
            amount: 99_000,
            arr: 1_188_000,
            activeSubscriptions: 99,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
          computedAt: new Date("2026-06-02T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_legacy_user",
          metricKey: "revenue.mrr",
          userId: "user_1",
          organizationId: null,
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
          computedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
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
    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      calculationVersion: "revenue.mrr-v1",
      computedAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("uses global canonical rows under organization context when scoped company metrics are missing", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_global",
          metricKey: "revenue.mrr",
          userId: null,
          organizationId: null,
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42,
            currency: "USD",
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
          computedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-03T00:00:00.000Z"),
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
      status: "ready",
    });
  });

  it("uses the latest computed prior-period metric revision for burn multiple", async () => {
    const prisma = prismaMock({
      canonicalRows: [
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
          computedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_previous_old",
          metricKey: "revenue.mrr",
          value: { amount: 8_333.33, arr: 100_000, currency: "USD" },
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
          computedAt: new Date("2026-05-01T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_previous_revised",
          metricKey: "revenue.mrr",
          value: { amount: 25_000, arr: 300_000, currency: "USD" },
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
          computedAt: new Date("2026-05-02T00:00:00.000Z"),
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
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.healthBands.find((band) => band.id === "burn_multiple")).toMatchObject({
      value: 1.07,
      status: "watch",
    });
  });

  it("prefers tenant-specific prior revenue over newer organization fallbacks for burn multiple", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_current",
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
          computedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_previous_exact",
          metricKey: "revenue.mrr",
          userId: "user_1",
          organizationId: "org_1",
          value: { amount: 25_000, arr: 300_000, currency: "USD" },
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
          computedAt: new Date("2026-05-01T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_newer_org_fallback",
          metricKey: "revenue.mrr",
          userId: null,
          organizationId: "org_1",
          value: { amount: 30_000, arr: 360_000, currency: "USD" },
          periodEnd: new Date("2026-05-15T00:00:00.000Z"),
          computedAt: new Date("2026-05-16T00:00:00.000Z"),
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
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.healthBands.find((band) => band.id === "burn_multiple")).toMatchObject({
      value: 1.07,
      status: "watch",
    });
  });

  it("ignores unusable prior-period metric revisions when calculating burn multiple", async () => {
    const prisma = prismaMock({
      canonicalRows: [
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
          computedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_previous_ready",
          metricKey: "revenue.mrr",
          value: { amount: 25_000, arr: 300_000, currency: "USD" },
          status: "READY",
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
          computedAt: new Date("2026-05-01T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_previous_error",
          metricKey: "revenue.mrr",
          value: { amount: 30_000, arr: 360_000, currency: "USD" },
          status: "ERROR",
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
          computedAt: new Date("2026-05-02T00:00:00.000Z"),
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
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.healthBands.find((band) => band.id === "burn_multiple")).toMatchObject({
      value: 1.07,
      status: "watch",
    });
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

  it("treats zero burn against a break-even target as full lower-is-better progress", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            amount: 0,
            cashOutflow: 50_000,
            cashInflow: 50_000,
            currency: "USD",
          },
        }),
      ],
      goals: [
        {
          id: "goal_burn_break_even",
          userId: "user_1",
          metric: "BURN_RATE",
          targetValue: 0,
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
        id: "goal_burn_break_even",
        metric: "BURN_RATE",
        currentValue: 0,
        targetValue: 0,
        direction: "lower",
        progressPct: 100,
        status: "achieved",
      }),
    ]);
  });
});

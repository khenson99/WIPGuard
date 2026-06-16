import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import { runCompanyReadinessSetup } from "@/lib/imladris/company-readiness-setup";
import { ingestImladrisRawRecords } from "@/lib/imladris/ingestion";
import { materializeImladrisCanonicalMetrics } from "@/lib/imladris/materialization";
import { buildCompanyTrackerDashboard } from "@/lib/imladris/company-tracker";

vi.mock("@/lib/imladris/ingestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imladris/ingestion")>();
  return {
    ...actual,
    ingestImladrisRawRecords: vi.fn(),
  };
});

vi.mock("@/lib/imladris/materialization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imladris/materialization")>();
  return {
    ...actual,
    materializeImladrisCanonicalMetrics: vi.fn(),
  };
});

vi.mock("@/lib/imladris/company-tracker", () => ({
  buildCompanyTrackerDashboard: vi.fn(),
}));

const CONTEXT = {
  userId: "user_1",
  organizationId: "org_1",
};

function dashboardWithRecommendations(recommendations: Array<{ metric: string; targetValue: number | null }>) {
  return {
    dashboard: {
      id: "company",
      label: "Company Tracker",
      sourceKeys: ["stripe", "hubspot", "mercury"],
      metricKeys: ["revenue.mrr", "finance.cash_runway_months", "finance.net_burn"],
    },
    summary: {
      arr: 384_000,
      mrr: 32_000,
      runwayMonths: 8.5,
      cashBalance: 765_000,
      netBurn: 90_000,
      qualifiedPipeline: 1_000_000,
      activeSubscriptions: 42,
      currency: "USD",
    },
    goalProgress: [],
    goalRecommendations: recommendations.map((recommendation) => ({
      metric: recommendation.metric,
      targetValue: recommendation.targetValue,
      currentValue: recommendation.metric === "RUNWAY" ? 8.5 : 384_000,
      direction: recommendation.metric === "BURN_RATE" ? "lower" : "higher",
      deadline: "2027-06-01T12:00:00.000Z",
      sourceMetricKey:
        recommendation.metric === "RUNWAY"
          ? "finance.cash_runway_months"
          : recommendation.metric === "BURN_RATE"
            ? "finance.net_burn"
            : "revenue.mrr",
      formula: "test formula",
      rationale: "test rationale",
    })),
    healthBands: [],
    sourceCoverage: [],
    boardReadiness: {
      status: "watch",
      score: 82,
      blockers: [],
      caveats: [],
      requiredActions: recommendations.map(
        (recommendation) => `Configure ${recommendation.metric} FinancialGoal target.`,
      ),
      requiredActionCount: recommendations.length,
    },
    metrics: [],
    trust: {
      summary: { ready: 0, partial: 0, stale: 0, missing: 0, error: 0, warnings: 0 },
      warnings: [],
      caveats: [],
    },
  };
}

function snapshot(providerKey: string, payload: Record<string, unknown>, capturedAt: string) {
  return {
    providerKey,
    status: "SUCCESS",
    payload,
    capturedAt: new Date(capturedAt),
    expiresAt: new Date("2026-06-01T18:00:00.000Z"),
    fromDate: new Date("2026-05-02T12:00:00.000Z"),
    toDate: new Date("2026-06-01T12:00:00.000Z"),
    lastError: null,
  };
}

function companySnapshots() {
  return [
    snapshot(
      "stripe",
      {
        subscriptions: {
          active: 42,
        },
        revenue: {
          mrr: 32_000,
        },
      },
      "2026-06-01T10:00:00.000Z",
    ),
    snapshot(
      "mercury",
      {
        accounts: [{ id: "acct_1", availableBalance: 765_000 }],
        cashFlow: {
          inflows30d: 70_000,
          outflows30d: 160_000,
          burnRate: 90_000,
          runway: 8.5,
          totalBalance: 765_000,
        },
      },
      "2026-06-01T11:00:00.000Z",
    ),
    snapshot(
      "hubspot",
      {
        deals: [{ dealId: "deal_1", amount: 1_000_000, stageId: "qualifiedtobuy" }],
      },
      "2026-06-01T09:00:00.000Z",
    ),
    snapshot(
      "salesPerformance",
      {
        deals: [{ dealId: "deal_2", amount: 500_000, stageId: "presentationscheduled" }],
      },
      "2026-06-01T09:30:00.000Z",
    ),
    snapshot(
      "googleAnalytics",
      {
        sessions: 20_000,
        conversions: 640,
      },
      "2026-06-01T08:00:00.000Z",
    ),
    snapshot(
      "posthog",
      {
        events: [{ event: "activated", userId: "user_1" }],
      },
      "2026-06-01T08:30:00.000Z",
    ),
    snapshot(
      "pylon",
      {
        conversations: [{ id: "conversation_1", accountId: "account_1", sentiment: "at_risk" }],
      },
      "2026-06-01T07:30:00.000Z",
    ),
  ];
}

function prismaMock(input: {
  snapshots?: ReturnType<typeof snapshot>[];
  existingGoals?: Array<{ metric: string }>;
} = {}) {
  return {
    analyticsSnapshot: {
      findMany: vi.fn(async () => input.snapshots ?? companySnapshots()),
    },
    financialGoal: {
      findMany: vi.fn(async () => input.existingGoals ?? []),
      create: vi.fn(async ({ data }) => ({ id: `goal_${data.metric}`, ...data })),
    },
  };
}

describe("runCompanyReadinessSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ingestImladrisRawRecords).mockResolvedValue({
      syncRunId: "sync_1",
      status: "SUCCESS",
      recordCount: 2,
      acceptedCount: 2,
      errorCount: 0,
    });
    vi.mocked(materializeImladrisCanonicalMetrics).mockResolvedValue([
      {
        metricKey: "finance.cash_runway_months",
        metricValueId: "metric_runway",
        status: "READY",
        rawRecordCount: 3,
        value: { months: 8.5 },
      },
    ]);
  });

  it("backfills latest company snapshots, materializes canonical metrics, and creates missing board goals", async () => {
    const prisma = prismaMock();
    const afterMaterialization = dashboardWithRecommendations([
      { metric: "ARR", targetValue: 500_000 },
      { metric: "RUNWAY", targetValue: 18 },
      { metric: "BURN_RATE", targetValue: 76_500 },
    ]);
    const finalDashboard = {
      ...dashboardWithRecommendations([]),
      boardReadiness: {
        status: "ready",
        score: 100,
        blockers: [],
        caveats: [],
        requiredActions: [],
        requiredActionCount: 0,
      },
    };
    vi.mocked(buildCompanyTrackerDashboard)
      .mockResolvedValueOnce(afterMaterialization as never)
      .mockResolvedValueOnce(finalDashboard as never);

    const result = await runCompanyReadinessSetup({
      prisma: prisma as never,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerKey: {
            in: expect.arrayContaining([
              "stripe",
              "hubspot",
              "hubspotOps",
              "salesPerformance",
              "mercury",
              "googleAnalytics",
              "posthog",
              "pylon",
            ]),
          },
          status: "SUCCESS",
        }),
      }),
    );
    const backfillCalls = vi.mocked(ingestImladrisRawRecords).mock.calls.map(([input]) => {
      const checkpoint = input.checkpoint as { providerKey?: string } | undefined;
      return {
        provider: input.provider,
        providerKey: checkpoint?.providerKey,
        mode: input.mode,
        context: input.context,
        hasSnapshotRecord: input.records.some((record) => record.objectType === "snapshot"),
      };
    });
    expect(backfillCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: IntegrationProvider.MERCURY,
          providerKey: "mercury",
          mode: "company-readiness-backfill",
          context: CONTEXT,
          hasSnapshotRecord: true,
        }),
        expect.objectContaining({
          provider: IntegrationProvider.STRIPE,
          providerKey: "stripe",
          mode: "company-readiness-backfill",
          context: CONTEXT,
          hasSnapshotRecord: true,
        }),
        expect.objectContaining({
          provider: IntegrationProvider.HUBSPOT,
          providerKey: "hubspot",
          mode: "company-readiness-backfill",
          context: CONTEXT,
          hasSnapshotRecord: true,
        }),
        expect.objectContaining({
          provider: IntegrationProvider.HUBSPOT,
          providerKey: "salesPerformance",
          mode: "company-readiness-backfill",
          context: CONTEXT,
          hasSnapshotRecord: true,
        }),
        expect.objectContaining({
          provider: IntegrationProvider.GOOGLE_ANALYTICS,
          providerKey: "googleAnalytics",
          mode: "company-readiness-backfill",
          context: CONTEXT,
          hasSnapshotRecord: true,
        }),
        expect.objectContaining({
          provider: IntegrationProvider.POSTHOG,
          providerKey: "posthog",
          mode: "company-readiness-backfill",
          context: CONTEXT,
          hasSnapshotRecord: true,
        }),
        expect.objectContaining({
          provider: IntegrationProvider.PYLON,
          providerKey: "pylon",
          mode: "company-readiness-backfill",
          context: CONTEXT,
          hasSnapshotRecord: true,
        }),
      ]),
    );
    expect(materializeImladrisCanonicalMetrics).toHaveBeenCalledWith({
      prisma,
      context: CONTEXT,
      periodStart: new Date("2026-05-02T00:00:00.000Z"),
      periodEnd: new Date("2026-06-01T00:00:00.000Z"),
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(prisma.financialGoal.create).toHaveBeenCalledTimes(3);
    expect(prisma.financialGoal.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        metric: "RUNWAY",
        targetValue: 18,
        deadline: new Date("2027-06-01T12:00:00.000Z"),
      },
    });
    expect(result.setup.goalsCreated.map((goal) => goal.metric)).toEqual([
      "ARR",
      "RUNWAY",
      "BURN_RATE",
    ]);
    expect(result.setup.unresolvedBlockers).toEqual([]);
    expect(result.dashboard.boardReadiness.status).toBe("ready");
  });

  it("does not duplicate existing active board goals", async () => {
    const prisma = prismaMock({ existingGoals: [{ metric: "ARR" }] });
    const afterMaterialization = dashboardWithRecommendations([
      { metric: "ARR", targetValue: 500_000 },
      { metric: "RUNWAY", targetValue: 18 },
      { metric: "BURN_RATE", targetValue: 76_500 },
    ]);
    vi.mocked(buildCompanyTrackerDashboard)
      .mockResolvedValueOnce(afterMaterialization as never)
      .mockResolvedValueOnce(dashboardWithRecommendations([]) as never);

    await runCompanyReadinessSetup({
      prisma: prisma as never,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(prisma.financialGoal.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        status: "ACTIVE",
        metric: {
          in: ["ARR", "RUNWAY", "BURN_RATE"],
        },
      },
      select: {
        metric: true,
      },
    });
    expect(prisma.financialGoal.create).toHaveBeenCalledTimes(2);
    expect(prisma.financialGoal.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        metric: "ARR",
      }),
    });
  });

  it("leaves Mercury blockers unresolved when no Mercury snapshot is available", async () => {
    const prisma = prismaMock({
      snapshots: companySnapshots().filter((row) => row.providerKey !== "mercury"),
    });
    vi.mocked(buildCompanyTrackerDashboard)
      .mockResolvedValueOnce(dashboardWithRecommendations([]) as never)
      .mockResolvedValueOnce(
        {
          ...dashboardWithRecommendations([]),
          boardReadiness: {
            status: "blocked",
            score: 0,
            blockers: ["Mercury source is not available."],
            caveats: [],
            requiredActions: [],
            requiredActionCount: 0,
          },
        } as never,
      );

    const result = await runCompanyReadinessSetup({
      prisma: prisma as never,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(result.setup.snapshotsUsed.map((snapshotResult) => snapshotResult.providerKey)).not.toContain(
      "mercury",
    );
    expect(ingestImladrisRawRecords).not.toHaveBeenCalledWith(
      expect.objectContaining({
        provider: IntegrationProvider.MERCURY,
      }),
    );
    expect(result.setup.unresolvedBlockers).toEqual(["Mercury source is not available."]);
  });

  it("backfills mixed-format provider snapshot keys through the provider registry", async () => {
    const prisma = prismaMock({
      snapshots: [
        snapshot("Google Analytics", { sessions: 20_000 }, "2026-06-01T08:00:00.000Z"),
        snapshot("google_analytics", { sessions: 21_000 }, "2026-06-01T09:00:00.000Z"),
        snapshot("sales-performance", { deals: [{ dealId: "deal_1" }] }, "2026-06-01T09:30:00.000Z"),
      ],
    });
    vi.mocked(buildCompanyTrackerDashboard)
      .mockResolvedValueOnce(dashboardWithRecommendations([]) as never)
      .mockResolvedValueOnce(dashboardWithRecommendations([]) as never);

    const result = await runCompanyReadinessSetup({
      prisma: prisma as never,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    const ingestedProviders = vi.mocked(ingestImladrisRawRecords).mock.calls.map(([input]) => input.provider);

    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerKey: {
            in: expect.arrayContaining(["google_analytics", "google-analytics", "sales-performance"]),
          },
        }),
      }),
    );
    expect(ingestedProviders).toEqual(
      expect.arrayContaining([
        IntegrationProvider.GOOGLE_ANALYTICS,
        IntegrationProvider.HUBSPOT,
      ]),
    );
    expect(result.setup.snapshotsUsed.map((snapshotResult) => snapshotResult.providerKey)).toEqual(
      expect.arrayContaining(["google_analytics", "sales-performance"]),
    );
  });

  it("ignores future-dated snapshots before company readiness backfill", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        snapshot("stripe", { revenue: { mrr: 32_000 } }, "2026-06-01T10:00:00.000Z"),
        snapshot("stripe", { revenue: { mrr: 999_999 } }, "2026-06-02T10:00:00.000Z"),
      ],
    });
    vi.mocked(buildCompanyTrackerDashboard)
      .mockResolvedValueOnce(dashboardWithRecommendations([]) as never)
      .mockResolvedValueOnce(dashboardWithRecommendations([]) as never);

    const result = await runCompanyReadinessSetup({
      prisma: prisma as never,
      context: CONTEXT,
      now,
    });
    const stripeBackfills = vi
      .mocked(ingestImladrisRawRecords)
      .mock.calls.filter(([input]) => input.provider === IntegrationProvider.STRIPE);

    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          capturedAt: { lte: now },
        }),
      }),
    );
    expect(stripeBackfills).toHaveLength(1);
    expect(result.setup.snapshotsUsed).toEqual([
      expect.objectContaining({
        providerKey: "stripe",
        capturedAt: "2026-06-01T10:00:00.000Z",
      }),
    ]);
  });

  it("deduplicates snapshot-key aliases before company readiness backfill", async () => {
    const prisma = prismaMock({
      snapshots: [
        snapshot("Google Analytics", { sessions: 20_000 }, "2026-06-01T08:00:00.000Z"),
        snapshot("google_analytics", { sessions: 21_000 }, "2026-06-01T09:00:00.000Z"),
      ],
    });
    vi.mocked(buildCompanyTrackerDashboard)
      .mockResolvedValueOnce(dashboardWithRecommendations([]) as never)
      .mockResolvedValueOnce(dashboardWithRecommendations([]) as never);

    const result = await runCompanyReadinessSetup({
      prisma: prisma as never,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    const googleAnalyticsBackfills = vi
      .mocked(ingestImladrisRawRecords)
      .mock.calls.filter(([input]) => input.provider === IntegrationProvider.GOOGLE_ANALYTICS);

    expect(googleAnalyticsBackfills).toHaveLength(1);
    expect(googleAnalyticsBackfills[0][0].checkpoint).toMatchObject({
      providerKey: "google_analytics",
    });
    expect(result.setup.snapshotsUsed.map((snapshotResult) => snapshotResult.providerKey)).toEqual([
      "google_analytics",
    ]);
  });

  it("does not duplicate configured goals and reports recommendations without target values as unresolved", async () => {
    const prisma = prismaMock();
    vi.mocked(buildCompanyTrackerDashboard)
      .mockResolvedValueOnce(
        dashboardWithRecommendations([{ metric: "BURN_RATE", targetValue: null }]) as never,
      )
      .mockResolvedValueOnce(
        {
          ...dashboardWithRecommendations([{ metric: "BURN_RATE", targetValue: null }]),
          boardReadiness: {
            status: "blocked",
            score: 40,
            blockers: ["Mercury source is not available."],
            caveats: [],
            requiredActions: ["Configure BURN_RATE FinancialGoal target."],
            requiredActionCount: 1,
          },
        } as never,
      );

    const result = await runCompanyReadinessSetup({
      prisma: prisma as never,
      context: CONTEXT,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(prisma.financialGoal.create).not.toHaveBeenCalled();
    expect(result.setup.unresolvedActions).toEqual([
      "Configure BURN_RATE FinancialGoal target.",
    ]);
    expect(result.setup.unresolvedBlockers).toEqual(["Mercury source is not available."]);
  });
});

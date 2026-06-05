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
  periodStart?: Date;
  periodEnd?: Date;
  computedAt?: Date;
  userId?: string | null;
  organizationId?: string | null;
  lineage?: Array<Record<string, unknown>>;
}) {
  const periodEnd = input.periodEnd ?? new Date("2026-05-31T23:59:59.999Z");
  const periodStart = input.periodStart ?? new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1));
  return {
    id: input.id ?? `metric_${input.metricKey.replaceAll(".", "_")}`,
    metricKey: input.metricKey,
    department: input.metricKey.startsWith("sales.") ? "sales" : "finance",
    unit: input.metricKey === "finance.cash_runway_months" ? "months" : "currency",
    value: input.value,
    periodStart,
    periodEnd,
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
          metricKey: "revenue.arr",
          value: {
            amount: 390_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "revenue.total_revenue",
          value: {
            amount: 462_000,
            subscriptionRevenue: 390_000,
            servicesRevenue: 72_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "revenue.subscription_revenue",
          value: {
            amount: 390_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "revenue.services_revenue",
          value: {
            amount: 72_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "revenue.active_subscriptions",
          value: {
            count: 45,
            stripeSubscriptions: 38,
            hubspotOnlySubscriptions: 7,
          },
        }),
        metricRow({
          metricKey: "revenue.customer_count",
          value: {
            count: 39,
            stripeCustomers: 34,
            hubspotOnlyCustomers: 5,
          },
        }),
        metricRow({
          id: "metric_revenue_mrr_previous",
          metricKey: "revenue.mrr",
          value: { amount: 25_000, arr: 300_000, currency: "USD" },
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
        }),
        metricRow({
          metricKey: "finance.cash_balance",
          value: {
            amount: 800_000,
            currency: "USD",
          },
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
          metricKey: "finance.expenses",
          value: {
            amount: 182_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "finance.gross_margin",
          value: {
            rate: 78.4,
            revenue: 456_000,
            costOfGoodsSold: 98_500,
            stripeProcessingFees: 12_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "sales.qualified_pipeline",
          value: {
            amount: 1_000_000,
            qualifiedDealCount: 7,
            collaborationTouchCount: 5,
            collaborationCoverage: 0.84,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "sales.demos",
          value: {
            count: 4,
            scheduledDemos: 3,
            requestedDemos: 1,
            hubspotDemoDeals: 1,
            hubspotDemoMeetings: 1,
            calendarDemoEvents: 1,
            webflowDemoRequests: 1,
          },
        }),
        metricRow({
          metricKey: "marketing.website_traffic",
          value: {
            count: 18_500,
            websiteSessions: 15_000,
            posthogPageviews: 2_250,
            organicTraffic: 3_500,
            searchClicks: 240,
            searchImpressions: 4_800,
          },
        }),
        metricRow({
          metricKey: "marketing.conversion_rate",
          value: {
            rate: 3.4,
            conversions: 629,
            webflowFormSubmissions: 450,
            hubspotLeadConversions: 179,
            posthogConversions: 55,
            identifiedVisitors: 210,
          },
        }),
        metricRow({
          metricKey: "marketing.pipeline_efficiency",
          value: {
            rate: 40,
            qualifiedPipeline: 1_000_000,
            acquisitionSpend: 25_000,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "product.activation_rate",
          value: {
            rate: 64,
            activatedAccounts: 16,
            eligibleAccounts: 25,
          },
        }),
        metricRow({
          metricKey: "customer_success.customer_health",
          value: {
            score: 86,
            atRiskAccounts: 3,
            openSupportIssues: 9,
            escalations: 2,
            accountsWithBillingRisk: 1,
            lowUsageAccounts: 4,
          },
        }),
        metricRow({
          metricKey: "customer_success.customer_activity",
          value: {
            count: 214,
            supportInteractions: 7,
            productUsageRecords: 151,
            collaborationSignals: 56,
            activeAccounts: 39,
          },
        }),
        metricRow({
          metricKey: "customer_success.churn_rate",
          value: {
            rate: 2.5,
            churnedCustomers: 1,
            retainedCustomers: 39,
            customerBase: 40,
          },
        }),
        metricRow({
          metricKey: "customer_success.retention_rate",
          value: {
            rate: 97.5,
            retainedCustomers: 39,
            churnedCustomers: 1,
            customerBase: 40,
          },
        }),
        metricRow({
          metricKey: "customer_success.retention_risk",
          value: {
            score: 18,
            atRiskAccounts: 3,
            openSupportIssues: 9,
            escalations: 2,
            accountsWithBillingRisk: 1,
            lowUsageAccounts: 4,
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
      arr: 390_000,
      mrr: 32_000,
      totalRevenue: 462_000,
      subscriptionRevenue: 390_000,
      servicesRevenue: 72_000,
      runwayMonths: 8.5,
      cashBalance: 800_000,
      netBurn: 90_000,
      cashOutflow: 160_000,
      cashInflow: 70_000,
      expenses: 182_000,
      grossMargin: 78.4,
      grossMarginRevenue: 456_000,
      costOfGoodsSold: 98_500,
      stripeProcessingFees: 12_000,
      qualifiedPipeline: 1_000_000,
      qualifiedPipelineCount: 7,
      collaborationTouchCount: 5,
      collaborationCoverage: 0.84,
      demos: 4,
      scheduledDemos: 3,
      requestedDemos: 1,
      hubspotDemoDeals: 1,
      hubspotDemoMeetings: 1,
      calendarDemoEvents: 1,
      webflowDemoRequests: 1,
      activeSubscriptions: 45,
      stripeSubscriptions: 38,
      hubspotOnlySubscriptions: 7,
      customers: 39,
      stripeCustomers: 34,
      hubspotOnlyCustomers: 5,
      websiteTraffic: 18_500,
      websiteSessions: 15_000,
      posthogPageviews: 2_250,
      organicTraffic: 3_500,
      searchClicks: 240,
      searchImpressions: 4_800,
      conversionRate: 3.4,
      conversions: 629,
      webflowFormSubmissions: 450,
      hubspotLeadConversions: 179,
      posthogConversions: 55,
      identifiedVisitors: 210,
      pipelineEfficiency: 40,
      acquisitionSpend: 25_000,
      activationRate: 64,
      activatedAccounts: 16,
      eligibleAccounts: 25,
      customerHealth: 86,
      atRiskAccounts: 3,
      openSupportIssues: 9,
      customerActivity: 214,
      supportInteractions: 7,
      productUsageRecords: 151,
      collaborationSignals: 56,
      customerActivityActiveAccounts: 39,
      churnRate: 2.5,
      retentionRate: 97.5,
      churnedCustomers: 1,
      retainedCustomers: 39,
      retentionCustomerBase: 40,
      retentionRiskScore: 18,
      retentionRiskAccounts: 3,
      retentionRiskEscalations: 2,
      retentionRiskBillingRiskAccounts: 1,
      retentionRiskLowUsageAccounts: 4,
      currency: "USD",
    });
    expect(dashboard.northStar).toMatchObject({
      id: "healthy_arr_growth",
      label: "Healthy ARR Growth",
      status: "watch",
      currentArr: 390_000,
      netNewArr: 90_000,
      sourceMetricKeys: [
        "revenue.mrr",
        "finance.cash_runway_months",
        "finance.net_burn",
        "sales.qualified_pipeline",
      ],
    });
    expect(dashboard.northStar.drivers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "runway", status: "watch" }),
        expect.objectContaining({ id: "burn_multiple", value: 1 }),
        expect.objectContaining({ id: "pipeline_coverage", value: 2.6 }),
      ]),
    );
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_arr",
        metric: "ARR",
        currentValue: 390_000,
        progressPct: 78,
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
          value: 1,
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
    expect(dashboard.sourceCoverage.map((source) => source.key)).toEqual(
      expect.arrayContaining(["linear", "github"]),
    );
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      status: "ready",
      sourceLineageCount: 1,
    });
  });

  it("surfaces distinct canonical lineage source keys on company metrics", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            currency: "USD",
          },
          lineage: [
            {
              sourceKey: "stripe",
              sourceType: "raw",
              sourceId: "sub_1",
              rawRecordId: "raw_stripe_subscription",
              capturedAt: new Date("2026-05-31T00:00:00.000Z"),
              metadata: {},
            },
            {
              sourceKey: "hubspot",
              sourceType: "raw",
              sourceId: "deal_1",
              rawRecordId: "raw_hubspot_deal",
              capturedAt: new Date("2026-05-31T00:00:00.000Z"),
              metadata: {},
            },
            {
              sourceKey: "stripe",
              sourceType: "raw",
              sourceId: "sub_2",
              rawRecordId: "raw_stripe_subscription_2",
              capturedAt: new Date("2026-06-01T03:15:00.000Z"),
              metadata: {},
            },
            {
              sourceKey: "",
              sourceType: "raw",
              sourceId: "blank",
              rawRecordId: "raw_blank",
              capturedAt: new Date("2026-05-31T00:00:00.000Z"),
              metadata: {},
            },
          ],
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")).toMatchObject({
      sourceLineageCount: 4,
      sourceLineageKeys: ["stripe", "hubspot"],
      latestSourceCapturedAt: "2026-06-01T03:15:00.000Z",
    });
  });

  it("aggregates sanitized source evidence onto north-star drivers", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            currency: "USD",
          },
          lineage: [
            {
              sourceKey: "stripe",
              sourceType: "raw",
              sourceId: "sub_1",
              rawRecordId: "raw_stripe_subscription_internal",
              capturedAt: new Date("2026-06-01T01:00:00.000Z"),
              metadata: {},
            },
            {
              sourceKey: "hubspot",
              sourceType: "raw",
              sourceId: "deal_1",
              rawRecordId: "raw_hubspot_subscription_internal",
              capturedAt: new Date("2026-06-01T02:00:00.000Z"),
              metadata: {},
            },
          ],
        }),
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            amount: 90_000,
            currency: "USD",
          },
          lineage: [
            {
              sourceKey: "mercury",
              sourceType: "raw",
              sourceId: "txn_1",
              rawRecordId: "raw_mercury_transaction_internal",
              capturedAt: new Date("2026-06-01T03:15:00.000Z"),
              metadata: {},
            },
          ],
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.northStar.drivers).toContainEqual(
      expect.objectContaining({
        id: "burn_multiple",
        sourceLineageKeys: ["mercury", "stripe", "hubspot"],
        sourceLineageCount: 3,
        latestSourceCapturedAt: "2026-06-01T03:15:00.000Z",
      }),
    );
    expect(JSON.stringify(dashboard.northStar.drivers)).not.toContain("raw_mercury_transaction_internal");
    expect(JSON.stringify(dashboard.northStar.drivers)).not.toContain("raw_stripe_subscription_internal");
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
              activeCustomerRefs: [
                { customerId: "cus_1", email: "buyer@example.com", emailDomain: "example.com" },
                { customerId: "cus_2", email: "buyer-2@example.com", emailDomain: "example.com" },
              ],
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
              collectedFormSubmissions: 185,
              stages: [],
              dealsBySource: [],
            },
            collectedForms: {
              formSubmissions: [],
              submissions: [],
              totalFormSubmissions: 185,
              leadMagnetSubmissions: 120,
              contactRequestSubmissions: 65,
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
        {
          providerKey: "googleAnalytics",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            sessions30d: 18_500,
            sessionsPrev30d: 16_200,
            users30d: 12_400,
            usersPrev30d: 11_000,
            pageviews30d: 42_000,
            pageviewsPrev30d: 36_000,
            bounceRate: 0.38,
            avgSessionDuration: 91,
            trafficByChannel: [],
            topPages: [],
            dailyTrend: [],
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
      totalRevenue: 384_000,
      subscriptionRevenue: 384_000,
      runwayMonths: 8.5,
      cashBalance: 765_000,
      netBurn: 90_000,
      expenses: 160_000,
      qualifiedPipeline: 1_000_000,
      demos: 1,
      activeSubscriptions: 42,
      customers: 2,
      websiteTraffic: 18_500,
      conversionRate: 1,
      customerHealth: 82,
      customerActivity: 12,
      churnRate: 2,
      retentionRate: 98,
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
      sourceLineageCount: 5,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "sales.qualified_pipeline")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        amount: 1_000_000,
        source: "analytics.revenue_dashboard",
      }),
    });
    expect(dashboard.metrics.find((metric) => metric.key === "sales.demos")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        count: 1,
        scheduledDemos: 1,
        source: "analytics.snapshot_demos",
      }),
    });
    expect(dashboard.metrics.find((metric) => metric.key === "marketing.website_traffic")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        count: 18_500,
        source: "analytics.snapshot_website_traffic",
      }),
    });
    expect(dashboard.metrics.find((metric) => metric.key === "customer_success.customer_health")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        score: 82,
        source: "analytics.snapshot_customer_health",
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

  it("uses Webflow form submissions in live analytics conversion fallback", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "googleAnalytics",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            sessions30d: 1_000,
          },
        },
        {
          providerKey: "webflow",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            totalFormSubmissions: 25,
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
      conversionRate: 2.5,
      conversions: 25,
      webflowFormSubmissions: 25,
      websiteSessions: 1_000,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "marketing.conversion_rate")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        rate: 2.5,
        conversions: 25,
        webflowFormSubmissions: 25,
        websiteSessions: 1_000,
        source: "analytics.snapshot_conversion",
      }),
      sourceLineageKeys: ["googleAnalytics", "webflow"],
    });
  });

  it("uses Search Console clicks as conversion traffic when Google Analytics is absent", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "googleSearchConsole",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            clicks: 1_000,
            impressions: 20_000,
          },
        },
        {
          providerKey: "webflow",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            totalFormSubmissions: 25,
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
      conversionRate: 2.5,
      conversions: 25,
      webflowFormSubmissions: 25,
      websiteSessions: 1_000,
      searchClicks: 1_000,
    });
    expect(dashboard.metrics.find((metric) => metric.key === "marketing.conversion_rate")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        rate: 2.5,
        conversions: 25,
        webflowFormSubmissions: 25,
        websiteSessions: 1_000,
        source: "analytics.snapshot_conversion",
      }),
      sourceLineageKeys: ["googleSearchConsole", "webflow"],
    });
  });

  it("deduplicates live Stripe active customer refs before founder customer counts", async () => {
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
              active: 2,
              pastDue: 0,
              canceled: 0,
              trialing: 0,
              churnRate: 0.02,
              recentChurnEvents: [],
              activeCustomerRefs: [
                { customerId: "cus_shared", email: "billing@example.com", emailDomain: "example.com" },
                { customerId: "cus_shared", email: "billing@example.com", emailDomain: "example.com" },
              ],
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
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            funnel: {
              totalDeals: 0,
              closedWon: 0,
              closedLost: 0,
              unlikely: 0,
              churn: 0,
              activeSubscriptions: 0,
              noShows: 0,
              demoScheduled: 0,
              demoFollowUp: 0,
              avgDealSize: 0,
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
            deals: [],
            subscriptionDeals: [],
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary.customers).toBe(1);
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.customer_count")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        count: 1,
        activeCustomerRefs: 2,
      }),
    });
  });

  it("deduplicates live Stripe customer refs by shared HubSpot company metadata", async () => {
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
              active: 2,
              pastDue: 0,
              canceled: 0,
              trialing: 0,
              churnRate: 0.02,
              recentChurnEvents: [],
              activeCustomerRefs: [
                {
                  customerId: "cus_billing_admin",
                  email: "admin@example.com",
                  emailDomain: "example.com",
                  hubspotCompanyIds: ["company_shared"],
                },
                {
                  customerId: "cus_billing_ops",
                  email: "ops@example.com",
                  emailDomain: "example.com",
                  hubspotCompanyIds: ["company_shared"],
                },
              ],
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
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            funnel: {
              totalDeals: 0,
              closedWon: 0,
              closedLost: 0,
              unlikely: 0,
              churn: 0,
              activeSubscriptions: 0,
              noShows: 0,
              demoScheduled: 0,
              demoFollowUp: 0,
              avgDealSize: 0,
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
            deals: [],
            subscriptionDeals: [],
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary.customers).toBe(1);
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.customer_count")).toMatchObject({
      value: expect.objectContaining({
        count: 1,
        activeCustomerRefs: 2,
      }),
    });
  });

  it("reads snake_case Stripe active customer refs before founder customer counts", async () => {
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
              active: 9,
              pastDue: 0,
              canceled: 0,
              trialing: 0,
              churnRate: 0.02,
              recentChurnEvents: [],
              active_customer_refs: [
                { customer_id: "cus_shared", email: "billing@example.com", email_domain: "example.com" },
                { customer_id: "cus_shared", email: "billing@example.com", email_domain: "example.com" },
              ],
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
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            funnel: {
              totalDeals: 0,
              closedWon: 0,
              closedLost: 0,
              unlikely: 0,
              churn: 0,
              activeSubscriptions: 0,
              noShows: 0,
              demoScheduled: 0,
              demoFollowUp: 0,
              avgDealSize: 0,
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
            deals: [],
            subscriptionDeals: [],
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary.customers).toBe(1);
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.customer_count")).toMatchObject({
      value: expect.objectContaining({
        count: 1,
        activeCustomerRefs: 2,
      }),
    });
  });

  it("ignores future-dated analytics snapshots when building live company metrics", async () => {
    const currentCapturedAt = new Date("2026-05-31T20:00:00.000Z");
    const futureCapturedAt = new Date("2026-06-02T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "stripe",
          status: "SUCCESS",
          capturedAt: currentCapturedAt,
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
          providerKey: "stripe",
          status: "SUCCESS",
          capturedAt: futureCapturedAt,
          expiresAt: new Date("2026-06-03T20:00:00.000Z"),
          lastError: null,
          payload: {
            revenue: {
              mrr: 999_999,
              mrrChange: 0,
              totalRevenue30d: 999_999,
              totalRevenuePrev30d: 34_000,
              revenueGrowth: 0.08,
              avgRevenuePerCustomer: 800,
            },
            subscriptions: {
              active: 1,
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
      computedAt: currentCapturedAt.toISOString(),
      periodEnd: currentCapturedAt.toISOString(),
      value: expect.objectContaining({
        amount: 32_000,
        arr: 384_000,
      }),
    });
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          capturedAt: { lte: now },
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

  it("reports source coverage capture times from each provider's own latest snapshot", async () => {
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "stripe",
          status: "SUCCESS",
          capturedAt: new Date("2026-05-31T22:00:00.000Z"),
          expiresAt: new Date("2026-06-01T22:00:00.000Z"),
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
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt: new Date("2026-05-31T08:30:00.000Z"),
          expiresAt: new Date("2026-06-01T08:30:00.000Z"),
          lastError: null,
          payload: {
            funnel: {
              totalDeals: 0,
              closedWon: 0,
              closedLost: 0,
              unlikely: 0,
              churn: 0,
              activeSubscriptions: 42,
              noShows: 0,
              demoScheduled: 0,
              demoFollowUp: 0,
              avgDealSize: 0,
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
            deals: [],
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "stripe",
          lastCapturedAt: "2026-05-31T22:00:00.000Z",
        }),
        expect.objectContaining({
          key: "hubspot",
          lastCapturedAt: "2026-05-31T08:30:00.000Z",
        }),
      ]),
    );
  });

  it("uses the newest status across snapshot aliases for source coverage", async () => {
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "google_analytics",
          status: "ERROR",
          capturedAt: new Date("2026-05-31T08:00:00.000Z"),
          expiresAt: new Date("2026-06-01T08:00:00.000Z"),
          lastError: "Old GA alias token failed.",
          payload: null,
        },
        {
          providerKey: "googleAnalytics",
          status: "SUCCESS",
          capturedAt: new Date("2026-05-31T22:00:00.000Z"),
          expiresAt: new Date("2026-06-01T22:00:00.000Z"),
          lastError: null,
          payload: {
            sessions30d: 12_000,
            pageviews30d: 24_000,
            bounceRate: 0.42,
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "googleAnalytics",
          status: "available",
          lastCapturedAt: "2026-05-31T22:00:00.000Z",
        }),
      ]),
    );
    expect(dashboard.trust.warnings).not.toContain("google_analytics: Old GA alias token failed.");
  });

  it("uses delimiter-formatted snapshot aliases as live metric fallback inputs", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "sales-performance",
          status: "SUCCESS",
          capturedAt,
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            repMonthRows: [
              {
                ownerId: "owner_1",
                ownerName: "Ava",
                signedDealsBookedValue: 250_000,
                signedDealsRealizedValue30d: 100_000,
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

    expect(dashboard.metrics.find((metric) => metric.key === "sales.qualified_pipeline")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        bookedValue: 250_000,
        realizedValue30d: 100_000,
        bookedToRealizedRatio30d: 0.4,
        source: "analytics.revenue_dashboard",
      }),
    });
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

  it("uses legacy product snapshots as PostHog evidence for activation fallback", async () => {
    const capturedAt = new Date("2026-05-31T20:00:00.000Z");
    const analyticsSnapshotFindMany = vi.fn(async (query) => {
      const providerKeys = (query as {
        where?: { providerKey?: { in?: string[] } };
      }).where?.providerKey?.in ?? [];
      return providerKeys.includes("product")
        ? [
            {
              providerKey: "hubspot",
              status: "SUCCESS",
              capturedAt,
              expiresAt: new Date("2026-06-01T20:00:00.000Z"),
              lastError: null,
              payload: {
                funnel: {
                  activeSubscriptions: 4,
                },
              },
            },
            {
              providerKey: "product",
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
          ]
        : [];
    });
    const prisma = {
      ...prismaMock(),
      analyticsSnapshot: {
        findMany: analyticsSnapshotFindMany,
      },
    };

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "product.activation_rate")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        rate: 25,
        activatedAccounts: 1,
        eligibleAccounts: 4,
        source: "analytics.snapshot_activation",
      }),
    });
    expect(dashboard.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "posthog", status: "available" }),
      ]),
    );
    expect(analyticsSnapshotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerKey: {
            in: expect.arrayContaining(["posthog", "product"]),
          },
        }),
      }),
    );
  });

  it("uses the newest compatible PostHog snapshot alias for activation fallback", async () => {
    const prisma = prismaMock({
      snapshots: [
        {
          providerKey: "hubspot",
          status: "SUCCESS",
          capturedAt: new Date("2026-05-31T20:00:00.000Z"),
          expiresAt: new Date("2026-06-01T20:00:00.000Z"),
          lastError: null,
          payload: {
            funnel: {
              activeSubscriptions: 4,
            },
          },
        },
        {
          providerKey: "posthog",
          status: "SUCCESS",
          capturedAt: new Date("2026-05-31T08:00:00.000Z"),
          expiresAt: new Date("2026-06-01T08:00:00.000Z"),
          lastError: null,
          payload: {
            events: [
              { event: "activation_completed", distinct_id: "account_1" },
            ],
            eventCount: 1,
          },
        },
        {
          providerKey: "product",
          status: "SUCCESS",
          capturedAt: new Date("2026-05-31T22:00:00.000Z"),
          expiresAt: new Date("2026-06-01T22:00:00.000Z"),
          lastError: null,
          payload: {
            events: [
              { event: "activation_completed", distinct_id: "account_1" },
              { event: "activation_completed", distinct_id: "account_2" },
              { event: "activation_completed", distinct_id: "account_3" },
              { event: "activation_completed", distinct_id: "account_4" },
            ],
            eventCount: 4,
          },
        },
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.metrics.find((metric) => metric.key === "product.activation_rate")).toMatchObject({
      status: "partial",
      value: expect.objectContaining({
        rate: 100,
        activatedAccounts: 4,
        eligibleAccounts: 4,
        eventCount: 4,
      }),
    });
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

  it("uses runway net burn as a summary fallback when the dedicated net burn metric is missing", async () => {
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
          id: "metric_revenue_mrr_previous",
          metricKey: "revenue.mrr",
          value: { amount: 25_000, arr: 300_000, currency: "USD" },
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
          computedAt: new Date("2026-05-01T00:00:00.000Z"),
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
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(dashboard.summary.netBurn).toBe(90_000);
    expect(dashboard.healthBands.find((band) => band.id === "burn_multiple")).toMatchObject({
      value: 1.07,
      status: "watch",
    });
    expect(dashboard.metrics.find((metric) => metric.key === "finance.net_burn")).toMatchObject({
      status: "missing",
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

  it("unwraps provider date envelopes before canonical metric and goal freshness checks", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        {
          ...metricRow({
            id: "wrapped_date_revenue_mrr",
            metricKey: "revenue.mrr",
            value: {
              amount: 32_000,
              arr: 384_000,
              activeSubscriptions: 42,
              currency: "USD",
            },
          }),
          periodStart: { value: "2026-05-01T00:00:00.000Z" },
          periodEnd: { data: { attributes: { value: "2026-05-31T23:59:59.999Z" } } },
          computedAt: { value: "2026-06-01T00:00:00.000Z" },
        },
      ],
      goals: [
        {
          id: "goal_arr_wrapped_deadline",
          metric: "ARR",
          targetValue: 500_000,
          deadline: { data: { attributes: { value: "2026-12-31T00:00:00.000Z" } } },
          status: "ACTIVE",
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
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_arr_wrapped_deadline",
        deadline: "2026-12-31T00:00:00.000Z",
        currentValue: 384_000,
        progressPct: 76.8,
        status: "active",
      }),
    ]);
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

  it("parses ISO currency canonical values before summary and goal calculations", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: "USD 32,000",
            arr: "384,000 USD",
            activeSubscriptions: "42",
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            amount: "USD -10,000",
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

  it("parses compact currency canonical values before summary and goal calculations", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: "USD 100k",
            arr: "1.2M USD",
            activeSubscriptions: "42",
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            amount: "USD -80k",
            currency: "USD",
          },
        }),
      ],
      goals: [
        {
          id: "goal_arr_compact_target",
          metric: "ARR",
          targetValue: "USD 1.5M",
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
      arr: 1_200_000,
      mrr: 100_000,
      netBurn: -80_000,
      activeSubscriptions: 42,
    });
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_arr_compact_target",
        targetValue: 1_500_000,
        currentValue: 1_200_000,
        progressPct: 80,
      }),
    ]);
  });

  it("reads wrapped canonical metric values before summary and health band calculations", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_current_wrapped",
          metricKey: "revenue.mrr",
          value: {
            values: {
              amount: "USD 32k",
              arr: "USD 384k",
              active_subscriptions: "42",
              currency: "usd",
            },
          },
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_previous_wrapped",
          metricKey: "revenue.mrr",
          value: {
            fields: {
              amount: 25_000,
              arr: 300_000,
              currency: "usd",
            },
          },
          periodEnd: new Date("2026-04-30T23:59:59.999Z"),
        }),
        metricRow({
          metricKey: "finance.cash_runway_months",
          value: {
            attributes: {
              months: "9.5",
              cash_balance: "765k",
              net_burn: "84k",
              currency: "usd",
            },
          },
        }),
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            values: {
              amount: "USD 84k",
              currency: "usd",
            },
          },
        }),
        metricRow({
          metricKey: "sales.qualified_pipeline",
          value: {
            fields: {
              amount: "USD 1.5M",
              currency: "usd",
            },
          },
        }),
      ],
      goals: [
        {
          id: "goal_arr_wrapped",
          metric: "ARR",
          targetValue: "USD 500k",
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
      runwayMonths: 9.5,
      cashBalance: 765_000,
      netBurn: 84_000,
      qualifiedPipeline: 1_500_000,
      activeSubscriptions: 42,
      currency: "USD",
    });
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_arr_wrapped",
        currentValue: 384_000,
        progressPct: 76.8,
        status: "active",
      }),
    ]);
    expect(dashboard.healthBands.find((band) => band.id === "burn_multiple")).toMatchObject({
      value: 1,
      status: "strong",
    });
    expect(dashboard.healthBands.find((band) => band.id === "pipeline_coverage")).toMatchObject({
      value: 3.9,
      status: "strong",
    });
    expect(dashboard.metrics.find((metric) => metric.key === "sales.qualified_pipeline")?.value).toEqual({
      amount: "USD 1.5M",
      currency: "usd",
    });
  });

  it("reads JSON:API data attribute canonical metric values before summary calculations", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_json_api",
          metricKey: "revenue.mrr",
          value: {
            data: {
              type: "canonical_metric_values",
              id: "metric_revenue_mrr_json_api",
              attributes: {
                amount: "USD 32k",
                arr: "USD 384k",
                active_subscriptions: "42",
                currency: "usd",
              },
            },
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
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
      currency: "USD",
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")?.value).toEqual({
      amount: "USD 32k",
      arr: "USD 384k",
      active_subscriptions: "42",
      currency: "usd",
    });
  });

  it("unwraps single-value JSON:API canonical metric attributes before summary calculations", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_json_api_value",
          metricKey: "revenue.mrr",
          value: {
            data: {
              type: "canonical_metric_values",
              id: "metric_revenue_mrr_json_api_value",
              attributes: {
                value: {
                  amount: "USD 32k",
                  arr: "USD 384k",
                  active_subscriptions: "42",
                  currency: "usd",
                },
              },
            },
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
      arr: 384_000,
      mrr: 32_000,
      activeSubscriptions: 42,
      currency: "USD",
    });
    expect(dashboard.metrics.find((metric) => metric.key === "revenue.mrr")?.value).toEqual({
      amount: "USD 32k",
      arr: "USD 384k",
      active_subscriptions: "42",
      currency: "usd",
    });
  });

  it("unwraps object-shaped canonical scalar values before summary and goal calculations", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: { value: "USD 32k" },
            arr: {
              data: {
                value: "USD 384k",
              },
            },
            activeSubscriptions: { value: "42" },
            currency: { value: "usd" },
          },
        }),
        metricRow({
          metricKey: "finance.net_burn",
          value: {
            amount: { value: "USD 84k" },
            currency: { value: "usd" },
          },
        }),
      ],
      goals: [
        {
          id: "goal_arr_scalar_wrapped",
          metric: "ARR",
          targetValue: { value: "USD 500k" },
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
      netBurn: 84_000,
      activeSubscriptions: 42,
      currency: "USD",
    });
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_arr_scalar_wrapped",
        targetValue: 500_000,
        currentValue: 384_000,
        progressPct: 76.8,
      }),
    ]);
  });

  it("floors fractional active subscription counts before summary and goal calculations", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            activeSubscriptions: 42.9,
            currency: "USD",
          },
        }),
      ],
      goals: [
        {
          id: "goal_customer_count",
          metric: "CUSTOMER_COUNT",
          targetValue: 50,
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

    expect(dashboard.summary.activeSubscriptions).toBe(42);
    expect(dashboard.goalProgress).toEqual([
      expect.objectContaining({
        id: "goal_customer_count",
        currentValue: 42,
        progressPct: 84,
      }),
    ]);
  });

  it("reads snake_case canonical summary payload aliases", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          metricKey: "revenue.mrr",
          value: {
            amount: 32_000,
            arr: 384_000,
            active_subscriptions: 42,
            currency: "USD",
          },
        }),
        metricRow({
          metricKey: "finance.cash_runway_months",
          value: {
            months: 8.5,
            cash_balance: 765_000,
            net_burn: 90_000,
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

    expect(dashboard.summary).toMatchObject({
      arr: 384_000,
      mrr: 32_000,
      runwayMonths: 8.5,
      cashBalance: 765_000,
      netBurn: 90_000,
      activeSubscriptions: 42,
    });
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
    const missingMetricWarningCount = dashboard.metrics.filter(
      (metric) => metric.status === "missing",
    ).length;
    expect(dashboard.trust.summary.warnings).toBe(missingMetricWarningCount + 3);
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

  it("defensively ignores canonical rows with inverted reporting windows", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_inverted_window",
          metricKey: "revenue.mrr",
          value: {
            amount: 99_000,
            arr: 1_188_000,
            activeSubscriptions: 99,
            currency: "USD",
          },
          periodStart: new Date("2026-06-01T00:00:00.000Z"),
          periodEnd: new Date("2026-05-31T23:59:59.999Z"),
          computedAt: new Date("2026-06-01T00:30:00.000Z"),
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
          computedAt: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ],
    });

    const dashboard = await buildCompanyTrackerDashboard({
      prisma: prisma as unknown as CompanyTrackerPrisma,
      context: CONTEXT,
      now: new Date("2026-06-01T01:00:00.000Z"),
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

  it("does not let newer global canonical rows override scoped company metrics", async () => {
    const prisma = prismaMock({
      canonicalRows: [
        metricRow({
          id: "metric_revenue_mrr_global_future_period",
          metricKey: "revenue.mrr",
          userId: null,
          organizationId: null,
          value: {
            amount: 99_000,
            arr: 1_188_000,
            activeSubscriptions: 99,
            currency: "USD",
          },
          periodStart: new Date("2026-06-01T00:00:00.000Z"),
          periodEnd: new Date("2026-06-02T23:59:59.999Z"),
          computedAt: new Date("2026-06-03T00:00:00.000Z"),
        }),
        metricRow({
          id: "metric_revenue_mrr_scoped_current",
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
      now: new Date("2026-06-03T12:00:00.000Z"),
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
      periodEnd: "2026-05-31T23:59:59.999Z",
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

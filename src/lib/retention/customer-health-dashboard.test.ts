import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    retentionTenantCurrent: {
      findMany: vi.fn(),
    },
    retentionSourceRecord: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    retentionSyncRun: {
      findFirst: vi.fn(),
    },
  },
}));

function currentRow(overrides: Record<string, unknown> = {}) {
  return {
    customerRecordId: "cust_1",
    lifecyclePhase: "MATURE",
    status: "HEALTHY",
    primaryLirPassed: true,
    primaryLirLabel: "Active weeks trailing 8",
    primaryLirValue: 6,
    primaryLirThreshold: 5,
    currentMonthActivity: 24,
    activityTrendPct: 8,
    supportRisk: false,
    billingRisk: false,
    onboardingRisk: false,
    icp: true,
    ownerName: "CS Owner",
    segment: "Mid-market",
    plan: "Growth",
    ageBucket: "180d+",
    lastMaterializedAt: new Date("2026-03-15T00:00:00.000Z"),
    reasonCodes: [],
    detailData: {
      coverage: {
        arda: true,
        coda: true,
        stripe: true,
        hubspot: true,
        pylon: false,
        missingSources: ["pylon"],
      },
    },
    customerRecord: {
      name: "Tenant One",
    },
    ...overrides,
  };
}

describe("customer health dashboard service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns an empty dashboard payload when no current retention snapshots exist", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { buildCustomerHealthDashboard } = await import("@/lib/retention/customer-health-dashboard");

    vi.mocked(prisma.retentionTenantCurrent.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.retentionSourceRecord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.retentionSourceRecord.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.retentionSyncRun.findFirst).mockResolvedValue(null as never);

    const dashboard = await buildCustomerHealthDashboard({ id: "user_1", organizationId: "org_1" });

    expect(dashboard.totals).toEqual({
      totalAccounts: 0,
      healthyAccounts: 0,
      watchAccounts: 0,
      atRiskAccounts: 0,
      onboardingRiskAccounts: 0,
      billingRiskAccounts: 0,
      lirPassingAccounts: 0,
      avgCurrentMonthActivity: 0,
    });
    expect(dashboard.accounts).toEqual([]);
    expect(dashboard.ardaDataQuality.activityRecords).toBe(0);
    expect(dashboard.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "ARDA", tenantsCovered: 0, coveragePct: 0 }),
        expect.objectContaining({ source: "CODA", tenantsCovered: 0, coveragePct: 0 }),
      ]),
    );
  });

  it("builds portfolio totals, risk queues, source coverage, and Arda activity counts", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { buildCustomerHealthDashboard } = await import("@/lib/retention/customer-health-dashboard");

    vi.mocked(prisma.retentionTenantCurrent.findMany).mockResolvedValue([
      currentRow(),
      currentRow({
        customerRecordId: "cust_2",
        status: "AT_RISK",
        primaryLirPassed: false,
        currentMonthActivity: 3,
        activityTrendPct: -42,
        supportRisk: true,
        reasonCodes: [
          {
            code: "usage_collapse",
            label: "Current-month usage collapse",
            detail: "Recent activity is materially below baseline.",
            severity: "critical",
            dimension: "usage",
          },
        ],
        detailData: {
          coverage: {
            arda: true,
            coda: false,
            stripe: false,
            hubspot: true,
            pylon: true,
            missingSources: ["coda", "stripe"],
          },
        },
        customerRecord: { name: "Tenant Two" },
      }),
      currentRow({
        customerRecordId: "cust_3",
        status: "BILLING_RISK",
        primaryLirPassed: false,
        currentMonthActivity: 8,
        billingRisk: true,
        customerRecord: { name: "Tenant Three" },
      }),
      currentRow({
        customerRecordId: "cust_4",
        lifecyclePhase: "ONBOARDING",
        status: "ONBOARDING_RISK",
        primaryLirPassed: false,
        currentMonthActivity: 1,
        onboardingRisk: true,
        customerRecord: { name: "Tenant Four" },
      }),
    ] as never);
    vi.mocked(prisma.retentionSourceRecord.findMany).mockResolvedValue([
      { source: "ARDA", customerRecordId: "cust_1" },
      { source: "ARDA", customerRecordId: "cust_2" },
      { source: "CODA", customerRecordId: "cust_1" },
      { source: "PYLON", customerRecordId: "cust_2" },
    ] as never);
    vi.mocked(prisma.retentionSourceRecord.groupBy).mockResolvedValue([
      { objectType: "tenant", _count: { _all: 4 } },
      { objectType: "order", _count: { _all: 12 } },
      { objectType: "card", _count: { _all: 7 } },
      { objectType: "item", _count: { _all: 9 } },
    ] as never);
    vi.mocked(prisma.retentionSyncRun.findFirst).mockResolvedValue({
      status: "ERROR",
      startedAt: new Date("2026-03-15T00:00:00.000Z"),
      completedAt: null,
      recordCount: 28,
      mappedCount: 20,
      errorCount: 1,
      lastError: "Arda request failed",
    } as never);

    const dashboard = await buildCustomerHealthDashboard({ id: "user_1", organizationId: "org_1" });

    expect(dashboard.totals).toEqual({
      totalAccounts: 4,
      healthyAccounts: 1,
      watchAccounts: 0,
      atRiskAccounts: 1,
      onboardingRiskAccounts: 1,
      billingRiskAccounts: 1,
      lirPassingAccounts: 1,
      avgCurrentMonthActivity: 9,
    });
    expect(dashboard.ardaDataQuality).toEqual(
      expect.objectContaining({
        tenantRecords: 4,
        orderRecords: 12,
        cardRecords: 7,
        itemRecords: 9,
        activityRecords: 28,
        adoptionBreadthSource: "ARDA_ACTIVITY",
      }),
    );
    expect(dashboard.ardaDataQuality.latestSync?.status).toBe("ERROR");
    expect(dashboard.sourceCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "ARDA", tenantsCovered: 2, totalTenants: 4, coveragePct: 50 }),
        expect.objectContaining({ source: "CODA", tenantsCovered: 1, totalTenants: 4, coveragePct: 25 }),
      ]),
    );
    expect(dashboard.riskQueues.atRisk.map((account) => account.accountId)).toEqual(["cust_2"]);
    expect(dashboard.riskQueues.billingRisk.map((account) => account.accountId)).toEqual(["cust_3"]);
    expect(dashboard.riskQueues.onboardingRisk.map((account) => account.accountId)).toEqual(["cust_4"]);
    expect(dashboard.riskQueues.sharpDeclines.map((account) => account.accountId)).toEqual(["cust_2"]);
    expect(dashboard.accounts[0]).toEqual(
      expect.objectContaining({
        accountId: "cust_2",
        name: "Tenant Two",
        status: "At Risk",
        coverage: expect.objectContaining({ missingSources: ["coda", "stripe"] }),
      }),
    );
  });

  it("normalizes malformed account materialization timestamps to an empty timestamp", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { buildCustomerHealthDashboard } = await import("@/lib/retention/customer-health-dashboard");

    vi.mocked(prisma.retentionTenantCurrent.findMany).mockResolvedValue([
      currentRow({
        lastMaterializedAt: "not-a-date",
      }),
    ] as never);
    vi.mocked(prisma.retentionSourceRecord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.retentionSourceRecord.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.retentionSyncRun.findFirst).mockResolvedValue(null as never);

    const dashboard = await buildCustomerHealthDashboard({ id: "user_1", organizationId: "org_1" });

    expect(dashboard.accounts).toEqual([
      expect.objectContaining({
        accountId: "cust_1",
        lastMaterializedAt: "",
      }),
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    retentionTenantCurrent: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    retentionTenantMonth: {
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

describe("retention service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("dedupes tenant coverage per source when building retention summary", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { getRetentionSummary } = await import("@/lib/retention/service");

    vi.mocked(prisma.retentionTenantCurrent.findMany).mockResolvedValue([
      {
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
        customerRecord: {
          name: "Tenant One",
        },
      },
      {
        customerRecordId: "cust_2",
        lifecyclePhase: "MATURE",
        status: "WATCH",
        primaryLirPassed: false,
        primaryLirLabel: "Active weeks trailing 8",
        primaryLirValue: 3,
        primaryLirThreshold: 5,
        currentMonthActivity: 8,
        activityTrendPct: -20,
        supportRisk: false,
        billingRisk: false,
        onboardingRisk: false,
        icp: false,
        ownerName: "CS Owner",
        segment: "SMB",
        plan: "Starter",
        ageBucket: "90-179d",
        lastMaterializedAt: new Date("2026-03-15T00:00:00.000Z"),
        reasonCodes: [],
        customerRecord: {
          name: "Tenant Two",
        },
      },
    ] as never);

    vi.mocked(prisma.retentionTenantCurrent.count).mockResolvedValue(2 as never);
    vi.mocked(prisma.retentionTenantMonth.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.retentionSourceRecord.findMany)
      .mockResolvedValueOnce([
        { source: "ARDA", customerRecordId: "cust_1" },
        { source: "ARDA", customerRecordId: "cust_1" },
        { source: "ARDA", customerRecordId: "cust_2" },
        { source: "STRIPE", customerRecordId: "cust_1" },
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.retentionSourceRecord.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.retentionSyncRun.findFirst).mockResolvedValue(null as never);

    const summary = await getRetentionSummary(
      { id: "user_1", organizationId: "org_1" },
      {},
    );

    expect(summary.dataCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "ARDA",
          tenantsCovered: 2,
          totalTenants: 2,
          coveragePct: 100,
        }),
        expect.objectContaining({
          source: "STRIPE",
          tenantsCovered: 1,
          totalTenants: 2,
          coveragePct: 50,
        }),
      ]),
    );
  });
});

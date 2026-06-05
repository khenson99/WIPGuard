import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOwnerUserId: vi.fn((userId: string) => `owner-for-${userId}`),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsSnapshot: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/analytics/pnl-builder", () => ({
  buildProfitAndLoss: vi.fn(() => ({ items: [], netIncome: 0 })),
}));

vi.mock("@/lib/analytics/unit-economics", () => ({
  computeUnitEconomics: vi.fn(() => ({ ltv: 0, cac: 0 })),
}));

describe("GET /api/financial-planning/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the integration owner and normalizes legacy Mercury snapshots", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { buildProfitAndLoss } = await import("@/lib/analytics/pnl-builder");
    const { computeUnitEconomics } = await import("@/lib/analytics/unit-economics");
    const { GET } = await import("@/app/api/financial-planning/overview/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.analyticsSnapshot.findFirst)
      .mockResolvedValueOnce({
        payload: {
          revenue: {
            mrr: 12000,
            mrrChange: 0,
            totalRevenue30d: 14000,
            totalRevenuePrev30d: 13000,
            revenueGrowth: 0,
            avgRevenuePerCustomer: 700,
          },
          subscriptions: {
            active: 20,
            pastDue: 0,
            canceled: 0,
            trialing: 0,
            churnRate: 0,
            recentChurnEvents: [],
          },
          payments: {
            succeeded: 0,
            failed: 0,
            successRate: 100,
          },
          revenueTrend: [],
          _meta: {
            fetchedAt: "2026-03-15T00:00:00.000Z",
            nextRefresh: "2026-03-15T01:00:00.000Z",
            source: "snapshot",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        payload: {
          accounts: [],
          cashFlow: {
            totalBalance: 12000,
            inflows30d: 100,
            outflows30d: 1000,
            netCashFlow: -900,
            burnRate: 900,
            runway: 13.3,
            observedPeriodDays: 90,
          },
          _meta: {
            fetchedAt: "2026-03-15T00:00:00.000Z",
            nextRefresh: "2026-03-15T01:00:00.000Z",
            source: "snapshot",
          },
        },
      } as never)
      .mockResolvedValueOnce({
        payload: {
          funnel: {
            totalDeals: 0,
            closedWon: 2,
            closedLost: 0,
            unlikely: 0,
            churn: 0,
            activeSubscriptions: 20,
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
          _meta: {
            fetchedAt: "2026-03-15T00:00:00.000Z",
            nextRefresh: "2026-03-15T01:00:00.000Z",
            source: "snapshot",
          },
        },
      } as never);

    const response = await GET(new NextRequest("http://localhost/api/financial-planning/overview"));

    expect(response.status).toBe(200);
    expect(prisma.analyticsSnapshot.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner-for-user-1",
          providerKey: "stripe",
        }),
      }),
    );
    expect(prisma.analyticsSnapshot.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner-for-user-1",
          providerKey: "mercury",
        }),
      }),
    );
    expect(buildProfitAndLoss).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        cashFlow: expect.objectContaining({
          inflows30d: 33.33,
          outflows30d: 333.33,
          netCashFlow: -300,
          burnRate: 300,
          runway: 40,
          observedOutflowTotal: 1000,
        }),
      }),
      expect.objectContaining({ timeRange: "Last 30 days" }),
    );
    expect(computeUnitEconomics).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        cashFlow: expect.objectContaining({
          outflows30d: 333.33,
          observedOutflowTotal: 1000,
        }),
      }),
      expect.any(Object),
      expect.objectContaining({
        observedPeriodDays: 90,
      }),
    );
  });

  it("does not use future-dated provider snapshots for financial metrics", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { buildProfitAndLoss } = await import("@/lib/analytics/pnl-builder");
    const { computeUnitEconomics } = await import("@/lib/analytics/unit-economics");
    const { GET } = await import("@/app/api/financial-planning/overview/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.analyticsSnapshot.findFirst).mockImplementation((async (query: unknown) => {
      const where = (query as { where?: { providerKey?: string; capturedAt?: unknown } }).where;
      if (where?.providerKey === "stripe" && !where.capturedAt) {
        return {
          payload: {
            revenue: {
              mrr: 999_999,
              mrrChange: 0,
              totalRevenue30d: 999_999,
              totalRevenuePrev30d: 0,
              revenueGrowth: 0,
              avgRevenuePerCustomer: 0,
            },
            subscriptions: {
              active: 1,
              pastDue: 0,
              canceled: 0,
              trialing: 0,
              churnRate: 0,
              recentChurnEvents: [],
            },
            payments: {
              succeeded: 0,
              failed: 0,
              successRate: 100,
            },
            revenueTrend: [],
            _meta: {
              fetchedAt: "2026-03-16T00:00:00.000Z",
              nextRefresh: "2026-03-16T01:00:00.000Z",
              source: "snapshot",
            },
          },
        } as never;
      }
      return null;
    }) as never);

    const response = await GET(new NextRequest("http://localhost/api/financial-planning/overview"));

    expect(response.status).toBe(200);
    expect(prisma.analyticsSnapshot.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner-for-user-1",
          providerKey: "stripe",
          capturedAt: { lte: new Date("2026-03-15T12:00:00.000Z") },
        }),
      }),
    );
    expect(buildProfitAndLoss).toHaveBeenCalledWith(
      null,
      null,
      expect.objectContaining({ timeRange: "Last 30 days" }),
    );
    expect(computeUnitEconomics).toHaveBeenCalledWith(
      null,
      null,
      null,
      expect.objectContaining({ observedPeriodDays: 30 }),
    );
  });
});

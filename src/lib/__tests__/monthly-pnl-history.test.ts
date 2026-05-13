import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildMonthlyPnLHistory } from "@/lib/analytics/monthly-pnl-history";
import type { MercuryData, StripeData } from "@/lib/analytics/types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsSnapshot: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/ownership", () => ({
  resolveIntegrationOwnerUserId: vi.fn((userId: string) => `owner:${userId}`),
}));

const meta = {
  fetchedAt: "2025-01-31T23:59:59.999Z",
  nextRefresh: "2025-02-01T00:59:59.999Z",
  source: "cached" as const,
};

function makeStripe(revenue: number): StripeData {
  return {
    revenue: {
      mrr: revenue / 10,
      mrrChange: 0,
      totalRevenue30d: revenue,
      totalRevenuePrev30d: revenue,
      revenueGrowth: 0,
      avgRevenuePerCustomer: revenue / 100,
    },
    subscriptions: {
      active: 10,
      pastDue: 0,
      canceled: 0,
      trialing: 0,
      churnRate: 0,
      recentChurnEvents: [],
    },
    payments: {
      succeeded: 1,
      failed: 0,
      successRate: 100,
    },
    revenueTrend: [],
    _meta: meta,
  };
}

function makeMercury(balance: number, outflows: number): MercuryData {
  return {
    accounts: [],
    cashFlow: {
      totalBalance: balance,
      inflows30d: 0,
      outflows30d: outflows,
      netCashFlow: -outflows,
      runway: 1,
      burnRate: outflows,
    },
    _meta: meta,
  };
}

describe("buildMonthlyPnLHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-15T12:00:00.000Z"));
    vi.mocked(prisma.analyticsSnapshot.findMany).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads and exposes every reporting month starting January 2025", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "stripe",
        payload: makeStripe(10_000),
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        toDate: new Date("2025-01-31T23:59:59.999Z"),
        capturedAt: new Date("2025-03-15T00:00:00.000Z"),
      },
      {
        providerKey: "mercury",
        payload: makeMercury(50_000, 2_000),
        fromDate: new Date("2025-03-01T00:00:00.000Z"),
        toDate: new Date("2025-03-31T23:59:59.999Z"),
        capturedAt: new Date("2025-03-15T00:00:00.000Z"),
      },
    ] as never);

    const history = await buildMonthlyPnLHistory("user-1");

    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner:user-1",
          contextKey: "financial-planning",
          rangePreset: "monthly",
          fromDate: { gte: new Date("2025-01-01T00:00:00.000Z") },
        }),
      }),
    );
    expect(history.months.map((month) => month.month)).toEqual([
      "2025-01",
      "2025-02",
      "2025-03",
    ]);
    expect(history.months[0]?.revenue).toBe(10_000);
    expect(history.months[0]?.sourceCoverage).toEqual({
      stripe: true,
      mercury: false,
    });
    expect(history.months[1]?.revenue).toBe(0);
    expect(history.months[1]?.sourceCoverage).toEqual({
      stripe: false,
      mercury: false,
    });
    expect(history.months[2]?.cashBalance).toBe(50_000);
    expect(history.months[2]?.sourceCoverage).toEqual({
      stripe: false,
      mercury: true,
    });
  });
});

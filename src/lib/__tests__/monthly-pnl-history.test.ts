import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildMonthlyPnLHistory } from "@/lib/analytics/monthly-pnl-history";
import type { HubSpotData, MercuryData, StripeData } from "@/lib/analytics/types";

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

function makeStripe(revenue: number, overrides: Partial<StripeData> = {}): StripeData {
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
    ...overrides,
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

function makeHubSpot(subscriptionAmount: number): HubSpotData {
  return {
    funnel: {
      totalDeals: 1,
      closedWon: 0,
      closedLost: 0,
      unlikely: 0,
      churn: 0,
      activeSubscriptions: 1,
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
    subscriptionDeals: [
      {
        dealId: "hubspot-only-subscription",
        dealName: "HubSpot only subscription",
        stageId: "subscriptions",
        stageLabel: "Subscriptions",
        amount: subscriptionAmount,
        source: "Referral",
        ownerId: null,
        updatedAt: "2025-01-31T00:00:00.000Z",
        createdAt: "2025-01-01T00:00:00.000Z",
        closedAt: "2025-01-31T00:00:00.000Z",
        stripeCustomerId: null,
        pipelineId: "subscription-pipeline",
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: "buyer@example.com",
      },
    ],
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
      hubspot: false,
    });
    expect(history.months[1]?.revenue).toBe(0);
    expect(history.months[1]?.sourceCoverage).toEqual({
      stripe: false,
      mercury: false,
      hubspot: false,
    });
    expect(history.months[2]?.cashBalance).toBe(50_000);
    expect(history.months[2]?.sourceCoverage).toEqual({
      stripe: false,
      mercury: true,
      hubspot: false,
    });
  });

  it("ignores future-captured snapshots when selecting monthly history data", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "stripe",
        payload: makeStripe(99_999),
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        toDate: new Date("2025-01-31T23:59:59.999Z"),
        capturedAt: new Date("2025-03-16T00:00:00.000Z"),
      },
      {
        providerKey: "stripe",
        payload: makeStripe(10_000),
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        toDate: new Date("2025-01-31T23:59:59.999Z"),
        capturedAt: new Date("2025-03-15T00:00:00.000Z"),
      },
    ] as never);

    const history = await buildMonthlyPnLHistory("user-1");

    expect(history.months[0]?.revenue).toBe(10_000);
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          capturedAt: { lte: new Date("2025-03-15T12:00:00.000Z") },
        }),
      }),
    );
  });

  it("normalizes ratio-style Stripe churn in historical monthly entries", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "stripe",
        payload: makeStripe(10_000, {
          subscriptions: {
            active: 10,
            pastDue: 0,
            canceled: 0,
            trialing: 0,
            churnRate: 0.04,
            recentChurnEvents: [],
          },
        }),
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        toDate: new Date("2025-01-31T23:59:59.999Z"),
        capturedAt: new Date("2025-03-15T00:00:00.000Z"),
      },
    ] as never);

    const history = await buildMonthlyPnLHistory("user-1");

    expect(history.months[0]?.churnRate).toBe(4);
  });

  it("normalizes legacy Mercury observed-period snapshots in monthly history", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "mercury",
        payload: {
          ...makeMercury(120_000, 90_000),
          cashFlow: {
            ...makeMercury(120_000, 90_000).cashFlow,
            inflows30d: 0,
            netCashFlow: -90_000,
            burnRate: 90_000,
            runway: 1.3,
            observedPeriodDays: 90,
          },
        },
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        toDate: new Date("2025-01-31T23:59:59.999Z"),
        capturedAt: new Date("2025-03-15T00:00:00.000Z"),
      },
    ] as never);

    const history = await buildMonthlyPnLHistory("user-1");

    expect(history.months[0]?.cashBalance).toBe(120_000);
    expect(history.months[0]?.burnRate).toBe(30_000);
    expect(history.months[0]?.totalOpex).toBe(22_500);
  });

  it("uses canonical Stripe plus HubSpot subscription metrics in monthly history", async () => {
    vi.mocked(prisma.analyticsSnapshot.findMany).mockResolvedValue([
      {
        providerKey: "stripe",
        payload: makeStripe(10_000),
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        toDate: new Date("2025-01-31T23:59:59.999Z"),
        capturedAt: new Date("2025-03-15T00:00:00.000Z"),
      },
      {
        providerKey: "hubspot",
        payload: makeHubSpot(12_000),
        fromDate: new Date("2025-01-01T00:00:00.000Z"),
        toDate: new Date("2025-01-31T23:59:59.999Z"),
        capturedAt: new Date("2025-03-15T00:00:00.000Z"),
      },
    ] as never);

    const history = await buildMonthlyPnLHistory("user-1");

    expect(history.months[0]?.sourceCoverage).toEqual({
      stripe: true,
      mercury: false,
      hubspot: true,
    });
    expect(history.months[0]?.mrr).toBe(2000);
    expect(history.months[0]?.activeSubscriptions).toBe(11);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AnalyticsSnapshotStatus } from "@/generated/prisma/client";

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
    forecastScenario: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/analytics/forecast-engine", () => ({
  buildDefaultScenarios: vi.fn(() => [{ id: "default-base", name: "Base Case" }]),
  buildForecastScenario: vi.fn(() => ({ id: "scenario-1", name: "Saved Scenario" })),
}));

describe("GET /api/financial-planning/forecast", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads successful provider snapshots from the integration owner for forecasts", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const {
      buildDefaultScenarios,
      buildForecastScenario,
    } = await import("@/lib/analytics/forecast-engine");
    const { GET } = await import("@/app/api/financial-planning/forecast/route");

    const stripe = { revenue: { mrr: 12_000 }, subscriptions: { churnRate: 0 } };
    const mercury = { cashFlow: { totalBalance: 120_000, outflows30d: 40_000, burnRate: 28_000 } };
    const hubspot = { subscriptionDeals: [{ dealId: "hs-1", amount: 6_000 }] };
    const assumptions = {
      revenueGrowthRate: 0,
      churnRateDelta: 0,
      burnRateDelta: 0,
      additionalMonthlyExpense: 0,
      additionalMonthlyRevenue: 0,
    };

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.analyticsSnapshot.findFirst)
      .mockResolvedValueOnce({ payload: stripe } as never)
      .mockResolvedValueOnce({ payload: mercury } as never)
      .mockResolvedValueOnce({ payload: hubspot } as never);
    vi.mocked(prisma.forecastScenario.findMany).mockResolvedValue([
      { id: "scenario-1", name: "Saved Scenario", assumptions },
    ] as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.analyticsSnapshot.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner-for-user-1",
          providerKey: "stripe",
          status: AnalyticsSnapshotStatus.SUCCESS,
        }),
      }),
    );
    expect(prisma.analyticsSnapshot.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner-for-user-1",
          providerKey: "mercury",
          status: AnalyticsSnapshotStatus.SUCCESS,
        }),
      }),
    );
    expect(prisma.analyticsSnapshot.findFirst).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner-for-user-1",
          providerKey: "hubspot",
          status: AnalyticsSnapshotStatus.SUCCESS,
        }),
      }),
    );
    expect(prisma.forecastScenario.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(buildDefaultScenarios).toHaveBeenCalledWith(stripe, mercury, 18, hubspot);
    expect(buildForecastScenario).toHaveBeenCalledWith(
      stripe,
      mercury,
      assumptions,
      { id: "scenario-1", name: "Saved Scenario", hubspot },
    );
    expect(body).toEqual({
      defaults: [{ id: "default-base", name: "Base Case" }],
      custom: [{ id: "scenario-1", name: "Saved Scenario" }],
    });
  });

  it("normalizes legacy Mercury observed-period snapshots before forecasting", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { buildDefaultScenarios } = await import("@/lib/analytics/forecast-engine");
    const { GET } = await import("@/app/api/financial-planning/forecast/route");

    const stripe = { revenue: { mrr: 12_000 }, subscriptions: { churnRate: 0 } };
    const mercury = {
      cashFlow: {
        totalBalance: 120_000,
        inflows30d: 0,
        outflows30d: 90_000,
        netCashFlow: -90_000,
        burnRate: 90_000,
        runway: 1.3,
        observedPeriodDays: 90,
      },
    };

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.analyticsSnapshot.findFirst)
      .mockResolvedValueOnce({ payload: stripe } as never)
      .mockResolvedValueOnce({ payload: mercury } as never)
      .mockResolvedValueOnce({ payload: null } as never);
    vi.mocked(prisma.forecastScenario.findMany).mockResolvedValue([] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(buildDefaultScenarios).toHaveBeenCalledWith(
      stripe,
      expect.objectContaining({
        cashFlow: expect.objectContaining({
          outflows30d: 30_000,
          burnRate: 30_000,
          runway: 4,
          observedPeriodDays: 90,
          observedOutflowTotal: 90_000,
        }),
      }),
      18,
      null,
    );
  });

  it("does not use future-dated provider snapshots for forecast inputs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { buildDefaultScenarios } = await import("@/lib/analytics/forecast-engine");
    const { GET } = await import("@/app/api/financial-planning/forecast/route");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.forecastScenario.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.analyticsSnapshot.findFirst).mockImplementation((async (query: unknown) => {
      const where = (query as { where?: { providerKey?: string; capturedAt?: unknown } }).where;
      if (where?.providerKey === "stripe" && !where.capturedAt) {
        return {
          payload: {
            revenue: { mrr: 999_999 },
            subscriptions: { churnRate: 0 },
          },
        } as never;
      }
      return null;
    }) as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(prisma.analyticsSnapshot.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner-for-user-1",
          providerKey: "stripe",
          status: AnalyticsSnapshotStatus.SUCCESS,
          capturedAt: { lte: new Date("2026-03-15T12:00:00.000Z") },
        }),
      }),
    );
    expect(buildDefaultScenarios).toHaveBeenCalledWith(null, null, 18, null);
  });
});

describe("POST /api/financial-planning/forecast", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("saves scenarios for the signed-in user but computes from integration-owner snapshots", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");
    const { buildForecastScenario } = await import("@/lib/analytics/forecast-engine");
    const { POST } = await import("@/app/api/financial-planning/forecast/route");

    const assumptions = {
      revenueGrowthRate: 5,
      churnRateDelta: -1,
      burnRateDelta: 0,
      additionalMonthlyExpense: 0,
      additionalMonthlyRevenue: 1000,
    };
    const stripe = { revenue: { mrr: 12_000 }, subscriptions: { churnRate: 0 } };
    const mercury = { cashFlow: { totalBalance: 120_000, outflows30d: 40_000, burnRate: 28_000 } };
    const hubspot = { subscriptionDeals: [{ dealId: "hs-1", amount: 6_000 }] };

    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(prisma.forecastScenario.create).mockResolvedValue({
      id: "scenario-2",
      name: "Expansion Plan",
      assumptions,
    } as never);
    vi.mocked(prisma.analyticsSnapshot.findFirst)
      .mockResolvedValueOnce({ payload: stripe } as never)
      .mockResolvedValueOnce({ payload: mercury } as never)
      .mockResolvedValueOnce({ payload: hubspot } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/financial-planning/forecast", {
        method: "POST",
        body: JSON.stringify({ name: "Expansion Plan", assumptions }),
      }),
    );

    expect(response.status).toBe(201);
    expect(prisma.forecastScenario.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Expansion Plan",
        assumptions,
      },
    });
    expect(prisma.analyticsSnapshot.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner-for-user-1",
          providerKey: "stripe",
          status: AnalyticsSnapshotStatus.SUCCESS,
        }),
      }),
    );
    expect(buildForecastScenario).toHaveBeenCalledWith(
      stripe,
      mercury,
      assumptions,
      { id: "scenario-2", name: "Expansion Plan", hubspot },
    );
  });
});

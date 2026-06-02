import { describe, expect, it } from "vitest";
import {
  projectRevenue,
  projectRunway,
  buildForecastScenario,
  buildDefaultScenarios,
} from "@/lib/analytics/forecast-engine";
import type { StripeData, MercuryData, ForecastAssumptions, HubSpotData } from "@/lib/analytics/types";

const META = { fetchedAt: "2026-01-15T00:00:00Z", nextRefresh: "2026-01-15T01:00:00Z", source: "live" as const };

function makeStripe(overrides: Partial<StripeData> = {}): StripeData {
  return {
    revenue: {
      mrr: 10_000,
      mrrChange: 1200,
      totalRevenue30d: 12_000,
      totalRevenuePrev30d: 10_800,
      revenueGrowth: 10,
      avgRevenuePerCustomer: 200,
    },
    subscriptions: {
      active: 50,
      pastDue: 2,
      canceled: 3,
      trialing: 5,
      churnRate: 4,
      recentChurnEvents: [],
    },
    payments: {
      succeeded: 48,
      failed: 2,
      successRate: 96,
    },
    revenueTrend: [],
    _meta: META,
    ...overrides,
  };
}

function makeMercury(overrides: Partial<MercuryData> = {}): MercuryData {
  return {
    accounts: [{ accountId: "a1", accountName: "Operating", balance: 500_000, type: "checking" }],
    cashFlow: {
      totalBalance: 500_000,
      inflows30d: 12_000,
      outflows30d: 45_000,
      netCashFlow: -33_000,
      runway: 15,
      burnRate: 45_000,
    },
    _meta: META,
    ...overrides,
  };
}

function makeHubSpot(overrides: Partial<HubSpotData> = {}): HubSpotData {
  return {
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
    contacts: { totalContacts: 0, recentContacts: 0, bySource: [] },
    _meta: META,
    ...overrides,
  };
}

function subscriptionDeal(amount: number): NonNullable<HubSpotData["subscriptionDeals"]>[number] {
  return {
    dealId: `sub-${amount}`,
    dealName: `Subscription ${amount}`,
    stageId: "subscriptions",
    stageLabel: "Subscriptions",
    amount,
    source: "Referral",
    ownerId: null,
    updatedAt: "2026-01-10T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    closedAt: "2026-01-10T00:00:00Z",
    stripeCustomerId: null,
    pipelineId: "subscription-pipeline",
    contactIds: [],
    primaryContactId: null,
    primaryContactEmail: "buyer@example.com",
  };
}

const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  revenueGrowthRate: 0,
  churnRateDelta: 0,
  burnRateDelta: 0,
  additionalMonthlyExpense: 0,
  additionalMonthlyRevenue: 0,
};

describe("projectRevenue", () => {
  it("returns one entry per month with YYYY-MM labels", () => {
    const result = projectRevenue(10_000, 0.1, 0.04, 50_000, 5_000, 12);
    expect(result).toHaveLength(12);
    expect(result[0].month).toMatch(/\d{4}-\d{2}/);
  });

  it("compounds correctly and updates cash", () => {
    const result = projectRevenue(10_000, 0.1, 0.04, 50_000, 5_000, 2);
    expect(result[0].projectedMrr).toBeCloseTo(10_560, 2);
    expect(result[1].projectedMrr).toBeCloseTo(11_151.36, 2);
    expect(result[0].projectedCashBalance).toBeCloseTo(55_560, 2);
  });

  it("handles negative growth", () => {
    const result = projectRevenue(10_000, -0.05, 0.02, 20_000, 8_000, 2);
    expect(result[0].projectedMrr).toBeLessThan(10_000);
    expect(result[1].projectedMrr).toBeLessThan(result[0].projectedMrr);
  });
});

describe("projectRunway", () => {
  it("returns null when effective burn is non-positive", () => {
    expect(projectRunway(100_000, 0, 0)).toBeNull();
    expect(projectRunway(100_000, -5_000, 0)).toBeNull();
  });

  it("returns 0 when cash is empty and burn is positive", () => {
    expect(projectRunway(0, 10_000, 0)).toBe(0);
  });

  it("returns a positive runway for positive burn", () => {
    const runway = projectRunway(120_000, 20_000, 0);
    expect(runway).toBeCloseTo(6, 1);
  });
});

describe("buildForecastScenario", () => {
  it("builds scenario using assumptions and keeps added revenue out of expenses", () => {
    const stripe = makeStripe();
    const mercury = makeMercury();
    const assumptions: ForecastAssumptions = {
      revenueGrowthRate: 5,
      churnRateDelta: 1,
      burnRateDelta: 2_000,
      additionalMonthlyExpense: 1_000,
      additionalMonthlyRevenue: 3_000,
    };

    const scenario = buildForecastScenario(stripe, mercury, assumptions, { months: 2 });
    expect(scenario.assumptions).toEqual(assumptions);
    expect(scenario.months).toHaveLength(2);

    const monthlyExpenses = 45_000 + 2_000 + 1_000;
    expect(scenario.months[0].projectedExpenses).toBeCloseTo(monthlyExpenses, 2);
    expect(scenario.months[0].projectedRevenue).toBeGreaterThan(10_000);
  });

  it("normalizes ratio-style churn values before projecting scenario revenue", () => {
    const stripe = makeStripe({
      subscriptions: {
        active: 50,
        pastDue: 2,
        canceled: 3,
        trialing: 5,
        churnRate: 0.04,
        recentChurnEvents: [],
      },
    });

    const scenario = buildForecastScenario(stripe, makeMercury(), DEFAULT_ASSUMPTIONS, { months: 1 });

    expect(scenario.months[0].projectedMrr).toBeCloseTo(10_560, 2);
  });

  it("normalizes ratio-style revenue growth values before projecting scenario revenue", () => {
    const stripe = makeStripe({
      revenue: {
        mrr: 10_000,
        mrrChange: 1200,
        totalRevenue30d: 12_000,
        totalRevenuePrev30d: 10_800,
        revenueGrowth: 0.10,
        avgRevenuePerCustomer: 200,
      },
    });

    const scenario = buildForecastScenario(stripe, makeMercury(), DEFAULT_ASSUMPTIONS, { months: 1 });

    expect(scenario.months[0].projectedMrr).toBeCloseTo(10_560, 2);
  });

  it("uses canonical MRR including HubSpot-only annual subscriptions", () => {
    const hubspot = makeHubSpot({
      subscriptionDeals: [subscriptionDeal(12_000)],
    });

    const scenario = buildForecastScenario(
      makeStripe(),
      makeMercury(),
      DEFAULT_ASSUMPTIONS,
      { months: 1, hubspot },
    );

    expect(scenario.months[0].projectedMrr).toBeCloseTo(11_616, 2);
  });

  it("handles null stripe or mercury", () => {
    const scenario = buildForecastScenario(null, null, DEFAULT_ASSUMPTIONS, { months: 1 });
    expect(scenario.months).toHaveLength(1);
    expect(scenario.months[0].projectedMrr).toBe(0);
  });
});

describe("buildDefaultScenarios", () => {
  it("returns three scenarios with expected names", () => {
    const scenarios = buildDefaultScenarios(makeStripe(), makeMercury());
    expect(scenarios).toHaveLength(3);
    expect(scenarios.map((s) => s.name)).toEqual([
      "Base Case",
      "Optimistic",
      "Conservative",
    ]);
  });

  it("uses different assumption profiles", () => {
    const scenarios = buildDefaultScenarios(makeStripe(), makeMercury());
    const [base, optimistic, conservative] = scenarios;
    expect(base.assumptions.revenueGrowthRate).toBe(0);
    expect(optimistic.assumptions.revenueGrowthRate).toBeCloseTo(5, 5);
    expect(conservative.assumptions.revenueGrowthRate).toBeCloseTo(-3, 5);
  });

  it("scales default growth and churn assumptions from current rates", () => {
    const scenarios = buildDefaultScenarios(makeStripe(), makeMercury(), 1);
    const [base, optimistic, conservative] = scenarios;

    expect(base.months[0].projectedMrr).toBeCloseTo(10_560, 2);
    expect(optimistic.assumptions.revenueGrowthRate).toBeCloseTo(5, 5);
    expect(optimistic.assumptions.churnRateDelta).toBeCloseTo(-0.8, 5);
    expect(optimistic.months[0].projectedMrr).toBeCloseTo(11_132, 2);
    expect(conservative.assumptions.revenueGrowthRate).toBeCloseTo(-3, 5);
    expect(conservative.assumptions.churnRateDelta).toBeCloseTo(1, 5);
    expect(conservative.months[0].projectedMrr).toBeCloseTo(10_165, 2);
  });

  it("builds defaults from canonical MRR when HubSpot-only subscriptions exist", () => {
    const scenarios = buildDefaultScenarios(
      makeStripe(),
      makeMercury(),
      1,
      makeHubSpot({ subscriptionDeals: [subscriptionDeal(12_000)] }),
    );

    expect(scenarios[0].months[0].projectedMrr).toBeCloseTo(11_616, 2);
  });
});

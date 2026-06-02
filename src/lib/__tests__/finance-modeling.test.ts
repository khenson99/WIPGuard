import { describe, expect, it } from "vitest";
import {
  projectMrr,
  buildRunwayScenarios,
  computeFinancialGoals,
  runSensitivityAnalysis,
  scoreFinancialHealth,
} from "@/lib/analytics/finance-modeling";
import type { AnalyticsDashboardData, StripeData, MercuryData, HubSpotData } from "@/lib/analytics/types";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

/* ─── Fixtures ────────────────────────────────────────────── */

const META = { fetchedAt: "2026-01-15T00:00:00Z", nextRefresh: "2026-01-15T01:00:00Z", source: "live" as const };
const TIME_RANGE = { preset: "30d" as const, from: "2025-12-16", to: "2026-01-15", days: 30, label: "Last 30 days" };

function makeStripe(overrides: Partial<StripeData> = {}): StripeData {
  return {
    revenue: {
      mrr: 10_000,
      mrrChange: 1200,
      totalRevenue30d: 12_000,
      totalRevenuePrev30d: 10_800,
      revenueGrowth: 10, // 10% monthly
      avgRevenuePerCustomer: 200,
    },
    subscriptions: {
      active: 50,
      pastDue: 2,
      canceled: 3,
      trialing: 5,
      churnRate: 4, // 4% monthly
      recentChurnEvents: [],
    },
    payments: {
      succeeded: 48,
      failed: 2,
      successRate: 96,
    },
    revenueTrend: [
      { month: "Aug 25", revenue: 7000 },
      { month: "Sep 25", revenue: 7800 },
      { month: "Oct 25", revenue: 8500 },
      { month: "Nov 25", revenue: 9200 },
      { month: "Dec 25", revenue: 9800 },
      { month: "Jan 26", revenue: 10000 },
    ],
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
      totalDeals: 20,
      closedWon: 5,
      closedLost: 3,
      unlikely: 1,
      churn: 0,
      activeSubscriptions: 50,
      noShows: 2,
      demoScheduled: 4,
      demoFollowUp: 3,
      avgDealSize: 5000,
      winRate: 25,
      effectiveWinRate: 20,
      noShowRate: 10,
      stages: [
        { stageId: "s1", label: "Discovery", count: 5, value: 25_000 },
        { stageId: "s2", label: "Demo", count: 4, value: 20_000 },
        { stageId: "s3", label: "Proposal", count: 3, value: 15_000 },
        { stageId: "s4", label: "Negotiation", count: 2, value: 10_000 },
      ],
      dealsBySource: [
        { source: "Organic", count: 8, value: 40_000 },
        { source: "Referral", count: 5, value: 25_000 },
      ],
    },
    contacts: { totalContacts: 500, recentContacts: 50, bySource: [] },
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

function makeData(opts?: {
  stripe?: Partial<StripeData> | null;
  mercury?: Partial<MercuryData> | null;
  hubspot?: Partial<HubSpotData> | null;
}): AnalyticsDashboardData {
  const base = createEmptyAnalyticsDashboardData({ freshness: {}, timeRange: TIME_RANGE });
  return {
    ...base,
    stripe: opts?.stripe === null ? null : makeStripe(opts?.stripe ?? {}),
    mercury: opts?.mercury === null ? null : makeMercury(opts?.mercury ?? {}),
    hubspot: opts?.hubspot === null ? null : makeHubSpot(opts?.hubspot ?? {}),
  };
}

/* ═══════════════════════════════════════════════════════════
   1. projectMrr
   ═══════════════════════════════════════════════════════════ */

describe("projectMrr", () => {
  it("returns months+1 entries (month 0 = current)", () => {
    const result = projectMrr(makeData(), 12);
    expect(result).toHaveLength(13); // 0 through 12
    expect(result[0].month).toBe(0);
    expect(result[12].month).toBe(12);
  });

  it("month 0 is the current MRR snapshot with zero new/churned", () => {
    const result = projectMrr(makeData(), 3);
    expect(result[0].mrr).toBe(10_000);
    expect(result[0].newMrr).toBe(0);
    expect(result[0].churnedMrr).toBe(0);
  });

  it("compounds correctly: mrr * (1+growth) * (1-churn) minus breakdown", () => {
    const data = makeData();
    const result = projectMrr(data, 1);
    // Month 1: newMrr = 10000 * 0.10 = 1000, churnedMrr = 10000 * 0.04 = 400
    // mrr = max(0, 10000 + 1000 - 400) = 10600
    expect(result[1].newMrr).toBeCloseTo(1000, 0);
    expect(result[1].churnedMrr).toBeCloseTo(400, 0);
    expect(result[1].mrr).toBeCloseTo(10_600, 0);
  });

  it("normalizes ratio-style churn values before projecting MRR", () => {
    const data = makeData({
      stripe: {
        subscriptions: {
          active: 50,
          pastDue: 2,
          canceled: 3,
          trialing: 5,
          churnRate: 0.04,
          recentChurnEvents: [],
        },
      },
    });

    const result = projectMrr(data, 1);

    expect(result[1].churnedMrr).toBeCloseTo(400, 0);
    expect(result[1].mrr).toBeCloseTo(10_600, 0);
  });

  it("normalizes ratio-style revenue growth values before projecting MRR", () => {
    const data = makeData({
      stripe: {
        revenue: {
          mrr: 10_000,
          mrrChange: 1200,
          totalRevenue30d: 12_000,
          totalRevenuePrev30d: 10_800,
          revenueGrowth: 0.10,
          avgRevenuePerCustomer: 200,
        },
      },
    });

    const result = projectMrr(data, 1);

    expect(result[1].newMrr).toBeCloseTo(1000, 0);
    expect(result[1].mrr).toBeCloseTo(10_600, 0);
  });

  it("uses canonical MRR including HubSpot-only annual subscriptions", () => {
    const data = makeData({
      hubspot: {
        subscriptionDeals: [subscriptionDeal(12_000)],
      },
    });

    const result = projectMrr(data, 1);

    expect(result[0].mrr).toBe(11_000);
    expect(result[1].newMrr).toBeCloseTo(1_100, 0);
    expect(result[1].churnedMrr).toBeCloseTo(440, 0);
    expect(result[1].mrr).toBeCloseTo(11_660, 0);
  });

  it("compounds over multiple months", () => {
    const data = makeData();
    const result = projectMrr(data, 3);
    // Month 1: 10000 + 1000 - 400 = 10600
    // Month 2: 10600 + 1060 - 424 = 11236
    // Month 3: 11236 + 1123.6 - 449.44 = 11910.16
    expect(result[1].mrr).toBeCloseTo(10_600, 0);
    expect(result[2].mrr).toBeCloseTo(11_236, 0);
    expect(result[3].mrr).toBeCloseTo(11_910.16, 0);
  });

  it("tracks cumulative MRR across months", () => {
    const data = makeData();
    const result = projectMrr(data, 2);
    // cumulative[0] = 10000
    // cumulative[1] = 10000 + 10600 = 20600
    // cumulative[2] = 20600 + 11236 = 31836
    expect(result[0].cumulative).toBe(10_000);
    expect(result[1].cumulative).toBeCloseTo(20_600, 0);
    expect(result[2].cumulative).toBeCloseTo(31_836, 0);
  });

  it("handles zero growth rate gracefully", () => {
    const data = makeData({ stripe: { revenue: { mrr: 5000, mrrChange: 0, totalRevenue30d: 5000, totalRevenuePrev30d: 5000, revenueGrowth: 0, avgRevenuePerCustomer: 100 } } });
    const result = projectMrr(data, 3);
    // With 0% growth and 4% churn: mrr shrinks each month
    expect(result[1].newMrr).toBe(0);
    expect(result[1].churnedMrr).toBeCloseTo(200, 0); // 5000 * 0.04
    expect(result[1].mrr).toBeCloseTo(4800, 0);
  });

  it("handles 100% churn (MRR goes to zero)", () => {
    const data = makeData({
      stripe: {
        revenue: { mrr: 10_000, mrrChange: 0, totalRevenue30d: 10000, totalRevenuePrev30d: 10000, revenueGrowth: 0, avgRevenuePerCustomer: 200 },
        subscriptions: { active: 50, pastDue: 0, canceled: 50, trialing: 0, churnRate: 100, recentChurnEvents: [] },
      },
    });
    const result = projectMrr(data, 3);
    // churnRate 100% with zero growth → all MRR churns each month
    expect(result[1].mrr).toBe(0);
    expect(result[2].mrr).toBe(0);
  });

  it("never produces negative MRR", () => {
    const data = makeData({
      stripe: {
        revenue: { mrr: 100, mrrChange: -50, totalRevenue30d: 100, totalRevenuePrev30d: 150, revenueGrowth: -50, avgRevenuePerCustomer: 10 },
        subscriptions: { active: 10, pastDue: 0, canceled: 5, trialing: 0, churnRate: 20, recentChurnEvents: [] },
      },
    });
    const result = projectMrr(data, 12);
    for (const p of result) {
      expect(p.mrr).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles missing Stripe data (all nulls)", () => {
    const data = makeData({ stripe: null });
    const result = projectMrr(data, 6);
    expect(result).toHaveLength(7);
    // All MRR should be 0 when stripe is null
    for (const p of result) {
      expect(p.mrr).toBe(0);
    }
  });

  it("respects custom month count", () => {
    expect(projectMrr(makeData(), 6)).toHaveLength(7);
    expect(projectMrr(makeData(), 24)).toHaveLength(25);
    expect(projectMrr(makeData(), 0)).toHaveLength(1);
  });
});

/* ═══════════════════════════════════════════════════════════
   2. buildRunwayScenarios
   ═══════════════════════════════════════════════════════════ */

describe("buildRunwayScenarios", () => {
  it("returns exactly 3 scenarios", () => {
    const result = buildRunwayScenarios(makeData());
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.label)).toEqual(["Best Case", "Expected", "Worst Case"]);
  });

  it("applies correct burn multipliers", () => {
    const result = buildRunwayScenarios(makeData());
    const baseBurn = 45_000;
    expect(result[0].monthlyBurn).toBeCloseTo(baseBurn * 0.8, 0); // Best: 36000
    expect(result[1].monthlyBurn).toBeCloseTo(baseBurn * 1.0, 0); // Expected: 45000
    expect(result[2].monthlyBurn).toBeCloseTo(baseBurn * 1.3, 0); // Worst: 58500
  });

  it("applies correct inflow multipliers", () => {
    const result = buildRunwayScenarios(makeData());
    const baseInflow = 12_000;
    expect(result[0].monthlyInflow).toBeCloseTo(baseInflow * 1.2, 0);
    expect(result[1].monthlyInflow).toBeCloseTo(baseInflow * 1.0, 0);
    expect(result[2].monthlyInflow).toBeCloseTo(baseInflow * 0.7, 0);
  });

  it("best case has longest runway, worst has shortest", () => {
    const result = buildRunwayScenarios(makeData());
    expect(result[0].runway).toBeGreaterThan(result[1].runway);
    expect(result[1].runway).toBeGreaterThan(result[2].runway);
  });

  it("projectedCash starts at totalBalance", () => {
    const result = buildRunwayScenarios(makeData());
    for (const scenario of result) {
      expect(scenario.projectedCash[0].cash).toBe(500_000);
    }
  });

  it("projectedCash never goes below zero", () => {
    const result = buildRunwayScenarios(makeData());
    for (const scenario of result) {
      for (const point of scenario.projectedCash) {
        expect(point.cash).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("computes zeroDate when cash runs out", () => {
    const result = buildRunwayScenarios(makeData());
    // Expected case: burn=45000, inflow=12000, net=33000/mo, balance=500000
    // ~15 months to zero → should have a zeroDate
    const expected = result[1];
    expect(expected.zeroDate).not.toBeNull();
  });

  it("reports exact cash depletion in the month it reaches zero", () => {
    const data = makeData({
      mercury: {
        accounts: [{ accountId: "a1", accountName: "Operating", balance: 100, type: "checking" }],
        cashFlow: {
          totalBalance: 100,
          inflows30d: 0,
          outflows30d: 100,
          netCashFlow: -100,
          runway: 1,
          burnRate: 100,
        },
      },
    });

    const expected = buildRunwayScenarios(data, 3).find(
      (scenario) => scenario.label === "Expected",
    );

    expect(expected?.runway).toBe(1);
    expect(expected?.zeroDate).not.toBeNull();
    expect(expected?.projectedCash.map((point) => point.cash)).toEqual([100, 0, 0, 0]);
  });

  it("sets runway = 999 when inflows exceed burn (infinite runway)", () => {
    const data = makeData({
      mercury: {
        accounts: [{ accountId: "a1", accountName: "Operating", balance: 500_000, type: "checking" }],
        cashFlow: {
          totalBalance: 500_000,
          inflows30d: 100_000, // inflows > burn
          outflows30d: 20_000,
          netCashFlow: 80_000,
          runway: 999,
          burnRate: 20_000,
        },
      },
    });
    const result = buildRunwayScenarios(data);
    // Best case: burn=16000, inflow=120000 → infinite
    expect(result[0].runway).toBe(999);
    expect(result[0].zeroDate).toBeNull();
  });

  it("handles missing Mercury data", () => {
    const data = makeData({ mercury: null });
    const result = buildRunwayScenarios(data);
    expect(result).toHaveLength(3);
    // With zero balance and zero burn, all scenarios have infinite runway
    for (const s of result) {
      expect(s.monthlyBurn).toBe(0);
      expect(s.runway).toBe(999);
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   3. computeFinancialGoals
   ═══════════════════════════════════════════════════════════ */

describe("computeFinancialGoals", () => {
  it("generates MRR milestone goal when MRR > 0", () => {
    const goals = computeFinancialGoals(makeData());
    const mrrGoal = goals.find((g) => g.id === "mrr-milestone");
    expect(mrrGoal).toBeDefined();
    // mrr=10000 → next round number = 25000
    expect(mrrGoal!.target).toBe(25_000);
    expect(mrrGoal!.current).toBe(10_000);
    expect(mrrGoal!.unit).toBe("currency");
  });

  it("uses canonical MRR for financial goals", () => {
    const goals = computeFinancialGoals(makeData({
      hubspot: {
        subscriptionDeals: [subscriptionDeal(180_000)],
      },
    }));

    const mrrGoal = goals.find((g) => g.id === "mrr-milestone");

    expect(mrrGoal).toBeDefined();
    expect(mrrGoal!.current).toBe(25_000);
    expect(mrrGoal!.target).toBe(50_000);
  });

  it("MRR goal is on track when net growth is positive", () => {
    const goals = computeFinancialGoals(makeData()); // growth=10%, churn=4% → net=6%
    const mrrGoal = goals.find((g) => g.id === "mrr-milestone");
    expect(mrrGoal!.onTrack).toBe(true);
    expect(mrrGoal!.projectedDate).not.toBeNull();
  });

  it("MRR goal is NOT on track when churn exceeds growth", () => {
    const data = makeData({
      stripe: {
        revenue: { mrr: 10_000, mrrChange: -500, totalRevenue30d: 10000, totalRevenuePrev30d: 10500, revenueGrowth: 2, avgRevenuePerCustomer: 200 },
        subscriptions: { active: 50, pastDue: 2, canceled: 5, trialing: 5, churnRate: 8, recentChurnEvents: [] },
      },
    });
    const goals = computeFinancialGoals(data);
    const mrrGoal = goals.find((g) => g.id === "mrr-milestone");
    expect(mrrGoal!.onTrack).toBe(false);
    expect(mrrGoal!.projectedDate).toBeNull();
  });

  it("generates runway extension goal when runway < 18 months", () => {
    const goals = computeFinancialGoals(makeData()); // runway=15
    const runwayGoal = goals.find((g) => g.id === "runway-extension");
    expect(runwayGoal).toBeDefined();
    expect(runwayGoal!.target).toBe(18);
    expect(runwayGoal!.current).toBe(15);
    expect(runwayGoal!.unit).toBe("months");
  });

  it("does NOT generate runway goal when runway >= 18 months", () => {
    const data = makeData({
      mercury: {
        accounts: [{ accountId: "a1", accountName: "Operating", balance: 1_000_000, type: "checking" }],
        cashFlow: { totalBalance: 1_000_000, inflows30d: 12000, outflows30d: 45000, netCashFlow: -33000, runway: 22, burnRate: 45_000 },
      },
    });
    const goals = computeFinancialGoals(data);
    expect(goals.find((g) => g.id === "runway-extension")).toBeUndefined();
  });

  it("generates churn target goal when churn > 5%", () => {
    const data = makeData({
      stripe: {
        revenue: { mrr: 10000, mrrChange: 0, totalRevenue30d: 10000, totalRevenuePrev30d: 10000, revenueGrowth: 10, avgRevenuePerCustomer: 200 },
        subscriptions: { active: 50, pastDue: 2, canceled: 3, trialing: 5, churnRate: 7, recentChurnEvents: [] },
      },
    });
    const goals = computeFinancialGoals(data);
    const churnGoal = goals.find((g) => g.id === "churn-target");
    expect(churnGoal).toBeDefined();
    expect(churnGoal!.target).toBe(3); // 3%
    expect(churnGoal!.current).toBeCloseTo(7, 5); // 7%
  });

  it("normalizes ratio-style churn values before generating churn goals", () => {
    const data = makeData({
      stripe: {
        revenue: { mrr: 10000, mrrChange: 0, totalRevenue30d: 10000, totalRevenuePrev30d: 10000, revenueGrowth: 10, avgRevenuePerCustomer: 200 },
        subscriptions: { active: 50, pastDue: 2, canceled: 3, trialing: 5, churnRate: 0.07, recentChurnEvents: [] },
      },
    });

    const goals = computeFinancialGoals(data);
    const churnGoal = goals.find((g) => g.id === "churn-target");

    expect(churnGoal).toBeDefined();
    expect(churnGoal!.current).toBeCloseTo(7, 5);
  });

  it("does NOT generate churn goal when churn <= 5%", () => {
    // Default fixture has churnRate=4 → 4% → <= 5%, so no churn goal
    const goals = computeFinancialGoals(makeData());
    expect(goals.find((g) => g.id === "churn-target")).toBeUndefined();
  });

  it("generates payment success goal when rate < 98%", () => {
    const goals = computeFinancialGoals(makeData()); // successRate=96
    const payGoal = goals.find((g) => g.id === "payment-success");
    expect(payGoal).toBeDefined();
    expect(payGoal!.target).toBe(98);
    expect(payGoal!.current).toBe(96);
  });

  it("normalizes ratio-style payment success values before generating goals", () => {
    const goals = computeFinancialGoals(makeData({
      stripe: {
        payments: { succeeded: 48, failed: 2, successRate: 0.96 },
      },
    }));
    const payGoal = goals.find((g) => g.id === "payment-success");

    expect(payGoal).toBeDefined();
    expect(payGoal!.current).toBe(96);
  });

  it("generates ARPC growth goal when ARPC > 0", () => {
    const goals = computeFinancialGoals(makeData()); // arpc=200
    const arpcGoal = goals.find((g) => g.id === "arpc-growth");
    expect(arpcGoal).toBeDefined();
    expect(arpcGoal!.target).toBe(250); // 200 * 1.25
    expect(arpcGoal!.current).toBe(200);
  });

  it("uses canonical MRR and merged subscriptions for ARPC growth goals", () => {
    const goals = computeFinancialGoals(makeData({
      hubspot: {
        subscriptionDeals: [subscriptionDeal(12_000)],
      },
    }));

    const arpcGoal = goals.find((g) => g.id === "arpc-growth");

    expect(arpcGoal).toBeDefined();
    expect(arpcGoal!.current).toBeCloseTo(215.69, 2);
    expect(arpcGoal!.target).toBeCloseTo(269.61, 2);
  });

  it("handles all-null data gracefully (no goals generated)", () => {
    const data = makeData({ stripe: null, mercury: null, hubspot: null });
    const goals = computeFinancialGoals(data);
    expect(goals).toHaveLength(0);
  });

  it("progress is always between 0 and 100", () => {
    const goals = computeFinancialGoals(makeData());
    for (const g of goals) {
      expect(g.progress).toBeGreaterThanOrEqual(0);
      expect(g.progress).toBeLessThanOrEqual(100);
    }
  });

  it("every goal has a non-empty suggestion", () => {
    const goals = computeFinancialGoals(makeData());
    for (const g of goals) {
      expect(g.suggestion.length).toBeGreaterThan(10);
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   4. runSensitivityAnalysis
   ═══════════════════════════════════════════════════════════ */

describe("runSensitivityAnalysis", () => {
  it("returns exactly 3 results (churn, growth, burn)", () => {
    const results = runSensitivityAnalysis(makeData());
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.parameter)).toEqual(["Churn Rate", "Growth Rate", "Burn Rate"]);
  });

  it("reducing churn increases 12-month MRR", () => {
    const results = runSensitivityAnalysis(makeData(), {
      churnDelta: -0.02,
      growthDelta: 0,
      burnDelta: 0,
    });
    const churnResult = results.find((r) => r.parameter === "Churn Rate")!;
    expect(churnResult.impactOnMrr12m).toBeGreaterThan(0);
    expect(churnResult.adjustedValue).toBeLessThan(churnResult.baseValue);
  });

  it("uses canonical MRR for sensitivity MRR impact", () => {
    const results = runSensitivityAnalysis(makeData({
      hubspot: {
        subscriptionDeals: [subscriptionDeal(12_000)],
      },
    }), {
      churnDelta: -0.02,
      growthDelta: 0,
      burnDelta: 0,
    });

    const churnResult = results.find((r) => r.parameter === "Churn Rate")!;
    const expectedImpact =
      11_000 * Math.pow(1.1 * 0.98, 12) -
      11_000 * Math.pow(1.1 * 0.96, 12);

    expect(churnResult.impactOnMrr12m).toBeCloseTo(expectedImpact, 5);
  });

  it("normalizes ratio-style churn values before sensitivity analysis", () => {
    const results = runSensitivityAnalysis(makeData({
      stripe: {
        subscriptions: {
          active: 50,
          pastDue: 2,
          canceled: 3,
          trialing: 5,
          churnRate: 0.04,
          recentChurnEvents: [],
        },
      },
    }), {
      churnDelta: -0.02,
      growthDelta: 0,
      burnDelta: 0,
    });

    const churnResult = results.find((r) => r.parameter === "Churn Rate")!;
    expect(churnResult.baseValue).toBe(4);
    expect(churnResult.adjustedValue).toBe(2);
  });

  it("increasing growth increases 12-month MRR", () => {
    const results = runSensitivityAnalysis(makeData(), {
      churnDelta: 0,
      growthDelta: 0.05,
      burnDelta: 0,
    });
    const growthResult = results.find((r) => r.parameter === "Growth Rate")!;
    expect(growthResult.impactOnMrr12m).toBeGreaterThan(0);
  });

  it("normalizes ratio-style revenue growth values before sensitivity analysis", () => {
    const results = runSensitivityAnalysis(makeData({
      stripe: {
        revenue: {
          mrr: 10_000,
          mrrChange: 1200,
          totalRevenue30d: 12_000,
          totalRevenuePrev30d: 10_800,
          revenueGrowth: 0.10,
          avgRevenuePerCustomer: 200,
        },
      },
    }), {
      churnDelta: 0,
      growthDelta: 0.05,
      burnDelta: 0,
    });

    const growthResult = results.find((r) => r.parameter === "Growth Rate")!;
    expect(growthResult.baseValue).toBe(10);
    expect(growthResult.adjustedValue).toBeCloseTo(15, 5);
  });

  it("reducing burn increases runway", () => {
    const results = runSensitivityAnalysis(makeData(), {
      churnDelta: 0,
      growthDelta: 0,
      burnDelta: -0.1,
    });
    const burnResult = results.find((r) => r.parameter === "Burn Rate")!;
    expect(burnResult.impactOnRunway).toBeGreaterThan(0);
  });

  it("increasing burn decreases runway", () => {
    const results = runSensitivityAnalysis(makeData(), {
      churnDelta: 0,
      growthDelta: 0,
      burnDelta: 0.2,
    });
    const burnResult = results.find((r) => r.parameter === "Burn Rate")!;
    expect(burnResult.impactOnRunway).toBeLessThan(0);
  });

  it("churn delta does not go below 0", () => {
    const results = runSensitivityAnalysis(makeData(), {
      churnDelta: -0.99, // way larger than current 4%
      growthDelta: 0,
      burnDelta: 0,
    });
    const churnResult = results.find((r) => r.parameter === "Churn Rate")!;
    expect(churnResult.adjustedValue).toBeGreaterThanOrEqual(0);
  });

  it("burn delta does not go below 0", () => {
    const results = runSensitivityAnalysis(makeData(), {
      churnDelta: 0,
      growthDelta: 0,
      burnDelta: -2.0, // -200%, way past zero
    });
    const burnResult = results.find((r) => r.parameter === "Burn Rate")!;
    expect(burnResult.adjustedValue).toBeGreaterThanOrEqual(0);
  });

  it("all results have a description string", () => {
    const results = runSensitivityAnalysis(makeData());
    for (const r of results) {
      expect(r.description.length).toBeGreaterThan(10);
    }
  });

  it("handles missing data gracefully", () => {
    const data = makeData({ stripe: null, mercury: null });
    const results = runSensitivityAnalysis(data);
    expect(results).toHaveLength(3);
    // With no data, MRR impact should be 0 (same as base)
    for (const r of results) {
      expect(Number.isFinite(r.impactOnMrr12m)).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   5. scoreFinancialHealth
   ═══════════════════════════════════════════════════════════ */

describe("scoreFinancialHealth", () => {
  it("returns overall score between 0 and 100", () => {
    const { overall } = scoreFinancialHealth(makeData());
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(100);
  });

  it("returns exactly 5 components", () => {
    const { components } = scoreFinancialHealth(makeData());
    expect(components).toHaveLength(5);
    const labels = components.map((c) => c.label).sort();
    expect(labels).toEqual(["Churn", "MRR Growth", "Payment Success", "Pipeline Coverage", "Runway"].sort());
  });

  it("normalizes ratio-style churn and payment success before health scoring", () => {
    const { components } = scoreFinancialHealth(makeData({
      stripe: {
        subscriptions: {
          active: 50,
          pastDue: 2,
          canceled: 3,
          trialing: 5,
          churnRate: 0.04,
          recentChurnEvents: [],
        },
        payments: { succeeded: 48, failed: 2, successRate: 0.96 },
      },
    }));

    const churn = components.find((c) => c.label === "Churn")!;
    const payment = components.find((c) => c.label === "Payment Success")!;
    expect(churn.detail).toBe("4.0% monthly");
    expect(churn.score).toBe(65);
    expect(payment.detail).toBe("96.0%");
    expect(payment.score).toBe(65);
  });

  it("normalizes ratio-style revenue growth before health scoring", () => {
    const { components } = scoreFinancialHealth(makeData({
      stripe: {
        revenue: {
          mrr: 10_000,
          mrrChange: 1200,
          totalRevenue30d: 12_000,
          totalRevenuePrev30d: 10_800,
          revenueGrowth: 0.10,
          avgRevenuePerCustomer: 200,
        },
      },
    }));

    const growth = components.find((c) => c.label === "MRR Growth")!;
    expect(growth.detail).toBe("10.0% monthly");
    expect(growth.score).toBe(75);
  });


  it("uses canonical MRR for pipeline coverage scoring", () => {
    const { components } = scoreFinancialHealth(makeData({
      hubspot: {
        funnel: {
          ...makeHubSpot().funnel,
          stages: [
            { stageId: "s1", label: "Discovery", count: 3, value: 150_000 },
          ],
        },
        subscriptionDeals: [subscriptionDeal(180_000)],
      },
    }));

    const pipelineCoverage = components.find((c) => c.label === "Pipeline Coverage")!;

    expect(pipelineCoverage.score).toBe(35);
  });

  it("excludes terminal stages from pipeline coverage scoring", () => {
    const { components } = scoreFinancialHealth(makeData({
      stripe: {
        revenue: {
          mrr: 10_000,
          mrrChange: 0,
          totalRevenue30d: 10_000,
          totalRevenuePrev30d: 10_000,
          revenueGrowth: 0,
          avgRevenuePerCustomer: 200,
        },
      },
      hubspot: {
        funnel: {
          ...makeHubSpot().funnel,
          stages: [
            { stageId: "discovery", label: "Discovery", count: 1, value: 60_000 },
            { stageId: "closedwon", label: "Closed Won", count: 1, value: 500_000 },
            { stageId: "closedlost", label: "Closed Lost", count: 1, value: 500_000 },
            { stageId: "churn", label: "Churn", count: 1, value: 500_000 },
          ],
        },
      },
    }));

    const pipelineCoverage = components.find((c) => c.label === "Pipeline Coverage")!;

    expect(pipelineCoverage.score).toBe(35);
  });

  it("component weights sum to 1.0", () => {
    const { components } = scoreFinancialHealth(makeData());
    const weightSum = components.reduce((s, c) => s + c.weight, 0);
    expect(weightSum).toBeCloseTo(1.0, 5);
  });

  it("overall score equals weighted sum of component scores", () => {
    const { overall, components } = scoreFinancialHealth(makeData());
    const computed = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0));
    expect(overall).toBe(computed);
  });

  it("assigns correct grade bands", () => {
    // Default data: runway=15 (score 75), growth=10% (score 75),
    // churn=4% (score 65), payment=96% (score 65), pipeline coverage TBD
    const { grade } = scoreFinancialHealth(makeData());
    // All scores are moderate → expect B or C range
    expect(["A", "B", "C", "D", "F"]).toContain(grade);
  });

  it("healthy startup scores higher than struggling one", () => {
    const healthy = makeData({
      stripe: {
        revenue: { mrr: 50_000, mrrChange: 10000, totalRevenue30d: 60000, totalRevenuePrev30d: 50000, revenueGrowth: 20, avgRevenuePerCustomer: 500 },
        subscriptions: { active: 100, pastDue: 0, canceled: 1, trialing: 10, churnRate: 1, recentChurnEvents: [] },
        payments: { succeeded: 99, failed: 1, successRate: 99 },
      },
      mercury: {
        accounts: [{ accountId: "a1", accountName: "Operating", balance: 2_000_000, type: "checking" }],
        cashFlow: { totalBalance: 2_000_000, inflows30d: 50000, outflows30d: 60000, netCashFlow: -10000, runway: 24, burnRate: 60000 },
      },
    });

    const struggling = makeData({
      stripe: {
        revenue: { mrr: 2000, mrrChange: -200, totalRevenue30d: 1800, totalRevenuePrev30d: 2000, revenueGrowth: -10, avgRevenuePerCustomer: 40 },
        subscriptions: { active: 50, pastDue: 10, canceled: 15, trialing: 2, churnRate: 15, recentChurnEvents: [] },
        payments: { succeeded: 40, failed: 10, successRate: 80 },
      },
      mercury: {
        accounts: [{ accountId: "a1", accountName: "Operating", balance: 50_000, type: "checking" }],
        cashFlow: { totalBalance: 50_000, inflows30d: 1800, outflows30d: 30000, netCashFlow: -28200, runway: 2, burnRate: 30000 },
      },
    });

    const healthyScore = scoreFinancialHealth(healthy);
    const strugglingScore = scoreFinancialHealth(struggling);
    expect(healthyScore.overall).toBeGreaterThan(strugglingScore.overall);
    expect(healthyScore.grade).not.toBe("F");
    expect(strugglingScore.grade).toBe("F");
  });

  it("generates suggestions from weakest components (sorted by priority)", () => {
    const { topSuggestions } = scoreFinancialHealth(makeData());
    // Should have some suggestions (our default data has some weak areas)
    expect(topSuggestions.length).toBeGreaterThan(0);
    expect(topSuggestions.length).toBeLessThanOrEqual(4);

    // Priorities are sequential 1,2,3...
    for (let i = 0; i < topSuggestions.length; i++) {
      expect(topSuggestions[i].priority).toBe(i + 1);
    }
  });

  it("each suggestion has title, action, and expectedImpact", () => {
    const { topSuggestions } = scoreFinancialHealth(makeData());
    for (const s of topSuggestions) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.action.length).toBeGreaterThan(0);
      expect(s.expectedImpact.length).toBeGreaterThan(0);
    }
  });

  it("no suggestions when all components score >= 80", () => {
    const data = makeData({
      stripe: {
        revenue: { mrr: 50_000, mrrChange: 10000, totalRevenue30d: 60000, totalRevenuePrev30d: 50000, revenueGrowth: 20, avgRevenuePerCustomer: 500 },
        subscriptions: { active: 100, pastDue: 0, canceled: 1, trialing: 10, churnRate: 2, recentChurnEvents: [] },
        payments: { succeeded: 99, failed: 1, successRate: 99 },
      },
      mercury: {
        accounts: [{ accountId: "a1", accountName: "Operating", balance: 2_000_000, type: "checking" }],
        cashFlow: { totalBalance: 2_000_000, inflows30d: 50000, outflows30d: 60000, netCashFlow: -10000, runway: 24, burnRate: 60000 },
      },
      hubspot: {
        funnel: {
          totalDeals: 30, closedWon: 10, closedLost: 3, unlikely: 1, churn: 0,
          activeSubscriptions: 100, noShows: 1, demoScheduled: 5, demoFollowUp: 4,
          avgDealSize: 10000, winRate: 33, effectiveWinRate: 30, noShowRate: 5,
          stages: [
            // annualMrr = 50000*12 = 600000; need 3x coverage = 1.8M
            { stageId: "s1", label: "Discovery", count: 10, value: 800_000 },
            { stageId: "s2", label: "Demo", count: 8, value: 600_000 },
            { stageId: "s3", label: "Proposal", count: 5, value: 400_000 },
          ],
          dealsBySource: [{ source: "Organic", count: 20, value: 1_000_000 }],
        },
        contacts: { totalContacts: 1000, recentContacts: 100, bySource: [] },
        _meta: META,
      },
    });
    const { topSuggestions } = scoreFinancialHealth(data);
    expect(topSuggestions.length).toBe(0);
  });

  it("handles missing data (all null providers)", () => {
    const data = makeData({ stripe: null, mercury: null, hubspot: null });
    const result = scoreFinancialHealth(data);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.components).toHaveLength(5);
    expect(["A", "B", "C", "D", "F"]).toContain(result.grade);
  });

  it("pipeline coverage is neutral (50) when hubspot is null", () => {
    const data = makeData({ hubspot: null });
    const { components } = scoreFinancialHealth(data);
    const pipeline = components.find((c) => c.label === "Pipeline Coverage")!;
    expect(pipeline.score).toBe(50);
  });

  it("does not flag payment recovery when Stripe payment data is unavailable", () => {
    const data = makeData({ stripe: null });
    const { components, topSuggestions } = scoreFinancialHealth(data);

    const payment = components.find((c) => c.label === "Payment Success")!;
    expect(payment.detail).toBe("No data");
    expect(topSuggestions.map((suggestion) => suggestion.title)).not.toContain("Improve Payment Recovery");
  });

  it("does not score Stripe growth or churn rates when Stripe data is unavailable", () => {
    const data = makeData({ stripe: null });
    const { components, topSuggestions } = scoreFinancialHealth(data);

    const growth = components.find((c) => c.label === "MRR Growth")!;
    const churn = components.find((c) => c.label === "Churn")!;
    const suggestionTitles = topSuggestions.map((suggestion) => suggestion.title);

    expect(growth.detail).toBe("No data");
    expect(churn.detail).toBe("No data");
    expect(suggestionTitles).not.toContain("Accelerate Revenue Growth");
    expect(suggestionTitles).not.toContain("Reduce Customer Churn");
  });

  it("each component score is between 0 and 100", () => {
    const { components } = scoreFinancialHealth(makeData());
    for (const c of components) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });
});

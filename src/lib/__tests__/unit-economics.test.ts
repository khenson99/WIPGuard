import { describe, expect, it } from "vitest";
import { computeUnitEconomics } from "@/lib/analytics/unit-economics";
import type { StripeData, MercuryData, HubSpotData } from "@/lib/analytics/types";

/* ─── Fixtures ────────────────────────────────────────────── */

const META = {
  fetchedAt: "2026-01-15T00:00:00Z",
  nextRefresh: "2026-01-15T01:00:00Z",
  source: "live" as const,
};

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
    accounts: [
      { accountId: "a1", accountName: "Operating", balance: 500_000, type: "checking" },
    ],
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
      avgDealSize: 2000,
      winRate: 25,
      effectiveWinRate: 30,
      noShowRate: 10,
      stages: [],
      dealsBySource: [],
    },
    contacts: {
      totalContacts: 500,
      recentContacts: 50,
      bySource: [],
    },
    _meta: META,
    ...overrides,
  };
}

/* ─── Tests ───────────────────────────────────────────────── */

describe("computeUnitEconomics", () => {
  const stripe = makeStripe();
  const mercury = makeMercury();
  const hubspot = makeHubSpot();

  it("computes ARPA from stripe avgRevenuePerCustomer", () => {
    const result = computeUnitEconomics(stripe, mercury, hubspot);
    expect(result.arpa).toBe(200);
  });

  it("computes LTV = ARPA / churnDecimal", () => {
    // LTV = 200 / (4/100) = 200 / 0.04 = 5000
    const result = computeUnitEconomics(stripe, mercury, hubspot);
    expect(result.ltv).toBe(5000);
  });

  it("computes CAC = marketingSpend / newCustomers", () => {
    // marketingSpend = 45000 * 0.15 = 6750
    // newCustomers = hubspot.closedWon = 5
    // CAC = 6750 / 5 = 1350
    const result = computeUnitEconomics(stripe, mercury, hubspot);
    expect(result.cac).toBe(1350);
  });

  it("computes LTV:CAC ratio", () => {
    // ltvCacRatio = 5000 / 1350 = 3.703... rounded to 3.7
    const result = computeUnitEconomics(stripe, mercury, hubspot);
    expect(result.ltvCacRatio).toBe(3.7);
  });

  it("computes paybackMonths from CAC and gross profit", () => {
    // grossMarginPct = (12000 - 11250) / 12000 * 100 = 6.25
    // monthlyGrossProfit = ARPA * grossMarginPct = 200 * 0.0625 = 12.5
    // paybackMonths = CAC / monthlyGrossProfit = 1350 / 12.5 = 108
    const result = computeUnitEconomics(stripe, mercury, hubspot);
    expect(result.paybackMonths).toBe(108);
  });

  it("computes grossMarginPct from revenue and outflows-based COGS", () => {
    // revenue = 12000, cogs = 45000 * 0.25 = 11250
    // grossMarginPct = (12000 - 11250) / 12000 * 100 = 750/12000 * 100 = 6.25
    const result = computeUnitEconomics(stripe, mercury, hubspot);
    expect(result.grossMarginPct).toBe(6.25);
  });

  it("computes magicNumber from mrrChange and marketingSpend", () => {
    const result = computeUnitEconomics(stripe, mercury, hubspot);
    // (1200 * 12) / 6750 = 2.13
    expect(result.magicNumber).toBe(2.13);
  });

  it("respects custom budget-informed expense ratios", () => {
    const result = computeUnitEconomics(stripe, mercury, hubspot, {
      ratios: {
        cogs: 0.1,
        payroll: 0.2,
        marketing: 0.5,
        infrastructure: 0.1,
        ops: 0.1,
      },
    });

    expect(result.cac).toBe(4500);
    expect(result.grossMarginPct).toBe(62.5);
    expect(result.magicNumber).toBe(0.64);
  });

  it("prefers Mercury transaction-derived category breakdown when present", () => {
    const mercuryWithBreakdown = makeMercury({
      cashFlow: {
        totalBalance: 500_000,
        inflows30d: 12_000,
        outflows30d: 45_000,
        netCashFlow: -33_000,
        runway: 15,
        burnRate: 45_000,
        expenseBreakdown30d: {
          cogs: 5_000,
          payroll: 10_000,
          marketing: 15_000,
          infrastructure: 5_000,
          ops: 10_000,
          other: 0,
        },
      },
    });

    const result = computeUnitEconomics(stripe, mercuryWithBreakdown, hubspot);

    expect(result.cac).toBe(3000);
    expect(result.grossMarginPct).toBe(58.33);
    expect(result.magicNumber).toBe(0.96);
  });

  it("normalizes in-range closed won counts to a monthly equivalent", () => {
    const ninetyDayMercury = makeMercury({
      cashFlow: {
        totalBalance: 500_000,
        inflows30d: 12_000,
        outflows30d: 45_000,
        netCashFlow: -33_000,
        runway: 15,
        burnRate: 45_000,
        observedPeriodDays: 90,
      },
    });
    const ninetyDayHubspot = makeHubSpot({
      funnel: {
        ...hubspot.funnel,
        closedWon: 9,
      },
    });

    const result = computeUnitEconomics(stripe, ninetyDayMercury, ninetyDayHubspot);

    expect(result.cac).toBe(2250);
    expect(result.paybackMonths).toBe(180);
    expect(result.ltvCacRatio).toBe(2.22);
  });

  /* ─── Churn edge cases ──────────────────────────────────── */

  it("caps LTV at 10 years when churnRate is zero", () => {
    const zeroChurnStripe = makeStripe({
      subscriptions: {
        active: 50,
        pastDue: 2,
        canceled: 0,
        trialing: 5,
        churnRate: 0,
        recentChurnEvents: [],
      },
    });
    const result = computeUnitEconomics(zeroChurnStripe, mercury, hubspot);
    // churnRate=0 falls back to a 10-year cap (120 months)
    expect(result.ltv).toBe(24000);
  });

  it("produces small LTV when churn is very high (100%)", () => {
    const highChurnStripe = makeStripe({
      subscriptions: {
        active: 50,
        pastDue: 2,
        canceled: 50,
        trialing: 0,
        churnRate: 100,
        recentChurnEvents: [],
      },
    });
    const result = computeUnitEconomics(highChurnStripe, mercury, hubspot);
    // churnDecimal = 100/100 = 1.0, effectiveChurn = max(1.0, 0.01) = 1.0
    // LTV = 200 / 1.0 = 200
    expect(result.ltv).toBe(200);
  });

  /* ─── Missing provider fallbacks ────────────────────────── */

  it("falls back to churn replacement when HubSpot is null", () => {
    const result = computeUnitEconomics(stripe, mercury, null);
    // newCustomers falls back to active * churnDecimal = 50 * 0.04 = 2
    // CAC = 6750 / 2 = 3375
    expect(result.cac).toBe(3375);
  });

  it("returns zero-based values when Stripe is null", () => {
    const result = computeUnitEconomics(null, mercury, hubspot);
    expect(result.arpa).toBe(0);
    // effectiveChurn = max(0, 0.01) = 0.01 so LTV = 0 / 0.01 = 0
    expect(result.ltv).toBe(0);
    // revenue is 0 so grossMarginPct = 0
    expect(result.grossMarginPct).toBe(0);
    // arpa is 0 so monthlyGrossProfit = 0 → paybackMonths = 0
    expect(result.paybackMonths).toBe(0);
  });

  it("returns CAC of 0 when Mercury is null (no marketing spend)", () => {
    const result = computeUnitEconomics(stripe, null, hubspot);
    // totalOutflows = 0, marketingSpend = 0, CAC = 0 / 50 = 0
    expect(result.cac).toBe(0);
    // ltvCacRatio = cac > 0 ? ltv/cac : ltv → returns ltv when cac is 0
    expect(result.ltvCacRatio).toBe(5000);
  });

  it("returns all zeros and nulls when every provider is null", () => {
    const result = computeUnitEconomics(null, null, null);
    expect(result.arpa).toBe(0);
    expect(result.ltv).toBe(0);
    expect(result.cac).toBe(0);
    expect(result.ltvCacRatio).toBe(0);
    expect(result.paybackMonths).toBe(0);
    expect(result.grossMarginPct).toBe(0);
    expect(result.magicNumber).toBeNull();
  });

  /* ─── Divide-by-zero protection ─────────────────────────── */

  it("returns paybackMonths of 0 when ARPA is zero", () => {
    const zeroArpaStripe = makeStripe({
      revenue: {
        mrr: 0,
        mrrChange: 0,
        totalRevenue30d: 0,
        totalRevenuePrev30d: 0,
        revenueGrowth: 0,
        avgRevenuePerCustomer: 0,
      },
    });
    const result = computeUnitEconomics(zeroArpaStripe, mercury, hubspot);
    expect(result.arpa).toBe(0);
    // monthlyGrossProfit = 0 when ARPA is zero → paybackMonths = 0
    expect(result.paybackMonths).toBe(0);
  });

  it("computes gross margin from revenue alone when outflows are zero", () => {
    const zeroOutflowsMercury = makeMercury({
      cashFlow: {
        totalBalance: 500_000,
        inflows30d: 12_000,
        outflows30d: 0,
        netCashFlow: 12_000,
        runway: 999,
        burnRate: 0,
      },
    });
    const result = computeUnitEconomics(stripe, zeroOutflowsMercury, hubspot);
    // cogs = 0 * 0.25 = 0, grossMarginPct = (12000 - 0) / 12000 * 100 = 100
    expect(result.grossMarginPct).toBe(100);
  });

  it("returns grossMarginPct of 0 when revenue is zero", () => {
    const zeroRevenueStripe = makeStripe({
      revenue: {
        mrr: 0,
        mrrChange: 0,
        totalRevenue30d: 0,
        totalRevenuePrev30d: 0,
        revenueGrowth: 0,
        avgRevenuePerCustomer: 200,
      },
    });
    const result = computeUnitEconomics(zeroRevenueStripe, mercury, hubspot);
    expect(result.grossMarginPct).toBe(0);
  });

  /* ─── Numeric safety ────────────────────────────────────── */

  it("produces only finite numbers (no NaN or Infinity)", () => {
    const result = computeUnitEconomics(stripe, mercury, hubspot);
    const numericValues = [
      result.ltv,
      result.cac,
      result.ltvCacRatio,
      result.paybackMonths,
      result.grossMarginPct,
      result.arpa,
    ];
    for (const val of numericValues) {
      expect(Number.isFinite(val)).toBe(true);
    }
  });

  it("produces only finite numbers even with all-null providers", () => {
    const result = computeUnitEconomics(null, null, null);
    const numericValues = [
      result.ltv,
      result.cac,
      result.ltvCacRatio,
      result.paybackMonths,
      result.grossMarginPct,
      result.arpa,
    ];
    for (const val of numericValues) {
      expect(Number.isFinite(val)).toBe(true);
    }
  });
});

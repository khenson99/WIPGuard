import { describe, expect, it } from "vitest";
import { buildCustomerJourneyData } from "@/lib/analytics/customer-journey";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

const META = { fetchedAt: "2026-02-10T00:00:00.000Z", nextRefresh: "2026-02-10T01:00:00.000Z", source: "live" as const };

function baseData(): AnalyticsDashboardData {
  return createEmptyAnalyticsDashboardData({
    freshness: {},
    timeRange: {
      preset: "30d",
      from: "2026-01-01",
      to: "2026-01-30",
      days: 30,
      label: "Last 30 days",
    },
  });
}

describe("buildCustomerJourneyData", () => {
  it("builds journeys, touchpoint summary, and attribution from hubspot deals", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        totalDeals: 2,
        closedWon: 1,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 1,
        noShows: 0,
        demoScheduled: 1,
        demoFollowUp: 1,
        avgDealSize: 4000,
        winRate: 50,
        effectiveWinRate: 40,
        noShowRate: 0,
        stages: [
          { stageId: "lead", label: "Lead", count: 1, value: 5000 },
          { stageId: "demo", label: "Demo Scheduled", count: 1, value: 3000 },
        ],
        dealsBySource: [{ source: "Organic", count: 2, value: 8000 }],
      },
      contacts: {
        totalContacts: 10,
        recentContacts: 2,
        bySource: [],
      },
      deals: [
        {
          dealId: "deal-1",
          dealName: "Acme Corp",
          stageId: "lead",
          stageLabel: "Lead",
          amount: 5000,
          source: "Organic",
          ownerId: "owner-1",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-10T00:00:00.000Z",
        },
        {
          dealId: "deal-2",
          dealName: "Beta LLC",
          stageId: "demo",
          stageLabel: "Demo Scheduled",
          amount: 3000,
          source: "Paid",
          ownerId: "owner-2",
          createdAt: "2026-02-02T00:00:00.000Z",
          updatedAt: "2026-02-11T00:00:00.000Z",
        },
      ],
      _meta: META,
    };

    data.stripe = {
      revenue: {
        mrr: 12000,
        mrrChange: 2,
        totalRevenue30d: 15000,
        totalRevenuePrev30d: 14000,
        revenueGrowth: 7.1,
        avgRevenuePerCustomer: 600,
      },
      subscriptions: {
        active: 20,
        pastDue: 1,
        canceled: 0,
        trialing: 2,
        churnRate: 0.02,
        recentChurnEvents: [],
      },
      payments: {
        succeeded: 100,
        failed: 2,
        successRate: 0.98,
      },
      revenueTrend: [],
      _meta: META,
    };

    data.googleAds = {
      totalSpend30d: 1000,
      totalImpressions: 10000,
      totalClicks: 200,
      totalConversions: 10,
      ctr: 2,
      cpc: 5,
      cpa: 100,
      roas: 1,
      campaigns: [],
      _meta: META,
    };

    const journey = buildCustomerJourneyData(data);

    expect(journey.journeys).toHaveLength(2);
    expect(journey.touchpointSummary.length).toBeGreaterThan(0);
    expect(journey.topPaths.length).toBeGreaterThan(0);
    expect(journey.attribution.length).toBeGreaterThan(0);
    expect(journey.avgTouchpoints).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { buildDemoAnalyticsData } from "@/lib/analytics/demo-analytics";
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

describe("buildDemoAnalyticsData", () => {
  it("builds demo analytics from hubspot deal stages", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        totalDeals: 3,
        closedWon: 1,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 1,
        demoScheduled: 3,
        demoFollowUp: 1,
        avgDealSize: 3000,
        winRate: 33.3,
        effectiveWinRate: 30,
        noShowRate: 33.3,
        stages: [
          { stageId: "demo", label: "Demo Scheduled", count: 3, value: 9000 },
          { stageId: "follow", label: "Demo Follow-Up", count: 1, value: 3000 },
        ],
        dealsBySource: [{ source: "Organic", count: 3, value: 9000 }],
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
          stageId: "demo",
          stageLabel: "Demo Scheduled",
          amount: 5000,
          source: "Organic",
          ownerId: "owner-1",
          updatedAt: "2026-02-10T00:00:00.000Z",
        },
        {
          dealId: "deal-2",
          dealName: "Beta LLC",
          stageId: "noshow",
          stageLabel: "No-Show/Reschedule",
          amount: 2000,
          source: "Referral",
          ownerId: "owner-2",
          updatedAt: "2026-02-11T00:00:00.000Z",
        },
        {
          dealId: "deal-3",
          dealName: "Gamma Inc",
          stageId: "follow",
          stageLabel: "Demo Follow-Up",
          amount: 3000,
          source: "Paid",
          ownerId: "owner-3",
          updatedAt: "2026-02-12T00:00:00.000Z",
        },
      ],
      _meta: META,
    };

    const demo = buildDemoAnalyticsData(data);

    expect(demo.totalScheduled).toBe(3);
    expect(demo.totalNoShows).toBe(1);
    expect(demo.noShowRate).toBe(33.3);
    expect(demo.byOutcome.length).toBeGreaterThan(0);
    expect(demo.bySource.length).toBeGreaterThan(0);
    expect(demo.conversionFunnel.length).toBeGreaterThan(0);
  });
});

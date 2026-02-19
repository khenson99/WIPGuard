import { describe, expect, it } from "vitest";
import { buildProcessAnalyticsData } from "@/lib/analytics/process-analytics";
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

describe("buildProcessAnalyticsData", () => {
  it("builds velocity, health score, and bottlenecks from hubspot data", () => {
    const data = baseData();
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    data.hubspot = {
      funnel: {
        totalDeals: 2,
        closedWon: 0,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 0,
        demoScheduled: 1,
        demoFollowUp: 0,
        avgDealSize: 4000,
        winRate: 40,
        effectiveWinRate: 35,
        noShowRate: 5,
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
          updatedAt: oldDate,
        },
        {
          dealId: "deal-2",
          dealName: "Beta LLC",
          stageId: "demo",
          stageLabel: "Demo Scheduled",
          amount: 3000,
          source: "Paid",
          ownerId: "owner-2",
          updatedAt: recentDate,
        },
      ],
      _meta: META,
    };

    const process = buildProcessAnalyticsData(data);

    expect(process.stageVelocity.length).toBeGreaterThan(0);
    expect(process.healthScore).toBeGreaterThanOrEqual(0);
    expect(process.healthScore).toBeLessThanOrEqual(100);
    expect(process.bottlenecks.length).toBeGreaterThan(0);
    expect(process.avgCycleTimeDays).toBeGreaterThan(0);
  });
});

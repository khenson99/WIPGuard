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
          createdAt: "2026-01-15T00:00:00.000Z",
          pipelineId: null,
          contactIds: [],
          primaryContactId: null,
          primaryContactEmail: null,
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
          createdAt: "2026-01-20T00:00:00.000Z",
          pipelineId: null,
          contactIds: [],
          primaryContactId: null,
          primaryContactEmail: null,
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
          createdAt: "2026-01-25T00:00:00.000Z",
          pipelineId: null,
          contactIds: [],
          primaryContactId: null,
          primaryContactEmail: null,
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

  it("builds journey path analysis across full lifecycle", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        totalDeals: 7,
        closedWon: 2,
        closedLost: 1,
        unlikely: 0,
        churn: 1,
        activeSubscriptions: 1,
        noShows: 1,
        demoScheduled: 2,
        demoFollowUp: 1,
        avgDealSize: 4000,
        winRate: 66.7,
        effectiveWinRate: 50,
        noShowRate: 20,
        stages: [],
        dealsBySource: [],
      },
      contacts: { totalContacts: 10, recentContacts: 2, bySource: [] },
      deals: [
        // Organic channel: prospect, demo completed → won, churned
        { dealId: "o1", dealName: "Org Prospect", stageId: "p", stageLabel: "Prospect", amount: 0, source: "Organic", ownerId: null, updatedAt: "2026-02-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
        { dealId: "o2", dealName: "Org Demo", stageId: "d", stageLabel: "Demo Scheduled", amount: 3000, source: "Organic", ownerId: null, updatedAt: "2026-02-02T00:00:00.000Z", createdAt: "2026-01-05T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
        { dealId: "o3", dealName: "Org Won", stageId: "w", stageLabel: "Closed Won", amount: 5000, source: "Organic", ownerId: null, updatedAt: "2026-02-05T00:00:00.000Z", createdAt: "2026-01-10T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
        { dealId: "o4", dealName: "Org Churn", stageId: "ch", stageLabel: "Churn", amount: 2000, source: "Organic", ownerId: null, updatedAt: "2026-02-10T00:00:00.000Z", createdAt: "2026-01-15T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
        // Paid channel: no-show, demo follow-up → lost
        { dealId: "p1", dealName: "Paid NoShow", stageId: "ns", stageLabel: "No-Show/Reschedule", amount: 1000, source: "Paid", ownerId: null, updatedAt: "2026-02-03T00:00:00.000Z", createdAt: "2026-01-20T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
        { dealId: "p2", dealName: "Paid Follow", stageId: "fu", stageLabel: "Demo Follow-Up", amount: 4000, source: "Paid", ownerId: null, updatedAt: "2026-02-04T00:00:00.000Z", createdAt: "2026-01-22T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
        { dealId: "p3", dealName: "Paid Lost", stageId: "l", stageLabel: "Closed Lost", amount: 3000, source: "Paid", ownerId: null, updatedAt: "2026-02-06T00:00:00.000Z", createdAt: "2026-01-25T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
      ],
      _meta: META,
    };

    const demo = buildDemoAnalyticsData(data);
    const paths = demo.journeyPaths;

    expect(paths.length).toBe(2);

    // Organic channel (4 leads, sorted first)
    const organic = paths.find((p) => p.source === "Organic")!;
    expect(organic.totalLeads).toBe(4);
    expect(organic.demosBooked).toBe(2); // Demo Scheduled + Closed Won (post-demo stage)
    expect(organic.demoCompleted).toBe(1); // Closed Won is in POST_DEMO_STAGES
    expect(organic.demoNoShow).toBe(0);
    expect(organic.closedWon).toBe(1);
    expect(organic.onboarding).toBe(1); // Closed Won = onboarded (Subscription/Closed Won)
    expect(organic.avgContractValue).toBe(5000);
    expect(organic.churned).toBe(1); // HubSpot "Churn" stage
    expect(organic.churnedPct).toBeGreaterThan(0);
    expect(organic.notActivated).toBe(1); // Churn created Jan 15 → churned Feb 10 = 26 days < 30

    // Paid channel (3 leads)
    const paid = paths.find((p) => p.source === "Paid")!;
    expect(paid.totalLeads).toBe(3);
    expect(paid.demosBooked).toBe(2); // No-Show + Demo Follow-Up
    expect(paid.demoCompleted).toBe(1); // Demo Follow-Up is in POST_DEMO_STAGES
    expect(paid.demoNoShow).toBe(1);
    expect(paid.closedLost).toBe(1);
    expect(paid.onboarding).toBe(0); // No Subscription/Closed Won deals
    expect(paid.churned).toBe(1);
    expect(paid.notActivated).toBe(1);
  });

  it("includes Stripe churn events in churned count", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        totalDeals: 2, closedWon: 1, closedLost: 0, unlikely: 0, churn: 0,
        activeSubscriptions: 1, noShows: 0, demoScheduled: 1, demoFollowUp: 0,
        avgDealSize: 5000, winRate: 100, effectiveWinRate: 100, noShowRate: 0,
        stages: [], dealsBySource: [],
      },
      contacts: { totalContacts: 5, recentContacts: 1, bySource: [] },
      deals: [
        { dealId: "cus_stripe1", dealName: "Stripe Customer", stageId: "w", stageLabel: "Closed Won", amount: 5000, source: "Organic", ownerId: null, updatedAt: "2026-03-05T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
        { dealId: "d2", dealName: "Active Deal", stageId: "s", stageLabel: "Subscription", amount: 3000, source: "Organic", ownerId: null, updatedAt: "2026-02-01T00:00:00.000Z", createdAt: "2026-01-10T00:00:00.000Z", pipelineId: null, contactIds: [], primaryContactId: null, primaryContactEmail: null },
      ],
      _meta: META,
    };
    // Stripe shows a cancellation for "cus_stripe1" (matching dealId)
    data.stripe = {
      revenue: { mrr: 3000, mrrChange: 0, totalRevenue30d: 8000, totalRevenuePrev30d: 7500, revenueGrowth: 6.7, avgRevenuePerCustomer: 4000 },
      subscriptions: {
        active: 1, pastDue: 0, canceled: 1, trialing: 0, churnRate: 50,
        recentChurnEvents: [
          { customer: "cus_stripe1", canceledAt: "2026-01-20T00:00:00.000Z", amount: 5000 },
        ],
      },
      payments: { succeeded: 2, failed: 0, successRate: 100 },
      revenueTrend: [],
      _meta: META,
    };

    const demo = buildDemoAnalyticsData(data);
    const organic = demo.journeyPaths.find((p) => p.source === "Organic")!;

    // Stripe churn event matched by dealId → customer ID
    expect(organic.churned).toBe(1);
    expect(organic.onboarding).toBe(2); // Both Closed Won and Subscription
    expect(organic.notActivated).toBe(1);
  });
});

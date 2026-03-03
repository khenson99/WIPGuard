import { describe, expect, it } from "vitest";
import { buildProcessAnalyticsData } from "@/lib/analytics/process-analytics";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { buildSalesPerformancePack } from "@/lib/analytics/fetchers";
import type { AnalyticsDashboardData, HubSpotContactRecord, HubSpotData } from "@/lib/analytics/types";

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
          createdAt: oldDate,
          updatedAt: oldDate,
          pipelineId: null,
          contactIds: [],
          primaryContactId: null,
          primaryContactEmail: null,
        },
        {
          dealId: "deal-2",
          dealName: "Beta LLC",
          stageId: "demo",
          stageLabel: "Demo Scheduled",
          amount: 3000,
          source: "Paid",
          ownerId: "owner-2",
          createdAt: recentDate,
          updatedAt: recentDate,
          pipelineId: null,
          contactIds: [],
          primaryContactId: null,
          primaryContactEmail: null,
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

describe("buildSalesPerformancePack", () => {
  it("buckets signed deals by close month and opps by create month", () => {
    const deals: NonNullable<HubSpotData["deals"]> = [
      {
        dealId: "d1",
        dealName: "Deal 1",
        stageId: "closedwon",
        stageLabel: "Closed Won",
        amount: 1000,
        source: "Organic Search",
        ownerId: "o1",
        repName: "Rep A",
        updatedAt: null,
        createdAt: "2026-01-31T23:00:00.000Z",
        closedAt: "2026-02-01T00:00:00.000Z",
        stripeCustomerId: null,
        pipelineId: null,
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: null,
      },
    ];

    const pack = buildSalesPerformancePack({
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-02-28T23:59:59.999Z"),
      deals,
      contacts: [],
      chargesByCustomerId: {},
    });

    const jan = pack.repMonthRows.find((r) => r.month === "2026-01" && r.repName === "Rep A");
    const feb = pack.repMonthRows.find((r) => r.month === "2026-02" && r.repName === "Rep A");
    expect(jan?.opportunitiesCreatedCount).toBe(1);
    expect(jan?.signedDealsCount ?? 0).toBe(0);
    expect(feb?.signedDealsCount).toBe(1);
  });

  it("classifies Offline Sources as Outbound and computes shares", () => {
    const deals: NonNullable<HubSpotData["deals"]> = [
      {
        dealId: "d1",
        dealName: "Deal 1",
        stageId: "closedwon",
        stageLabel: "Closed Won",
        amount: 1000,
        source: "Offline Sources",
        ownerId: "o1",
        repName: "Rep A",
        updatedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        closedAt: "2026-02-10T00:00:00.000Z",
        stripeCustomerId: null,
        pipelineId: null,
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: null,
      },
    ];

    const pack = buildSalesPerformancePack({
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-02-28T23:59:59.999Z"),
      deals,
      contacts: [],
      chargesByCustomerId: {},
    });

    const row = pack.repMonthRows.find((r) => r.month === "2026-02" && r.repName === "Rep A");
    expect(row?.signedOutboundShare).toBeCloseTo(1, 6);
  });

  it("computes cohort opportunity→closed won within 90 days", () => {
    const deals: NonNullable<HubSpotData["deals"]> = [
      {
        dealId: "d1",
        dealName: "Fast",
        stageId: "closedwon",
        stageLabel: "Closed Won",
        amount: 1000,
        source: "Organic Search",
        ownerId: "o1",
        repName: "Rep A",
        updatedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        closedAt: "2026-03-15T00:00:00.000Z",
        stripeCustomerId: null,
        pipelineId: null,
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: null,
      },
      {
        dealId: "d2",
        dealName: "Slow",
        stageId: "closedwon",
        stageLabel: "Closed Won",
        amount: 1000,
        source: "Organic Search",
        ownerId: "o1",
        repName: "Rep A",
        updatedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        closedAt: "2026-05-05T00:00:00.000Z",
        stripeCustomerId: null,
        pipelineId: null,
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: null,
      },
    ];

    const pack = buildSalesPerformancePack({
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-06-01T00:00:00.000Z"),
      deals,
      contacts: [],
      chargesByCustomerId: {},
      cohortWindowDays: 90,
    });

    const jan = pack.repMonthRows.find((r) => r.month === "2026-01" && r.repName === "Rep A");
    expect(jan?.opportunitiesCreatedCount).toBe(2);
    expect(jan?.opportunityToClosedRate90d).toBeCloseTo(0.5, 6);
  });

  it("allocates Stripe charges to the most recent qualifying close window", () => {
    const deals: NonNullable<HubSpotData["deals"]> = [
      {
        dealId: "d1",
        dealName: "Deal 1",
        stageId: "closedwon",
        stageLabel: "Closed Won",
        amount: 1000,
        source: "Organic Search",
        ownerId: "o1",
        repName: "Rep A",
        updatedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        closedAt: "2026-02-01T00:00:00.000Z",
        stripeCustomerId: "cus_1",
        pipelineId: null,
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: null,
      },
      {
        dealId: "d2",
        dealName: "Deal 2",
        stageId: "closedwon",
        stageLabel: "Closed Won",
        amount: 1000,
        source: "Organic Search",
        ownerId: "o1",
        repName: "Rep A",
        updatedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        closedAt: "2026-02-20T00:00:00.000Z",
        stripeCustomerId: "cus_1",
        pipelineId: null,
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: null,
      },
    ];

    const pack = buildSalesPerformancePack({
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-02-28T23:59:59.999Z"),
      deals,
      contacts: [],
      chargesByCustomerId: {
        cus_1: [
          {
            chargeId: "ch_1",
            created: Math.floor(new Date("2026-02-25T00:00:00.000Z").getTime() / 1000),
            currency: "usd",
            netAmountCents: 2500,
          },
        ],
      },
    });

    const d1 = pack.dealAuditRows.find((r) => r.hubspotDealId === "d1");
    const d2 = pack.dealAuditRows.find((r) => r.hubspotDealId === "d2");
    expect(d1?.stripeRealized30d).toBe(0);
    expect(d2?.stripeRealized30d).toBe(25);
  });

  it("computes lead→opp proxy rate by rep-month", () => {
    const deals: NonNullable<HubSpotData["deals"]> = [
      {
        dealId: "d1",
        dealName: "Deal 1",
        stageId: "qualifiedtobuy",
        stageLabel: "Lead",
        amount: 0,
        source: "Organic Search",
        ownerId: "o1",
        repName: "Rep A",
        updatedAt: null,
        createdAt: "2026-02-10T00:00:00.000Z",
        closedAt: null,
        stripeCustomerId: null,
        pipelineId: null,
        contactIds: [],
        primaryContactId: null,
        primaryContactEmail: null,
      },
    ];

    const contacts: HubSpotContactRecord[] = [
      { contactId: "c1", createdAt: "2026-02-01T00:00:00.000Z", ownerId: "o1", repName: "Rep A", rawSource: null },
      { contactId: "c2", createdAt: "2026-02-02T00:00:00.000Z", ownerId: "o1", repName: "Rep A", rawSource: null },
    ];

    const pack = buildSalesPerformancePack({
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-02-28T23:59:59.999Z"),
      deals,
      contacts,
      chargesByCustomerId: {},
    });

    const row = pack.repMonthRows.find((r) => r.month === "2026-02" && r.repName === "Rep A");
    expect(row?.leadToOpportunityRate).toBeCloseTo(0.5, 6);
  });
});

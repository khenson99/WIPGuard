import { describe, expect, it } from "vitest";
import {
  buildDemoAnalyticsData,
  type DemoMeetingContext,
} from "@/lib/analytics/demo-analytics";
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

type HubSpotDeal = NonNullable<NonNullable<AnalyticsDashboardData["hubspot"]>["deals"]>[number];

function makeDeal(overrides: Partial<HubSpotDeal> & Pick<HubSpotDeal, "dealId" | "dealName" | "stageId" | "stageLabel" | "amount" | "source">): HubSpotDeal {
  return {
    ownerId: null,
    updatedAt: null,
    createdAt: null,
    pipelineId: null,
    contactIds: [],
    primaryContactId: null,
    primaryContactEmail: null,
    ...overrides,
  };
}

function makeMeeting(
  overrides: Partial<DemoMeetingContext> & Pick<DemoMeetingContext, "id" | "title" | "status" | "startAt">
): DemoMeetingContext {
  return {
    endAt: null,
    location: null,
    notes: null,
    dealId: null,
    dealName: null,
    hubspotDealId: null,
    companyName: null,
    attendeeEmails: [],
    googleDriveFileId: null,
    googleDriveFileName: null,
    googleDriveFileUrl: null,
    transcriptMatchedAt: null,
    transcriptMatchConfidence: null,
    analysisArtifactId: null,
    demoQualityScore: null,
    demoQualitySummary: null,
    demoStrengths: [],
    demoGaps: [],
    analyzedAt: null,
    analysisArtifact: null,
    siblingArtifacts: [],
    ...overrides,
  };
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
        makeDeal({
          dealId: "deal-1",
          dealName: "Acme Corp",
          stageId: "demo",
          stageLabel: "Demo Scheduled",
          amount: 5000,
          source: "Organic",
          ownerId: "owner-1",
          updatedAt: "2026-02-10T00:00:00.000Z",
          createdAt: "2026-01-15T00:00:00.000Z",
        }),
        makeDeal({
          dealId: "deal-2",
          dealName: "Beta LLC",
          stageId: "noshow",
          stageLabel: "No-Show/Reschedule",
          amount: 2000,
          source: "Referral",
          ownerId: "owner-2",
          updatedAt: "2026-02-11T00:00:00.000Z",
          createdAt: "2026-01-20T00:00:00.000Z",
        }),
        makeDeal({
          dealId: "deal-3",
          dealName: "Gamma Inc",
          stageId: "follow",
          stageLabel: "Demo Follow-Up",
          amount: 3000,
          source: "Paid",
          ownerId: "owner-3",
          updatedAt: "2026-02-12T00:00:00.000Z",
          createdAt: "2026-01-25T00:00:00.000Z",
        }),
      ],
      _meta: {
        ...META,
        fetchedAt: "2026-03-11T00:00:00.000Z",
        nextRefresh: "2026-03-11T01:00:00.000Z",
      },
    };

    const demo = buildDemoAnalyticsData(data);

    expect(demo.totalScheduled).toBe(3);
    expect(demo.totalNoShows).toBe(1);
    expect(demo.noShowRate).toBe(33.3);
    expect(demo.byOutcome.length).toBeGreaterThan(0);
    expect(demo.bySource.length).toBeGreaterThan(0);
    expect(demo.conversionFunnel.length).toBeGreaterThan(0);
  });

  it("derives funnel counts from the full demo cohort instead of current HubSpot stage totals", () => {
    const data = baseData();
    const scheduledDeals = Array.from({ length: 5 }, (_, index) => makeDeal({
      dealId: `scheduled-${index + 1}`,
      dealName: `Scheduled ${index + 1}`,
      stageId: "demo",
      stageLabel: "Demo Scheduled",
      amount: 1000,
      source: "Organic",
      ownerId: null,
      updatedAt: "2026-02-10T00:00:00.000Z",
      createdAt: "2026-01-10T00:00:00.000Z",
    }));
    const followUpDeals = Array.from({ length: 10 }, (_, index) => makeDeal({
      dealId: `follow-${index + 1}`,
      dealName: `Follow ${index + 1}`,
      stageId: "follow",
      stageLabel: "Demo Follow-Up",
      amount: 2000,
      source: "Organic",
      ownerId: null,
      updatedAt: "2026-02-11T00:00:00.000Z",
      createdAt: "2026-01-11T00:00:00.000Z",
    }));
    const wonDeals = Array.from({ length: 10 }, (_, index) => makeDeal({
      dealId: `won-${index + 1}`,
      dealName: `Won ${index + 1}`,
      stageId: "won",
      stageLabel: "Closed Won",
      amount: 3000,
      source: "Paid",
      ownerId: null,
      updatedAt: "2026-02-12T00:00:00.000Z",
      createdAt: "2026-01-12T00:00:00.000Z",
    }));

    data.hubspot = {
      funnel: {
        totalDeals: 25,
        closedWon: 12,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 0,
        demoScheduled: 20,
        demoFollowUp: 10,
        avgDealSize: 3000,
        winRate: 100,
        effectiveWinRate: 100,
        noShowRate: 0,
        stages: [],
        dealsBySource: [],
      },
      contacts: { totalContacts: 0, recentContacts: 0, bySource: [] },
      deals: [...scheduledDeals, ...followUpDeals, ...wonDeals],
      _meta: {
        ...META,
        fetchedAt: "2026-03-11T00:00:00.000Z",
        nextRefresh: "2026-03-11T01:00:00.000Z",
      },
    };

    const demo = buildDemoAnalyticsData(data);

    expect(demo.totalScheduled).toBe(25);
    expect(demo.totalCompleted).toBe(20);
    expect(demo.conversionFunnel).toEqual([
      { label: "Demo Scheduled", count: 25, conversionFromPrevious: null },
      { label: "Demo Completed", count: 20, conversionFromPrevious: 80 },
      { label: "Follow-Up Sent", count: 20, conversionFromPrevious: 100 },
      { label: "Closed Won", count: 10, conversionFromPrevious: 40 },
    ]);
  });

  it("includes uncovered post-demo HubSpot deals in the scheduling records", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        totalDeals: 2,
        closedWon: 1,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 0,
        demoScheduled: 2,
        demoFollowUp: 1,
        avgDealSize: 4500,
        winRate: 50,
        effectiveWinRate: 50,
        noShowRate: 0,
        stages: [],
        dealsBySource: [],
      },
      contacts: { totalContacts: 0, recentContacts: 0, bySource: [] },
      deals: [
        makeDeal({
          dealId: "follow-up-deal",
          dealName: "Follow Up Co",
          stageId: "follow",
          stageLabel: "Demo Follow-Up",
          amount: 4000,
          source: "Organic",
          ownerId: null,
          updatedAt: "2026-02-12T00:00:00.000Z",
          createdAt: "2026-01-10T00:00:00.000Z",
        }),
        makeDeal({
          dealId: "won-deal",
          dealName: "Won Co",
          stageId: "won",
          stageLabel: "Closed Won",
          amount: 5000,
          source: "Paid",
          ownerId: null,
          updatedAt: "2026-02-15T00:00:00.000Z",
          createdAt: "2026-01-12T00:00:00.000Z",
        }),
      ],
      _meta: META,
    };

    const demo = buildDemoAnalyticsData(data);

    expect(demo.totalScheduled).toBe(2);
    expect(demo.demos.map((record) => record.dealId)).toEqual(["follow-up-deal", "won-deal"]);
    expect(demo.demos.every((record) => record.isUpcoming === false)).toBe(true);
    expect(demo.demos.every((record) => record.outcome === "completed")).toBe(true);
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
        makeDeal({ dealId: "o1", dealName: "Org Prospect", stageId: "p", stageLabel: "Prospect", amount: 0, source: "Organic", ownerId: null, updatedAt: "2026-02-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" }),
        makeDeal({ dealId: "o2", dealName: "Org Demo", stageId: "d", stageLabel: "Demo Scheduled", amount: 3000, source: "Organic", ownerId: null, updatedAt: "2026-02-02T00:00:00.000Z", createdAt: "2026-01-05T00:00:00.000Z" }),
        makeDeal({ dealId: "o3", dealName: "Org Won", stageId: "w", stageLabel: "Closed Won", amount: 5000, source: "Organic", ownerId: null, updatedAt: "2026-02-05T00:00:00.000Z", createdAt: "2026-01-10T00:00:00.000Z" }),
        makeDeal({ dealId: "o4", dealName: "Org Churn", stageId: "ch", stageLabel: "Churn", amount: 2000, source: "Organic", ownerId: null, updatedAt: "2026-02-10T00:00:00.000Z", createdAt: "2026-01-15T00:00:00.000Z" }),
        // Paid channel: no-show, demo follow-up → lost
        makeDeal({ dealId: "p1", dealName: "Paid NoShow", stageId: "ns", stageLabel: "No-Show/Reschedule", amount: 1000, source: "Paid", ownerId: null, updatedAt: "2026-02-03T00:00:00.000Z", createdAt: "2026-01-20T00:00:00.000Z" }),
        makeDeal({ dealId: "p2", dealName: "Paid Follow", stageId: "fu", stageLabel: "Demo Follow-Up", amount: 4000, source: "Paid", ownerId: null, updatedAt: "2026-02-04T00:00:00.000Z", createdAt: "2026-01-22T00:00:00.000Z" }),
        makeDeal({ dealId: "p3", dealName: "Paid Lost", stageId: "l", stageLabel: "Closed Lost", amount: 3000, source: "Paid", ownerId: null, updatedAt: "2026-02-06T00:00:00.000Z", createdAt: "2026-01-25T00:00:00.000Z" }),
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
    expect(paid.churned).toBe(0); // Closed Lost is a sales loss, not customer churn
    expect(paid.notActivated).toBe(0);
  });

  it("includes Stripe churn events in churned count", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        totalDeals: 3, closedWon: 1, closedLost: 1, unlikely: 0, churn: 0,
        activeSubscriptions: 1, noShows: 0, demoScheduled: 1, demoFollowUp: 0,
        avgDealSize: 5000, winRate: 100, effectiveWinRate: 100, noShowRate: 0,
        stages: [], dealsBySource: [],
      },
      contacts: { totalContacts: 5, recentContacts: 1, bySource: [] },
      deals: [
        makeDeal({ dealId: "cus_stripe1", dealName: "Stripe Customer", stageId: "w", stageLabel: "Closed Won", amount: 5000, source: "Organic", ownerId: null, updatedAt: "2026-03-05T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" }),
        makeDeal({ dealId: "d2", dealName: "Active Deal", stageId: "s", stageLabel: "Subscription", amount: 3000, source: "Organic", ownerId: null, updatedAt: "2026-02-01T00:00:00.000Z", createdAt: "2026-01-10T00:00:00.000Z" }),
        makeDeal({ dealId: "cus_lost", dealName: "Lost Deal", stageId: "l", stageLabel: "Closed Lost", amount: 2000, source: "Organic", ownerId: null, updatedAt: "2026-02-12T00:00:00.000Z", createdAt: "2026-01-15T00:00:00.000Z" }),
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
          { customer: "cus_lost", canceledAt: "2026-01-25T00:00:00.000Z", amount: 2000 },
        ],
      },
      payments: { succeeded: 2, failed: 0, successRate: 100 },
      revenueTrend: [],
      _meta: META,
    };

    const demo = buildDemoAnalyticsData(data);
    const organic = demo.journeyPaths.find((p) => p.source === "Organic")!;

    // Stripe churn event matched by dealId → customer ID, but only for activated customer stages
    expect(organic.churned).toBe(1);
    expect(organic.onboarding).toBe(2); // Both Closed Won and Subscription
    expect(organic.notActivated).toBe(1);
  });

  it("surfaces upcoming and analyzed demos from meeting-backed records", () => {
    const data = baseData();
    data.hubspot = {
      funnel: {
        totalDeals: 3,
        closedWon: 1,
        closedLost: 0,
        unlikely: 0,
        churn: 0,
        activeSubscriptions: 0,
        noShows: 0,
        demoScheduled: 2,
        demoFollowUp: 1,
        avgDealSize: 4000,
        winRate: 50,
        effectiveWinRate: 50,
        noShowRate: 0,
        stages: [],
        dealsBySource: [],
      },
      contacts: { totalContacts: 4, recentContacts: 1, bySource: [] },
      deals: [
        makeDeal({
          dealId: "hs-upcoming",
          dealName: "Upcoming Deal",
          stageId: "demo",
          stageLabel: "Demo Scheduled",
          amount: 4000,
          source: "Organic",
          ownerId: null,
          repName: "Avery",
          updatedAt: "2026-02-10T00:00:00.000Z",
          createdAt: "2026-02-01T00:00:00.000Z",
        }),
        makeDeal({
          dealId: "hs-unscheduled",
          dealName: "Fallback Deal",
          stageId: "demo",
          stageLabel: "Demo Scheduled",
          amount: 3500,
          source: "Referral",
          ownerId: null,
          updatedAt: "2026-02-10T00:00:00.000Z",
          createdAt: "2026-02-02T00:00:00.000Z",
        }),
        makeDeal({
          dealId: "hs-historical",
          dealName: "Historical Deal",
          stageId: "won",
          stageLabel: "Closed Won",
          amount: 7000,
          source: "Paid",
          ownerId: null,
          updatedAt: "2026-02-10T00:00:00.000Z",
          createdAt: "2026-01-10T00:00:00.000Z",
        }),
      ],
      _meta: META,
    };

    const demo = buildDemoAnalyticsData(data, {
      meetings: [
        makeMeeting({
          id: "meeting-upcoming",
          title: "Field Fastener & Arda Cards",
          status: "SCHEDULED",
          startAt: "2026-03-15T18:00:00.000Z",
          endAt: "2026-03-15T18:30:00.000Z",
          notes: "A Sales Engineer will walk you through how Arda can eliminate stockouts and make ordering 10x faster. What are you most interested in learning about Arda?: Let's start the conversation.",
          dealId: "local-upcoming",
          dealName: "Upcoming Deal",
          hubspotDealId: "hs-upcoming",
          attendeeEmails: ["future@example.com"],
        }),
        makeMeeting({
          id: "meeting-internal",
          title: "Arda Sync",
          status: "COMPLETED",
          startAt: "2026-03-12T18:00:00.000Z",
          endAt: "2026-03-12T18:30:00.000Z",
          notes: "Internal operating sync.",
          attendeeEmails: ["team@example.com"],
        }),
        makeMeeting({
          id: "meeting-historical",
          title: "Historical Demo",
          status: "COMPLETED",
          startAt: "2026-03-05T18:00:00.000Z",
          endAt: "2026-03-05T19:00:00.000Z",
          dealId: "local-historical",
          dealName: "Historical Deal",
          hubspotDealId: "hs-historical",
          attendeeEmails: ["buyer@example.com"],
          googleDriveFileId: "drive-1",
          googleDriveFileName: "historical-demo-transcript",
          googleDriveFileUrl: "https://drive.test/transcript",
          transcriptMatchedAt: "2026-03-05T20:00:00.000Z",
          transcriptMatchConfidence: 0.92,
          analysisArtifactId: "artifact-scorecard-1",
          demoQualityScore: 88,
          demoQualitySummary: "Strong demo with clear next step.",
          demoStrengths: ["Discovery depth"],
          demoGaps: ["Pricing clarity"],
          analyzedAt: "2026-03-05T21:00:00.000Z",
          analysisArtifact: {
            id: "artifact-scorecard-1",
            runId: "run-1",
            artifactType: "demo_quality_scorecard",
            summary: "Strong demo with clear next step.",
            content: null,
            contentJson: {
              overallScore: 88,
              strengths: ["Discovery depth"],
              gaps: ["Pricing clarity"],
              customerSignals: ["Budget approved"],
              nextSteps: ["Send proposal"],
              outcomeConfidence: "high",
            },
            sourceDocument: {
              id: "doc-1",
              title: "Archived transcript",
              sourceUrl: "https://archive.test/transcript",
              textContent: "Customer: We have budget approval.\nRep: I will send the proposal today.",
            },
          },
          siblingArtifacts: [
            {
              id: "artifact-coaching-1",
              artifactType: "demo_coaching_memo",
              title: "Coaching",
              summary: "Keep ROI framing tighter.",
              content: "Keep ROI framing tighter.",
              contentJson: null,
            },
            {
              id: "artifact-next-step-1",
              artifactType: "deal_next_step_memo",
              title: "Next Step",
              summary: "Send proposal and confirm procurement.",
              content: "Send proposal and confirm procurement.",
              contentJson: null,
            },
          ],
        }),
      ],
    });

    expect(demo.totalScheduled).toBe(2);
    expect(demo.totalCompleted).toBe(1);
    expect(demo.weeklyTrend).toEqual([
      { week: "2026-03-01", scheduled: 1, completed: 1, noShows: 0 },
      { week: "2026-03-15", scheduled: 1, completed: 0, noShows: 0 },
    ]);
    expect(demo.upcomingCount).toBe(2);
    expect(demo.meetingBackedUpcomingCount).toBe(1);
    expect(demo.unscheduledDemoCount).toBe(1);
    expect(demo.analyzedDemoCount).toBe(1);
    expect(demo.avgDemoQualityScore).toBe(88);
    expect(demo.transcriptCoveragePct).toBe(100);
    expect(demo.upcomingDemos).toHaveLength(2);
    expect(demo.upcomingDemos[0].meetingId).toBe("meeting-upcoming");
    expect(demo.upcomingDemos[0].ownerName).toBe("Avery");
    expect(demo.upcomingDemos[1].isUnscheduledFallback).toBe(true);
    expect(demo.topStrengthThemes).toEqual([{ label: "Discovery depth", count: 1 }]);
    expect(demo.topGapThemes).toEqual([{ label: "Pricing clarity", count: 1 }]);

    const historical = demo.demos.find((entry) => entry.meetingId === "meeting-historical");
    expect(historical?.transcriptStatus).toBe("matched");
    expect(historical?.transcriptSourceUrl).toBe("https://archive.test/transcript");
    expect(historical?.transcriptSourceTitle).toBe("Archived transcript");
    expect(historical?.transcriptSourceDocumentId).toBe("doc-1");
    expect(historical?.transcriptText).toContain("budget approval");
    expect(historical?.analysisStatus).toBe("ready");
    expect(historical?.qualityScore).toBe(88);
    expect(historical?.coachingMemo).toContain("ROI");
    expect(historical?.nextStepMemo).toContain("proposal");
  });
});

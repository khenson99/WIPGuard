import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoAnalyticsTab } from "./demo-analytics-tab";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

describe("DemoAnalyticsTab", () => {
  it("shows owner context on upcoming demo cards", () => {
    const data = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-02-01",
        to: "2026-03-01",
        days: 30,
        label: "Last 30 days",
      },
    });

    data.demoAnalytics = {
      totalScheduled: 2,
      totalCompleted: 1,
      totalNoShows: 0,
      noShowRate: 0,
      avgLeadTimeDays: 2,
      upcomingCount: 1,
      meetingBackedUpcomingCount: 1,
      unscheduledDemoCount: 0,
      analyzedDemoCount: 0,
      avgDemoQualityScore: 0,
      transcriptCoveragePct: 0,
      topStrengthThemes: [],
      topGapThemes: [],
      demos: [],
      upcomingDemos: [
        {
          dealId: "deal-1",
          dealName: "Acme",
          ownerName: "Jordan",
          contactEmail: "buyer@acme.test",
          scheduledAt: "2026-03-15T18:00:00.000Z",
          meetingId: "meeting-1",
          meetingTitle: "Acme Demo",
          meetingEndAt: "2026-03-15T18:30:00.000Z",
          meetingStatus: "SCHEDULED",
          isUpcoming: true,
          isUnscheduledFallback: false,
          source: "Organic",
          outcome: "pending",
          followUpSent: false,
          daysToNextStage: null,
          resultingStage: "Demo Scheduled",
          transcriptStatus: "missing",
          transcriptMatchConfidence: null,
          transcriptSourceUrl: null,
          transcriptSourceTitle: null,
          transcriptSourceDocumentId: null,
          transcriptText: null,
          analysisStatus: "missing",
          qualityScore: null,
          qualitySummary: null,
          strengths: [],
          gaps: [],
          nextSteps: [],
          customerSignals: [],
          outcomeConfidence: null,
          coachingMemo: null,
          nextStepMemo: null,
        },
      ],
      bySource: [],
      byOutcome: [
        { outcome: "completed", count: 1, pct: 100 },
        { outcome: "no-show", count: 0, pct: 0 },
        { outcome: "rescheduled", count: 0, pct: 0 },
        { outcome: "pending", count: 0, pct: 0 },
        { outcome: "unknown", count: 0, pct: 0 },
      ],
      conversionFunnel: [
        { label: "Demo Scheduled", count: 2, conversionFromPrevious: null },
        { label: "Demo Completed", count: 1, conversionFromPrevious: 50 },
        { label: "Follow-Up Sent", count: 1, conversionFromPrevious: 100 },
        { label: "Closed Won", count: 1, conversionFromPrevious: 50 },
      ],
      weeklyTrend: [],
      journeyPaths: [],
    };

    render(<DemoAnalyticsTab data={data} />);

    expect(screen.getByText("Owner: Jordan")).toBeTruthy();
    expect(screen.getByText("Acme Demo")).toBeTruthy();
  });
});

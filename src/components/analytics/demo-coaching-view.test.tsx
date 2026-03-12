import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoCoachingView } from "./demo-coaching-view";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import type { DemoRecord } from "@/lib/analytics/types";

function makeDemoRecord(
  overrides: Partial<DemoRecord> &
    Pick<DemoRecord, "dealId" | "dealName" | "scheduledAt" | "source" | "outcome">,
): DemoRecord {
  return {
    ownerName: null,
    contactEmail: null,
    meetingId: null,
    meetingTitle: null,
    meetingEndAt: null,
    meetingStatus: null,
    isUpcoming: false,
    isUnscheduledFallback: false,
    followUpSent: false,
    daysToNextStage: null,
    resultingStage: null,
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
    ...overrides,
  };
}

describe("DemoCoachingView", () => {
  it("renders transcript excerpt and confidence pills for analyzed demos", () => {
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
      totalScheduled: 1,
      totalCompleted: 1,
      totalNoShows: 0,
      noShowRate: 0,
      avgLeadTimeDays: 2,
      upcomingCount: 0,
      meetingBackedUpcomingCount: 0,
      unscheduledDemoCount: 0,
      analyzedDemoCount: 1,
      avgDemoQualityScore: 91,
      transcriptCoveragePct: 100,
      topStrengthThemes: [{ label: "Discovery depth", count: 1 }],
      topGapThemes: [{ label: "Pricing clarity", count: 1 }],
      demos: [
        makeDemoRecord({
          dealId: "deal-1",
          dealName: "Acme",
          scheduledAt: "2026-03-05T18:00:00.000Z",
          meetingId: "meeting-1",
          meetingTitle: "Acme Demo",
          source: "Organic",
          outcome: "completed",
          transcriptStatus: "matched",
          transcriptMatchConfidence: 0.92,
          transcriptSourceUrl: "https://archive.test/transcript",
          transcriptSourceTitle: "Archived transcript",
          transcriptSourceDocumentId: "doc-1",
          transcriptText: "Customer: We have budget approval.\nRep: I will send pricing today.",
          analysisStatus: "ready",
          qualityScore: 91,
          qualitySummary: "Strong discovery and clear close.",
          strengths: ["Discovery depth"],
          gaps: ["Pricing clarity"],
          nextSteps: ["Send pricing recap"],
          customerSignals: ["Budget approved"],
          outcomeConfidence: "high",
          coachingMemo: "Tighten pricing explanation.",
          nextStepMemo: "Send recap and book procurement review.",
        }),
      ],
      upcomingDemos: [],
      bySource: [],
      byOutcome: [],
      conversionFunnel: [],
      weeklyTrend: [],
      journeyPaths: [],
    };

    render(<DemoCoachingView data={data} />);

    expect(screen.getByText("Transcript Excerpt")).toBeTruthy();
    expect(screen.getByText(/budget approval/i)).toBeTruthy();
    expect(screen.getByText("Match 92%")).toBeTruthy();
    expect(screen.getByText("Outcome: high")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Archived transcript" }).getAttribute("href")).toBe(
      "https://archive.test/transcript",
    );
  });
});

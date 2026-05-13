import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoAttributionView } from "@/components/analytics/demo-attribution-view";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

describe("DemoAttributionView", () => {
  it("shows suspicious HubSpot lead exclusions in demo attribution", () => {
    const data = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-05-01",
        to: "2026-05-08",
        days: 8,
        label: "Last 8 days",
      },
    });

    data.demoAnalytics = {
      totalScheduled: 1,
      totalCompleted: 1,
      totalNoShows: 0,
      excludedSuspiciousLeads: 2,
      noShowRate: 0,
      avgLeadTimeDays: 1,
      upcomingCount: 0,
      meetingBackedUpcomingCount: 0,
      unscheduledDemoCount: 0,
      analyzedDemoCount: 0,
      avgDemoQualityScore: 0,
      transcriptCoveragePct: 0,
      topStrengthThemes: [],
      topGapThemes: [],
      demos: [],
      upcomingDemos: [],
      bySource: [
        {
          source: "Organic",
          scheduled: 1,
          completed: 1,
          noShows: 0,
          conversionRate: 100,
        },
      ],
      byOutcome: [],
      conversionFunnel: [],
      weeklyTrend: [],
      journeyPaths: [],
    };

    render(<DemoAttributionView data={data} />);

    expect(screen.getByText("Excluded Leads")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("flagged as suspicious")).toBeTruthy();
  });
});

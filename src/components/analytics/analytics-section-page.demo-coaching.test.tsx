import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSectionPage } from "@/components/analytics/analytics-section-page";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { clearDashboardCache } from "@/lib/client/dashboard-cache-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
  usePathname: () => "/analytics/demo-coaching",
  useSearchParams: () => new URLSearchParams(),
}));

describe("AnalyticsSectionPage demo coaching", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("renders the demo coaching child dashboard", async () => {
    const payload = createEmptyAnalyticsDashboardData({
      freshness: {},
      timeRange: {
        preset: "30d",
        from: "2026-02-01",
        to: "2026-03-01",
        days: 30,
        label: "Last 30 days",
      },
    });

    payload.demoAnalytics = {
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
        {
          dealId: "deal-1",
          dealName: "Acme",
          ownerName: null,
          contactEmail: null,
          scheduledAt: "2026-03-05T18:00:00.000Z",
          meetingId: "meeting-1",
          meetingTitle: "Acme Demo",
          meetingEndAt: "2026-03-05T18:30:00.000Z",
          meetingStatus: "COMPLETED",
          isUpcoming: false,
          isUnscheduledFallback: false,
          source: "Organic",
          outcome: "completed",
          followUpSent: true,
          daysToNextStage: 2,
          resultingStage: "Closed Won",
          transcriptStatus: "matched",
          transcriptMatchConfidence: 0.92,
          transcriptSourceUrl: "https://archive.test/transcript",
          transcriptSourceTitle: "Archived transcript",
          transcriptSourceDocumentId: "doc-1",
          transcriptText: "Customer: We have budget approval.",
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
        },
      ],
      upcomingDemos: [],
      bySource: [],
      byOutcome: [],
      conversionFunnel: [],
      weeklyTrend: [],
      journeyPaths: [],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
      })),
    );

    render(<AnalyticsSectionPage sectionId="demo-coaching" />);

    await waitFor(() => {
      expect(screen.getByText("Transcript Excerpt")).toBeTruthy();
    });

    expect(screen.getByText("Match 92%")).toBeTruthy();
    expect(screen.getByText("Outcome: high")).toBeTruthy();
  });
});

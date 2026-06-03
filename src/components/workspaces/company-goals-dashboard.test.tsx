import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompanyGoalsDashboard } from "@/components/workspaces/company-goals-dashboard";
import type { CompanyGoalsDashboardData } from "@/lib/imladris/company-goals";

const DATA: CompanyGoalsDashboardData = {
  generatedAt: "2026-06-01T12:00:00.000Z",
  summary: {
    totalActiveGoals: 2,
    onTrackGoals: 1,
    atRiskGoals: 1,
    completedRecently: 1,
    latestSyncAt: "2026-06-01T12:00:00.000Z",
  },
  goals: [
    {
      id: "project_1",
      name: "Launch self-serve onboarding",
      description: "Ship the onboarding project.",
      url: "https://linear.app/acme/project/self-serve-onboarding",
      state: "started",
      status: "on_track",
      leadName: "Ada Lovelace",
      teamLabels: ["ENG"],
      targetDate: "2026-06-30",
      updatedAt: "2026-05-31T00:00:00.000Z",
      completedAt: null,
      progressPct: 50,
      completedIssueCount: 1,
      totalIssueCount: 2,
      blockedIssueCount: 0,
      warnings: [],
    },
    {
      id: "project_2",
      name: "Repair billing lifecycle",
      description: null,
      url: "https://linear.app/acme/project/billing",
      state: "started",
      status: "at_risk",
      leadName: null,
      teamLabels: ["FIN"],
      targetDate: "2026-05-15",
      updatedAt: "2026-05-01T00:00:00.000Z",
      completedAt: null,
      progressPct: 0,
      completedIssueCount: 0,
      totalIssueCount: 1,
      blockedIssueCount: 1,
      warnings: ["Target date has passed.", "No Linear activity in the last 14 days.", "1 blocked issue."],
    },
  ],
  emptyState: null,
};

describe("CompanyGoalsDashboard", () => {
  it("renders Linear project goals and progress without legacy analytics copy", () => {
    render(<CompanyGoalsDashboard data={DATA} />);

    expect(screen.getByRole("heading", { name: "Company Goals" })).toBeTruthy();
    expect(screen.getByText("2 active")).toBeTruthy();
    expect(screen.getByText("1 on track")).toBeTruthy();
    expect(screen.getByText("1 at risk")).toBeTruthy();
    expect(screen.getByText("Launch self-serve onboarding")).toBeTruthy();
    expect(screen.getByText("Repair billing lifecycle")).toBeTruthy();
    expect(screen.getByText("1 / 2 issues")).toBeTruthy();
    expect(screen.getByText("0 / 1 issues")).toBeTruthy();
    expect(screen.getByText("50.0%")).toBeTruthy();
    expect(screen.getByText("Target date has passed.")).toBeTruthy();
    expect(screen.queryByText(/legacy analytics/i)).toBeNull();
  });

  it("renders the Linear connection empty state", () => {
    render(
      <CompanyGoalsDashboard
        data={{
          ...DATA,
          summary: {
            totalActiveGoals: 0,
            onTrackGoals: 0,
            atRiskGoals: 0,
            completedRecently: 0,
            latestSyncAt: null,
          },
          goals: [],
          emptyState: {
            title: "No Linear goals synced",
            description: "Connect Linear in Settings > Integrations or run the Linear sync to populate company goals.",
          },
        }}
      />,
    );

    expect(screen.getByText("No Linear goals synced")).toBeTruthy();
    expect(screen.getByText(/Settings > Integrations/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open integrations/i }).getAttribute("href")).toBe("/settings");
  });
});

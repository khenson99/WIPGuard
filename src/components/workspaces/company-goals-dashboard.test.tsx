import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      trackingEnabled: false,
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
      trackingEnabled: false,
      warnings: ["Target date has passed.", "No Linear activity in the last 14 days.", "1 blocked issue."],
    },
  ],
  trackingSetup: {
    configured: false,
    options: [
      {
        id: "project_1",
        name: "Launch self-serve onboarding",
        state: "started",
        tracked: false,
      },
      {
        id: "project_2",
        name: "Repair billing lifecycle",
        state: "started",
        tracked: false,
      },
    ],
  },
  emptyState: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CompanyGoalsDashboard", () => {
  it("renders Linear project goals and progress without legacy analytics copy", () => {
    render(<CompanyGoalsDashboard data={DATA} />);

    expect(screen.getByRole("heading", { name: "Company Goals" })).toBeTruthy();
    expect(screen.getByText("2 active")).toBeTruthy();
    expect(screen.getByText("1 on track")).toBeTruthy();
    expect(screen.getByText("1 at risk")).toBeTruthy();
    expect(screen.getAllByText("Launch self-serve onboarding").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Repair billing lifecycle").length).toBeGreaterThan(0);
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
          trackingSetup: {
            configured: false,
            options: [],
          },
          emptyState: {
            title: "No Linear goals synced",
            description: "Connect Linear in Settings > Integrations, then run Linear Issue Sync to populate company goals.",
          },
        }}
      />,
    );

    expect(screen.getByText("No Linear goals synced")).toBeTruthy();
    expect(screen.getByText(/Settings > Integrations/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open Integrations/i }).getAttribute("href")).toBe("/settings?tab=integrations");
  });

  it("lets users choose which synced Linear projects become tracked goals", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ linearProjectIds: ["project_1"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<CompanyGoalsDashboard data={DATA} />);

    await user.click(screen.getByRole("checkbox", { name: /Launch self-serve onboarding/i }));
    await user.click(screen.getByRole("button", { name: /Save tracked goals/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/goals/tracking", expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linearProjectIds: ["project_1"] }),
      }));
    });
    expect(screen.getByText("Tracked goals saved.")).toBeTruthy();
  });

  it("unwraps provider date envelopes before rendering sync and goal dates", () => {
    render(
      <CompanyGoalsDashboard
        data={{
          ...DATA,
          summary: {
            ...DATA.summary,
            latestSyncAt: { value: "2026-06-01T12:00:00.000Z" } as never,
          },
          goals: [
            {
              ...DATA.goals[0],
              targetDate: { data: { value: "2026-06-30" } } as never,
              updatedAt: { attributes: { value: "2026-05-31T00:00:00.000Z" } } as never,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Synced 2026-06-01")).toBeTruthy();
    expect(screen.getByText("2026-06-30")).toBeTruthy();
    expect(screen.getByText("2026-05-31")).toBeTruthy();
  });

  it("unwraps provider numeric envelopes before rendering progress and issue counts", () => {
    render(
      <CompanyGoalsDashboard
        data={{
          ...DATA,
          goals: [
            {
              ...DATA.goals[0],
              progressPct: { data: { attributes: { value: "50" } } } as never,
              completedIssueCount: { value: "1" } as never,
              totalIssueCount: { metricValue: "2" } as never,
              blockedIssueCount: { amount: "0" } as never,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("50.0%")).toBeTruthy();
    expect(screen.getByText("1 / 2 issues")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByText("[object Object]")).toBeNull();
  });
});

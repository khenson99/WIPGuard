import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalizedDashboard } from "@/components/dashboard/personalized-dashboard";

describe("PersonalizedDashboard", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps cached content visible when fetch fails and marks state stale", async () => {
    window.sessionStorage.setItem(
      "dashboard:personalized:v2",
      JSON.stringify({
        data: {
          generatedAt: "2026-02-17T00:00:00.000Z",
          personal: {
            myActive: [],
            myBlocked: [],
            myOverdue: [],
            myDueSoon: [],
            myCompletedWeek: 2,
            recommendations: [
              {
                id: "task-1",
                title: "Call customer",
                status: "ACTIVE",
                priority: "P1",
                dueDate: null,
                project: null,
              },
            ],
          },
          team: {
            staleTasks: 1,
            blockedTasks: 2,
            overdueTasks: 3,
            taskStatusOverview: { ACTIVE: 3 },
          },
          projects: {
            active: [],
          },
        },
        lastUpdatedAt: "2026-02-17T00:00:00.000Z",
      })
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("service unavailable");
      })
    );

    render(<PersonalizedDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeTruthy();
    });

    expect(screen.getByText("Call customer")).toBeTruthy();
    expect(screen.getByText("Showing cached data while latest refresh failed.")).toBeTruthy();
  });
});

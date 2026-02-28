import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalizedDashboard } from "@/components/dashboard/personalized-dashboard";
import { clearDashboardCache, useDashboardCacheStore } from "@/lib/client/dashboard-cache-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Passthrough,
    PieChart: Passthrough,
    Pie: Passthrough,
    Cell: Passthrough,
    Tooltip: Passthrough,
    BarChart: Passthrough,
    Bar: Passthrough,
    XAxis: Passthrough,
    YAxis: Passthrough,
    CartesianGrid: Passthrough,
    Legend: Passthrough,
    LineChart: Passthrough,
    Line: Passthrough,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
describe("PersonalizedDashboard", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("renders visual dashboard sections from cached data", async () => {
    window.sessionStorage.setItem(
      "dashboard:personalized:v2",
      JSON.stringify({
        data: {
          generatedAt: "2026-02-17T00:00:00.000Z",
          personal: {
            myActive: [{ id: "a1", title: "Active task", status: "ACTIVE", priority: "P2", dueDate: null, project: null }],
            myBlocked: [{ id: "b1", title: "Blocked task", status: "NOT_DONE", priority: "P1", dueDate: null, project: null }],
            myOverdue: [
              { id: "o1", title: "Overdue 1", status: "ACTIVE", priority: "P0", dueDate: "2026-02-16T00:00:00.000Z", project: null },
              { id: "o2", title: "Overdue 2", status: "ACTIVE", priority: "P1", dueDate: "2026-02-15T00:00:00.000Z", project: null },
            ],
            myDueSoon: [{ id: "d1", title: "Due soon", status: "ACTIVE", priority: "P3", dueDate: "2026-02-18T00:00:00.000Z", project: null }],
            myCompletedWeek: 2,
            completedByDay: [
              { date: "2026-02-14", count: 0 },
              { date: "2026-02-15", count: 1 },
              { date: "2026-02-16", count: 1 },
            ],
            recommendations: [],
          },
          team: {
            staleTasks: 1,
            blockedTasks: 2,
            overdueTasks: 3,
            taskStatusOverview: { ACTIVE: 3, DONE: 4 },
          },
          projects: { active: [] },
        },
        lastUpdatedAt: "2026-02-17T00:00:00.000Z",
      })
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "no-store in test" }), { status: 500 }))
    );

    render(<PersonalizedDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeTruthy();
    });

    expect(screen.getByText("My Workload")).toBeTruthy();
    expect(screen.getByText("Team Status Overview")).toBeTruthy();
  });

  it("changes the focused task list when clicking legend items", async () => {
    window.sessionStorage.setItem(
      "dashboard:personalized:v2",
      JSON.stringify({
        data: {
          generatedAt: "2026-02-17T00:00:00.000Z",
          personal: {
            myActive: [],
            myBlocked: [{ id: "b1", title: "Blocked task", status: "NOT_DONE", priority: "P1", dueDate: null, project: null }],
            myOverdue: [{ id: "o1", title: "Overdue task", status: "ACTIVE", priority: "P0", dueDate: "2026-02-16T00:00:00.000Z", project: null }],
            myDueSoon: [],
            myCompletedWeek: 0,
            recommendations: [],
          },
          team: {
            staleTasks: 0,
            blockedTasks: 0,
            overdueTasks: 0,
            taskStatusOverview: { ACTIVE: 0 },
          },
          projects: { active: [] },
        },
        lastUpdatedAt: "2026-02-17T00:00:00.000Z",
      })
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "no-store in test" }), { status: 500 }))
    );

    render(<PersonalizedDashboard />);

    await waitFor(() => {
      expect(screen.getByText("My Blockers")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Overdue:/ }));
    expect(screen.getByRole("heading", { name: "My Overdue" })).toBeTruthy();
  });

  it("changes focus via keyboard activation", async () => {
    window.sessionStorage.setItem(
      "dashboard:personalized:v2",
      JSON.stringify({
        data: {
          generatedAt: "2026-02-17T00:00:00.000Z",
          personal: {
            myActive: [{ id: "a1", title: "Active task", status: "ACTIVE", priority: "P1", dueDate: null, project: null }],
            myBlocked: [],
            myOverdue: [],
            myDueSoon: [],
            myCompletedWeek: 0,
            recommendations: [],
          },
          team: {
            staleTasks: 0,
            blockedTasks: 0,
            overdueTasks: 0,
            taskStatusOverview: { ACTIVE: 0 },
          },
          projects: { active: [] },
        },
        lastUpdatedAt: "2026-02-17T00:00:00.000Z",
      })
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "no-store in test" }), { status: 500 }))
    );

    render(<PersonalizedDashboard />);

    await waitFor(() => {
      expect(screen.getByText("My Blockers")).toBeTruthy();
    });

    const activeButton = screen.getByRole("button", { name: /Active:/ });
    activeButton.focus();
    fireEvent.keyDown(activeButton, { key: "Enter" });

    expect(screen.getByText("My Active")).toBeTruthy();
  });

  it("keeps cached content visible when fetch fails and marks state stale", async () => {
    useDashboardCacheStore.getState().write("dashboard:personalized:v2", {
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
    });

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

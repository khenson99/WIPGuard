import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorDashboard } from "@/components/dashboard/operator-dashboard";

vi.mock("@/components/dashboard/personalized-dashboard", () => ({
  PersonalizedDashboard: ({ title }: { title?: string }) => (
    <div>{title ?? "Personalized Dashboard"}</div>
  ),
}));

describe("OperatorDashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders platform overview cards from the overview API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            generatedAt: "2026-03-11T16:00:00.000Z",
            workSummary: {
              workspaceId: "work",
              activeTasks: 4,
              overdueTasks: 2,
              blockedTasks: 1,
              dueSoonTasks: 3,
              openAlerts: 2,
            },
            revenueSummary: {
              workspaceId: "deals",
              openDeals: 6,
              pipelineValue: 42500,
              closingThisMonth: 3,
              wonThisQuarter: 2,
            },
            integrationHealth: {
              workspaceId: "integrations",
              totalConnections: 8,
              connectedConnections: 6,
              degradedConnections: 2,
              errorConnections: 1,
              staleConnections: 1,
              missingConnections: 2,
            },
            automationAttention: {
              workspaceId: "automations",
              activeWorkflows: 5,
              pendingApprovals: 1,
              pendingRecommendations: 2,
              failingRuns: 1,
              waitingExternalRuns: 1,
            },
            analyticsFreshness: {
              workspaceId: "analytics",
              latestSnapshotAt: "2026-03-11T15:55:00.000Z",
              healthyDomains: 5,
              staleDomains: 1,
              errorDomains: 1,
              missingDomains: 2,
            },
          }),
        ),
      ),
    );

    render(<OperatorDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Operator Cockpit")).toBeTruthy();
    });

    expect(screen.getByText("4 active tasks in motion")).toBeTruthy();
    expect(screen.getByText("6 open deals worth $42,500")).toBeTruthy();
    expect(screen.getByText("6/8 providers connected")).toBeTruthy();
    expect(screen.getByText("5 active workflows running")).toBeTruthy();
    expect(screen.getByText("5 healthy analytics domains")).toBeTruthy();
    expect(screen.getByText("My Work")).toBeTruthy();
  });
});

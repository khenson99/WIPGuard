import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorDashboard } from "@/components/dashboard/operator-dashboard";
import { clearDashboardCache } from "@/lib/client/dashboard-cache-store";

describe("OperatorDashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    clearDashboardCache();
  });

  it("renders platform overview cards from the overview API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            generatedAt: "2026-03-11T16:00:00.000Z",
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

    expect(screen.getByText("6 open deals worth $42,500")).toBeTruthy();
    expect(screen.getByText("6/8 providers connected")).toBeTruthy();
    expect(screen.getByText("5 active workflows running")).toBeTruthy();
    expect(screen.getByText("5 healthy analytics domains")).toBeTruthy();
    expect(screen.queryByText("My Work")).toBeNull();
  });

  it("renders a specific setup state when organization context is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "Organization context required for dashboard overview",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<OperatorDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Organization Context Required")).toBeTruthy();
    });

    expect(
      screen.getByText(
        "Dashboard overview needs an organization context before it can load operator metrics."
      )
    ).toBeTruthy();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerSuccessTab } from "@/components/analytics/customer-success-tab";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";

function makeHealth(score: number, grade: "A" | "B" | "C" | "D" | "F" = "B") {
  return {
    score,
    grade,
    trend: "stable" as const,
    confidence: 82,
    updatedAt: "2026-03-10T00:00:00.000Z",
    components: {
      adoption: {
        score,
        weight: 0.24,
        weightedScore: score * 0.24,
        trend: "stable" as const,
        status: "watch" as const,
        evidence: ["Usage stable"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      engagement: {
        score,
        weight: 0.22,
        weightedScore: score * 0.22,
        trend: "stable" as const,
        status: "watch" as const,
        evidence: ["Meetings steady"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      relationship: {
        score,
        weight: 0.2,
        weightedScore: score * 0.2,
        trend: "stable" as const,
        status: "healthy" as const,
        evidence: ["Champion engaged"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      support: {
        score,
        weight: 0.2,
        weightedScore: score * 0.2,
        trend: "stable" as const,
        status: "watch" as const,
        evidence: ["Queue manageable"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      commercial: {
        score,
        weight: 0.14,
        weightedScore: score * 0.14,
        trend: "stable" as const,
        status: "healthy" as const,
        evidence: ["Renewal tracked"],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
    },
  };
}

function makePortfolio(): CustomerSuccessPortfolio {
  return {
    generatedAt: "2026-03-10T08:00:00.000Z",
    summary: {
      totalAccounts: 12,
      avgHealthScore: 74,
      atRiskAccounts: 3,
      openAlerts: 6,
    },
    healthDistribution: [
      { label: "A", count: 2 },
      { label: "B", count: 4 },
      { label: "C", count: 3 },
      { label: "D", count: 2 },
      { label: "F", count: 1 },
    ],
    attentionAccounts: [
      {
        accountId: "acct_1",
        name: "Acme Co",
        ownerName: "Casey",
        health: makeHealth(58, "D"),
        openAlertCount: 2,
        lifecycleStage: "AT_RISK",
        relationship: {
          connectedSystems: 3,
          retentionStatus: "At Risk",
          primaryLirPassed: false,
          implementationStage: "LIVE",
          missingSources: ["pylon"],
        },
        nextAction: "Schedule exec check-in",
      },
    ],
    alerts: [
      {
        id: "alert_1",
        accountId: "acct_1",
        title: "Renewal risk rising",
        category: "risk",
        severity: "high",
        status: "open",
        slaStatus: "at_risk",
        source: "commercial",
        evidence: ["Renewal in 45 days"],
        suggestedAction: "Confirm champion and rollout plan",
        createdAt: "2026-03-09T10:00:00.000Z",
        updatedAt: "2026-03-10T08:00:00.000Z",
      },
    ],
    recentActivity: [
      {
        id: "event_1",
        accountId: "acct_1",
        type: "relationship",
        title: "QBR completed",
        description: "Exec sponsor joined the call",
        occurredAt: "2026-03-09T12:00:00.000Z",
      },
    ],
    accounts: [
      {
        accountId: "acct_1",
        name: "Acme Co",
        segment: "Mid-market",
        tier: "Growth",
        ownerName: "Casey",
        health: makeHealth(58, "D"),
        lastActivityAt: "2026-03-09T12:00:00.000Z",
        renewalDate: "2026-04-20T00:00:00.000Z",
        openAlertCount: 2,
        relationship: {
          connectedSystems: 3,
          retentionStatus: "At Risk",
          primaryLirPassed: false,
          implementationStage: "LIVE",
          missingSources: ["pylon"],
        },
      },
      {
        accountId: "acct_2",
        name: "No Coda Co",
        segment: "SMB",
        tier: "Starter",
        ownerName: "Morgan",
        health: makeHealth(66, "D"),
        lastActivityAt: "2026-03-08T12:00:00.000Z",
        renewalDate: "2026-05-20T00:00:00.000Z",
        openAlertCount: 1,
        relationship: {
          connectedSystems: 1,
          retentionStatus: "Watch",
          primaryLirPassed: false,
          implementationStage: "BLOCKED",
          missingSources: ["coda", "pylon"],
        },
      },
    ],
  };
}

function makeAnalyticsData(): AnalyticsDashboardData {
  return {
    freshness: {
      google_workspace: { status: "CONNECTED", stale: false },
      slack: { status: "CONNECTED", stale: true },
      coda: { status: "CONNECTED", stale: false },
    },
    pylon: {
      openConversations: 28,
      urgentConversations: 18,
      waitingOnTeam: 12,
      avgFirstResponseMinutes: 180,
    },
    coda: {
      totalCards: 42,
    },
    slack: {
      enabledRules: 2,
      totalRules: 2,
      trend: [{ date: "2026-03-08", createdTasks: 2, receipts: 3 }],
    },
    googleWorkspace: {
      enabledRules: 1,
      totalRules: 1,
      trend: [{ date: "2026-03-08", createdTasks: 1, receipts: 1 }],
    },
    codaOps: {
      enabledRules: 3,
      totalRules: 3,
      trend: [{ date: "2026-03-08", createdTasks: 4, receipts: 2 }],
    },
  } as unknown as AnalyticsDashboardData;
}

describe("CustomerSuccessTab", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the customer-success portfolio and integration-led recommendations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/customer-success/portfolio") {
          return {
            ok: true,
            status: 200,
            json: async () => makePortfolio(),
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${String(input)}`);
      })
    );

    render(<CustomerSuccessTab data={makeAnalyticsData()} />);

    await waitFor(() => {
      expect(screen.getByText("Portfolio Accounts")).toBeTruthy();
    });

    expect(screen.getAllByText("Acme Co").length).toBeGreaterThan(0);
    expect(screen.getByText("Renewal risk rising")).toBeTruthy();
    expect(screen.getByText("QBR completed")).toBeTruthy();
    expect(screen.getByText("Integration Delivery Status")).toBeTruthy();
    expect(screen.getByText("Accounts With Coda")).toBeTruthy();
    expect(screen.getByText("Relationship Coverage")).toBeTruthy();
    expect(screen.getByText("Missing Coda Accounts")).toBeTruthy();
    expect(screen.getByText("LIR Fail Queue")).toBeTruthy();
    expect(screen.getAllByText("No Coda Co").length).toBeGreaterThan(0);
    expect(screen.getAllByText("At Risk").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing pylon/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Missing coda/).length).toBeGreaterThan(0);
    expect(screen.getByText("Connected but stale")).toBeTruthy();
    expect(screen.getByText("Rebalance urgent queue ownership")).toBeTruthy();
    expect(screen.getByText("Clear the waiting-on-team queue")).toBeTruthy();
    expect(screen.getByText("Tighten first-response coverage")).toBeTruthy();
  });

  it("shows the portfolio-only fallback when integration analytics are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makePortfolio(),
      }))
    );

    render(<CustomerSuccessTab data={null} />);

    await waitFor(() => {
      expect(screen.getByText("Customer Records")).toBeTruthy();
    });

    expect(
      screen.getByText(
        "Portfolio data is available, but customer-success integration analytics are not configured for the selected range."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("Not provisioned").length).toBeGreaterThan(0);
  });

  it("runs the relationship sync action and refreshes the portfolio", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/customer-success/portfolio") {
        return {
          ok: true,
          status: 200,
          json: async () => makePortfolio(),
        } as Response;
      }

      if (url === "/api/retention/sync" && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            completed: ["sync_sources", "build_dataset", "materialize"],
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerSuccessTab data={makeAnalyticsData()} />);

    await waitFor(() => {
      expect(screen.getByText("Customer Relationship Portfolio")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sync relationship data" }));

    await waitFor(() => {
      expect(screen.getByText("Relationship data synced: sync_sources, build_dataset, materialize")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/retention/sync",
      expect.objectContaining({
        method: "POST",
      })
    );
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerSuccessPortfolioPanels } from "@/components/analytics/customer-success-portfolio-panels";
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
    leadingIndicators: {
      recency: {
        label: "Activity recency",
        score,
        status: "watch" as const,
        value: "7d since touch",
        evidence: ["Recent customer-facing touch found"],
      },
      cadence: {
        label: "Touch cadence",
        score,
        status: "watch" as const,
        value: "3 touches / 30d",
        evidence: ["Follow-up rhythm is steady"],
      },
      consistency: {
        label: "Touch consistency",
        score,
        status: "watch" as const,
        value: "3/3 months active",
        evidence: ["No large touch gaps"],
      },
      depth: {
        label: "Execution depth",
        score,
        status: "watch" as const,
        value: "2/3 milestones done",
        evidence: ["Plan is moving forward"],
      },
      breadth: {
        label: "Relationship breadth",
        score,
        status: "healthy" as const,
        value: "2/3 stakeholders covered",
        evidence: ["Champion engaged"],
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
        accountId: "acct_2",
        name: "Beacon Ltd",
        segment: "Enterprise",
        tier: "Strategic",
        ownerName: "Morgan",
        health: makeHealth(88, "A"),
        lastActivityAt: "2026-03-10T12:00:00.000Z",
        renewalDate: "2026-05-30T00:00:00.000Z",
        openAlertCount: 5,
      },
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
      },
    ],
  };
}

describe("CustomerSuccessPortfolioPanels", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows a loading state before the portfolio resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise(() => {
            // Keep the promise pending to hold the initial loading state.
          })
      )
    );

    const { container } = render(<CustomerSuccessPortfolioPanels />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Portfolio Accounts")).toBeNull();
  });

  it("shows an error banner when the portfolio request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "Portfolio exploded" }),
      }))
    );

    render(<CustomerSuccessPortfolioPanels />);

    await waitFor(() => {
      expect(screen.getByText("Portfolio exploded")).toBeTruthy();
    });
  });

  it("renders the portfolio panels when the request succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makePortfolio(),
      }))
    );

    render(<CustomerSuccessPortfolioPanels />);

    await waitFor(() => {
      expect(screen.getByText("Portfolio Accounts")).toBeTruthy();
    });

    expect(screen.getByText("Leading Indicator Pressure")).toBeTruthy();
    expect(screen.getByText("Health Distribution")).toBeTruthy();
    expect(screen.getByText("Attention Queue")).toBeTruthy();
    expect(screen.getByText("Renewal risk rising")).toBeTruthy();
    expect(screen.getByText("Recent Activity")).toBeTruthy();
    expect(screen.getByText("Primary Signal")).toBeTruthy();
  });
});

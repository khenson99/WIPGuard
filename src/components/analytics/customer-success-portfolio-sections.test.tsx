import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  LeadingIndicatorPressurePanel,
  PortfolioAlertsPanel,
  PortfolioAttentionQueuePanel,
  PortfolioHealthDistributionPanel,
  PortfolioRecentActivityPanel,
  PortfolioSummaryCards,
} from "@/components/analytics/customer-success-portfolio-sections";

describe("customer-success-portfolio-sections", () => {
  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return String(value);
  };

  const formatDate = (value?: string) => value ?? "—";
  const healthTone = (score: number) => (score >= 80 ? "text-[var(--success)]" : "text-red-500");

  it("renders the portfolio summary cards", () => {
    render(
      <PortfolioSummaryCards
        accountsWithCoda={9}
        avgHealthScore={74}
        atRiskAccounts={3}
        coverageGaps={4}
        formatNumber={formatNumber}
        healthTone={healthTone}
        openAlerts={6}
        totalAccounts={12}
      />
    );

    expect(screen.getByText("Customer Records")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Average Health")).toBeTruthy();
    expect(screen.getByText("74")).toBeTruthy();
    expect(screen.getByText("Accounts With Coda")).toBeTruthy();
    expect(screen.getByText("Coverage Gaps")).toBeTruthy();
  });

  it("renders pressure, attention, alert, activity, and distribution panels", () => {
    render(
      <>
        <LeadingIndicatorPressurePanel
          formatNumber={formatNumber}
          indicatorFilter="recency"
          leadingIndicatorPressure={[
            { key: "recency", label: "Activity recency", count: 1 },
            { key: "cadence", label: "Touch cadence", count: 0 },
          ]}
          onToggleIndicator={() => {}}
          threshold={65}
        />
        <PortfolioHealthDistributionPanel
          formatNumber={formatNumber}
          healthDistribution={[
            { label: "A", count: 2 },
            { label: "D", count: 1 },
          ]}
        />
        <PortfolioAttentionQueuePanel
          attentionAccounts={[
            {
              accountId: "acct_1",
              name: "Acme Co",
              ownerName: "Casey",
              health: {
                score: 58,
                grade: "D",
                trend: "stable",
                confidence: 82,
                updatedAt: "2026-03-10T00:00:00.000Z",
                components: {
                  adoption: {
                    score: 58,
                    weight: 0.24,
                    weightedScore: 13.92,
                    trend: "stable",
                    status: "watch",
                    evidence: [],
                    lastUpdatedAt: "2026-03-10T00:00:00.000Z",
                  },
                  engagement: {
                    score: 58,
                    weight: 0.22,
                    weightedScore: 12.76,
                    trend: "stable",
                    status: "watch",
                    evidence: [],
                    lastUpdatedAt: "2026-03-10T00:00:00.000Z",
                  },
                  relationship: {
                    score: 58,
                    weight: 0.2,
                    weightedScore: 11.6,
                    trend: "stable",
                    status: "watch",
                    evidence: [],
                    lastUpdatedAt: "2026-03-10T00:00:00.000Z",
                  },
                  support: {
                    score: 58,
                    weight: 0.2,
                    weightedScore: 11.6,
                    trend: "stable",
                    status: "watch",
                    evidence: [],
                    lastUpdatedAt: "2026-03-10T00:00:00.000Z",
                  },
                  commercial: {
                    score: 58,
                    weight: 0.14,
                    weightedScore: 8.12,
                    trend: "stable",
                    status: "watch",
                    evidence: [],
                    lastUpdatedAt: "2026-03-10T00:00:00.000Z",
                  },
                },
                leadingIndicators: {
                  recency: {
                    label: "Activity recency",
                    score: 55,
                    status: "risk",
                    value: "7d since touch",
                    evidence: [],
                  },
                  cadence: {
                    label: "Touch cadence",
                    score: 60,
                    status: "watch",
                    value: "3 touches / 30d",
                    evidence: [],
                  },
                  consistency: {
                    label: "Touch consistency",
                    score: 70,
                    status: "watch",
                    value: "3/3 months active",
                    evidence: [],
                  },
                  depth: {
                    label: "Execution depth",
                    score: 72,
                    status: "watch",
                    value: "2/3 milestones done",
                    evidence: [],
                  },
                  breadth: {
                    label: "Relationship breadth",
                    score: 80,
                    status: "healthy",
                    value: "2/3 stakeholders covered",
                    evidence: [],
                  },
                },
              },
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
          ]}
          formatNumber={formatNumber}
          healthTone={healthTone}
        />
        <PortfolioAlertsPanel
          alerts={[
            {
              id: "alert_1",
              accountId: "acct_1",
              title: "Renewal risk rising",
              category: "risk",
              severity: "high",
              status: "open",
              slaStatus: "at_risk",
              source: "commercial",
              evidence: [],
              suggestedAction: "Confirm champion and rollout plan",
              createdAt: "2026-03-09T10:00:00.000Z",
              updatedAt: "2026-03-10T08:00:00.000Z",
            },
          ]}
        />
        <PortfolioRecentActivityPanel
          formatDate={formatDate}
          recentActivity={[
            {
              id: "event_1",
              accountId: "acct_1",
              type: "relationship",
              title: "QBR completed",
              description: "Exec sponsor joined the call",
              occurredAt: "2026-03-09T12:00:00.000Z",
            },
          ]}
        />
      </>
    );

    expect(screen.getByText("Leading Indicator Pressure")).toBeTruthy();
    expect(screen.getByText("Filtering table")).toBeTruthy();
    expect(screen.getByText("Health Distribution")).toBeTruthy();
    expect(screen.getByText("Attention Queue")).toBeTruthy();
    expect(screen.getByText(/At Risk/)).toBeTruthy();
    expect(screen.getByText("3 systems • LIVE • Missing pylon")).toBeTruthy();
    expect(screen.getByText("Primary risk: Activity recency • 7d since touch")).toBeTruthy();
    expect(screen.getByText("Open Alerts")).toBeTruthy();
    expect(screen.getByText("Renewal risk rising")).toBeTruthy();
    expect(screen.getByText("Recent Activity")).toBeTruthy();
    expect(screen.getByText("QBR completed")).toBeTruthy();
  });
});

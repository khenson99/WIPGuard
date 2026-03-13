import { describe, expect, it } from "vitest";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import { deriveCustomerSuccessPortfolioView } from "@/components/analytics/customer-success-portfolio-selectors";

function makeHealth(input: {
  score: number;
  recency: number;
  cadence: number;
  consistency: number;
  depth: number;
  breadth: number;
}): CustomerSuccessPortfolio["accounts"][number]["health"] {
  return {
    score: input.score,
    grade: input.score >= 80 ? "B" : "D",
    trend: "stable",
    confidence: 80,
    updatedAt: "2026-03-10T00:00:00.000Z",
    components: {
      adoption: {
        score: input.score,
        weight: 0.24,
        weightedScore: input.score * 0.24,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      engagement: {
        score: input.score,
        weight: 0.22,
        weightedScore: input.score * 0.22,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      relationship: {
        score: input.score,
        weight: 0.2,
        weightedScore: input.score * 0.2,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      support: {
        score: input.score,
        weight: 0.2,
        weightedScore: input.score * 0.2,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      commercial: {
        score: input.score,
        weight: 0.14,
        weightedScore: input.score * 0.14,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
    },
    leadingIndicators: {
      recency: {
        label: "Activity recency",
        score: input.recency,
        status: input.recency < 65 ? "risk" : "watch",
        value: `${input.recency} recency`,
        evidence: [],
      },
      cadence: {
        label: "Touch cadence",
        score: input.cadence,
        status: input.cadence < 65 ? "risk" : "watch",
        value: `${input.cadence} cadence`,
        evidence: [],
      },
      consistency: {
        label: "Touch consistency",
        score: input.consistency,
        status: input.consistency < 65 ? "risk" : "watch",
        value: `${input.consistency} consistency`,
        evidence: [],
      },
      depth: {
        label: "Execution depth",
        score: input.depth,
        status: input.depth < 65 ? "risk" : "watch",
        value: `${input.depth} depth`,
        evidence: [],
      },
      breadth: {
        label: "Relationship breadth",
        score: input.breadth,
        status: input.breadth < 65 ? "risk" : "watch",
        value: `${input.breadth} breadth`,
        evidence: [],
      },
    },
  };
}

function makePortfolio(): CustomerSuccessPortfolio {
  return {
    generatedAt: "2026-03-10T08:00:00.000Z",
    summary: {
      totalAccounts: 3,
      avgHealthScore: 72,
      atRiskAccounts: 2,
      openAlerts: 7,
    },
    healthDistribution: [],
    attentionAccounts: [],
    alerts: [],
    recentActivity: [],
    accounts: [
      {
        accountId: "acct-a",
        name: "Acme",
        ownerName: "Casey",
        health: makeHealth({ score: 58, recency: 55, cadence: 80, consistency: 82, depth: 83, breadth: 84 }),
        openAlertCount: 2,
        lastActivityAt: "2026-03-09T00:00:00.000Z",
        renewalDate: "2026-04-20T00:00:00.000Z",
      },
      {
        accountId: "acct-b",
        name: "Beacon",
        ownerName: "Morgan",
        health: makeHealth({ score: 88, recency: 78, cadence: 75, consistency: 74, depth: 76, breadth: 79 }),
        openAlertCount: 5,
        lastActivityAt: "2026-03-10T00:00:00.000Z",
        renewalDate: "2026-05-30T00:00:00.000Z",
      },
      {
        accountId: "acct-c",
        name: "Cinder",
        ownerName: "Riley",
        health: makeHealth({ score: 64, recency: 81, cadence: 62, consistency: 61, depth: 60, breadth: 77 }),
        openAlertCount: 1,
        lastActivityAt: "2026-03-08T00:00:00.000Z",
        renewalDate: "2026-04-10T00:00:00.000Z",
      },
    ],
  };
}

describe("customer success portfolio selectors", () => {
  it("sorts by weakest leading indicator by default and exposes pressure metadata", () => {
    const view = deriveCustomerSuccessPortfolioView({
      accountSort: "primary-signal",
      indicatorFilter: null,
      portfolio: makePortfolio(),
      showOnlyWeakSignals: false,
      weakSignalThreshold: 65,
    });

    expect(view.filteredAccounts.map((account) => account.accountId)).toEqual(["acct-a", "acct-c", "acct-b"]);
    expect(view.hasActiveFilters).toBe(false);
    expect(view.leadingIndicatorPressure[0]?.count).toBeGreaterThan(0);
  });

  it("applies weak-signal and specific-indicator filters together", () => {
    const view = deriveCustomerSuccessPortfolioView({
      accountSort: "alerts",
      indicatorFilter: "recency",
      portfolio: makePortfolio(),
      showOnlyWeakSignals: true,
      weakSignalThreshold: 65,
    });

    expect(view.hasActiveFilters).toBe(true);
    expect(view.indicatorFilterLabel).toBe("Activity recency");
    expect(view.filteredAccounts.map((account) => account.accountId)).toEqual(["acct-a"]);
  });
});

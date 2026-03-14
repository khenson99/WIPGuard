import { describe, expect, it } from "vitest";
import {
  makeAccount,
  makeHealth,
} from "@/components/analytics/__tests__/customer-success-test-helpers";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import { deriveCustomerSuccessPortfolioView } from "@/components/analytics/customer-success-portfolio-selectors";

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
      makeAccount("acct-a", {
        name: "Acme",
        ownerName: "Casey",
        health: makeHealth({
          score: 58,
          grade: "D",
          indicatorScores: { recency: 55, cadence: 80, consistency: 82, depth: 83, breadth: 84 },
        }),
        openAlertCount: 2,
        lastActivityAt: "2026-03-09T00:00:00.000Z",
        renewalDate: "2026-04-20T00:00:00.000Z",
      }),
      makeAccount("acct-b", {
        name: "Beacon",
        ownerName: "Morgan",
        health: makeHealth({
          score: 88,
          grade: "B",
          indicatorScores: { recency: 78, cadence: 75, consistency: 74, depth: 76, breadth: 79 },
        }),
        openAlertCount: 5,
        lastActivityAt: "2026-03-10T00:00:00.000Z",
        renewalDate: "2026-05-30T00:00:00.000Z",
      }),
      makeAccount("acct-c", {
        name: "Cinder",
        ownerName: "Riley",
        health: makeHealth({
          score: 64,
          grade: "D",
          indicatorScores: { recency: 81, cadence: 62, consistency: 61, depth: 60, breadth: 77 },
        }),
        openAlertCount: 1,
        lastActivityAt: "2026-03-08T00:00:00.000Z",
        renewalDate: "2026-04-10T00:00:00.000Z",
      }),
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

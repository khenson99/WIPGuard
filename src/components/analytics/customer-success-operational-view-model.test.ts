import { describe, expect, it } from "vitest";
import { deriveCustomerSuccessOperationalView } from "@/components/analytics/customer-success-operational-view-model";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

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
    },
    product: {
      backlogGrowth: 8,
      throughputRate: 62.4,
      overdueOpenTasks: 9,
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

describe("deriveCustomerSuccessOperationalView", () => {
  it("derives integration statuses, trend, risks, and actions", () => {
    const view = deriveCustomerSuccessOperationalView(makeAnalyticsData());

    expect(view.integrationStatuses).toEqual([
      {
        label: "Google Workspace",
        status: "Active",
        details: "1/1 rules enabled",
      },
      {
        label: "Slack",
        status: "Connected but stale",
        details: "2/2 rules enabled",
      },
      {
        label: "Coda",
        status: "Active",
        details: "3/3 rules enabled",
      },
    ]);
    expect(view.trend).toEqual([{ date: "2026-03-08", total: 13 }]);
    expect(view.maxTrend).toBe(13);
    expect(view.riskItems.map((item) => item.value)).toEqual([18, 8, 9]);
    expect(view.actions.map((item) => item.title)).toEqual([
      "Rebalance urgent queue ownership",
      "Throttle backlog inflow",
      "Automate follow-up execution",
      "Review overdue task assignments",
    ]);
    expect(view.openConversations).toBe(28);
    expect(view.codaCards).toBe(42);
    expect(view.hasLegacyAnalytics).toBe(true);
    expect(view.throughputRate).toBe(62.4);
  });

  it("returns fallback state when analytics data is unavailable", () => {
    const view = deriveCustomerSuccessOperationalView(null);

    expect(view.hasLegacyAnalytics).toBe(false);
    expect(view.trend).toEqual([]);
    expect(view.maxTrend).toBe(1);
    expect(view.actions).toEqual([
      {
        title: "System operating within thresholds",
        detail: "All customer-success indicators are within acceptable ranges. No immediate intervention required.",
        impact: "Use this window to invest in proactive retention workflows.",
        severity: "info",
      },
    ]);
    expect(view.integrationStatuses.map((item) => item.status)).toEqual([
      "Not provisioned",
      "Not provisioned",
      "Not provisioned",
    ]);
  });
});

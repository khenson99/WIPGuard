import { describe, expect, it } from "vitest";
import {
  makeAnalyticsData,
} from "@/components/analytics/__tests__/customer-success-test-helpers";
import { deriveCustomerSuccessOperationalView } from "@/components/analytics/customer-success-operational-view-model";

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
      "Review delivery balance",
      "Investigate delivery drag",
      "Review cycle-time risk",
    ]);
    expect(view.openConversations).toBe(28);
    expect(view.codaCards).toBe(42);
    expect(view.hasLegacyAnalytics).toBe(true);
    expect(view.deliveryRate).toBe(62.4);
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

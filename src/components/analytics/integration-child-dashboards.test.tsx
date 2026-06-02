import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { INTEGRATION_CHILD_DASHBOARD_REGISTRY, type IntegrationChildDashboardProps } from "@/components/analytics/integration-child-dashboards";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";
import { buildAnalyticsMetricsLayer } from "@/lib/analytics/kpis";

describe("integration child dashboards", () => {
  const baseData = createEmptyAnalyticsDashboardData({ freshness: {}, timeRange: undefined });
  const entries = Object.entries(INTEGRATION_CHILD_DASHBOARD_REGISTRY);

  it("registers all non-ops integration child dashboards", () => {
    expect(entries.length).toBeGreaterThanOrEqual(18);
  });

  for (const [childId, Dashboard] of entries) {
    it(`smoke renders ${childId}`, () => {
      const Component = Dashboard as ComponentType<IntegrationChildDashboardProps>;
      const view = render(<Component data={baseData} />);
      expect(view.container.firstChild).not.toBeNull();
    });
  }

  it("does not register the retired ads Coda/Kanban dashboard", () => {
    expect(INTEGRATION_CHILD_DASHBOARD_REGISTRY["ads-coda-kanban"]).toBeUndefined();
  });

  it("uses canonical Mercury metrics in the finance Mercury child dashboard", () => {
    const Dashboard = INTEGRATION_CHILD_DASHBOARD_REGISTRY["finance-mercury"] as ComponentType<IntegrationChildDashboardProps>;
    const data = {
      ...baseData,
      mercury: {
        accounts: [],
        cashFlow: {
          totalBalance: 500000,
          inflows30d: 18000,
          outflows30d: 45000,
          netCashFlow: -27000,
          runway: 18.5,
          burnRate: 27000,
        },
        _meta: {
          fetchedAt: "2026-02-18T00:00:00.000Z",
          nextRefresh: "2026-02-18T01:00:00.000Z",
          source: "live" as const,
        },
      },
    };
    data.metrics = buildAnalyticsMetricsLayer(data);
    data.metrics.finance.mercury!.totalBalance = 1234;

    render(<Dashboard data={data} />);

    expect(screen.getByText("$1.2K")).toBeTruthy();
  });

  it("uses canonical Stripe metrics in the sales Stripe child dashboard", () => {
    const Dashboard = INTEGRATION_CHILD_DASHBOARD_REGISTRY["sales-stripe"] as ComponentType<IntegrationChildDashboardProps>;
    const data = {
      ...baseData,
      stripe: {
        revenue: {
          mrr: 12000,
          mrrChange: 500,
          totalRevenue30d: 15000,
          totalRevenuePrev30d: 14000,
          revenueGrowth: 7.1,
          avgRevenuePerCustomer: 300,
        },
        subscriptions: {
          active: 40,
          pastDue: 2,
          canceled: 1,
          trialing: 3,
          churnRate: 0.04,
          recentChurnEvents: [],
        },
        payments: {
          succeeded: 79,
          failed: 1,
          successRate: 0.987,
        },
        revenueTrend: [],
        _meta: {
          fetchedAt: "2026-02-18T00:00:00.000Z",
          nextRefresh: "2026-02-18T01:00:00.000Z",
          source: "live" as const,
        },
      },
    };
    data.metrics = buildAnalyticsMetricsLayer(data);
    data.metrics.finance.stripe!.activeSubscriptions = 88;
    data.metrics.finance.stripe!.paymentSuccessPct = 91.2;

    render(<Dashboard data={data} />);

    expect(screen.getByText("88")).toBeTruthy();
    expect(screen.getByText("91.2%")).toBeTruthy();
  });
});

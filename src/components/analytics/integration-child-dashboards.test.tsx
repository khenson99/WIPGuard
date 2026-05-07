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
    expect(entries.length).toBeGreaterThanOrEqual(19);
  });

  for (const [childId, Dashboard] of entries) {
    it(`smoke renders ${childId}`, () => {
      const Component = Dashboard as ComponentType<IntegrationChildDashboardProps>;
      const view = render(<Component data={baseData} />);
      expect(view.container.firstChild).not.toBeNull();
    });
  }

  it("renders creator-intelligence outreach actions for ads coda dashboard", () => {
    const Dashboard = INTEGRATION_CHILD_DASHBOARD_REGISTRY["ads-coda-kanban"] as ComponentType<IntegrationChildDashboardProps>;
    const data = {
      ...baseData,
      coda: {
        totalCards: 2,
        cardsByStatus: [{ status: "Backlog", count: 2 }],
        recentCards: [
          {
            id: "c1",
            name: "Card 1",
            status: "Backlog",
            creator: "Alice",
            creatorEmail: "alice@example.com",
            createdAt: "2026-02-10T00:00:00.000Z",
            updatedAt: "2026-02-10T00:00:00.000Z",
          },
        ],
        creatorWindows: [
          {
            windowDays: 30 as const,
            totalCards: 2,
            previousWindowTotalCards: 1,
            trendDeltaPct: 100,
            uniqueCreators: 1,
            byCreator: [
              {
                creator: "Alice",
                email: "alice@example.com",
                cardCount: 2,
                activeDays: 2,
                firstCardAt: "2026-02-01T00:00:00.000Z",
                lastCardAt: "2026-02-10T00:00:00.000Z",
              },
            ],
          },
          {
            windowDays: 60 as const,
            totalCards: 2,
            previousWindowTotalCards: 0,
            trendDeltaPct: null,
            uniqueCreators: 1,
            byCreator: [],
          },
          {
            windowDays: 90 as const,
            totalCards: 2,
            previousWindowTotalCards: 0,
            trendDeltaPct: null,
            uniqueCreators: 1,
            byCreator: [],
          },
        ],
        newCreatorFeed: [
          {
            creator: "Alice",
            email: "alice@example.com",
            firstSeenAt: "2026-02-01T00:00:00.000Z",
            lastSeenAt: "2026-02-10T00:00:00.000Z",
            cardsCreated: 2,
            isUnknown: false,
          },
        ],
	        trends: {
	          newCreators30d: [{ date: "2026-02-01", count: 1 }],
	          cardsCreated90d: [{ date: "2026-02-10", count: 1 }],
	          downloadsDaily: [{ date: "2026-02-10", count: 0 }],
	          downloadersDaily: [{ date: "2026-02-10", count: 0 }],
	        },
	        engagedLeadCandidates: [
	          {
	            creator: "Alice",
            email: "alice@example.com",
            cards30d: 2,
            activeDays30d: 2,
            lastActivityAt: "2026-02-10T00:00:00.000Z",
            trend30dVsPrevious30d: 50,
            engagementScore: 81.2,
            reasons: ["high 30d volume"],
            funnelStatus: "notInFunnel" as const,
            hubspotSearchUrl: "https://app.hubspot.com/contacts?query=alice%40example.com",
          },
        ],
        diagnostics: {
          creatorResolutionMode: "override" as const,
          unknownCreatorRatio: 0,
          unknownCardCount: 0,
          hubspotMatchingErrors: 0,
        },
        _meta: {
          fetchedAt: "2026-02-18T00:00:00.000Z",
          nextRefresh: "2026-02-18T01:00:00.000Z",
          source: "live" as const,
        },
      },
    };

    render(<Dashboard data={data} />);
    expect(screen.getByText("Engaged Leads Missing from Funnel")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Search in HubSpot" })).toBeTruthy();
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

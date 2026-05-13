import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RetentionTenantDetailView } from "@/components/retention/retention-tenant-detail";
import { clearDashboardCache } from "@/lib/client/dashboard-cache-store";
import type { RetentionTenantDetail } from "@/lib/retention/types";

function buildDetail(): RetentionTenantDetail {
  return {
    generatedAt: "2026-03-16T02:00:00.000Z",
    lirDefinition: {
      id: "mature-active-weeks",
      label: "Active weeks trailing 8",
      lifecyclePhase: "MATURE",
      metricKey: "activeWeeksTrailing8",
      comparator: "gte",
      threshold: 5,
      windowLabel: "Trailing 8 weeks",
      description: "Tenant is active in at least five of the last eight weeks.",
      rationale: "Habitual weekly operations indicate embedded workflow value.",
    },
    tenant: {
      customerRecordId: "cust_1",
      tenantName: "Northstar Chemical",
      status: "At Risk",
      lifecyclePhase: "MATURE",
      primaryLirPassed: false,
      primaryLirLabel: "Active weeks trailing 8",
      primaryLirValue: 2,
      primaryLirThreshold: 5,
      currentMonthActivity: 4,
      trendVsPriorPct: -37.5,
      supportRisk: false,
      billingRisk: false,
      onboardingRisk: false,
      icp: true,
      ownerName: "CS Owner",
      segment: "Mid-market",
      plan: "Growth",
      ageBucket: "180d+",
      reasonCodes: [],
      lastMaterializedAt: "2026-03-16T02:00:00.000Z",
      goLiveDate: "2025-10-01T00:00:00.000Z",
      subscriptionStartDate: "2025-09-15T00:00:00.000Z",
      firstOrderDate: "2025-10-05T00:00:00.000Z",
      implementationStage: "LIVE",
      commercial: {},
      supportSummary: {},
      billingSummary: {},
      usageSummary: {},
      adoptionSummary: {
        ardaAdoptionCountsSource: "ARDA_USER_DETAILS",
        ardaUserDetailsCounts: {
          orders: 0,
          cards: 103,
          items: 102,
        },
        ardaDirectActivityCounts: {
          orders: 0,
          cards: 0,
          items: 0,
        },
      },
      coverage: {
        arda: true,
        coda: true,
        stripe: true,
        hubspot: true,
        pylon: false,
        ardaActivityCollectionAvailable: false,
        ardaUserDetailsFallback: true,
        missingSources: ["pylon"],
      },
      explanation: "at risk because weekly activity is below threshold.",
    },
    timeline: [
      {
        monthStart: "2026-03-01T00:00:00.000Z",
        primaryLirPassed: false,
        primaryLirValue: 2,
        currentMonthActivity: 4,
        orderCount: 1,
        cardTouches: 0,
        itemTouches: 0,
        activeWeeksTrailing8: 2,
        recentBaselineRatio: 0.4,
        supportTickets30d: 0,
        mrr: 2000,
        status: "At Risk",
      },
    ],
  };
}

describe("RetentionTenantDetailView", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("shows the tenant Arda fallback note", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/retention/tenants/cust_1") {
          return new Response(JSON.stringify(buildDetail()), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    render(<RetentionTenantDetailView customerRecordId="cust_1" />);

    await waitFor(() => {
      expect(screen.getByText("Northstar Chemical")).toBeTruthy();
    });

    expect(screen.getByText("Arda Data Quality")).toBeTruthy();
    expect(
      screen.getByText("Arda activity history is unavailable; breadth falls back to User Details (103 cards, 102 items).")
    ).toBeTruthy();
  });
});

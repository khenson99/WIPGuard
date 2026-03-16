import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RetentionDashboard } from "@/components/retention/retention-dashboard";
import { clearDashboardCache } from "@/lib/client/dashboard-cache-store";
import type { RetentionSummary, RetentionTenantRow } from "@/lib/retention/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/analytics/retention",
  useSearchParams: () => new URLSearchParams(),
}));

function buildSummary(): RetentionSummary {
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
    totals: {
      tenants: 1,
      activeTenants: 1,
      lirPassingTenants: 0,
      atRiskTenants: 1,
      onboardingRiskTenants: 0,
      billingRiskTenants: 0,
    },
    kpis: [],
    byIcp: [],
    byPlan: [],
    byAgeBucket: [],
    sharpDeclines: [],
    onboardingMisses: [],
    supportHeavyHighUsage: [],
    billingRiskAccounts: [],
    cohorts: [],
    dataCoverage: [
      {
        source: "ARDA",
        tenantsCovered: 1,
        totalTenants: 1,
        coveragePct: 100,
      },
    ],
    dataQuality: {
      arda: {
        latestSync: null,
        tenantRecords: 18,
        activityRecords: 0,
        tenantsWithUserDetailsBreadth: 10,
        adoptionBreadthSource: "ARDA_USER_DETAILS",
        note: "Arda direct item/card/order history is unavailable; current adoption breadth falls back to User Details snapshot counts.",
      },
    },
  };
}

function buildTenant(): RetentionTenantRow {
  return {
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
  };
}

describe("RetentionDashboard", () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.restoreAllMocks();
  });

  it("shows the Arda data-quality banner and fallback mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/retention/summary") {
          return new Response(JSON.stringify(buildSummary()), { status: 200 });
        }
        if (url === "/api/retention/tenants") {
          return new Response(
            JSON.stringify({
              generatedAt: "2026-03-16T02:00:00.000Z",
              tenants: [buildTenant()],
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      })
    );

    render(<RetentionDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Retention")).toBeTruthy();
    });

    expect(screen.getByText("Arda Data Quality")).toBeTruthy();
    expect(
      screen.getByText("Arda activity history is unavailable. Breadth is currently derived from User Details for 10 tenants.")
    ).toBeTruthy();
    expect(screen.getByText("Arda activity mode")).toBeTruthy();
    expect(screen.getByText("Fallback to User Details (10 tenants with breadth counts)")).toBeTruthy();
  });
});

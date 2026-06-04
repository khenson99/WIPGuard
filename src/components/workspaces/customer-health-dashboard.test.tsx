import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomerHealthDashboard } from "./customer-health-dashboard";
import type { CustomerHealthDashboardData } from "@/lib/retention/customer-health-dashboard";

const DATA: CustomerHealthDashboardData = {
  generatedAt: "2026-03-15T00:00:00.000Z",
  totals: {
    totalAccounts: 2,
    healthyAccounts: 1,
    watchAccounts: 0,
    atRiskAccounts: 1,
    onboardingRiskAccounts: 0,
    billingRiskAccounts: 0,
    lirPassingAccounts: 1,
    avgCurrentMonthActivity: 14,
  },
  healthStatusBreakdown: [
    { status: "Healthy", count: 1 },
    { status: "At Risk", count: 1 },
  ],
  sourceCoverage: [
    { source: "ARDA", tenantsCovered: 2, totalTenants: 2, coveragePct: 100 },
    { source: "CODA", tenantsCovered: 1, totalTenants: 2, coveragePct: 50 },
  ],
  ardaDataQuality: {
    latestSync: {
      status: "SUCCESS",
      startedAt: "2026-03-15T00:00:00.000Z",
      completedAt: "2026-03-15T00:02:00.000Z",
      recordCount: 28,
      mappedCount: 20,
      errorCount: 0,
      lastError: null,
    },
    tenantRecords: 2,
    orderRecords: 12,
    cardRecords: 7,
    itemRecords: 9,
    activityRecords: 28,
    adoptionBreadthSource: "ARDA_ACTIVITY",
    note: "Arda direct item/card/order history is available in the retention source records.",
  },
  riskQueues: {
    atRisk: [
      {
        accountId: "cust_2",
        name: "Tenant Two",
        status: "At Risk",
        lifecyclePhase: "MATURE",
        primaryLirPassed: false,
        primaryLirLabel: "Active weeks trailing 8",
        primaryLirValue: 2,
        primaryLirThreshold: 5,
        currentMonthActivity: 3,
        trendVsPriorPct: -42,
        supportRisk: true,
        billingRisk: false,
        onboardingRisk: false,
        ownerName: "CS Owner",
        segment: "SMB",
        plan: "Starter",
        ageBucket: "180d+",
        reasonCodes: [
          {
            code: "usage_collapse",
            label: "Current-month usage collapse",
            detail: "Recent activity is materially below baseline.",
            severity: "critical",
            dimension: "usage",
          },
        ],
        coverage: {
          arda: true,
          coda: false,
          stripe: false,
          hubspot: true,
          pylon: true,
          missingSources: ["coda", "stripe"],
        },
        lastMaterializedAt: "2026-03-15T00:00:00.000Z",
      },
    ],
    onboardingRisk: [],
    billingRisk: [],
    sharpDeclines: [],
  },
  accounts: [
    {
      accountId: "cust_1",
      name: "Tenant One",
      status: "Healthy",
      lifecyclePhase: "MATURE",
      primaryLirPassed: true,
      primaryLirLabel: "Active weeks trailing 8",
      primaryLirValue: 6,
      primaryLirThreshold: 5,
      currentMonthActivity: 24,
      trendVsPriorPct: 8,
      supportRisk: false,
      billingRisk: false,
      onboardingRisk: false,
      ownerName: "CS Owner",
      segment: "Mid-market",
      plan: "Growth",
      ageBucket: "180d+",
      reasonCodes: [],
      coverage: {
        arda: true,
        coda: true,
        stripe: true,
        hubspot: true,
        pylon: false,
        missingSources: ["pylon"],
      },
      lastMaterializedAt: "2026-03-15T00:00:00.000Z",
    },
  ],
};

describe("CustomerHealthDashboard", () => {
  it("renders portfolio health, source coverage, risk queues, and account rows", () => {
    render(<CustomerHealthDashboard data={DATA} />);

    expect(screen.getByRole("heading", { name: "Customer Health" })).toBeTruthy();
    expect(screen.getByText("2 accounts")).toBeTruthy();
    expect(screen.getByText("LIR attainment")).toBeTruthy();
    expect(screen.getByText("Average activity")).toBeTruthy();
    expect(screen.getByText("Arda Data Quality")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Orders")).toBeTruthy();
    expect(screen.getByText("Source Coverage")).toBeTruthy();
    const codaCoverage = screen.getByText("CODA").closest("div");
    expect(codaCoverage).toBeTruthy();
    expect(within(codaCoverage as HTMLElement).getByText("50.0%")).toBeTruthy();
    expect(screen.getByText("Needs Attention")).toBeTruthy();
    expect(screen.getByText("Tenant Two")).toBeTruthy();
    expect(screen.getByText("Current-month usage collapse")).toBeTruthy();
    expect(screen.getByText("Tenant One")).toBeTruthy();
  });

  it("renders an empty state when no accounts have materialized health", () => {
    render(
      <CustomerHealthDashboard
        data={{
          ...DATA,
          totals: {
            totalAccounts: 0,
            healthyAccounts: 0,
            watchAccounts: 0,
            atRiskAccounts: 0,
            onboardingRiskAccounts: 0,
            billingRiskAccounts: 0,
            lirPassingAccounts: 0,
            avgCurrentMonthActivity: 0,
          },
          riskQueues: { atRisk: [], onboardingRisk: [], billingRisk: [], sharpDeclines: [] },
          accounts: [],
        }}
      />,
    );

    expect(screen.getByText("No customer health snapshots are materialized yet.")).toBeTruthy();
  });

  it("unwraps scalar metric envelopes before rendering customer health values", () => {
    render(
      <CustomerHealthDashboard
        data={{
          ...DATA,
          sourceCoverage: [
            {
              source: "ARDA",
              tenantsCovered: 1,
              totalTenants: 2,
              coveragePct: { value: "75" } as never,
            },
          ],
          riskQueues: { atRisk: [], onboardingRisk: [], billingRisk: [], sharpDeclines: [] },
          accounts: [
            {
              ...DATA.accounts[0],
              currentMonthActivity: { value: "37" } as never,
              trendVsPriorPct: { data: { value: "-12.5" } } as never,
              primaryLirValue: { value: "9" } as never,
              primaryLirThreshold: { data: { attributes: { value: "11" } } } as never,
            },
          ],
        }}
      />,
    );

    const ardaCoverage = screen.getByText("ARDA").closest("div");
    expect(ardaCoverage).toBeTruthy();
    expect(within(ardaCoverage as HTMLElement).getByText("75.0%")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    expect(screen.getByText("-12.5%")).toBeTruthy();
    expect(screen.getByText("9 / 11")).toBeTruthy();
  });
});

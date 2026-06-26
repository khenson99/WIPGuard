import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    {
      accountId: "cust_3",
      name: "Tenant Three",
      status: "Onboarding Risk",
      lifecyclePhase: "ONBOARDING",
      primaryLirPassed: false,
      primaryLirLabel: "First order",
      primaryLirValue: 0,
      primaryLirThreshold: 1,
      currentMonthActivity: 1,
      trendVsPriorPct: -10,
      supportRisk: false,
      billingRisk: false,
      onboardingRisk: true,
      ownerName: "CS Owner",
      segment: "SMB",
      plan: "Starter",
      ageBucket: "0-30d",
      reasonCodes: [],
      coverage: {
        arda: false,
        coda: true,
        stripe: true,
        hubspot: true,
        pylon: true,
        missingSources: ["arda"],
      },
      lastMaterializedAt: "2026-03-15T00:00:00.000Z",
    },
    {
      accountId: "cust_4",
      name: "Tenant Four",
      status: "Billing Risk",
      lifecyclePhase: "MATURE",
      primaryLirPassed: false,
      primaryLirLabel: "Payment current",
      primaryLirValue: 0,
      primaryLirThreshold: 1,
      currentMonthActivity: 4,
      trendVsPriorPct: -5,
      supportRisk: false,
      billingRisk: true,
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
        hubspot: false,
        pylon: true,
        missingSources: ["hubspot"],
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
    expect(screen.getAllByText("Tenant Two").length).toBeGreaterThan(0);
    expect(screen.getByText("Current-month usage collapse")).toBeTruthy();
    expect(screen.getByText("Tenant One")).toBeTruthy();
  });

  it("filters the board risk table by customer status and missing source", async () => {
    const user = userEvent.setup();
    render(<CustomerHealthDashboard data={DATA} />);

    expect(screen.getByText("Board Customer Risk")).toBeTruthy();
    expect(screen.getByRole("button", { name: "At Risk" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Onboarding Risk" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Billing Risk" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Missing ARDA" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Missing Coda" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Missing HubSpot" })).toBeTruthy();
    const accountTable = screen.getByRole("table");

    await user.click(screen.getByRole("button", { name: "At Risk" }));
    expect(within(accountTable).getByText("Tenant Two")).toBeTruthy();
    expect(within(accountTable).queryByText("Tenant One")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Missing Coda" }));
    expect(within(accountTable).getByText("Tenant Two")).toBeTruthy();
    expect(within(accountTable).queryByText("Tenant One")).toBeNull();

    await user.click(screen.getByRole("button", { name: "All Sources" }));
    await user.click(screen.getByRole("button", { name: "Onboarding Risk" }));
    expect(within(accountTable).getByText("Tenant Three")).toBeTruthy();
    expect(within(accountTable).queryByText("Tenant Two")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Missing ARDA" }));
    expect(within(accountTable).getByText("Tenant Three")).toBeTruthy();
    expect(within(accountTable).queryByText("Tenant Four")).toBeNull();

    await user.click(screen.getByRole("button", { name: "All Sources" }));
    await user.click(screen.getByRole("button", { name: "Billing Risk" }));
    expect(within(accountTable).getByText("Tenant Four")).toBeTruthy();
    expect(within(accountTable).queryByText("Tenant Three")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Missing HubSpot" }));
    expect(within(accountTable).getByText("Tenant Four")).toBeTruthy();
    expect(within(accountTable).queryByText("Tenant Three")).toBeNull();
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

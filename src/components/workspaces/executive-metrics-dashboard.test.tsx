import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExecutiveMetricsDashboard } from "./executive-metrics-dashboard";
import type { CompanyTrackerDashboardData } from "@/lib/imladris/company-tracker";
import type { ExpenseDashboardData } from "@/lib/imladris/expense-dashboard";
import type { CustomerHealthDashboardData } from "@/lib/retention/customer-health-dashboard";

const COMPANY: CompanyTrackerDashboardData = {
  dashboard: {
    id: "company",
    label: "Company Tracker",
    sourceKeys: ["stripe", "hubspot", "mercury"],
    metricKeys: [
      "revenue.mrr",
      "finance.cash_runway_months",
      "finance.net_burn",
      "sales.qualified_pipeline",
    ],
  },
  summary: {
    arr: 384_000,
    mrr: 32_000,
    runwayMonths: 8.5,
    cashBalance: 765_000,
    netBurn: 90_000,
    qualifiedPipeline: 1_000_000,
    activeSubscriptions: 42,
    currency: "USD",
  },
  goalProgress: [
    {
      id: "goal_arr",
      metric: "ARR",
      targetValue: 500_000,
      currentValue: 384_000,
      direction: "higher",
      progressPct: 76.8,
      deadline: "2026-12-31T00:00:00.000Z",
      status: "active",
      sourceMetricKey: "revenue.mrr",
    },
  ],
  goalRecommendations: [],
  healthBands: [],
  sourceCoverage: [
    {
      key: "stripe",
      label: "Stripe",
      status: "available",
      lastCapturedAt: "2026-05-31T20:00:00.000Z",
      detail: "Latest analytics snapshot is available.",
    },
    {
      key: "hubspot",
      label: "HubSpot",
      status: "available",
      lastCapturedAt: "2026-05-30T20:00:00.000Z",
      detail: "Latest analytics snapshot is available.",
    },
    {
      key: "posthog",
      label: "PostHog",
      status: "missing",
      lastCapturedAt: null,
      detail: "No canonical lineage or analytics snapshot is available.",
    },
  ],
  boardReadiness: {
    status: "watch",
    score: 82,
    blockers: [],
    caveats: ["Using analytics snapshots for revenue.mrr until canonical materialization catches up."],
    requiredActions: ["Configure RUNWAY FinancialGoal target."],
    requiredActionCount: 1,
  },
  metrics: [],
  trust: {
    summary: {
      ready: 3,
      partial: 1,
      stale: 0,
      missing: 1,
      error: 0,
      warnings: 1,
    },
    warnings: [],
    caveats: [],
  },
};

const CUSTOMER_HEALTH: CustomerHealthDashboardData = {
  generatedAt: "2026-06-01T00:00:00.000Z",
  totals: {
    totalAccounts: 10,
    healthyAccounts: 7,
    watchAccounts: 1,
    atRiskAccounts: 1,
    onboardingRiskAccounts: 1,
    billingRiskAccounts: 0,
    lirPassingAccounts: 8,
    avgCurrentMonthActivity: 44,
  },
  healthStatusBreakdown: [
    { status: "Healthy", count: 7 },
    { status: "Watch", count: 1 },
    { status: "At Risk", count: 1 },
    { status: "Onboarding Risk", count: 1 },
  ],
  sourceCoverage: [],
  ardaDataQuality: {
    latestSync: null,
    tenantRecords: 0,
    orderRecords: 0,
    cardRecords: 0,
    itemRecords: 0,
    activityRecords: 0,
    adoptionBreadthSource: "NONE",
    note: "No Arda activity history or User Details fallback breadth counts are currently available.",
  },
  riskQueues: {
    atRisk: [],
    onboardingRisk: [],
    billingRisk: [],
    sharpDeclines: [],
  },
  accounts: [],
};

const EXPENSES: ExpenseDashboardData = {
  months: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
  categories: ["payroll", "marketing", "software"],
  categoryMonthly: {
    payroll: {
      "2026-01": 50_000,
      "2026-02": 52_000,
      "2026-03": 53_000,
      "2026-04": 55_000,
      "2026-05": 56_000,
      "2026-06": 57_000,
    },
    marketing: {
      "2026-01": 10_000,
      "2026-02": 12_000,
      "2026-03": 15_000,
      "2026-04": 16_000,
      "2026-05": 18_000,
      "2026-06": 20_000,
    },
    software: {
      "2026-01": 5_000,
      "2026-02": 5_000,
      "2026-03": 6_000,
      "2026-04": 6_000,
      "2026-05": 7_000,
      "2026-06": 7_000,
    },
  },
  categoryTotals: {
    payroll: 323_000,
    marketing: 91_000,
    software: 36_000,
  },
  vendorMonthly: {},
  vendorTotals: {},
  vendorCategory: {},
  txnIndex: {},
  chartSeries: {
    operatingInflows: [20_000, 25_000, 28_000, 30_000, 32_000, 35_000],
    operatingOutflows: [70_000, 75_000, 80_000, 86_000, 90_000, 92_000],
    grossBurn: [70_000, 75_000, 80_000, 86_000, 90_000, 92_000],
    netBurn: [50_000, 50_000, 52_000, 56_000, 58_000, 57_000],
    runwayCash: 765_000,
  },
  refreshedAt: "2026-06-01T00:00:00.000Z",
};

describe("ExecutiveMetricsDashboard", () => {
  it("renders the founder operating dashboard from company, customer, and expense metrics", () => {
    render(
      <ExecutiveMetricsDashboard
        company={COMPANY}
        customerHealth={CUSTOMER_HEALTH}
        expenses={EXPENSES}
      />,
    );

    expect(screen.getByRole("heading", { name: "Operating Cockpit" })).toBeTruthy();
    expect(screen.getByText("$384.0k")).toBeTruthy();
    expect(screen.getByText("8.5 mo")).toBeTruthy();
    expect(screen.getByText("Customer Risk")).toBeTruthy();
    expect(screen.getByText("Decision Signals")).toBeTruthy();
    expect(screen.getByText("Source Coverage")).toBeTruthy();
  });

  it("switches between investor and board dashboard lenses", () => {
    render(
      <ExecutiveMetricsDashboard
        company={COMPANY}
        customerHealth={CUSTOMER_HEALTH}
        expenses={EXPENSES}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Investor" }));
    expect(screen.getByRole("heading", { name: "Investor Update" })).toBeTruthy();
    expect(screen.getByText("Qualified Pipeline")).toBeTruthy();
    expect(screen.getByText("Burn Multiple")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(screen.getByRole("heading", { name: "Board Packet Readiness" })).toBeTruthy();
    expect(screen.getAllByText("Data Trust").length).toBeGreaterThan(0);
    expect(screen.getByText("Goal Coverage")).toBeTruthy();
  });

  it("updates the selected signal detail when a metric is selected", () => {
    render(
      <ExecutiveMetricsDashboard
        company={COMPANY}
        customerHealth={CUSTOMER_HEALTH}
        expenses={EXPENSES}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Customer Risk/i }));

    expect(screen.getByText("10 accounts tracked, 7 healthy.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Drill in/i }).getAttribute("href")).toBe(
      "/metrics/customer-health",
    );
  });
});

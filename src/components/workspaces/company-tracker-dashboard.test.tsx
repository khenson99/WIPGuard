import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyTrackerDashboard } from "./company-tracker-dashboard";
import type { CompanyTrackerDashboardData } from "@/lib/imladris/company-tracker";

const router = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const DATA: CompanyTrackerDashboardData = {
  dashboard: {
    id: "company",
    label: "Company Tracker",
    sourceKeys: ["stripe", "hubspot", "mercury"],
    metricKeys: [
      "revenue.mrr",
      "revenue.arr",
      "revenue.total_revenue",
      "revenue.subscription_revenue",
      "revenue.services_revenue",
      "revenue.active_subscriptions",
      "revenue.customer_count",
      "finance.cash_balance",
      "finance.cash_runway_months",
      "finance.net_burn",
      "finance.expenses",
      "finance.gross_margin",
      "sales.qualified_pipeline",
      "sales.demos",
      "marketing.website_traffic",
      "marketing.conversion_rate",
      "marketing.pipeline_efficiency",
      "product.activation_rate",
      "customer_success.customer_health",
      "customer_success.customer_activity",
      "customer_success.churn_rate",
      "customer_success.retention_rate",
      "customer_success.retention_risk",
    ],
  },
  summary: {
    arr: 384_000,
    mrr: 32_000,
    totalRevenue: 456_000,
    subscriptionRevenue: 384_000,
    servicesRevenue: 72_000,
    runwayMonths: 8.5,
    cashBalance: 765_000,
    netBurn: 90_000,
    cashOutflow: 160_000,
    cashInflow: 70_000,
    expenses: 182_000,
    grossMargin: 78.4,
    grossMarginRevenue: 456_000,
    costOfGoodsSold: 98_500,
    qualifiedPipeline: 1_000_000,
    qualifiedPipelineCount: 7,
    collaborationTouchCount: 5,
    collaborationCoverage: 0.84,
    demos: 12,
    scheduledDemos: 9,
    requestedDemos: 3,
    hubspotDemoDeals: 4,
    hubspotDemoMeetings: 3,
    calendarDemoEvents: 2,
    webflowDemoRequests: 3,
    activeSubscriptions: 42,
    stripeSubscriptions: 37,
    hubspotOnlySubscriptions: 5,
    customers: 39,
    stripeCustomers: 35,
    hubspotOnlyCustomers: 4,
    websiteTraffic: 18_500,
    websiteSessions: 15_000,
    organicTraffic: 3_500,
    searchClicks: 240,
    searchImpressions: 4_800,
    conversionRate: 3.4,
    conversions: 629,
    webflowFormSubmissions: 450,
    hubspotLeadConversions: 179,
    identifiedVisitors: 210,
    pipelineEfficiency: 40,
    acquisitionSpend: 25_000,
    activationRate: 64,
    activatedAccounts: 16,
    eligibleAccounts: 25,
    customerHealth: 86,
    atRiskAccounts: 3,
    openSupportIssues: 9,
    customerActivity: 214,
    supportInteractions: 7,
    productUsageRecords: 151,
    collaborationSignals: 56,
    churnRate: 2.5,
    retentionRate: 97.5,
    retentionRiskScore: 18,
    retentionRiskAccounts: 3,
    currency: "USD",
  },
  northStar: {
    id: "healthy_arr_growth",
    label: "Healthy ARR Growth",
    status: "watch",
    currentArr: 384_000,
    currentMrr: 32_000,
    netNewArr: 84_000,
    formula:
      "ARR growth interpreted through runway, burn multiple, pipeline coverage, activation, retention risk, goals, and source trust.",
    sourceMetricKeys: [
      "revenue.mrr",
      "finance.cash_runway_months",
      "finance.net_burn",
      "sales.qualified_pipeline",
    ],
    drivers: [
      {
        id: "runway",
        label: "Runway",
        value: 8.5,
        unit: "months",
        status: "watch",
        detail: "6-12 months is watch; 12+ months is strong.",
      },
      {
        id: "burn_multiple",
        label: "Burn Multiple",
        value: 1.07,
        unit: "ratio",
        status: "watch",
        detail: "Lower is better; <=1 is strong and <=2 is watch.",
      },
    ],
  },
  benchmarkContext: {
    items: [
      {
        id: "burn-multiple",
        label: "Burn Multiple",
        value: 1.07,
        unit: "ratio",
        status: "watch",
        benchmark: "Strong <=1.0x; watch <=2.0x.",
        formula: "net burn / monthly net-new ARR",
        assumption: "Uses the current ARR delta as the monthly net-new ARR proxy when prior MRR is available.",
        sourceMetricKeys: ["finance.net_burn", "revenue.mrr"],
      },
      {
        id: "pipeline-coverage",
        label: "Pipeline Coverage",
        value: 10.42,
        unit: "ratio",
        status: "strong",
        benchmark: "Strong >=3.0x next-quarter revenue run-rate; watch >=1.5x.",
        formula: "qualified pipeline / (MRR * 3)",
        assumption: "Uses current MRR as next-quarter revenue run-rate until explicit ARR target coverage is configured.",
        sourceMetricKeys: ["sales.qualified_pipeline", "revenue.mrr"],
      },
    ],
    cohorts: [
      {
        id: "activation-cohort",
        label: "Activation Cohort",
        value: 64,
        unit: "percent",
        status: "strong",
        detail: "16 activated / 25 eligible",
        formula: "activated accounts / eligible accounts",
        sourceMetricKeys: ["product.activation_rate"],
      },
      {
        id: "retention-risk-cohort",
        label: "Retention-Risk Cohort",
        value: 7.1,
        unit: "percent",
        status: "watch",
        detail: "3 at-risk accounts / 42 customers",
        formula: "at-risk accounts / active customers",
        sourceMetricKeys: ["customer_success.retention_risk", "revenue.customer_count"],
      },
    ],
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
  goalRecommendations: [
    {
      metric: "RUNWAY",
      targetValue: 18,
      currentValue: 8.5,
      direction: "higher",
      deadline: "2027-06-01T00:00:00.000Z",
      sourceMetricKey: "finance.cash_runway_months",
      formula: "target 18 months of runway",
      rationale: "18 months is a common operating target for fundraise and burn planning conversations.",
    },
  ],
  healthBands: [
    {
      id: "runway",
      label: "Runway",
      value: 8.5,
      unit: "months",
      status: "watch",
      formula: "finance.cash_runway_months.value.months",
      detail: "6-12 months is watch; 12+ months is strong.",
      sourceMetricKeys: ["finance.cash_runway_months"],
    },
  ],
  sourceCoverage: [
    {
      key: "stripe",
      label: "Stripe",
      status: "available",
      lastCapturedAt: "2026-05-31T20:00:00.000Z",
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
  metrics: [
    {
      key: "revenue.mrr",
      label: "MRR",
      value: { amount: 32_000, arr: 384_000 },
      status: "ready",
      confidence: 0.92,
      warnings: [],
      caveats: [],
      calculationVersion: "revenue-mrr-v1",
      computedAt: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-05-31T23:59:59.999Z",
      sourceLineageCount: 2,
    },
  ],
  trust: {
    summary: {
      ready: 1,
      partial: 0,
      stale: 0,
      missing: 0,
      error: 0,
      warnings: 0,
    },
    warnings: [],
    caveats: [],
  },
};

describe("CompanyTrackerDashboard", () => {
  beforeEach(() => {
    router.refresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ setup: { goalsCreated: [] } }),
      })),
    );
  });

  it("renders the founder cockpit sections from company tracker data", () => {
    render(<CompanyTrackerDashboard data={DATA} />);

    expect(screen.getByRole("heading", { name: "Company Tracker" })).toBeTruthy();
    expect(screen.getByText("Healthy ARR Growth")).toBeTruthy();
    expect(screen.getByText("Net new ARR $84.0k")).toBeTruthy();
    expect(screen.getByText(/ARR growth interpreted through runway/)).toBeTruthy();
    expect(screen.getByText("Benchmark Context")).toBeTruthy();
    expect(screen.getByText("Strong <=1.0x; watch <=2.0x.")).toBeTruthy();
    expect(screen.getByText("net burn / monthly net-new ARR")).toBeTruthy();
    expect(screen.getByText(/monthly net-new ARR proxy/)).toBeTruthy();
    expect(screen.getByText("Cohorts And Segments")).toBeTruthy();
    expect(screen.getByText("Retention-Risk Cohort")).toBeTruthy();
    expect(screen.getByText("at-risk accounts / active customers")).toBeTruthy();
    expect(screen.getAllByText("ARR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$384.0k").length).toBeGreaterThan(0);
    expect(screen.getByText("Revenue")).toBeTruthy();
    expect(screen.getByText("$456.0k")).toBeTruthy();
    expect(screen.getByText("Subscription Revenue")).toBeTruthy();
    expect(screen.getByText("Services Revenue")).toBeTruthy();
    expect(screen.getByText("Cash Balance")).toBeTruthy();
    expect(screen.getByText("Expenses")).toBeTruthy();
    expect(screen.getByText("Gross Margin")).toBeTruthy();
    expect(screen.getByText("$160.0k out / $70.0k in")).toBeTruthy();
    expect(screen.getByText("$456.0k revenue / $98.5k COGS")).toBeTruthy();
    expect(screen.getByText("7 deals / 84.0% collaboration")).toBeTruthy();
    expect(screen.getByText("Demos")).toBeTruthy();
    expect(screen.getByText("9 scheduled / 3 requested")).toBeTruthy();
    expect(screen.getByText("Customers")).toBeTruthy();
    expect(screen.getByText("35 Stripe / 4 HubSpot-only")).toBeTruthy();
    expect(screen.getByText("37 Stripe / 5 HubSpot-only")).toBeTruthy();
    expect(screen.getByText("Website Traffic")).toBeTruthy();
    expect(screen.getByText("15,000 sessions / 3,500 organic")).toBeTruthy();
    expect(screen.getByText("Conversion Rate")).toBeTruthy();
    expect(screen.getByText("Conversions")).toBeTruthy();
    expect(screen.getByText("450 Webflow / 179 HubSpot / 210 identified")).toBeTruthy();
    expect(screen.getByText("Pipeline Efficiency")).toBeTruthy();
    expect(screen.getByText("$1.00m pipeline / $25.0k spend")).toBeTruthy();
    expect(screen.getByText("Activation Rate")).toBeTruthy();
    expect(screen.getAllByText("16 activated / 25 eligible").length).toBeGreaterThan(0);
    expect(screen.getByText("Customer Health")).toBeTruthy();
    expect(screen.getByText("3 at risk / 9 open support")).toBeTruthy();
    expect(screen.getByText("Customer Activity")).toBeTruthy();
    expect(screen.getByText("7 support / 151 usage / 56 collaboration")).toBeTruthy();
    expect(screen.getByText("Churn Rate")).toBeTruthy();
    expect(screen.getByText("Retention Rate")).toBeTruthy();
    expect(screen.getByText("Retention Risk")).toBeTruthy();
    expect(screen.getByText("3 at risk from retention model")).toBeTruthy();
    expect(screen.getByText("$72.0k")).toBeTruthy();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getByText("18,500")).toBeTruthy();
    expect(screen.getByText("629")).toBeTruthy();
    expect(screen.getAllByText("78.4%").length).toBeGreaterThan(0);
    expect(screen.getByText("97.5%")).toBeTruthy();
    expect(screen.getByText("Goal Progress")).toBeTruthy();
    expect(screen.getByText("Growth Engine")).toBeTruthy();
    expect(screen.getByText("Board Readiness")).toBeTruthy();
    expect(screen.getByText("Source Coverage")).toBeTruthy();
    expect(screen.getByText("Draft Board Targets")).toBeTruthy();
    expect(screen.getByText("Configure RUNWAY FinancialGoal target.")).toBeTruthy();
    expect(screen.getByText("Data Trust")).toBeTruthy();
    expect(screen.getByText("finance.cash_runway_months.value.months")).toBeTruthy();
  });

  it("runs board readiness setup from the readiness card and refreshes the route", async () => {
    render(<CompanyTrackerDashboard data={DATA} />);

    fireEvent.click(screen.getByRole("button", { name: "Run readiness setup" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/imladris/dashboards/company/readiness/setup",
        expect.objectContaining({ method: "POST" }),
      );
      expect(router.refresh).toHaveBeenCalledOnce();
    });
  });

  it("hides board readiness setup when there are no blockers, caveats, or required actions", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          boardReadiness: {
            status: "ready",
            score: 100,
            blockers: [],
            caveats: [],
            requiredActions: [],
            requiredActionCount: 0,
          },
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Run readiness setup" })).toBeNull();
  });

  it("renders missing canonical metric states without legacy fallback copy", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          summary: { ...DATA.summary, arr: null, mrr: null },
          metrics: [
            {
              key: "revenue.mrr",
              label: "MRR",
              value: null,
              status: "missing",
              confidence: 0,
              warnings: ["Canonical company metric is missing."],
              caveats: [],
              calculationVersion: null,
              computedAt: null,
              periodEnd: null,
              sourceLineageCount: 0,
            },
          ],
          trust: {
            summary: { ready: 0, partial: 0, stale: 0, missing: 1, error: 0, warnings: 1 },
            warnings: ["Canonical company metric is missing."],
            caveats: [],
          },
          boardReadiness: {
            ...DATA.boardReadiness,
            status: "blocked",
            blockers: ["ARR/MRR is missing."],
            caveats: [],
          },
        }}
      />,
    );

    expect(screen.getAllByText("Missing").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Canonical company metric is missing.")).toBeTruthy();
    expect(screen.queryByText(/legacy analytics/i)).toBeNull();
  });

  it("does not show stale payload values for missing growth metrics", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          summary: { ...DATA.summary, qualifiedPipeline: null },
          metrics: [
            {
              key: "sales.qualified_pipeline",
              label: "Qualified Pipeline",
              value: { amount: 1_000_000 },
              status: "missing",
              confidence: 0,
              warnings: ["Canonical sales metric is missing."],
              calculationVersion: "sales-pipeline-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 1,
            },
          ],
          trust: {
            summary: { ready: 0, partial: 0, stale: 0, missing: 1, error: 0, warnings: 1 },
            warnings: ["Canonical sales metric is missing."],
            caveats: [],
          },
        }}
      />,
    );

    expect(screen.getAllByText("Qualified Pipeline").length).toBeGreaterThan(0);
    expect(screen.queryByText("$1.00m")).toBeNull();
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
  });

  it("renders numeric-string metric payload values without falling back to availability copy", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          metrics: [
            {
              key: "product.activation_rate",
              label: "Activation Rate",
              value: { rate: "42" },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "product-activation-rate-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("42.0%")).toBeTruthy();
    expect(screen.queryByText("Available")).toBeNull();
  });

  it("renders percent-suffixed metric payload values without falling back to availability copy", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          metrics: [
            {
              key: "product.activation_rate",
              label: "Activation Rate",
              value: { rate: "42%" },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "product-activation-rate-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("42.0%")).toBeTruthy();
    expect(screen.queryByText("Available")).toBeNull();
  });

  it("renders compact currency metric payload values without falling back to availability copy", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          metrics: [
            {
              key: "sales.qualified_pipeline",
              label: "Qualified Pipeline",
              value: { amount: "USD 2.5M" },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "sales-qualified-pipeline-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("$2.50m")).toBeTruthy();
    expect(screen.queryByText("Available")).toBeNull();
  });

  it("renders count-based growth metric payload values without falling back to availability copy", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          metrics: [
            {
              key: "sales.demos",
              label: "Demos",
              value: { count: 12 },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "sales-demos-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
            {
              key: "revenue.active_subscriptions",
              label: "Active Subscriptions",
              value: { count: 42 },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "revenue-active-subscriptions-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
            {
              key: "revenue.customer_count",
              label: "Customers",
              value: { count: 39 },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "revenue-customer-count-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
            {
              key: "customer_success.customer_activity",
              label: "Customer Activity",
              value: { count: 118 },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "customer-success-activity-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("42").length).toBeGreaterThan(0);
    expect(screen.getAllByText("39").length).toBeGreaterThan(0);
    expect(screen.getByText("118")).toBeTruthy();
    expect(screen.queryByText("Available")).toBeNull();
  });

  it("unwraps scalar metric value envelopes before rendering growth metrics", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          metrics: [
            {
              key: "product.activation_rate",
              label: "Activation Rate",
              value: {
                rate: { value: "42%" },
              },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "product-activation-rate-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
            {
              key: "finance.cash_runway_months",
              label: "Cash Runway",
              value: {
                months: { data: { value: "8.5" } },
              },
              status: "ready",
              confidence: 0.91,
              warnings: [],
              calculationVersion: "finance-cash-runway-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: 2,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("42.0%")).toBeTruthy();
    expect(screen.getAllByText("8.5 mo").length).toBeGreaterThan(0);
    expect(screen.queryByText("Available")).toBeNull();
  });

  it("unwraps scalar goal progress envelopes before rendering goal rows", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          goalProgress: [
            {
              ...DATA.goalProgress[0],
              progressPct: { value: "76.8" } as never,
              currentValue: { data: { attributes: { value: "USD 384,000" } } } as never,
              targetValue: { metricValue: "500000" } as never,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("76.8%")).toBeTruthy();
    expect(screen.getByText("Current 384,000")).toBeTruthy();
    expect(screen.getByText("Target 500,000")).toBeTruthy();
  });

  it("unwraps scalar metric trust envelopes before rendering confidence and lineage", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          metrics: [
            {
              key: "product.activation_rate",
              label: "Activation Rate",
              value: { rate: "42%" },
              status: "ready",
              confidence: { value: "0.91" } as never,
              warnings: [],
              calculationVersion: "product-activation-rate-v1",
              computedAt: "2026-06-01T00:00:00.000Z",
              periodEnd: "2026-05-31T23:59:59.999Z",
              sourceLineageCount: { data: { attributes: { value: "2" } } } as never,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Confidence 91% · lineage 2")).toBeTruthy();
    expect(screen.getByText("91%")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.queryByText(/\bNaN%\b/)).toBeNull();
  });

  it("unwraps scalar summary KPI and trust count envelopes before rendering the cockpit", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          summary: {
            ...DATA.summary,
            arr: { data: { attributes: { value: "USD 384,000" } } } as never,
            mrr: { metricValue: "32000" } as never,
            runwayMonths: { months: "8.5" } as never,
            cashBalance: { balance: "$765,000" } as never,
            netBurn: { amount: "$90,000" } as never,
          },
          trust: {
            ...DATA.trust,
            summary: {
              ready: { value: "1" } as never,
              partial: 0,
              stale: { count: "2" } as never,
              missing: { data: { value: "3" } } as never,
              error: { metricValue: "4" } as never,
              warnings: { amount: "5" } as never,
            },
          },
        }}
      />,
    );

    expect(screen.getAllByText("$384.0k").length).toBeGreaterThan(0);
    expect(screen.getByText("$32.0k")).toBeTruthy();
    expect(screen.getAllByText("8.5 mo").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("$765.0k");
    expect(screen.getByText("$90.0k")).toBeTruthy();
    expect(screen.getByText("1 ready")).toBeTruthy();
    expect(screen.getByText("9 watch")).toBeTruthy();
    expect(screen.queryByText(/\bNaN\b/)).toBeNull();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
  });

  it("renders risk health bands with an explicit risk badge", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          healthBands: [
            {
              id: "burn_multiple",
              label: "Burn Multiple",
              value: 3.2,
              unit: "ratio",
              status: "risk",
              formula: "finance.net_burn.value.amount / net new ARR",
              detail: "Lower is better; <=1 is strong and <=2 is watch.",
              sourceMetricKeys: ["finance.net_burn", "revenue.mrr"],
            },
          ],
        }}
      />,
    );

    const riskBadge = screen.getByText("risk");
    expect(riskBadge.className).toContain("text-red-700");
  });

  it("renders analytics-backed growth engine metric values", () => {
    render(
      <CompanyTrackerDashboard
        data={{
          ...DATA,
          metrics: [
            {
              key: "marketing.pipeline_efficiency",
              label: "Pipeline Efficiency",
              value: {
                ratio: 10,
                qualifiedPipeline: 250_000,
                acquisitionSpend: 25_000,
              },
              status: "partial",
              confidence: 0.72,
              warnings: [],
              caveats: [
                "Canonical marketing.pipeline_efficiency is missing; using latest analytics snapshot stats.",
              ],
              calculationVersion: "analytics-snapshot-company-fallback-v1",
              computedAt: "2026-05-31T20:00:00.000Z",
              periodEnd: "2026-05-31T20:00:00.000Z",
              sourceLineageCount: 5,
            },
            {
              key: "product.activation_rate",
              label: "Activation Rate",
              value: { rate: 25 },
              status: "partial",
              confidence: 0.72,
              warnings: [],
              caveats: [],
              calculationVersion: "analytics-snapshot-company-fallback-v1",
              computedAt: "2026-05-31T20:00:00.000Z",
              periodEnd: "2026-05-31T20:00:00.000Z",
              sourceLineageCount: 5,
            },
            {
              key: "customer_success.retention_risk",
              label: "Retention Risk",
              value: { score: 36.6 },
              status: "partial",
              confidence: 0.72,
              warnings: [],
              caveats: [],
              calculationVersion: "analytics-snapshot-company-fallback-v1",
              computedAt: "2026-05-31T20:00:00.000Z",
              periodEnd: "2026-05-31T20:00:00.000Z",
              sourceLineageCount: 5,
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText("Pipeline Efficiency").length).toBeGreaterThan(0);
    expect(screen.getByText("10.00x")).toBeTruthy();
    expect(screen.getAllByText("Activation Rate").length).toBeGreaterThan(0);
    expect(screen.getByText("25.0%")).toBeTruthy();
    expect(screen.getAllByText("Retention Risk").length).toBeGreaterThan(0);
    expect(screen.getByText("36.6")).toBeTruthy();
  });
});

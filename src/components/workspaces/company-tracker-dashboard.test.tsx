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
    expect(screen.getAllByText("ARR").length).toBeGreaterThan(0);
    expect(screen.getByText("$384.0k")).toBeTruthy();
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
    expect(screen.getByText("Missing")).toBeTruthy();
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

    expect(screen.getByText("$384.0k")).toBeTruthy();
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

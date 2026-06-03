import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompanyTrackerDashboard } from "./company-tracker-dashboard";
import type { CompanyTrackerDashboardData } from "@/lib/imladris/company-tracker";

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
  metrics: [
    {
      key: "revenue.mrr",
      label: "MRR",
      value: { amount: 32_000, arr: 384_000 },
      status: "ready",
      confidence: 0.92,
      warnings: [],
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
  },
};

describe("CompanyTrackerDashboard", () => {
  it("renders the founder cockpit sections from company tracker data", () => {
    render(<CompanyTrackerDashboard data={DATA} />);

    expect(screen.getByRole("heading", { name: "Company Tracker" })).toBeTruthy();
    expect(screen.getAllByText("ARR").length).toBeGreaterThan(0);
    expect(screen.getByText("$384.0k")).toBeTruthy();
    expect(screen.getByText("Goal Progress")).toBeTruthy();
    expect(screen.getByText("Growth Engine")).toBeTruthy();
    expect(screen.getByText("Data Trust")).toBeTruthy();
    expect(screen.getByText("finance.cash_runway_months.value.months")).toBeTruthy();
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
              calculationVersion: null,
              computedAt: null,
              periodEnd: null,
              sourceLineageCount: 0,
            },
          ],
          trust: {
            summary: { ready: 0, partial: 0, stale: 0, missing: 1, error: 0, warnings: 1 },
            warnings: ["Canonical company metric is missing."],
          },
        }}
      />,
    );

    expect(screen.getAllByText("Missing").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Canonical company metric is missing.")).toBeTruthy();
    expect(screen.queryByText(/legacy analytics/i)).toBeNull();
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
});

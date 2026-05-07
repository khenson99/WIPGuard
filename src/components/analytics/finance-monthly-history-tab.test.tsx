import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceMonthlyHistoryTab } from "@/components/analytics/finance-monthly-history-tab";
import type { MonthlyPnLHistory } from "@/lib/analytics/monthly-pnl-history";

vi.mock("@/components/charts/area-trend", () => ({
  AreaTrend: () => <div data-testid="area-trend" />,
}));

vi.mock("@/components/charts/spark-line", () => ({
  SparkLine: () => <div data-testid="spark-line" />,
}));

const response: MonthlyPnLHistory = {
  months: [
    {
      month: "2025-01",
      revenue: 1000,
      cogs: 0,
      grossProfit: 1000,
      grossMarginPct: 100,
      operatingExpenses: {
        payroll: 0,
        marketing: 0,
        infrastructure: 0,
        ops: 0,
      },
      totalOpex: 0,
      operatingIncome: 1000,
      operatingMarginPct: 100,
      netIncome: 1000,
      cashBalance: null,
      burnRate: null,
      mrr: 100,
      activeSubscriptions: 1,
      churnRate: 0,
      sourceCoverage: {
        stripe: true,
        mercury: false,
      },
    },
    {
      month: "2025-02",
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      grossMarginPct: 0,
      operatingExpenses: {
        payroll: 0,
        marketing: 0,
        infrastructure: 0,
        ops: 0,
      },
      totalOpex: 0,
      operatingIncome: 0,
      operatingMarginPct: 0,
      netIncome: 0,
      cashBalance: null,
      burnRate: null,
      mrr: null,
      activeSubscriptions: null,
      churnRate: null,
      sourceCoverage: {
        stripe: false,
        mercury: false,
      },
    },
  ],
  latestMoM: null,
};

describe("FinanceMonthlyHistoryTab", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders per-month data source coverage", async () => {
    render(<FinanceMonthlyHistoryTab />);

    await waitFor(() => {
      expect(screen.getByText("Data Sources")).toBeTruthy();
    });

    expect(screen.getByText("Stripe")).toBeTruthy();
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
  });
});

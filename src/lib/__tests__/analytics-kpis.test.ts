import { describe, expect, it } from "vitest";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { computeAnalyticsKpis } from "@/lib/analytics/kpis";

function makeData(successRate: number): AnalyticsDashboardData {
  return {
    stripe: {
      revenue: { mrr: 0 },
      payments: { succeeded: 0, failed: 0, successRate },
    },
  } as unknown as AnalyticsDashboardData;
}

describe("computeAnalyticsKpis (finance)", () => {
  it("normalises Stripe payment successRate from 0–1 to 0–100", () => {
    expect(computeAnalyticsKpis(makeData(0.95)).finance.paymentSuccessPct).toBe(
      95,
    );
  });

  it("passes through Stripe payment successRate when already 0–100", () => {
    expect(computeAnalyticsKpis(makeData(96)).finance.paymentSuccessPct).toBe(
      96,
    );
  });

  it("treats a 1.0 ratio as 100%", () => {
    expect(computeAnalyticsKpis(makeData(1)).finance.paymentSuccessPct).toBe(100);
  });
});

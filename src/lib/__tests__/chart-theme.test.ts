// src/lib/__tests__/chart-theme.test.ts
import { describe, expect, it } from "vitest";
import { CHART_PALETTE, getChartColor } from "@/components/charts/chart-theme";

describe("chart-theme", () => {
  it("exports a CHART_PALETTE with at least 6 colors", () => {
    expect(CHART_PALETTE.length).toBeGreaterThanOrEqual(6);
    CHART_PALETTE.forEach((c) => expect(c).toMatch(/^#[0-9a-fA-F]{6}$/));
  });

  it("getChartColor wraps around palette length", () => {
    const first = getChartColor(0);
    const wrapped = getChartColor(CHART_PALETTE.length);
    expect(first).toBe(wrapped);
  });
});

import { describe, expect, it } from "vitest";
import {
  makeAccount,
  makeHealth,
} from "@/components/analytics/__tests__/customer-success-test-helpers";
import {
  buildLeadingIndicatorPressure,
  weakestLeadingIndicator,
} from "@/components/analytics/customer-success-portfolio-utils";

describe("customer success portfolio utils", () => {
  it("picks the weakest leading indicator from an account health model", () => {
    const weakest = weakestLeadingIndicator(
      makeHealth({
        score: 75,
        grade: "C",
        indicatorScores: {
          recency: 92,
          cadence: 61,
          consistency: 78,
          depth: 84,
          breadth: 80,
        },
        indicatorValues: {
          recency: "92 recency",
          cadence: "61 cadence",
          consistency: "78 consistency",
          depth: "84 depth",
          breadth: "80 breadth",
        },
      })
    );

    expect(weakest.label).toBe("Touch cadence");
    expect(weakest.score).toBe(61);
    expect(weakest.value).toBe("61 cadence");
  });

  it("counts below-threshold indicators across the portfolio and sorts by pressure", () => {
    const pressure = buildLeadingIndicatorPressure(
      [
        makeAccount("acct-1", {
          health: makeHealth({
            score: 75,
            grade: "C",
            indicatorScores: { recency: 62, cadence: 64, consistency: 66, depth: 80, breadth: 90 },
          }),
        }),
        makeAccount("acct-2", {
          health: makeHealth({
            score: 75,
            grade: "C",
            indicatorScores: { recency: 58, cadence: 72, consistency: 60, depth: 63, breadth: 88 },
          }),
        }),
        makeAccount("acct-3", {
          health: makeHealth({
            score: 75,
            grade: "C",
            indicatorScores: { recency: 70, cadence: 61, consistency: 90, depth: 62, breadth: 91 },
          }),
        }),
      ],
      65
    );

    expect(pressure[0]).toEqual({
      key: "recency",
      label: "Activity recency",
      count: 2,
    });
    expect(pressure[1]).toEqual({
      key: "depth",
      label: "Execution depth",
      count: 2,
    });
    expect(pressure[2]).toEqual({
      key: "cadence",
      label: "Touch cadence",
      count: 2,
    });
    expect(pressure.find((item) => item.key === "depth")?.count).toBe(2);
    expect(pressure.find((item) => item.key === "breadth")?.count).toBe(0);
  });
});

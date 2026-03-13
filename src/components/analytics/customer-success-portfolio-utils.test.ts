import { describe, expect, it } from "vitest";
import type { CustomerSuccessPortfolio } from "@/lib/customer-success/types";
import {
  buildLeadingIndicatorPressure,
  weakestLeadingIndicator,
} from "@/components/analytics/customer-success-portfolio-utils";

function makeHealth(input: {
  recency: number;
  cadence: number;
  consistency: number;
  depth: number;
  breadth: number;
}): CustomerSuccessPortfolio["accounts"][number]["health"] {
  return {
    score: 75,
    grade: "C",
    trend: "stable",
    confidence: 80,
    updatedAt: "2026-03-10T00:00:00.000Z",
    components: {
      adoption: {
        score: 75,
        weight: 0.24,
        weightedScore: 18,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      engagement: {
        score: 75,
        weight: 0.22,
        weightedScore: 16.5,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      relationship: {
        score: 75,
        weight: 0.2,
        weightedScore: 15,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      support: {
        score: 75,
        weight: 0.2,
        weightedScore: 15,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
      commercial: {
        score: 75,
        weight: 0.14,
        weightedScore: 10.5,
        trend: "stable",
        status: "watch",
        evidence: [],
        lastUpdatedAt: "2026-03-10T00:00:00.000Z",
      },
    },
    leadingIndicators: {
      recency: {
        label: "Activity recency",
        score: input.recency,
        status: input.recency < 65 ? "risk" : "watch",
        value: `${input.recency} recency`,
        evidence: [],
      },
      cadence: {
        label: "Touch cadence",
        score: input.cadence,
        status: input.cadence < 65 ? "risk" : "watch",
        value: `${input.cadence} cadence`,
        evidence: [],
      },
      consistency: {
        label: "Touch consistency",
        score: input.consistency,
        status: input.consistency < 65 ? "risk" : "watch",
        value: `${input.consistency} consistency`,
        evidence: [],
      },
      depth: {
        label: "Execution depth",
        score: input.depth,
        status: input.depth < 65 ? "risk" : "watch",
        value: `${input.depth} depth`,
        evidence: [],
      },
      breadth: {
        label: "Relationship breadth",
        score: input.breadth,
        status: input.breadth < 65 ? "risk" : "watch",
        value: `${input.breadth} breadth`,
        evidence: [],
      },
    },
  };
}

function makeAccount(
  accountId: string,
  scores: Parameters<typeof makeHealth>[0]
): CustomerSuccessPortfolio["accounts"][number] {
  return {
    accountId,
    name: accountId,
    ownerName: "Owner",
    health: makeHealth(scores),
    openAlertCount: 0,
    lastActivityAt: "2026-03-10T00:00:00.000Z",
    renewalDate: "2026-06-01T00:00:00.000Z",
  };
}

describe("customer success portfolio utils", () => {
  it("picks the weakest leading indicator from an account health model", () => {
    const weakest = weakestLeadingIndicator(
      makeHealth({ recency: 92, cadence: 61, consistency: 78, depth: 84, breadth: 80 })
    );

    expect(weakest.label).toBe("Touch cadence");
    expect(weakest.score).toBe(61);
    expect(weakest.value).toBe("61 cadence");
  });

  it("counts below-threshold indicators across the portfolio and sorts by pressure", () => {
    const pressure = buildLeadingIndicatorPressure(
      [
        makeAccount("acct-1", { recency: 62, cadence: 64, consistency: 66, depth: 80, breadth: 90 }),
        makeAccount("acct-2", { recency: 58, cadence: 72, consistency: 60, depth: 63, breadth: 88 }),
        makeAccount("acct-3", { recency: 70, cadence: 61, consistency: 90, depth: 62, breadth: 91 }),
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

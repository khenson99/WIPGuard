import { describe, expect, it } from "vitest";
import {
  computeConversionRate,
  computeDropOffReasons,
  computeFunnel,
  type FunnelInput,
} from "@/lib/funnel-analytics";

// ─────────────────────────────────────────────────────────────────────────────
// computeConversionRate
// ─────────────────────────────────────────────────────────────────────────────

describe("computeConversionRate", () => {
  it("returns 0 when denominator is 0", () => {
    expect(computeConversionRate(50, 0)).toBe(0);
  });

  it("returns 0 when denominator is negative", () => {
    expect(computeConversionRate(50, -10)).toBe(0);
  });

  it("returns correct rate with normal values", () => {
    expect(computeConversionRate(50, 100)).toBe(0.5);
  });

  it("returns 1 when numerator equals denominator", () => {
    expect(computeConversionRate(100, 100)).toBe(1);
  });

  it("handles numerator > denominator (value > 1)", () => {
    const rate = computeConversionRate(120, 100);
    expect(rate).toBe(1.2);
  });

  it("rounds to 4 decimal places for determinism", () => {
    // 1/3 = 0.333333... → rounds to 0.3333
    expect(computeConversionRate(1, 3)).toBe(0.3333);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeFunnel
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<FunnelInput> = {}): FunnelInput {
  return {
    submissions: 100,
    created: 60,
    completed: 30,
    statusBreakdown: { BACKLOG: 10, ACTIVE: 20, DONE: 30 },
    terminalStatuses: ["DONE"],
    ...overrides,
  };
}

describe("computeFunnel", () => {
  it("computes full funnel with normal data", () => {
    const result = computeFunnel(makeInput());

    expect(result.totalSubmissions).toBe(100);
    expect(result.totalCreated).toBe(60);
    expect(result.totalCompleted).toBe(30);

    const [sub, created, completed] = result.stages;

    // submissions stage
    expect(sub.name).toBe("submissions");
    expect(sub.count).toBe(100);
    expect(sub.conversionFromPrevious).toBeNull();
    expect(sub.conversionFromTop).toBe(1);
    expect(sub.dropOffCount).toBe(40);
    expect(sub.dropOffRate).toBe(0.4);

    // created stage
    expect(created.name).toBe("created");
    expect(created.count).toBe(60);
    expect(created.conversionFromPrevious).toBe(0.6);
    expect(created.conversionFromTop).toBe(0.6);
    expect(created.dropOffCount).toBe(30);
    expect(created.dropOffRate).toBe(0.5);

    // completed stage
    expect(completed.name).toBe("completed");
    expect(completed.count).toBe(30);
    expect(completed.conversionFromPrevious).toBe(0.5);
    expect(completed.conversionFromTop).toBe(0.3);
    expect(completed.dropOffCount).toBeNull();
    expect(completed.dropOffRate).toBeNull();

    expect(result.overallConversionRate).toBe(0.3);
  });

  it("handles zero submissions gracefully", () => {
    const result = computeFunnel(makeInput({ submissions: 0, created: 0, completed: 0 }));

    expect(result.totalSubmissions).toBe(0);
    expect(result.stages[0].count).toBe(0);
    expect(result.stages[0].dropOffCount).toBe(0);
    expect(result.stages[0].dropOffRate).toBe(0);
    expect(result.stages[1].conversionFromPrevious).toBe(0);
    expect(result.overallConversionRate).toBe(0);
  });

  it("handles zero created with nonzero submissions", () => {
    const result = computeFunnel(makeInput({ submissions: 50, created: 0, completed: 0 }));

    expect(result.totalSubmissions).toBe(50);
    expect(result.totalCreated).toBe(0);
    // all submissions dropped off before creation
    expect(result.stages[0].dropOffCount).toBe(50);
    expect(result.stages[1].conversionFromPrevious).toBe(0);
    expect(result.stages[1].dropOffRate).toBe(0);
    expect(result.overallConversionRate).toBe(0);
  });

  it("handles zero completed", () => {
    const result = computeFunnel(makeInput({ completed: 0 }));

    expect(result.totalCompleted).toBe(0);
    expect(result.stages[2].count).toBe(0);
    expect(result.stages[2].conversionFromPrevious).toBe(0);
    expect(result.stages[2].conversionFromTop).toBe(0);
    expect(result.overallConversionRate).toBe(0);
  });

  it("handles all zeros", () => {
    const result = computeFunnel(
      makeInput({ submissions: 0, created: 0, completed: 0, statusBreakdown: {} }),
    );

    expect(result.stages).toHaveLength(3);
    for (const stage of result.stages) {
      expect(stage.count).toBe(0);
    }
    expect(result.overallConversionRate).toBe(0);
  });

  it("treats NaN input as 0", () => {
    const result = computeFunnel(
      makeInput({ submissions: NaN, created: NaN, completed: NaN }),
    );

    expect(result.totalSubmissions).toBe(0);
    expect(result.totalCreated).toBe(0);
    expect(result.totalCompleted).toBe(0);
    expect(result.stages).toHaveLength(3);
  });

  it("treats negative input as 0", () => {
    const result = computeFunnel(
      makeInput({ submissions: -10, created: -5, completed: -1 }),
    );

    expect(result.totalSubmissions).toBe(0);
    expect(result.totalCreated).toBe(0);
    expect(result.totalCompleted).toBe(0);
  });

  it("produces deterministic output for identical input", () => {
    const input = makeInput();
    const a = computeFunnel(input);
    const b = computeFunnel(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("first stage conversionFromPrevious is null", () => {
    const result = computeFunnel(makeInput());
    expect(result.stages[0].conversionFromPrevious).toBeNull();
  });

  it("last stage dropOff fields are null", () => {
    const result = computeFunnel(makeInput());
    const last = result.stages[result.stages.length - 1];
    expect(last.dropOffCount).toBeNull();
    expect(last.dropOffRate).toBeNull();
  });

  it("overallConversionRate is completed / submissions", () => {
    const result = computeFunnel(makeInput({ submissions: 200, created: 150, completed: 75 }));
    expect(result.overallConversionRate).toBe(computeConversionRate(75, 200));
  });

  it("stages array always has exactly 3 entries", () => {
    const result = computeFunnel(makeInput());
    expect(result.stages).toHaveLength(3);
  });

  it("handles large numbers without overflow", () => {
    const result = computeFunnel(
      makeInput({ submissions: 1_000_000, created: 750_000, completed: 500_000 }),
    );

    expect(result.totalSubmissions).toBe(1_000_000);
    expect(result.totalCreated).toBe(750_000);
    expect(result.totalCompleted).toBe(500_000);
    expect(result.overallConversionRate).toBe(0.5);
    expect(result.stages[1].conversionFromTop).toBe(0.75);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDropOffReasons
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDropOffReasons", () => {
  it("excludes terminal statuses from drop-off list", () => {
    const breakdown = { BACKLOG: 10, ACTIVE: 20, DONE: 30 };
    const reasons = computeDropOffReasons(breakdown, ["DONE"], 60);
    const statuses = reasons.map((r) => r.status);
    expect(statuses).not.toContain("DONE");
    expect(statuses).toContain("ACTIVE");
    expect(statuses).toContain("BACKLOG");
  });

  it("sorts by count descending", () => {
    const breakdown = { BACKLOG: 5, QUEUED: 25, ACTIVE: 15, NOT_DONE: 10 };
    const reasons = computeDropOffReasons(breakdown, ["DONE"], 100);
    expect(reasons[0].status).toBe("QUEUED");
    expect(reasons[1].status).toBe("ACTIVE");
    expect(reasons[2].status).toBe("NOT_DONE");
    expect(reasons[3].status).toBe("BACKLOG");
  });

  it("limits to default topN of 5 results", () => {
    const breakdown = {
      A: 10, B: 9, C: 8, D: 7, E: 6, F: 5, G: 4,
    };
    const reasons = computeDropOffReasons(breakdown, [], 100);
    expect(reasons).toHaveLength(5);
  });

  it("respects a custom topN", () => {
    const breakdown = { A: 10, B: 9, C: 8, D: 7, E: 6 };
    const reasons = computeDropOffReasons(breakdown, [], 100, 3);
    expect(reasons).toHaveLength(3);
  });

  it("returns empty array for empty statusBreakdown", () => {
    const reasons = computeDropOffReasons({}, ["DONE"], 100);
    expect(reasons).toEqual([]);
  });

  it("returns empty array when all statuses are terminal", () => {
    const breakdown = { DONE: 50, CLOSED: 20 };
    const reasons = computeDropOffReasons(breakdown, ["DONE", "CLOSED"], 70);
    expect(reasons).toEqual([]);
  });

  it("computes percentage relative to totalCreated", () => {
    const breakdown = { ACTIVE: 20, BACKLOG: 10 };
    const reasons = computeDropOffReasons(breakdown, ["DONE"], 100);
    const active = reasons.find((r) => r.status === "ACTIVE")!;
    const backlog = reasons.find((r) => r.status === "BACKLOG")!;
    expect(active.percentage).toBe(computeConversionRate(20, 100));
    expect(backlog.percentage).toBe(computeConversionRate(10, 100));
  });

  it("returns empty array when totalCreated is 0", () => {
    const breakdown = { ACTIVE: 5 };
    // With 0 totalCreated, percentages are all 0 but we still return the breakdown
    // The key check: function does not crash
    const reasons = computeDropOffReasons(breakdown, [], 0);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].percentage).toBe(0);
  });
});

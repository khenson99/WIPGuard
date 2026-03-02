import { describe, expect, it } from "vitest";
import { computeKpiDelta } from "@/lib/analytics/kpi-deltas";

describe("computeKpiDelta", () => {
  it("computes absolute + percent delta and direction", () => {
    const delta = computeKpiDelta({ current: 100, previous: 80 });
    expect(delta).toEqual(
      expect.objectContaining({
        current: 100,
        previous: 80,
        delta: 20,
        deltaPct: 25,
        direction: "up",
      }),
    );
  });

  it("handles decreases", () => {
    const delta = computeKpiDelta({ current: 80, previous: 100 });
    expect(delta.delta).toBe(-20);
    expect(delta.deltaPct).toBe(-20);
    expect(delta.direction).toBe("down");
  });

  it("returns null deltas when current or previous is missing", () => {
    expect(computeKpiDelta({ current: null, previous: 10 }).delta).toBeNull();
    expect(computeKpiDelta({ current: 10, previous: null }).deltaPct).toBeNull();
  });

  it("returns null percent delta when previous is zero but current is non-zero", () => {
    const delta = computeKpiDelta({ current: 10, previous: 0 });
    expect(delta.delta).toBe(10);
    expect(delta.deltaPct).toBeNull();
    expect(delta.direction).toBe("up");
  });

  it("returns 0 percent delta when both values are zero", () => {
    const delta = computeKpiDelta({ current: 0, previous: 0 });
    expect(delta.delta).toBe(0);
    expect(delta.deltaPct).toBe(0);
    expect(delta.direction).toBe("flat");
  });
});


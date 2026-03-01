import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPENSE_RATIOS,
  computeVariance,
  computeProgressPct,
  fmtDelta,
  fmtMonths,
  fmtRatio,
  runwayColor,
  runwayBgColor,
  healthScoreColor,
  gradeColor,
  ltvCacSeverity,
} from "@/lib/analytics/finance-utils";

describe("DEFAULT_EXPENSE_RATIOS", () => {
  it("has exactly 5 category keys", () => {
    expect(Object.keys(DEFAULT_EXPENSE_RATIOS)).toHaveLength(5);
  });

  it("values sum to 1.0", () => {
    const sum = (Object.values(DEFAULT_EXPENSE_RATIOS) as number[]).reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it("contains the expected individual ratios", () => {
    expect(DEFAULT_EXPENSE_RATIOS.cogs).toBe(0.25);
    expect(DEFAULT_EXPENSE_RATIOS.payroll).toBe(0.35);
    expect(DEFAULT_EXPENSE_RATIOS.marketing).toBe(0.15);
    expect(DEFAULT_EXPENSE_RATIOS.infrastructure).toBe(0.1);
    expect(DEFAULT_EXPENSE_RATIOS.ops).toBe(0.15);
  });
});

describe("computeVariance", () => {
  it("returns null variance when actual is null", () => {
    expect(computeVariance(100, null)).toEqual({ variance: null, variancePct: null });
  });

  it("returns positive variance when actual exceeds planned", () => {
    expect(computeVariance(100, 120)).toEqual({ variance: 20, variancePct: 20 });
  });

  it("returns negative variance when actual is under planned", () => {
    expect(computeVariance(100, 80)).toEqual({ variance: -20, variancePct: -20 });
  });

  it("returns 0 variancePct when planned and actual are both zero", () => {
    expect(computeVariance(0, 0)).toEqual({ variance: 0, variancePct: 0 });
  });

  it("returns 100 variancePct when planned is zero and actual is positive", () => {
    expect(computeVariance(0, 50)).toEqual({ variance: 50, variancePct: 100 });
  });
});

describe("computeProgressPct", () => {
  it("returns 50 for halfway progress", () => {
    expect(computeProgressPct(50, 100)).toBe(50);
  });

  it("clamps to 100 when current exceeds target", () => {
    expect(computeProgressPct(150, 100)).toBe(100);
  });

  it("returns 0 when current is zero", () => {
    expect(computeProgressPct(0, 100)).toBe(0);
  });

  it("returns 0 when target is negative", () => {
    expect(computeProgressPct(50, -10)).toBe(0);
  });

  it("returns 100 when target is zero and current is positive", () => {
    expect(computeProgressPct(50, 0)).toBe(100);
  });
});

describe("fmtDelta", () => {
  it("formats thousands with k suffix", () => {
    expect(fmtDelta(1200)).toBe("+$1.2k");
  });

  it("formats large values as k (no M suffix)", () => {
    expect(fmtDelta(1_500_000)).toBe("+$1500k");
  });

  it("formats small values without suffix", () => {
    expect(fmtDelta(500)).toBe("+$500");
  });

  it("formats negative values with a minus sign", () => {
    expect(fmtDelta(-2500)).toBe("−$2.5k");
  });

  it("formats zero without a sign", () => {
    expect(fmtDelta(0)).toBe("$0");
  });
});

describe("fmtMonths", () => {
  it("formats a normal value with one decimal place", () => {
    expect(fmtMonths(12.5)).toBe("12.5mo");
  });

  it("formats values above 24 without capping", () => {
    expect(fmtMonths(25)).toBe("25.0mo");
  });

  it("formats exactly 24 as 24.0mo", () => {
    expect(fmtMonths(24)).toBe("24.0mo");
  });

  it("formats zero as 0.0mo", () => {
    expect(fmtMonths(0)).toBe("0.0mo");
  });

  it("formats infinite/very large values as ∞", () => {
    expect(fmtMonths(Infinity)).toBe("∞");
    expect(fmtMonths(999)).toBe("∞");
  });
});

describe("fmtRatio", () => {
  it("formats a normal ratio with one decimal and ×", () => {
    expect(fmtRatio(3.2)).toBe("3.2×");
  });

  it("formats zero as 0.0×", () => {
    expect(fmtRatio(0)).toBe("0.0×");
  });

  it("returns — for non-finite ratios", () => {
    expect(fmtRatio(Infinity)).toBe("—");
  });
});

describe("runwayColor", () => {
  it("returns red under 6 months", () => {
    expect(runwayColor(3)).toBe("text-red-500");
  });

  it("returns yellow between 6 and 11 months", () => {
    expect(runwayColor(6)).toBe("text-yellow-500");
    expect(runwayColor(9)).toBe("text-yellow-500");
  });

  it("returns green at 12 months or more", () => {
    expect(runwayColor(12)).toBe("text-emerald-500");
    expect(runwayColor(18)).toBe("text-emerald-500");
  });
});

describe("runwayBgColor", () => {
  it("returns red under 6 months", () => {
    expect(runwayBgColor(3)).toBe("bg-red-500");
  });

  it("returns yellow between 6 and 11 months", () => {
    expect(runwayBgColor(6)).toBe("bg-yellow-500");
    expect(runwayBgColor(9)).toBe("bg-yellow-500");
  });

  it("returns green at 12 months or more", () => {
    expect(runwayBgColor(12)).toBe("bg-emerald-500");
    expect(runwayBgColor(18)).toBe("bg-emerald-500");
  });
});

describe("healthScoreColor", () => {
  it("returns the expected HSL values by threshold", () => {
    expect(healthScoreColor(20)).toBe("hsl(0, 84%, 60%)");
    expect(healthScoreColor(55)).toBe("hsl(25, 95%, 53%)");
    expect(healthScoreColor(65)).toBe("hsl(48, 96%, 53%)");
    expect(healthScoreColor(85)).toBe("hsl(142, 71%, 45%)");
  });
});

describe("gradeColor", () => {
  it("returns Tailwind classes for letter grades", () => {
    expect(gradeColor("A")).toBe("text-emerald-500");
    expect(gradeColor("B")).toBe("text-blue-500");
    expect(gradeColor("C")).toBe("text-yellow-500");
    expect(gradeColor("D")).toBe("text-orange-500");
    expect(gradeColor("F")).toBe("text-red-500");
  });

  it("handles lowercase input (case insensitive)", () => {
    expect(gradeColor("a")).toBe("text-emerald-500");
  });
});

describe("ltvCacSeverity", () => {
  it("returns negative for ratio below 1", () => {
    expect(ltvCacSeverity(0.5)).toBe("negative");
  });

  it("returns neutral for ratio between 1 and 2.99", () => {
    expect(ltvCacSeverity(1)).toBe("neutral");
    expect(ltvCacSeverity(2)).toBe("neutral");
  });

  it("returns positive for ratio of 3 or above", () => {
    expect(ltvCacSeverity(3)).toBe("positive");
    expect(ltvCacSeverity(7)).toBe("positive");
  });
});


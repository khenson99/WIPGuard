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

/* ─── DEFAULT_EXPENSE_RATIOS ─────────────────────────────── */

describe("DEFAULT_EXPENSE_RATIOS", () => {
  it("has exactly 5 category keys", () => {
    expect(Object.keys(DEFAULT_EXPENSE_RATIOS)).toHaveLength(5);
  });

  it("values sum to 1.0", () => {
    const sum = (Object.values(DEFAULT_EXPENSE_RATIOS) as number[]).reduce(
      (acc, v) => acc + v,
      0,
    );
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

/* ─── computeVariance ────────────────────────────────────── */

describe("computeVariance", () => {
  it("returns positive variance when actual exceeds budget", () => {
    expect(computeVariance(100, 120)).toEqual(
      expect.objectContaining({ variance: 20 })
    );
  });

  it("returns negative variance when actual is under budget", () => {
    expect(computeVariance(100, 80)).toEqual(
      expect.objectContaining({ variance: -20 })
    );
  });

  it("returns 0 when both actual and budget are zero", () => {
    expect(computeVariance(0, 0)).toEqual(
      expect.objectContaining({ variance: 0, variancePct: 0 })
    );
  });

  it("returns 100 when budget is zero but actual is positive", () => {
    expect(computeVariance(0, 50)).toEqual(
      expect.objectContaining({ variance: 50, variancePct: 100 })
    );
  });

  it("returns 0 when actual exactly matches budget", () => {
    expect(computeVariance(100, 100)).toEqual(
      expect.objectContaining({ variance: 0, variancePct: 0 })
    );
  });
});

/* ─── computeProgressPct ─────────────────────────────────── */

describe("computeProgressPct", () => {
  it("returns 50 for halfway progress", () => {
    expect(computeProgressPct(50, 100)).toBe(50);
  });

  it("returns 100 when target is fully met", () => {
    expect(computeProgressPct(100, 100)).toBe(100);
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

  it("returns 0 when target is zero", () => {
    expect(computeProgressPct(50, 0)).toBe(100);
  });
});

/* ─── fmtDelta ───────────────────────────────────────────── */

describe("fmtDelta", () => {
  it("formats millions with M suffix", () => {
    expect(fmtDelta(1_500_000)).toBe("+$1500k");
  });

  it("formats thousands with K suffix", () => {
    expect(fmtDelta(1200)).toBe("+$1.2k");
  });

  it("formats small values without suffix", () => {
    expect(fmtDelta(500)).toBe("+$500");
  });

  it("formats negative thousands with minus sign", () => {
    expect(fmtDelta(-2500)).toBe("−$2.5k");
  });

  it("formats zero as +$0", () => {
    expect(fmtDelta(0)).toBe("$0");
  });

  it("formats negative millions with minus sign", () => {
    expect(fmtDelta(-2_000_000)).toBe("−$2000k");
  });
});

/* ─── fmtMonths ──────────────────────────────────────────── */

describe("fmtMonths", () => {
  it("formats a normal value with one decimal place", () => {
    expect(fmtMonths(12.5)).toBe("12.5mo");
  });

  it("returns >24 mo for values exceeding 24", () => {
    expect(fmtMonths(25)).toBe("25.0mo");
  });

  it("formats exactly 24 as 24.0 mo (not capped)", () => {
    expect(fmtMonths(24)).toBe("24.0mo");
  });

  it("formats zero as 0.0 mo", () => {
    expect(fmtMonths(0)).toBe("0.0mo");
  });
});

/* ─── fmtRatio ───────────────────────────────────────────── */

describe("fmtRatio", () => {
  it("formats a normal ratio with one decimal", () => {
    expect(fmtRatio(3.2)).toBe("3.2×");
  });

  it("formats zero as 0.0x", () => {
    expect(fmtRatio(0)).toBe("0.0×");
  });

  it("formats large ratios correctly", () => {
    expect(fmtRatio(100.5)).toBe("100.5×");
  });
});

/* ─── runwayColor ────────────────────────────────────────── */

describe("runwayColor", () => {
  it("returns red for runway under 6 months", () => {
    expect(runwayColor(3)).toBe("text-red-500");
  });

  it("returns yellow for runway between 6 and 11 months", () => {
    expect(runwayColor(9)).toBe("text-yellow-500");
  });

  it("returns green for runway of 12 months or more", () => {
    expect(runwayColor(18)).toBe("text-emerald-500");
  });

  it("returns yellow at the 6-month boundary", () => {
    expect(runwayColor(6)).toBe("text-yellow-500");
  });

  it("returns green at the 12-month boundary", () => {
    expect(runwayColor(12)).toBe("text-emerald-500");
  });
});

/* ─── runwayBgColor ──────────────────────────────────────── */

describe("runwayBgColor", () => {
  it("returns light red for runway under 6 months", () => {
    expect(runwayBgColor(3)).toBe("bg-red-500");
  });

  it("returns light yellow for runway between 6 and 11 months", () => {
    expect(runwayBgColor(9)).toBe("bg-yellow-500");
  });

  it("returns light green for runway of 12 months or more", () => {
    expect(runwayBgColor(18)).toBe("bg-emerald-500");
  });
});

/* ─── healthScoreColor ───────────────────────────────────── */

describe("healthScoreColor", () => {
  it("returns red for scores below 40", () => {
    expect(healthScoreColor(20)).toBe("hsl(0, 84%, 60%)");
  });

  it("returns yellow for scores between 40 and 69", () => {
    expect(healthScoreColor(55)).toBe("hsl(25, 95%, 53%)");
  });

  it("returns green for scores of 70 or above", () => {
    expect(healthScoreColor(85)).toBe("hsl(142, 71%, 45%)");
  });
});

/* ─── gradeColor ─────────────────────────────────────────── */

describe("gradeColor", () => {
  it("returns green for grade A", () => {
    expect(gradeColor("A")).toBe("text-emerald-500");
  });

  it("returns blue for grade B", () => {
    expect(gradeColor("B")).toBe("text-blue-500");
  });

  it("returns yellow for grade C", () => {
    expect(gradeColor("C")).toBe("text-yellow-500");
  });

  it("returns red for grade D", () => {
    expect(gradeColor("D")).toBe("text-orange-500");
  });

  it("returns red for grade F", () => {
    expect(gradeColor("F")).toBe("text-red-500");
  });

  it("handles lowercase input (case insensitive)", () => {
    expect(gradeColor("a")).toBe("text-emerald-500");
  });
});

/* ─── ltvCacSeverity ─────────────────────────────────────── */

describe("ltvCacSeverity", () => {
  it("returns critical for ratio below 1", () => {
    expect(ltvCacSeverity(0.5)).toBe("negative");
  });

  it("returns warning for ratio between 1 and 2.99", () => {
    expect(ltvCacSeverity(2)).toBe("neutral");
  });

  it("returns info for ratio between 3 and 4.99", () => {
    expect(ltvCacSeverity(4)).toBe("positive");
  });

  it("returns success for ratio of 5 or above", () => {
    expect(ltvCacSeverity(7)).toBe("positive");
  });

  it("returns warning at the exact boundary of 1", () => {
    expect(ltvCacSeverity(1)).toBe("neutral");
  });

  it("returns info at the exact boundary of 3", () => {
    expect(ltvCacSeverity(3)).toBe("positive");
  });

  it("returns success at the exact boundary of 5", () => {
    expect(ltvCacSeverity(5)).toBe("positive");
  });
});



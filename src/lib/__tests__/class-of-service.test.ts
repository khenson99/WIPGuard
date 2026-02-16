import { describe, expect, it } from "vitest";
import {
  type ClassOfService,
  CLASS_OF_SERVICE_VALUES,
  SERVICE_CLASS_META,
  getServiceClassColors,
  isDateBreachRisk,
  calculateExpediteDebt,
  parseClassOfService,
  DEFAULT_BREACH_THRESHOLD_DAYS,
  DEFAULT_EXPEDITE_THRESHOLD_PERCENT,
} from "@/lib/class-of-service";

// ---------------------------------------------------------------------------
// getServiceClassColors
// ---------------------------------------------------------------------------

describe("getServiceClassColors", () => {
  it.each(CLASS_OF_SERVICE_VALUES)(
    "returns color tokens for %s",
    (cls) => {
      const colors = getServiceClassColors(cls);
      expect(colors).toHaveProperty("bg");
      expect(colors).toHaveProperty("text");
      expect(colors).toHaveProperty("border");
      expect(colors).toHaveProperty("dot");
      expect(typeof colors.dot).toBe("string");
    }
  );

  it("expedite returns red-based colors", () => {
    const colors = getServiceClassColors("expedite");
    expect(colors.bg).toContain("red");
    expect(colors.text).toContain("red");
  });

  it("fixed-date returns blue-based colors", () => {
    const colors = getServiceClassColors("fixed-date");
    expect(colors.bg).toContain("blue");
  });

  it("intangible returns violet-based colors", () => {
    const colors = getServiceClassColors("intangible");
    expect(colors.bg).toContain("violet");
  });
});

// ---------------------------------------------------------------------------
// SERVICE_CLASS_META
// ---------------------------------------------------------------------------

describe("SERVICE_CLASS_META", () => {
  it("defines metadata for all service classes", () => {
    for (const cls of CLASS_OF_SERVICE_VALUES) {
      const meta = SERVICE_CLASS_META[cls];
      expect(meta.label).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.policy).toBeTruthy();
      expect(meta.iconName).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// isDateBreachRisk
// ---------------------------------------------------------------------------

describe("isDateBreachRisk", () => {
  const now = new Date("2025-06-15T12:00:00Z");

  it("returns null for non-fixed-date classes", () => {
    expect(isDateBreachRisk("2025-06-16", "standard", { now })).toBeNull();
    expect(isDateBreachRisk("2025-06-16", "expedite", { now })).toBeNull();
    expect(isDateBreachRisk("2025-06-16", "intangible", { now })).toBeNull();
  });

  it("returns null when dueDate is null/undefined", () => {
    expect(isDateBreachRisk(null, "fixed-date", { now })).toBeNull();
    expect(isDateBreachRisk(undefined, "fixed-date", { now })).toBeNull();
  });

  it("detects overdue items", () => {
    const result = isDateBreachRisk("2025-06-14T00:00:00Z", "fixed-date", {
      now,
    });
    expect(result).not.toBeNull();
    expect(result!.atRisk).toBe(true);
    expect(result!.daysRemaining).toBeLessThan(0);
    expect(result!.label).toContain("overdue");
  });

  it("detects items due today", () => {
    // Due date is earlier in the same day
    const result = isDateBreachRisk("2025-06-15T12:00:00Z", "fixed-date", {
      now,
    });
    expect(result).not.toBeNull();
    expect(result!.daysRemaining).toBe(0);
    expect(result!.atRisk).toBe(true);
    expect(result!.label).toBe("Due today");
  });

  it("marks items within threshold as at-risk", () => {
    // 2 days remaining, default threshold is 3
    const result = isDateBreachRisk("2025-06-17T12:00:00Z", "fixed-date", {
      now,
    });
    expect(result).not.toBeNull();
    expect(result!.daysRemaining).toBe(2);
    expect(result!.atRisk).toBe(true);
  });

  it("marks items beyond threshold as not at-risk", () => {
    // 10 days remaining
    const result = isDateBreachRisk("2025-06-25T12:00:00Z", "fixed-date", {
      now,
    });
    expect(result).not.toBeNull();
    expect(result!.daysRemaining).toBe(10);
    expect(result!.atRisk).toBe(false);
    expect(result!.label).toBe("10d remaining");
  });

  it("respects custom threshold", () => {
    // 5 days remaining, threshold = 7 => at risk
    const result = isDateBreachRisk("2025-06-20T12:00:00Z", "fixed-date", {
      now,
      thresholdDays: 7,
    });
    expect(result!.atRisk).toBe(true);

    // Same date with threshold = 3 => not at risk
    const result2 = isDateBreachRisk("2025-06-20T12:00:00Z", "fixed-date", {
      now,
      thresholdDays: 3,
    });
    expect(result2!.atRisk).toBe(false);
  });

  it("accepts Date objects for dueDate", () => {
    const due = new Date("2025-06-25T00:00:00Z");
    const result = isDateBreachRisk(due, "fixed-date", { now });
    expect(result).not.toBeNull();
    expect(result!.daysRemaining).toBeGreaterThan(0);
  });

  it("has a sensible default threshold", () => {
    expect(DEFAULT_BREACH_THRESHOLD_DAYS).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// calculateExpediteDebt
// ---------------------------------------------------------------------------

describe("calculateExpediteDebt", () => {
  interface MockTask {
    id: string;
    cls: ClassOfService;
  }

  const accessor = (t: MockTask) => t.cls;

  it("returns zero debt for empty task list", () => {
    const result = calculateExpediteDebt([], accessor);
    expect(result.totalTasks).toBe(0);
    expect(result.expediteCount).toBe(0);
    expect(result.expeditePercent).toBe(0);
    expect(result.isOverThreshold).toBe(false);
    expect(result.label).toBe("No tasks");
  });

  it("calculates correct percentage for mixed tasks", () => {
    const tasks: MockTask[] = [
      { id: "1", cls: "standard" },
      { id: "2", cls: "expedite" },
      { id: "3", cls: "fixed-date" },
      { id: "4", cls: "intangible" },
      { id: "5", cls: "standard" },
    ];

    const result = calculateExpediteDebt(tasks, accessor);
    expect(result.totalTasks).toBe(5);
    expect(result.expediteCount).toBe(1);
    expect(result.expeditePercent).toBe(20); // 1/5 = 20%
    expect(result.isOverThreshold).toBe(true); // 20% > 10% default
  });

  it("reports under-threshold correctly", () => {
    const tasks: MockTask[] = [
      { id: "1", cls: "standard" },
      { id: "2", cls: "standard" },
      { id: "3", cls: "standard" },
      { id: "4", cls: "standard" },
      { id: "5", cls: "standard" },
      { id: "6", cls: "standard" },
      { id: "7", cls: "standard" },
      { id: "8", cls: "standard" },
      { id: "9", cls: "standard" },
      { id: "10", cls: "expedite" },
    ];

    const result = calculateExpediteDebt(tasks, accessor);
    expect(result.expeditePercent).toBe(10);
    // 10% is not OVER 10%, so should not be flagged
    expect(result.isOverThreshold).toBe(false);
  });

  it("respects custom threshold", () => {
    const tasks: MockTask[] = [
      { id: "1", cls: "standard" },
      { id: "2", cls: "expedite" },
    ];

    // 50% expedite, threshold 60% => not over
    const result = calculateExpediteDebt(tasks, accessor, {
      thresholdPercent: 60,
    });
    expect(result.expeditePercent).toBe(50);
    expect(result.isOverThreshold).toBe(false);

    // Same tasks, threshold 40% => over
    const result2 = calculateExpediteDebt(tasks, accessor, {
      thresholdPercent: 40,
    });
    expect(result2.isOverThreshold).toBe(true);
  });

  it("handles all-expedite tasks", () => {
    const tasks: MockTask[] = [
      { id: "1", cls: "expedite" },
      { id: "2", cls: "expedite" },
    ];

    const result = calculateExpediteDebt(tasks, accessor);
    expect(result.expeditePercent).toBe(100);
    expect(result.isOverThreshold).toBe(true);
  });

  it("handles no-expedite tasks", () => {
    const tasks: MockTask[] = [
      { id: "1", cls: "standard" },
      { id: "2", cls: "fixed-date" },
    ];

    const result = calculateExpediteDebt(tasks, accessor);
    expect(result.expeditePercent).toBe(0);
    expect(result.isOverThreshold).toBe(false);
  });

  it("generates a readable label", () => {
    const tasks: MockTask[] = [
      { id: "1", cls: "standard" },
      { id: "2", cls: "expedite" },
      { id: "3", cls: "standard" },
      { id: "4", cls: "expedite" },
    ];

    const result = calculateExpediteDebt(tasks, accessor);
    expect(result.label).toBe("50% expedite (2/4)");
  });

  it("has a sensible default threshold", () => {
    expect(DEFAULT_EXPEDITE_THRESHOLD_PERCENT).toBe(10);
  });

  it("handles null/undefined class-of-service values", () => {
    const tasks = [
      { id: "1", cls: null },
      { id: "2", cls: undefined },
      { id: "3", cls: "expedite" as ClassOfService },
    ];

    const result = calculateExpediteDebt(
      tasks,
      (t) => t.cls as ClassOfService | null | undefined
    );
    expect(result.expediteCount).toBe(1);
    expect(result.totalTasks).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parseClassOfService
// ---------------------------------------------------------------------------

describe("parseClassOfService", () => {
  it("returns the correct class for valid values", () => {
    expect(parseClassOfService("standard")).toBe("standard");
    expect(parseClassOfService("fixed-date")).toBe("fixed-date");
    expect(parseClassOfService("expedite")).toBe("expedite");
    expect(parseClassOfService("intangible")).toBe("intangible");
  });

  it("is case-insensitive", () => {
    expect(parseClassOfService("EXPEDITE")).toBe("expedite");
    expect(parseClassOfService("Fixed-Date")).toBe("fixed-date");
    expect(parseClassOfService("INTANGIBLE")).toBe("intangible");
  });

  it("trims whitespace", () => {
    expect(parseClassOfService("  expedite  ")).toBe("expedite");
  });

  it("returns 'standard' for null/undefined", () => {
    expect(parseClassOfService(null)).toBe("standard");
    expect(parseClassOfService(undefined)).toBe("standard");
  });

  it("returns 'standard' for unrecognized values", () => {
    expect(parseClassOfService("urgent")).toBe("standard");
    expect(parseClassOfService("")).toBe("standard");
    expect(parseClassOfService("custom-class")).toBe("standard");
  });
});

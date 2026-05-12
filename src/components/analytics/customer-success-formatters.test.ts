import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatNumber,
  formatPct,
  healthTone,
} from "@/components/analytics/customer-success-formatters";

describe("customer-success-formatters", () => {
  it("formats percentages and numbers with fallbacks", () => {
    expect(formatPct(62.44)).toBe("62.4%");
    expect(formatPct(null)).toBe("—");
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(undefined)).toBe("—");
  });

  it("formats dates and health tone thresholds", () => {
    expect(formatDate("2026-03-09T12:00:00.000Z")).toBe("Mar 9, 2026");
    expect(formatDate()).toBe("—");
    expect(healthTone(82)).toBe("text-[var(--success)]");
    expect(healthTone(65)).toBe("text-[var(--warning)]");
    expect(healthTone(58)).toBe("text-red-500");
  });
});

import { describe, expect, it } from "vitest";
import { formatSprintDay, formatSprintRangeLabel, getSprintLabel } from "@/lib/sprints";

describe("sprints helpers", () => {
  it("formats a sprint day in UTC", () => {
    expect(formatSprintDay("2026-03-11")).toBe("Mar 11");
  });

  it("formats a sprint range label when both dates exist", () => {
    expect(
      formatSprintRangeLabel({
        startDate: "2026-03-01",
        endDate: "2026-03-14",
      }),
    ).toBe("Mar 1 – Mar 14");
  });

  it("falls back to the sprint name when dates are unavailable", () => {
    expect(
      getSprintLabel({
        name: "Pipeline Push",
        startDate: null,
        endDate: null,
      }),
    ).toBe("Pipeline Push");
  });

  it("falls back to a default label when the sprint is unnamed", () => {
    expect(getSprintLabel({})).toBe("Unnamed sprint");
  });
});

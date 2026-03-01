import { describe, expect, it } from "vitest";
import { endDateForPeriod } from "@/lib/analytics/budget-period";

describe("budget period date math", () => {
  it("does not overflow month-end dates into a later month", () => {
    expect(endDateForPeriod("2026-01-31", "MONTHLY")).toBe("2026-02-27");
  });

  it("keeps first-of-month ranges aligned to month end", () => {
    expect(endDateForPeriod("2026-02-01", "MONTHLY")).toBe("2026-02-28");
  });

  it("handles quarterly and annual periods", () => {
    expect(endDateForPeriod("2026-01-31", "QUARTERLY")).toBe("2026-04-29");
    expect(endDateForPeriod("2026-01-31", "ANNUAL")).toBe("2027-01-30");
  });
});

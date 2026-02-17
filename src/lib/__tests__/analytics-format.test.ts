import { smartFormat } from "@/lib/analytics/format";

describe("analytics format", () => {
  it("scales ratio-like percent metrics in smartFormat", () => {
    expect(smartFormat("bounceRate", 0.56)).toBe("56.0%");
    expect(smartFormat("successRate", 0.875)).toBe("87.5%");
  });

  it("keeps whole-percent metrics unchanged in smartFormat", () => {
    expect(smartFormat("bounceRate", 56)).toBe("56.0%");
  });
});

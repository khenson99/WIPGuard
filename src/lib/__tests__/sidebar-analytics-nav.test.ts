import { describe, expect, it } from "vitest";
import { PRIMARY_NAV_ITEMS } from "@/components/layout/sidebar";

describe("sidebar analytics tier-1 navigation", () => {
  it("includes direct links for each tier-1 analytics dashboard", () => {
    const hrefs = new Set(PRIMARY_NAV_ITEMS.map((item) => item.href));

    expect(hrefs.has("/analytics/ads-traffic")).toBe(true);
    expect(hrefs.has("/analytics/finance")).toBe(true);
    expect(hrefs.has("/analytics/sales-pipeline")).toBe(true);
    expect(hrefs.has("/analytics/customer-success")).toBe(true);
    expect(hrefs.has("/analytics")).toBe(false);
  });
});

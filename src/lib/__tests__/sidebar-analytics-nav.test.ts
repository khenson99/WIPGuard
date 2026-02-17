import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "@/components/layout/sidebar";

describe("sidebar analytics tier-1 navigation", () => {
  it("includes nested links for each tier-1 analytics dashboard", () => {
    const hrefs = new Set(DASHBOARD_NAV_ITEMS.map((item) => item.href));

    expect(hrefs.has("/analytics/ads-traffic")).toBe(true);
    expect(hrefs.has("/analytics/finance")).toBe(true);
    expect(hrefs.has("/analytics/sales-pipeline")).toBe(true);
    expect(hrefs.has("/analytics/customer-success")).toBe(true);
  });

  it("does not keep analytics dashboards in the top-level nav", () => {
    const hrefs = new Set(PRIMARY_NAV_ITEMS.map((item) => item.href));

    expect(hrefs.has("/analytics/ads-traffic")).toBe(false);
    expect(hrefs.has("/analytics/finance")).toBe(false);
    expect(hrefs.has("/analytics/sales-pipeline")).toBe(false);
    expect(hrefs.has("/analytics/customer-success")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/layout/sidebar-nav-config";

describe("sidebar analytics tier-1 navigation", () => {
  it("includes collapsible groups for each tier-1 analytics dashboard", () => {
    const items = buildNavItems();
    const hrefs = new Set(items.map((item) => item.href));

    expect(hrefs.has("/analytics/ads-traffic")).toBe(true);
    expect(hrefs.has("/analytics/finance")).toBe(true);
    expect(hrefs.has("/analytics/sales-pipeline")).toBe(true);
    expect(hrefs.has("/analytics/customer-success")).toBe(true);
  });

  it("analytics groups have children from section registry", () => {
    const items = buildNavItems();
    const adsTraffic = items.find((i) => i.id === "ads-traffic");
    expect(adsTraffic?.children?.length).toBeGreaterThan(0);
  });

  it("includes Customer Journey and AI Insights top-level pages", () => {
    const items = buildNavItems();
    const journey = items.find((i) => i.id === "customer-journey");
    const insights = items.find((i) => i.id === "ai-insights");
    expect(journey?.href).toBe("/analytics/customer-journey");
    expect(insights?.href).toBe("/analytics/ai-insights");
  });
});

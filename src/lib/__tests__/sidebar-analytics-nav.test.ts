import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/layout/sidebar-nav-config";

describe("sidebar analytics navigation", () => {
  const navItems = buildNavItems();

  it("builds analytics as grouped entries with nested children", () => {
    const ads = navItems.find((item) => item.id === "ads-traffic");
    const finance = navItems.find((item) => item.id === "finance");
    const sales = navItems.find((item) => item.id === "sales-pipeline");
    const cs = navItems.find((item) => item.id === "customer-success");

    expect(ads?.children?.length).toBeGreaterThan(0);
    expect(finance?.children?.length).toBeGreaterThan(0);
    expect(sales?.children?.length).toBeGreaterThan(0);
    expect(cs?.children?.length).toBeGreaterThan(0);
  });

  it("includes nested links for each tier-1 analytics dashboard", () => {
    const analyticsGroups = navItems.filter((item) => item.children && item.children.length > 0);
    const hrefs = new Set(analyticsGroups.map((item) => item.href));

    expect(hrefs.size).toBeGreaterThan(0);
  });

  it("keeps standup command center in nav and points it to /today", () => {
    const standup = navItems.find((item) => item.id === "standup");

    expect(standup).toBeTruthy();
    expect(standup?.href).toBe("/today");
  });

  it("includes customer journey and AI insights pages", () => {
    const customerJourney = navItems.find((item) => item.id === "customer-journey");
    const aiInsights = navItems.find((item) => item.id === "ai-insights");

    expect(customerJourney).toBeTruthy();
    expect(customerJourney?.href).toBe("/analytics/customer-journey");
    expect(aiInsights).toBeTruthy();
    expect(aiInsights?.href).toBe("/analytics/ai-insights");
  });

  it("includes conferences navigation entry", () => {
    const conferences = navItems.find((item) => item.id === "conferences");

    expect(conferences).toBeTruthy();
    expect(conferences?.href).toBe("/conferences");
  });
});

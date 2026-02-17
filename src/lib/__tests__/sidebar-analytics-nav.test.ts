import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/layout/sidebar-nav-config";

describe("sidebar analytics navigation", () => {
  it("builds analytics as grouped entries with nested children", () => {
    const navItems = buildNavItems();

    const ads = navItems.find((item) => item.id === "ads-traffic");
    const finance = navItems.find((item) => item.id === "finance");
    const sales = navItems.find((item) => item.id === "sales-pipeline");
    const cs = navItems.find((item) => item.id === "customer-success");

    expect(ads?.children?.length).toBeGreaterThan(0);
    expect(finance?.children?.length).toBeGreaterThan(0);
    expect(sales?.children?.length).toBeGreaterThan(0);
    expect(cs?.children?.length).toBeGreaterThan(0);
  });

  it("keeps standup command center in nav and points it to /today", () => {
    const navItems = buildNavItems();
    const standup = navItems.find((item) => item.id === "standup");

    expect(standup).toBeTruthy();
    expect(standup?.href).toBe("/today");
  });
});

import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/layout/sidebar-nav-config";

describe("sidebar workspace navigation", () => {
  const navItems = buildNavItems();

  it("builds the five top-level product pillars", () => {
    expect(navItems.map((item) => item.id)).toEqual([
      "dashboard",
      "deals",
      "analytics",
      "integrations",
      "automations",
    ]);
  });

  it("groups analytics and automations as nested workspace entries", () => {
    const analytics = navItems.find((item) => item.id === "analytics");
    const automations = navItems.find((item) => item.id === "automations");

    expect(analytics?.children?.some((child) => child.href === "/analytics/ai-insights")).toBe(true);
    expect(
      automations?.children?.map((child) => child.href)
    ).toEqual([
      "/automations",
      "/automations/artifacts",
    ]);
  });

  it("promotes integrations to a first-class workspace", () => {
    const integrations = navItems.find((item) => item.id === "integrations");

    expect(integrations).toBeTruthy();
    expect(integrations?.href).toBe("/integrations");
    expect(integrations?.children).toBeUndefined();
  });
});

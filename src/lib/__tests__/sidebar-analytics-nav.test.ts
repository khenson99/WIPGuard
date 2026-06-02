import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/layout/sidebar-nav-config";

describe("sidebar workspace navigation", () => {
  const navItems = buildNavItems();

  it("builds the API meeting-place workspace pillars", () => {
    expect(navItems.map((item) => item.id)).toEqual([
      "sources",
      "metrics",
      "reports",
      "pipelines",
    ]);
    expect(navItems.map((item) => item.label)).toEqual([
      "Sources",
      "Metrics",
      "Reports",
      "Automation Pipelines",
    ]);
    expect(navItems.some((item) => item.href === "/dashboard")).toBe(false);
  });

  it("keeps workspace navigation flat after the product reset", () => {
    expect(navItems.flatMap((item) => item.children ?? [])).toEqual([]);
    expect(navItems.some((item) => item.href.startsWith("/analytics"))).toBe(false);
  });

  it("promotes sources to a first-class workspace", () => {
    const sources = navItems.find((item) => item.id === "sources");

    expect(sources).toBeTruthy();
    expect(sources?.href).toBe("/sources");
    expect(sources?.children).toBeUndefined();
  });
});

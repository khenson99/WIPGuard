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

  it("groups metrics and pipelines as nested workspace entries", () => {
    const metrics = navItems.find((item) => item.id === "metrics");
    const pipelines = navItems.find((item) => item.id === "pipelines");

    expect(metrics?.children?.some((child) => child.href === "/analytics/ai-insights")).toBe(true);
    expect(
      pipelines?.children?.map((child) => child.href)
    ).toEqual([
      "/pipelines",
      "/pipelines/artifacts",
    ]);
  });

  it("promotes sources to a first-class workspace", () => {
    const sources = navItems.find((item) => item.id === "sources");

    expect(sources).toBeTruthy();
    expect(sources?.href).toBe("/sources");
    expect(sources?.children).toBeUndefined();
  });
});

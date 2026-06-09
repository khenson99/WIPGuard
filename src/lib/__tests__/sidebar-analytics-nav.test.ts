import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/layout/sidebar-nav-config";

describe("sidebar workspace navigation", () => {
  const navItems = buildNavItems();

  it("builds the API meeting-place workspace pillars", () => {
    expect(navItems.map((item) => item.id)).toEqual([
      "sources",
      "goals",
      "metrics",
      "reports",
      "pipelines",
    ]);
    expect(navItems.map((item) => item.label)).toEqual([
      "Sources",
      "Goals",
      "Metrics",
      "Reports",
      "Automation Pipelines",
    ]);
    expect(navItems.some((item) => item.href === "/dashboard")).toBe(false);
  });

  it("exposes metrics dashboards under Metrics without restoring analytics children", () => {
    const metrics = navItems.find((item) => item.id === "metrics");
    const children = metrics?.children ?? [];
    const childIds = children.map((child) => child.id);

    // Core metric dashboards must remain exposed under Metrics. Asserted via
    // arrayContaining (not an exact snapshot) so that legitimately adding new
    // Metrics dashboards — e.g. the Operating cockpit views — does not break
    // this test and silently block the deploy pipeline.
    expect(childIds).toEqual(
      expect.arrayContaining(["company-tracker", "customer-health", "expense-dashboard"]),
    );

    // Every Metrics child must belong to the metrics workspace.
    expect(children.every((child) => child.workspaceId === "metrics")).toBe(true);

    // The contract this test guards: analytics children are never restored.
    expect(navItems.every((item) => !item.href.startsWith("/analytics"))).toBe(true);
    expect(children.every((child) => !child.href.startsWith("/analytics"))).toBe(true);
  });

  it("promotes sources to a first-class workspace", () => {
    const sources = navItems.find((item) => item.id === "sources");

    expect(sources).toBeTruthy();
    expect(sources?.href).toBe("/sources");
    expect(sources?.children).toBeUndefined();
  });

  it("promotes Linear goals to a first-class workspace", () => {
    const goals = navItems.find((item) => item.id === "goals");

    expect(goals).toBeTruthy();
    expect(goals?.href).toBe("/goals");
    expect(goals?.children).toBeUndefined();
  });
});

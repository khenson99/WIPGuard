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

    expect(metrics?.children).toEqual([
      expect.objectContaining({
        id: "company-tracker",
        href: "/metrics/company",
        label: "Company Tracker",
        workspaceId: "metrics",
      }),
      expect.objectContaining({
        id: "customer-health",
        href: "/metrics/customer-health",
        label: "Customer Health",
        workspaceId: "metrics",
      }),
      expect.objectContaining({
        id: "expense-dashboard",
        href: "/metrics/expenses",
        label: "Expenses",
        workspaceId: "metrics",
      }),
    ]);
    expect(navItems.some((item) => item.href.startsWith("/analytics"))).toBe(false);
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

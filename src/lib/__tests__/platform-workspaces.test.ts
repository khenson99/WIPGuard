import { describe, expect, it } from "vitest";
import { WORKSPACE_NAV_ITEMS } from "@/lib/platform/workspaces";

describe("platform workspace navigation", () => {
  it("exposes the Imladris product workspaces including company goals", () => {
    expect(WORKSPACE_NAV_ITEMS.map((item) => item.id)).toEqual([
      "sources",
      "goals",
      "metrics",
      "reports",
      "pipelines",
    ]);
  });

  it("links the company goals dashboard as a first-class workspace", () => {
    const goals = WORKSPACE_NAV_ITEMS.find((item) => item.id === "goals");

    expect(goals).toEqual(expect.objectContaining({
      id: "goals",
      label: "Goals",
      href: "/goals",
    }));
    expect(goals?.children).toBeUndefined();
  });

  it("links metrics dashboards as children without restoring legacy analytics routes", () => {
    const metrics = WORKSPACE_NAV_ITEMS.find((item) => item.id === "metrics");

    expect(metrics?.children).toEqual([
      {
        id: "company-tracker",
        label: "Company Tracker",
        href: "/metrics/company",
        workspaceId: "metrics",
      },
      {
        id: "customer-health",
        label: "Customer Health",
        href: "/metrics/customer-health",
        workspaceId: "metrics",
      },
      {
        id: "expense-dashboard",
        label: "Expenses",
        href: "/metrics/expenses",
        workspaceId: "metrics",
      },
    ]);
    expect(
      WORKSPACE_NAV_ITEMS.some((item) => item.href.startsWith("/analytics"))
    ).toBe(false);
  });
});

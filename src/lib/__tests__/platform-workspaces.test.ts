import { describe, expect, it } from "vitest";
import { WORKSPACE_NAV_ITEMS } from "@/lib/platform/workspaces";

describe("platform workspace navigation", () => {
  it("exposes only the four Imladris product workspaces", () => {
    expect(WORKSPACE_NAV_ITEMS.map((item) => item.id)).toEqual([
      "sources",
      "metrics",
      "reports",
      "pipelines",
    ]);
  });

  it("links the company tracker as a metrics child without restoring legacy analytics routes", () => {
    const metrics = WORKSPACE_NAV_ITEMS.find((item) => item.id === "metrics");

    expect(metrics?.children).toEqual([
      {
        id: "company-tracker",
        label: "Company Tracker",
        href: "/metrics/company",
        workspaceId: "metrics",
      },
    ]);
    expect(
      WORKSPACE_NAV_ITEMS.some((item) => item.href.startsWith("/analytics"))
    ).toBe(false);
  });
});

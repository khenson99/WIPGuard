import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/layout/sidebar-nav-config";

describe("sidebar nav config", () => {
  it("keeps operator workspaces for non-investor roles", () => {
    expect(buildNavItems("member").map((item) => item.id)).toEqual([
      "sources",
      "goals",
      "metrics",
      "reports",
      "pipelines",
    ]);
  });

  it("limits investor navigation to the investor workspace", () => {
    expect(buildNavItems("investor")).toEqual([
      expect.objectContaining({
        id: "investor",
        href: "/investor",
        label: "Investor",
        workspaceId: "investor",
      }),
    ]);
  });
});

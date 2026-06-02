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

  it("keeps primary workspace navigation free of legacy analytics children", () => {
    expect(WORKSPACE_NAV_ITEMS.flatMap((item) => item.children ?? [])).toEqual([]);
    expect(
      WORKSPACE_NAV_ITEMS.some((item) => item.href.startsWith("/analytics"))
    ).toBe(false);
  });
});

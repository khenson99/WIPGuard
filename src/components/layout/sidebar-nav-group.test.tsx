import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Megaphone } from "lucide-react";
import { SidebarNavGroup } from "@/components/layout/sidebar-nav-group";
import type { NavItem } from "@/components/layout/sidebar-nav-config";

let mockPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const BASE_ITEM: NavItem = {
  id: "metrics",
  href: "/metrics",
  label: "Metrics",
  workspaceId: "metrics",
  icon: Megaphone,
  children: [
    {
      id: "analytics-ai-insights",
      href: "/pipelines/artifacts",
      label: "Artifacts",
      workspaceId: "metrics",
    },
  ],
};

describe("SidebarNavGroup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPathname = "/dashboard";
  });

  it("defaults to collapsed when no stored preference exists", () => {
    render(<SidebarNavGroup item={BASE_ITEM} />);

    expect(screen.getByRole("button", { name: "Expand Metrics" })).toBeTruthy();
  });

  it("respects stored collapsed preference", () => {
    window.localStorage.setItem(
      "sidebar:expanded",
      JSON.stringify({
        ids: ["finance"],
        explicit: true,
      })
    );

    render(<SidebarNavGroup item={BASE_ITEM} />);

    expect(screen.getByRole("button", { name: "Expand Metrics" })).toBeTruthy();
  });

  it("forces expanded state when a child route is active", () => {
    window.localStorage.setItem(
      "sidebar:expanded",
      JSON.stringify({
        ids: ["finance"],
        explicit: true,
      })
    );
    mockPathname = "/pipelines/artifacts";

    render(<SidebarNavGroup item={BASE_ITEM} />);

    expect(screen.getByRole("button", { name: "Collapse Metrics" })).toBeTruthy();
  });

  it("treats legacy empty-array preference as no preference and collapses", () => {
    window.localStorage.setItem("sidebar:expanded", JSON.stringify([]));

    render(<SidebarNavGroup item={BASE_ITEM} />);

    expect(screen.getByRole("button", { name: "Expand Metrics" })).toBeTruthy();
  });

  it("supports explicit collapse-all preference in new storage format", () => {
    window.localStorage.setItem(
      "sidebar:expanded",
      JSON.stringify({
        ids: [],
        explicit: true,
      })
    );

    render(<SidebarNavGroup item={BASE_ITEM} />);

    expect(screen.getByRole("button", { name: "Expand Metrics" })).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceHome } from "./workspace-home";
import type { WorkspacePageModel } from "./workspace-model";

const MODEL: WorkspacePageModel = {
  eyebrow: "Sources",
  title: "Source control room",
  summary:
    "Monitor provider health, sync recency, and source lineage before metrics are trusted.",
  primaryAction: {
    href: "/settings",
    label: "Manage connections",
  },
  secondaryAction: {
    href: "/api/integrations",
    label: "Open API",
  },
  stats: [
    { label: "Preserved APIs", value: "18" },
    { label: "Trust state", value: "Live" },
  ],
  records: [
    {
      title: "Raw source records",
      description: "Provider payloads stored with source timestamps and hashes.",
      href: "/api/imladris/sources",
      label: "Imladris source API",
    },
  ],
  preservedSystems: [
    "OAuth callbacks",
    "Provider health checks",
    "Token refresh",
  ],
};

describe("WorkspaceHome", () => {
  it("renders a focused workspace landing surface", () => {
    render(<WorkspaceHome model={MODEL} />);

    expect(screen.getByRole("heading", { name: "Source control room" })).toBeTruthy();
    expect(screen.getByText(/Monitor provider health/i)).toBeTruthy();
    expect(screen.getByText("Preserved APIs")).toBeTruthy();
    expect(screen.getByText("Raw source records")).toBeTruthy();
    expect(screen.getByText("OAuth callbacks")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage connections" }).getAttribute("href")).toBe(
      "/settings"
    );
    expect(screen.getByRole("link", { name: "Open API" }).getAttribute("href")).toBe(
      "/api/integrations"
    );
  });
});

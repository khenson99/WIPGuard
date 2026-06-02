import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeLanding } from "./home-landing";

describe("HomeLanding", () => {
  it("renders the corrected journey CTAs", () => {
    render(<HomeLanding />);

    expect(
      screen.getByRole("heading", {
        name: /make every business metric traceable\./i,
      })
    ).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /access workspace/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /see the metric layer/i })).toBeTruthy();
    expect(screen.getByText("Imladris")).toBeTruthy();
    expect(screen.getByText(/freshness, lineage, and executive-ready exports/i)).toBeTruthy();
    expect(screen.queryByText(/kanban/i)).toBeNull();
    expect(screen.queryByText(/wipguard/i)).toBeNull();
  });
});

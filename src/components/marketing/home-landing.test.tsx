import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeLanding } from "./home-landing";

describe("HomeLanding", () => {
  it("renders the corrected journey CTAs", () => {
    render(<HomeLanding />);

    expect(
      screen.getByRole("heading", {
        name: /stop starting\. start finishing revenue work\./i,
      })
    ).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /access workspace/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /see the flow/i })).toBeTruthy();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdvancedDeveloperLinks } from "./advanced-developer-links";

describe("AdvancedDeveloperLinks", () => {
  it("keeps endpoint links out of the primary UI until expanded", async () => {
    const user = userEvent.setup();

    render(
      <AdvancedDeveloperLinks
        links={[
          {
            href: "/api/imladris/sources",
            label: "Imladris source API",
            description: "Raw source payload for debugging.",
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /advanced \/ developer/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /imladris source api/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /advanced \/ developer/i }));

    expect(screen.getByRole("link", { name: /imladris source api/i }).getAttribute("href")).toBe(
      "/api/imladris/sources",
    );
    expect(screen.getByText("Raw source payload for debugging.")).toBeTruthy();
  });
});

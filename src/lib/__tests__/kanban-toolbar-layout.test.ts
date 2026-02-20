import { describe, it, expect } from "vitest";

/**
 * WGX-025: Verify that the Kanban board layout classes anchor the
 * toolbar (and its New Task button) to the board content width rather
 * than the viewport width.
 *
 * This is a static analysis test — it reads the component source and
 * asserts the expected Tailwind class patterns are present.
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(
  join(__dirname, "../../components/board/kanban-board.tsx"),
  "utf-8"
);

describe("KanbanBoard toolbar layout (WGX-025)", () => {
  it("uses an inline-flex content-sizing wrapper so the toolbar matches column width", () => {
    // The content wrapper must use inline-flex + min-w-full so it sizes to
    // its children (the columns) rather than stretching to the viewport.
    expect(SRC).toContain("inline-flex min-w-full flex-col");
  });

  it("outer container provides horizontal scroll", () => {
    // The outermost board div should handle overflow scrolling.
    expect(SRC).toContain("overflow-x-auto overflow-y-auto");
  });

  it("toolbar still uses justify-between within the content wrapper", () => {
    // The toolbar flex container keeps justify-between — it just operates
    // within the inline-flex wrapper now instead of the full viewport.
    expect(SRC).toContain("justify-between");
  });

  it("column containers still use flex layout for horizontal columns", () => {
    // All three grouping modes (status, project, department) render columns
    // inside a flex row.
    const flexColumnMatches = SRC.match(/className="flex h-full gap-3"/g);
    expect(flexColumnMatches).not.toBeNull();
    expect(flexColumnMatches!.length).toBeGreaterThanOrEqual(3);
  });
});

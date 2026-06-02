import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const RETIRED_PAGES = [
  "tasks",
  "board",
  "my-tasks",
  "projects",
  "standup",
  "today",
  "whip",
  "table",
  "logbook",
];

const RETIRED_PAGE_FILES = [
  "src/app/(dashboard)/automations/ralph-board/page.tsx",
];

describe("retired task/WIP dashboard pages", () => {
  it("does not keep visible page route files in the dashboard app", () => {
    for (const route of RETIRED_PAGES) {
      expect(existsSync(join(process.cwd(), "src/app/(dashboard)", route, "page.tsx"))).toBe(false);
    }
    for (const pageFile of RETIRED_PAGE_FILES) {
      expect(existsSync(join(process.cwd(), pageFile))).toBe(false);
    }
  });
});

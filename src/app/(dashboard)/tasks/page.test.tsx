import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("TasksPage", () => {
  it("does not ship a visible task page route", () => {
    expect(existsSync(join(process.cwd(), "src/app/(dashboard)/tasks/page.tsx"))).toBe(false);
  });
});

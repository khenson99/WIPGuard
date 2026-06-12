import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "fs";
import { createRequire } from "node:module";
import { join } from "path";

// migrate.cjs is a plain CommonJS script (it runs inside the production
// container with no build step), so load it the way Node does. Requiring
// it must NOT run migrations — that is what the require.main guard is for.
const require = createRequire(import.meta.url);
const migrate = require("../migrate.cjs") as {
  computePendingMigrations: (
    localDirs: string[],
    appliedNames: string[]
  ) => string[];
  listMigrationDirs: () => string[];
};

const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");

describe("migrate.cjs --check helpers", () => {
  it("importing the module has no side effects (require.main guard)", () => {
    // Reaching this assertion proves the require above neither connected
    // to a database nor called process.exit.
    expect(typeof migrate.computePendingMigrations).toBe("function");
    expect(typeof migrate.listMigrationDirs).toBe("function");
  });

  it("lists local migration directories sorted, matching prisma/migrations", () => {
    const dirs = migrate.listMigrationDirs();
    const expected = readdirSync(MIGRATIONS_DIR)
      .filter((d) => existsSync(join(MIGRATIONS_DIR, d, "migration.sql")))
      .sort();

    expect(dirs).toEqual(expected);
    expect(dirs.length).toBeGreaterThan(0);
  });

  it("reports no pending migrations when every local migration is applied", () => {
    expect(
      migrate.computePendingMigrations(
        ["20260101_a", "20260102_b"],
        ["20260101_a", "20260102_b", "20251201_db_only_row"]
      )
    ).toEqual([]);
  });

  it("reports pending migrations preserving local order", () => {
    expect(
      migrate.computePendingMigrations(
        ["20260101_a", "20260102_b", "20260103_c"],
        ["20260101_a"]
      )
    ).toEqual(["20260102_b", "20260103_c"]);
  });

  it("treats an empty applied set as everything pending (fresh database)", () => {
    expect(migrate.computePendingMigrations(["20260101_a"], [])).toEqual([
      "20260101_a",
    ]);
  });
});

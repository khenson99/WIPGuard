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
  stripSqlComments: (sql: string) => string;
};

// Mirrors the guard in migrate.cjs's run(): a migration is refused only when
// CONCURRENTLY appears in executable SQL (after comments are stripped).
const containsConcurrently = (sql: string) =>
  /\bCONCURRENTLY\b/i.test(migrate.stripSqlComments(sql));

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

describe("migrate.cjs CONCURRENTLY detection (comment-aware)", () => {
  // Regression: a migration that only *mentioned* CONCURRENTLY in a comment
  // was wrongly refused, failing every production deploy at boot.
  it("ignores CONCURRENTLY inside a line comment", () => {
    expect(
      containsConcurrently(
        '-- you may CREATE INDEX CONCURRENTLY by hand\nCREATE INDEX "x" ON "t"("c");'
      )
    ).toBe(false);
  });

  it("ignores CONCURRENTLY inside a block comment", () => {
    expect(
      containsConcurrently(
        '/* operators MAY pre-create CONCURRENTLY */\nCREATE INDEX "x" ON "t"("c");'
      )
    ).toBe(false);
  });

  it("still refuses a real CREATE INDEX CONCURRENTLY statement", () => {
    expect(
      containsConcurrently('CREATE INDEX CONCURRENTLY "x" ON "t"("c");')
    ).toBe(true);
  });

  it("does not flag the retention prune-indexes migration (comment-only mention)", () => {
    const sql = require("fs").readFileSync(
      join(
        MIGRATIONS_DIR,
        "20260615120000_add_retention_prune_indexes",
        "migration.sql"
      ),
      "utf-8"
    );
    expect(sql).toMatch(/CONCURRENTLY/i); // present in the comment
    expect(containsConcurrently(sql)).toBe(false); // but not in executable SQL
  });

  it("preserves executable DDL while stripping comments", () => {
    const stripped = migrate.stripSqlComments(
      '-- header\nCREATE INDEX "i" ON "t"("c"); /* trailing */'
    );
    expect(stripped).toContain('CREATE INDEX "i" ON "t"("c");');
    expect(stripped).not.toContain("header");
    expect(stripped).not.toContain("trailing");
  });
});

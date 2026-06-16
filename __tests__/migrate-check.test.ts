import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
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
  migrationUsesConcurrently: (sql: string) => boolean;
  stripSqlComments: (sql: string) => string;
  blankQuotedRegions: (sql: string) => string;
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

describe("migrate.cjs CONCURRENTLY guard", () => {
  // The runner applies each migration inside a transaction, so it must refuse
  // CONCURRENTLY DDL (Postgres forbids it in a transaction block) — but only
  // when CONCURRENTLY is a real keyword, never when it merely appears in a
  // comment or quoted text. A false positive blocks an otherwise-safe deploy
  // (this is the 2026-06-16 incident: the retention-index migration mentioned
  // CONCURRENTLY in an operator note and every deploy refused to apply it).

  it("allows a migration that only mentions CONCURRENTLY in comments", () => {
    expect(
      migrate.migrationUsesConcurrently(
        "-- pre-create by hand: CREATE INDEX CONCURRENTLY ...\n" +
          'CREATE INDEX IF NOT EXISTS "x_idx" ON "X"("createdAt");'
      )
    ).toBe(false);
    expect(
      migrate.migrationUsesConcurrently(
        '/* you MAY use CONCURRENTLY in a low-traffic window */\nCREATE INDEX "y" ON "Y"("c");'
      )
    ).toBe(false);
  });

  it("ignores CONCURRENTLY inside string literals, identifiers, and dollar quotes", () => {
    expect(
      migrate.migrationUsesConcurrently(
        "INSERT INTO notes(body) VALUES ('run CONCURRENTLY later');"
      )
    ).toBe(false);
    expect(
      migrate.migrationUsesConcurrently('CREATE INDEX "idx CONCURRENTLY" ON t(c);')
    ).toBe(false);
    expect(
      migrate.migrationUsesConcurrently("DO $$ BEGIN PERFORM 'CONCURRENTLY'; END $$;")
    ).toBe(false);
  });

  it("still refuses CONCURRENTLY in an executable statement", () => {
    expect(
      migrate.migrationUsesConcurrently("CREATE INDEX CONCURRENTLY foo ON t(c);")
    ).toBe(true);
    expect(
      migrate.migrationUsesConcurrently(
        "-- note about CONCURRENTLY\nDROP INDEX CONCURRENTLY bar;"
      )
    ).toBe(true);
    expect(
      migrate.migrationUsesConcurrently("REINDEX INDEX CONCURRENTLY foo;")
    ).toBe(true);
  });

  it("does not refuse any migration currently checked into prisma/migrations", () => {
    // Regression guard for the incident: every committed migration must be
    // applyable by the in-transaction runner. If a future migration genuinely
    // needs CONCURRENTLY, this will fail loudly and force an explicit decision
    // (pre-create by hand, or teach the runner an out-of-transaction path).
    const dirs = migrate.listMigrationDirs();
    const offenders = dirs.filter((dir) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf-8");
      return migrate.migrationUsesConcurrently(sql);
    });
    expect(offenders).toEqual([]);
  });

  it("stripSqlComments removes comments but preserves string contents", () => {
    expect(migrate.stripSqlComments("SELECT 1; -- trailing\n")).not.toMatch(
      /trailing/
    );
    expect(migrate.stripSqlComments("SELECT '-- not a comment';")).toMatch(
      /-- not a comment/
    );
  });
});

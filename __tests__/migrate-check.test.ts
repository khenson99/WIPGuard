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
  migrationContainsConcurrently: (dir: string) => boolean;
  sqlUsesConcurrently: (sql: string) => boolean;
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

describe("migrate.cjs CONCURRENTLY detection (deferred migrations)", () => {
  it("detects CONCURRENTLY in real statements", () => {
    expect(
      migrate.sqlUsesConcurrently(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS "x_idx" ON "X"("createdAt");'
      )
    ).toBe(true);
    expect(migrate.sqlUsesConcurrently("create index concurrently on t(c);")).toBe(
      true
    );
  });

  it("does NOT flag CONCURRENTLY that appears only in a comment", () => {
    // This is the false positive that previously blocked a transaction-safe
    // migration: the runner refused it because a comment mentioned the word.
    const lineComment = [
      "-- an operator MAY pre-create with CREATE INDEX CONCURRENTLY IF NOT EXISTS",
      'CREATE INDEX IF NOT EXISTS "x_idx" ON "X"("createdAt");',
    ].join("\n");
    expect(migrate.sqlUsesConcurrently(lineComment)).toBe(false);

    const blockComment = [
      "/* could be built CONCURRENTLY out of band */",
      'CREATE INDEX IF NOT EXISTS "y_idx" ON "Y"("startedAt");',
    ].join("\n");
    expect(migrate.sqlUsesConcurrently(blockComment)).toBe(false);
  });

  it("plain migrations without CONCURRENTLY are not deferred", () => {
    expect(
      migrate.sqlUsesConcurrently('CREATE TABLE "T" ("id" TEXT PRIMARY KEY);')
    ).toBe(false);
  });

  it("flags the retention prune-index migration as CONCURRENTLY (deferred)", () => {
    // The real migration on disk uses CREATE INDEX CONCURRENTLY, so the runner
    // must defer it (skip at boot, apply out-of-band).
    expect(
      migrate.migrationContainsConcurrently(
        "20260615120000_add_retention_prune_indexes"
      )
    ).toBe(true);
  });

  it("returns false for a non-existent migration dir", () => {
    expect(migrate.migrationContainsConcurrently("does_not_exist")).toBe(false);
  });
});

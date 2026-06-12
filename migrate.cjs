/**
 * Lightweight migration runner using pg directly.
 * Runs all Prisma SQL migration files in order, skipping those already applied.
 * Creates _prisma_migrations tracking table for Prisma compatibility.
 */
let Pool;
try {
  ({ Pool } = require("pg"));
} catch (error) {
  console.warn(
    "pg module unavailable in runtime image; skipping migrations:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(0);
}
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
// Load local .env when available; Railway injects env vars directly in production.
try {
  require("dotenv/config");
} catch {}

const MIGRATIONS_DIR = path.join(__dirname, "prisma", "migrations");

const ADVISORY_LOCK_KEY_1 = 0x57495047; // "WIPG"
const ADVISORY_LOCK_KEY_2 = 0x4d494752; // "MIGR"
const LOCK_MAX_WAIT_MS = 300_000;
const LOCK_RETRY_INTERVAL_MS = 1_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireAdvisoryLock(client) {
  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < LOCK_MAX_WAIT_MS) {
    attempts++;
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [ADVISORY_LOCK_KEY_1, ADVISORY_LOCK_KEY_2],
    );
    if (result.rows?.[0]?.locked) {
      return true;
    }

    const waitedMs = Date.now() - start;
    if (attempts === 1 || waitedMs % 10_000 < LOCK_RETRY_INTERVAL_MS) {
      console.log(
        `  waiting for migration lock... (${Math.floor(waitedMs / 1000)}s)`,
      );
    }
    await sleep(LOCK_RETRY_INTERVAL_MS);
  }

  return false;
}

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null;

  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length;
        dollarTag = null;
        continue;
      }
      index++;
      continue;
    }

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
      }
      index++;
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index++;
      continue;
    }

    if (inSingleQuote) {
      if (current === "'" && next === "'") {
        index += 2;
        continue;
      }
      if (current === "'") {
        inSingleQuote = false;
      }
      index++;
      continue;
    }

    if (inDoubleQuote) {
      if (current === '"' && next === '"') {
        index += 2;
        continue;
      }
      if (current === '"') {
        inDoubleQuote = false;
      }
      index++;
      continue;
    }

    if (current === "-" && next === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    if (current === "'") {
      inSingleQuote = true;
      index++;
      continue;
    }

    if (current === '"') {
      inDoubleQuote = true;
      index++;
      continue;
    }

    if (current === "$") {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        dollarTag = match[0];
        index += dollarTag.length;
        continue;
      }
    }

    if (current === ";") {
      const statement = sql.slice(start, index + 1);
      if (statement.trim()) {
        statements.push(statement);
      }
      start = index + 1;
    }

    index++;
  }

  const trailing = sql.slice(start);
  if (trailing.trim()) {
    statements.push(trailing);
  }

  return statements;
}

function stripLeadingSqlComments(statement) {
  let remaining = statement.trimStart();

  while (remaining) {
    if (remaining.startsWith("--")) {
      const nextLine = remaining.indexOf("\n");
      remaining =
        nextLine === -1 ? "" : remaining.slice(nextLine + 1).trimStart();
      continue;
    }

    if (remaining.startsWith("/*")) {
      const commentEnd = remaining.indexOf("*/");
      remaining =
        commentEnd === -1 ? "" : remaining.slice(commentEnd + 2).trimStart();
      continue;
    }

    break;
  }

  return remaining;
}

function isEnumAddValueStatement(statement) {
  return /^ALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE\b/i.test(
    stripLeadingSqlComments(statement),
  );
}

function splitMigrationSql(sql) {
  const statements = splitSqlStatements(sql);
  const leadingEnumStatements = [];
  let index = 0;

  while (
    index < statements.length &&
    isEnumAddValueStatement(statements[index])
  ) {
    leadingEnumStatements.push(statements[index]);
    index++;
  }

  return {
    leadingEnumStatements,
    remainingSql: statements.slice(index).join("\n"),
  };
}

function resolvePoolOptions() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.env.NODE_ENV === "production") {
      console.error("DATABASE_URL not set in production; refusing to start");
      process.exit(1);
    }
    console.error("DATABASE_URL not set, skipping migrations");
    process.exit(0);
  }

  const useSSL =
    process.env.NODE_ENV === "production" ||
    process.env.DATABASE_SSL === "true";

  // Append sslmode=no-verify for managed Postgres SSL connections if not already set.
  // Keep local/dev defaults non-SSL unless explicitly configured.
  let url;
  try {
    url = new URL(connectionString);
  } catch (error) {
    console.error(
      "Invalid DATABASE_URL:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
  if (useSSL && !url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "no-verify");
  }

  const poolOptions = {
    connectionString: url.toString(),
    connectionTimeoutMillis: 30000,
  };
  if (useSSL) {
    poolOptions.ssl = { rejectUnauthorized: true };
  }
  return poolOptions;
}

function listMigrationDirs() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((d) => {
      const p = path.join(MIGRATIONS_DIR, d);
      return (
        fs.statSync(p).isDirectory() &&
        fs.existsSync(path.join(p, "migration.sql"))
      );
    })
    .sort();
}

function computePendingMigrations(localDirs, appliedNames) {
  const appliedSet = new Set(appliedNames);
  return localDirs.filter((dir) => !appliedSet.has(dir));
}

/**
 * Read-only schema currency check (`node migrate.cjs --check`).
 *
 * Exit codes: 0 = every local migration is applied, 2 = migrations pending,
 * 1 = error (DB unreachable, bad URL, ...).
 *
 * Used by docker-entrypoint.sh as a fast boot-path gate: on Railway the
 * actual apply happens in `preDeployCommand` before the previous deploy is
 * stopped, so the serving container only needs to verify currency — one
 * connection and one query instead of advisory lock + table bootstrap +
 * per-migration apply loop. Uses the same applied-set criterion as run()
 * (rolled_back_at IS NULL) so the two modes always agree.
 */
async function check() {
  const pool = new Pool(resolvePoolOptions());
  let exitCode = 0;
  try {
    const localDirs = listMigrationDirs();
    const tracking = await pool.query(
      `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS found`,
    );
    if (!tracking.rows?.[0]?.found) {
      console.log(
        `Schema check: _prisma_migrations table missing; ${localDirs.length} migration(s) pending`,
      );
      exitCode = 2;
    } else {
      const applied = await pool.query(
        'SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL',
      );
      const pending = computePendingMigrations(
        localDirs,
        applied.rows.map((row) => row.migration_name),
      );
      if (pending.length > 0) {
        console.log(
          `Schema check: ${pending.length} pending migration(s): ${pending.join(", ")}`,
        );
        exitCode = 2;
      } else {
        console.log(
          `Schema check: current (all ${localDirs.length} local migrations applied)`,
        );
      }
    }
  } finally {
    await pool.end();
  }
  process.exit(exitCode);
}

async function run() {
  const pool = new Pool(resolvePoolOptions());
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    lockAcquired = await acquireAdvisoryLock(client);
    if (!lockAcquired) {
      console.error(
        `Timed out waiting for migration lock after ${Math.floor(LOCK_MAX_WAIT_MS / 1000)}s`,
      );
      process.exit(1);
    }

    // Ensure _prisma_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Get already-applied migrations
    const applied = await client.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL',
    );
    const appliedSet = new Set(applied.rows.map((r) => r.migration_name));

    // Get migration directories in order
    const dirs = listMigrationDirs();

    let appliedCount = 0;
    for (const dir of dirs) {
      if (appliedSet.has(dir)) {
        console.log("  skip: " + dir + " (already applied)");
        continue;
      }

      const sqlFile = path.join(MIGRATIONS_DIR, dir, "migration.sql");
      const sql = fs.readFileSync(sqlFile, "utf-8");
      if (/\bCONCURRENTLY\b/i.test(sql)) {
        console.error(
          `Migration ${dir} contains CONCURRENTLY; refusing to run outside a transaction`,
        );
        process.exit(1);
      }
      const checksum = crypto
        .createHash("sha256")
        .update(sql)
        .digest("hex")
        .slice(0, 64);
      const { leadingEnumStatements, remainingSql } = splitMigrationSql(sql);
      const hasRemainingSql = remainingSql.trim().length > 0;
      let inTransaction = false;

      console.log("  apply: " + dir + "...");
      try {
        for (const statement of leadingEnumStatements) {
          await client.query(statement);
        }

        await client.query("BEGIN");
        inTransaction = true;
        if (hasRemainingSql) {
          await client.query(remainingSql);
        }
        const migrationId = crypto.randomUUID();
        await client.query(
          'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)',
          [migrationId, checksum, dir],
        );

        await client.query("COMMIT");
        inTransaction = false;
      } catch (error) {
        if (inTransaction) {
          await client.query("ROLLBACK");
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Migration failed (${dir}):`, message);
        process.exit(1);
      }

      console.log("  done: " + dir);
      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log("  All migrations already applied.");
    } else {
      console.log("  Applied " + appliedCount + " migration(s).");
    }
  } finally {
    try {
      if (lockAcquired) {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [
          ADVISORY_LOCK_KEY_1,
          ADVISORY_LOCK_KEY_2,
        ]);
      }
    } catch {}
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const checkMode = process.argv.includes("--check");
  const entry = checkMode ? check : run;
  entry().catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    console.error(checkMode ? "Schema check failed:" : "Migration failed:", message);
    process.exit(1);
  });
}

module.exports = {
  computePendingMigrations,
  listMigrationDirs,
  splitMigrationSql,
  splitSqlStatements,
};

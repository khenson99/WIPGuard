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

async function run() {
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
    poolOptions.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolOptions);
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
    const dirs = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((d) => {
        const p = path.join(MIGRATIONS_DIR, d);
        return (
          fs.statSync(p).isDirectory() &&
          fs.existsSync(path.join(p, "migration.sql"))
        );
      })
      .sort();

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

      console.log("  apply: " + dir + "...");
      await client.query("BEGIN");
      try {
        await client.query(sql);

        const migrationId = crypto.randomUUID();
        await client.query(
          'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)',
          [migrationId, checksum, dir],
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
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

run().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error("Migration failed:", message);
  process.exit(1);
});

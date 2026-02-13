/**
 * Lightweight migration runner using pg directly.
 * Runs all Prisma SQL migration files in order, skipping those already applied.
 * Creates _prisma_migrations tracking table for Prisma compatibility.
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIGRATIONS_DIR = path.join(__dirname, "prisma", "migrations");

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set, skipping migrations");
    process.exit(0);
  }

  // Append sslmode=no-verify for Railway's self-signed certs if not already set
  const url = new URL(connectionString);
  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'no-verify');
  }

  const pool = new Pool({
    connectionString: url.toString(),
    connectionTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Ensure _prisma_migrations table exists
    await pool.query(`
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
    const applied = await pool.query(
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
      const checksum = crypto
        .createHash("sha256")
        .update(sql)
        .digest("hex")
        .slice(0, 64);

      console.log("  apply: " + dir + "...");
      await pool.query(sql);

      await pool.query(
        'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (gen_random_uuid(), $1, now(), $2, 1)',
        [checksum, dir],
      );

      console.log("  done: " + dir);
      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log("  All migrations already applied.");
    } else {
      console.log("  Applied " + appliedCount + " migration(s).");
    }
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});

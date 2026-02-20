#!/usr/bin/env node

import "dotenv/config";
import { Client } from "pg";

const SAMPLE_LIMIT = 20;

function parseMode(argv) {
  const hasApply = argv.includes("--apply-normalize");
  const hasReport = argv.includes("--report");

  if (hasApply) return "apply";
  if (hasReport || argv.length === 0) return "report";

  throw new Error(
    `Unknown argument(s): ${argv.join(" ")}. Use --report or --apply-normalize.`
  );
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printRows(rows) {
  if (rows.length === 0) {
    console.log("None");
    return;
  }

  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
}

async function report(client) {
  const normalizationCountResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "User"
    WHERE email <> lower(trim(email))
  `);
  const normalizationRowsResult = await client.query(
    `
      SELECT id, email, lower(trim(email)) AS normalized_email
      FROM "User"
      WHERE email <> lower(trim(email))
      ORDER BY email ASC
      LIMIT $1
    `,
    [SAMPLE_LIMIT]
  );

  const duplicateGroupCountResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT lower(trim(email)) AS normalized_email
      FROM "User"
      GROUP BY lower(trim(email))
      HAVING COUNT(*) > 1
    ) AS duplicate_groups
  `);
  const duplicateUserCountResult = await client.query(`
    SELECT COALESCE(SUM(group_count), 0)::int AS count
    FROM (
      SELECT COUNT(*)::int AS group_count
      FROM "User"
      GROUP BY lower(trim(email))
      HAVING COUNT(*) > 1
    ) AS duplicate_groups
  `);
  const duplicateRowsResult = await client.query(
    `
      SELECT
        lower(trim(email)) AS normalized_email,
        COUNT(*)::int AS user_count,
        ARRAY_AGG(id ORDER BY id) AS user_ids,
        ARRAY_AGG(email ORDER BY email) AS emails
      FROM "User"
      GROUP BY lower(trim(email))
      HAVING COUNT(*) > 1
      ORDER BY user_count DESC, normalized_email ASC
      LIMIT $1
    `,
    [SAMPLE_LIMIT]
  );

  const usersWithoutGoogleCountResult = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "User" u
    WHERE NOT EXISTS (
      SELECT 1
      FROM "Account" a
      WHERE a."userId" = u.id
        AND a.provider = 'google'
    )
  `);
  const usersWithoutGoogleRowsResult = await client.query(
    `
      SELECT u.id, u.email
      FROM "User" u
      WHERE NOT EXISTS (
        SELECT 1
        FROM "Account" a
        WHERE a."userId" = u.id
          AND a.provider = 'google'
      )
      ORDER BY lower(trim(u.email)) ASC
      LIMIT $1
    `,
    [SAMPLE_LIMIT]
  );

  const summary = {
    usersNeedingNormalization: normalizationCountResult.rows[0].count,
    duplicateNormalizedEmailGroups: duplicateGroupCountResult.rows[0].count,
    usersInDuplicateGroups: duplicateUserCountResult.rows[0].count,
    usersWithoutGoogleAccount: usersWithoutGoogleCountResult.rows[0].count,
  };

  printSection("Auth Linking Backfill Report");
  console.log(JSON.stringify(summary, null, 2));

  printSection(
    `Users needing trim/lower normalization (showing up to ${SAMPLE_LIMIT})`
  );
  printRows(normalizationRowsResult.rows);

  printSection(
    `Case-insensitive duplicate email groups (showing up to ${SAMPLE_LIMIT})`
  );
  printRows(duplicateRowsResult.rows);

  printSection(`Users without linked Google account (showing up to ${SAMPLE_LIMIT})`);
  printRows(usersWithoutGoogleRowsResult.rows);

  if (summary.duplicateNormalizedEmailGroups > 0) {
    console.error(
      "\nBlocking condition: case-insensitive duplicate emails exist. Resolve duplicates before applying normalization."
    );
  }

  return summary;
}

async function applyNormalization(client) {
  const duplicateRowsResult = await client.query(`
    SELECT
      lower(trim(email)) AS normalized_email,
      COUNT(*)::int AS user_count,
      ARRAY_AGG(id ORDER BY id) AS user_ids,
      ARRAY_AGG(email ORDER BY email) AS emails
    FROM "User"
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
    ORDER BY user_count DESC, normalized_email ASC
  `);

  if (duplicateRowsResult.rowCount > 0) {
    printSection("Normalization aborted: duplicate emails detected");
    printRows(duplicateRowsResult.rows.slice(0, SAMPLE_LIMIT));
    throw new Error(
      "Cannot normalize emails while case-insensitive duplicates exist."
    );
  }

  await client.query("BEGIN");
  try {
    const updateResult = await client.query(`
      WITH updated AS (
        UPDATE "User"
        SET email = lower(trim(email))
        WHERE email <> lower(trim(email))
        RETURNING id
      )
      SELECT COUNT(*)::int AS count
      FROM updated
    `);

    await client.query("COMMIT");
    printSection("Normalization applied");
    console.log(
      JSON.stringify(
        { normalizedUsers: updateResult.rows[0].count, status: "committed" },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    if (mode === "report") {
      await report(client);
      return;
    }

    await applyNormalization(client);
    await report(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

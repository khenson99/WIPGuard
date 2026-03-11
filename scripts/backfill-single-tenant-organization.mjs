import pg from "pg";

const { Client } = pg;

const connectionString =
  process.env.DATABASE_PUBLIC_URL?.trim() || process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("DATABASE_PUBLIC_URL or DATABASE_URL is required");
}

const organizationId = process.env.BACKFILL_ORGANIZATION_ID?.trim() || "org_arda";
const organizationName = process.env.BACKFILL_ORGANIZATION_NAME?.trim() || "Arda";
const organizationSlug = process.env.BACKFILL_ORGANIZATION_SLUG?.trim() || "arda";

const client = new Client({
  connectionString,
  ssl: connectionString.includes("proxy.rlwy.net")
    ? { rejectUnauthorized: false }
    : undefined,
});

await client.connect();

try {
  await client.query("BEGIN");

  const existingOrganizations = await client.query(
    'SELECT id, slug FROM "Organization" ORDER BY "createdAt" ASC'
  );
  if (existingOrganizations.rows.length > 0) {
    throw new Error(
      `Refusing to run: found ${existingOrganizations.rows.length} existing organization rows`
    );
  }

  const tables = (
    await client.query(
      "SELECT DISTINCT table_name FROM information_schema.columns " +
        "WHERE table_schema = 'public' AND column_name = 'organizationId' " +
        "AND table_name <> 'Organization' ORDER BY table_name ASC"
    )
  ).rows.map((row) => row.table_name);

  await client.query(
    'INSERT INTO "Organization" (id, name, slug, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())',
    [organizationId, organizationName, organizationSlug]
  );

  const updates = [];
  for (const table of tables) {
    const result = await client.query(
      `UPDATE "${table}" SET "organizationId" = $1 WHERE "organizationId" IS NULL`,
      [organizationId]
    );
    updates.push({ table, updated: result.rowCount });
  }

  await client.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        organizationId,
        organizationName,
        organizationSlug,
        updatedTables: updates,
      },
      null,
      2
    )
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

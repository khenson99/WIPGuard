const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const res = await client.query("SELECT * FROM \"IntegrationConnection\" WHERE provider = 'PYLON'");
  console.log("DB Row:", res.rows);
  
  const upd = await client.query("UPDATE \"IntegrationConnection\" SET \"lastError\" = NULL WHERE provider = 'PYLON' RETURNING *");
  console.log("Updated rows:", upd.rowCount);
  await client.end();
}
main().catch(console.error);

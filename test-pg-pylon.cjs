const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query("SELECT * FROM \"IntegrationConnection\" WHERE provider = 'PYLON'");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
main().catch(console.error);

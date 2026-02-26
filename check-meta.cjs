const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query("SELECT \"provider\", \"status\", \"lastError\" FROM \"IntegrationConnection\" WHERE provider = 'META_PAGE'");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
main().catch(console.error);

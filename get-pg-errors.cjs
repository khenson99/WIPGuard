const { Client } = require('pg');

async function getAllErrors() {
  const client = new Client({
    connectionString: "postgresql://postgres:uQhGIsQnIdjFmQhWhBvKzWJymIeEaOto@junction.proxy.rlwy.net:49065/railway",
    ssl: { rejectUnauthorized: false } // Required for Railway TCP proxies
  });

  try {
    await client.connect();
    const res = await client.query('SELECT provider, status, "lastError" FROM "IntegrationConnection"');
    console.log(`Integration Errors:`, JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error executing query', err);
  } finally {
    await client.end();
  }
}

getAllErrors();

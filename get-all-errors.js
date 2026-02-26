import { PrismaClient } from "@prisma/client";

async function getAllErrors() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres:uQhGIsQnIdjFmQhWhBvKzWJymIeEaOto@junction.proxy.rlwy.net:49065/railway"
      }
    }
  });

  try {
    const result = await prisma.$queryRaw`SELECT "provider", "status", "lastError" FROM "IntegrationConnection" WHERE "lastError" IS NOT NULL OR "status" != 'CONNECTED'`;
    console.log(`Integration Errors:`, JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error executing query', err);
  } finally {
    await prisma.$disconnect();
  }
}

getAllErrors();

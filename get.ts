import { PrismaClient } from "./src/generated/prisma/client.ts";

async function getAllErrors() {
  // Rely entirely on the DATABASE_URL environment variable 
  // injected by `railway run` for authentication
  const prisma = new PrismaClient();

  try {
    const integrations = await prisma.integrationConnection.findMany({
      where: {
        OR: [
          { lastError: { not: null } },
          { status: { not: 'CONNECTED' } }
        ]
      },
      select: {
        provider: true,
        status: true,
        lastError: true
      }
    });

    console.log(`Integration Errors:`, JSON.stringify(integrations, null, 2));
  } catch (err) {
    console.error('Error executing query', err);
  } finally {
    await prisma.$disconnect();
  }
}

getAllErrors();

import { prisma } from "./src/lib/prisma.ts";

async function getAllErrors() {
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
    process.exit(0);
  }
}

getAllErrors();

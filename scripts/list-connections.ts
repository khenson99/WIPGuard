import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { unprotectIntegrationSecret } from '../src/lib/integrations/token-crypto';

const databaseUrl = process.env.DATABASE_URL;
const showSecrets =
  process.argv.includes('--show-secrets') &&
  process.env.CONFIRM_SHOW_SECRETS === 'I understand this prints credentials';

if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set');
}

const requiredDatabaseUrl = databaseUrl;
const pool = new Pool({ connectionString: requiredDatabaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(`Using Database: ${requiredDatabaseUrl.split('@')[1] || requiredDatabaseUrl}`);
  const connections = await prisma.integrationConnection.findMany({
    select: {
      provider: true,
      status: true,
      providerAccountId: true,
      accountLabel: true,
      scopes: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      metadata: true,
    },
  });

  console.log(`Found ${connections.length} connections:`);
  for (const conn of connections) {
    const accessToken = conn.accessToken ? unprotectIntegrationSecret(conn.accessToken) : null;
    const refreshToken = conn.refreshToken ? unprotectIntegrationSecret(conn.refreshToken) : null;
    console.log('--------------------------------------------------');
    console.log(`Provider: ${conn.provider}`);
    console.log(`Status: ${conn.status}`);
    console.log(`Account Label: ${conn.accountLabel}`);
    console.log(`Account ID: ${conn.providerAccountId}`);
    console.log(`Access Token: ${showSecrets ? accessToken : accessToken ? '[redacted]' : null}`);
    console.log(`Refresh Token: ${showSecrets ? refreshToken : refreshToken ? '[redacted]' : null}`);
    console.log(`Expires At: ${conn.expiresAt}`);
    console.log(`Metadata: ${JSON.stringify(conn.metadata, null, 2)}`);
  }
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

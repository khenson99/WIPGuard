/**
 * Backfill Script: Assign all existing records to a default organization.
 *
 * This script:
 * 1. Creates a default organization (if it doesn't exist)
 * 2. Updates all existing records across all tenant-scoped tables
 *    to reference the default organization
 *
 * Usage:
 *   npx ts-node scripts/backfill-organization.ts
 *
 * Or with tsx:
 *   npx tsx scripts/backfill-organization.ts
 *
 * Environment:
 *   DATABASE_URL must be set
 */

import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before running the organization backfill');
}

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DEFAULT_ORG_ID = 'org_default_000000000';
const DEFAULT_ORG_NAME = 'Default Organization';
const DEFAULT_ORG_SLUG = 'default';

async function backfill() {
  console.log('🏢 Starting organization backfill...');
  console.log(`   Default org ID: ${DEFAULT_ORG_ID}`);
  console.log(`   Default org name: ${DEFAULT_ORG_NAME}`);
  console.log('');

  // Step 1: Create default organization (upsert to be idempotent)
  const org = await prisma.organization.upsert({
    where: { id: DEFAULT_ORG_ID },
    update: {},
    create: {
      id: DEFAULT_ORG_ID,
      name: DEFAULT_ORG_NAME,
      slug: DEFAULT_ORG_SLUG,
    },
  });
  console.log(`✅ Organization ensured: ${org.name} (${org.id})`);

  // Step 2: Backfill all tenant-scoped tables
  const tables = [
    'user',
    'project',
    'task',
    'sprint',
    'deal',
    'department',
    'companyPriority',
    'integrationConnection',
    'conference',
  ] as const;

  for (const table of tables) {
    try {
      // Using raw SQL for reliable bulk update across all tables
      // This handles the case where Prisma model names differ from table names
      const tableNameMap: Record<string, string> = {
        user: 'User',
        project: 'Project',
        task: 'Task',
        sprint: 'Sprint',
        deal: 'Deal',
        department: 'Department',
        companyPriority: 'CompanyPriority',
        integrationConnection: 'IntegrationConnection',
        conference: 'Conference',
      };

      const sqlTable = tableNameMap[table];
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "${sqlTable}" SET "organizationId" = $1 WHERE "organizationId" IS NULL`,
        DEFAULT_ORG_ID
      );

      console.log(`✅ ${sqlTable}: ${result} records updated`);
    } catch (error: unknown) {
      // Table might not exist yet in some environments
      const err = error as { code?: string; message?: string };
      if (err.code === 'P2010' || err.message?.includes('does not exist')) {
        console.log(`⏭️  ${table}: table does not exist, skipping`);
      } else {
        console.error(`❌ ${table}: ${err.message}`);
        throw error;
      }
    }
  }

  console.log('');
  console.log('🎉 Backfill complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Verify data: SELECT "organizationId", COUNT(*) FROM "User" GROUP BY "organizationId"');
  console.log('  2. Once verified, consider making organizationId NOT NULL in a follow-up migration');
  console.log('  3. Implement org-scoped middleware (ticket #379)');
}

backfill()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

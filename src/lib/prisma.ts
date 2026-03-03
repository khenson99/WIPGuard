import { PrismaClient } from '@prisma/client';
import { createTenantMiddleware } from './prisma-tenant-middleware';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

  // Apply tenant isolation middleware.
  // allowBypass is false by default — all tenant-scoped queries MUST
  // have an organization context or they will throw.
  // For admin/system operations, use runWithContext() to set context.
  client.$use(
    createTenantMiddleware({
      allowBypass: process.env.PRISMA_TENANT_BYPASS === 'true',
    })
  );

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

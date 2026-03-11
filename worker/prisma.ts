/**
 * Dedicated Prisma client for the worker process.
 *
 * Uses a separate connection pool from the main Next.js app to avoid
 * resource contention between sync operations and user-facing requests.
 *
 * The pool size and timeout are configured via WORKER_DB_* environment variables.
 */

import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { workerConfig } from './config';
import { logger } from './logger';

function buildDatasourceUrl(): string {
  // Prefer a worker-specific DATABASE_URL if set, otherwise fall back to the shared one
  const baseUrl = process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL;

  if (!baseUrl) {
    throw new Error(
      'Neither WORKER_DATABASE_URL nor DATABASE_URL is set. Cannot initialize worker Prisma client.'
    );
  }

  // Append connection pool parameters if not already present
  const url = new URL(baseUrl);
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', String(workerConfig.databasePoolSize));
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', String(Math.floor(workerConfig.databaseTimeout / 1000)));
  }

  return url.toString();
}

let workerPrisma: PrismaClient | null = null;
let workerPool: Pool | null = null;

export function getWorkerPrisma(): PrismaClient {
  if (!workerPrisma) {
    const datasourceUrl = buildDatasourceUrl();
    workerPool = new Pool({
      connectionString: datasourceUrl,
      max: workerConfig.databasePoolSize,
      idleTimeoutMillis: workerConfig.databaseTimeout,
      connectionTimeoutMillis: workerConfig.databaseTimeout,
    });
    const adapter = new PrismaPg(workerPool);

    logger.info('Initializing worker Prisma client', {
      poolSize: workerConfig.databasePoolSize,
      timeoutMs: workerConfig.databaseTimeout,
    });

    workerPrisma = new PrismaClient({
      adapter,
      log:
        workerConfig.logLevel === 'debug'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  return workerPrisma;
}

export async function disconnectWorkerPrisma(): Promise<void> {
  if (workerPrisma) {
    logger.info('Disconnecting worker Prisma client');
    await workerPrisma.$disconnect();
    workerPrisma = null;
  }
  if (workerPool) {
    await workerPool.end();
    workerPool = null;
  }
}

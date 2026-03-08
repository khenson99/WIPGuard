import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { poolMonitor } from "./pool-monitor";
import { createTenantExtension } from "./prisma-tenant-middleware";

const maxPoolSize = parseInt(process.env.DB_POOL_MAX || "25", 10);
const idleTimeoutMillis = parseInt(
  process.env.DB_POOL_IDLE_TIMEOUT || "30000",
  10
);
const connectionTimeoutMillis = parseInt(
  process.env.DB_POOL_CONNECTION_TIMEOUT || "10000",
  10
);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
  pgPool: Pool | undefined;
};

export type PrismaClientType = ReturnType<typeof createPrismaClient>;

function createPrismaClient(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: maxPoolSize,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  });

  // Attach pool monitoring
  poolMonitor.attach(pool, maxPoolSize);

  // Store pool reference for cleanup/monitoring
  globalForPrisma.pgPool = pool;

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  // Apply tenant isolation extension.
  // allowBypass is false by default — all tenant-scoped queries MUST
  // have an organization context or they will throw.
  // For admin/system operations, use runWithContext() to set context.
  const extendedClient = client.$extends(
    createTenantExtension({
      allowBypass: process.env.PRISMA_TENANT_BYPASS === "true",
    })
  );

  console.log(
    `[Prisma] Initialized with pool size: ${maxPoolSize}, idle timeout: ${idleTimeoutMillis}ms, connection timeout: ${connectionTimeoutMillis}ms`
  );

  return extendedClient;
}

function getPrismaClient(): PrismaClientType {
  const existing = globalForPrisma.prisma;
  if (existing) {
    return existing;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = createPrismaClient(connectionString);
  // Cache the Prisma client in `globalThis` to avoid creating a new
  // connection pool per request in long-lived Node.js runtimes (e.g. `next start`).
  globalForPrisma.prisma = client;

  return client;
}

export const prisma = new Proxy({} as PrismaClientType, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export default prisma;

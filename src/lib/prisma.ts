import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { poolMonitor } from "./pool-monitor";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

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
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPrismaClient(): PrismaClient {
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

  console.log(
    `[Prisma] Initialized with pool size: ${maxPoolSize}, idle timeout: ${idleTimeoutMillis}ms, connection timeout: ${connectionTimeoutMillis}ms`
  );

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

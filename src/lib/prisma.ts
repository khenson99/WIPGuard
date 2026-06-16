import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolClient } from "pg";
import { connectWithRetry } from "./db-connect-retry";
import { poolMonitor } from "./pool-monitor";
import { createTenantExtension } from "./prisma-tenant-middleware";

const maxPoolSize = parseInt(process.env.DB_POOL_MAX || "25", 10);
// Keep a small floor of established connections that the idle reaper never
// closes, so quiet periods don't force a fresh TCP+TLS+auth handshake on the
// next request (the expensive step when Postgres is under I/O pressure).
const minPoolSize = Math.min(
  parseInt(process.env.DB_POOL_MIN || "1", 10),
  maxPoolSize
);
const idleTimeoutMillis = parseInt(
  process.env.DB_POOL_IDLE_TIMEOUT || "30000",
  10
);
const connectionTimeoutMillis = parseInt(
  process.env.DB_POOL_CONNECTION_TIMEOUT || "10000",
  10
);
// Bounded retry for transient connection-acquisition failures (see
// db-connect-retry.ts and docs/runbooks/incident-2026-06-11-prisma-connect-timeouts.md).
// Worst case added latency: sum of per-attempt timeouts + backoff sleeps.
const connectRetries = parseInt(process.env.DB_CONNECT_RETRIES || "2", 10);
const connectRetryBaseDelayMs = parseInt(
  process.env.DB_CONNECT_RETRY_BASE_DELAY_MS || "300",
  10
);
const tenantBypassEnabled =
  process.env.PRISMA_TENANT_BYPASS === "true" || process.env.NODE_ENV === "development";

// Mirrors the callback shape in @types/pg Pool.connect — `done` is the
// checkout-bound client.release, whose parameter upstream types as `any`.
type ConnectDone = (release?: Error | boolean) => void;
type ConnectCallback = (
  err: Error | undefined,
  client: PoolClient | undefined,
  done: ConnectDone
) => void;

const noopDone = () => {};

/**
 * pg.Pool whose `connect()` retries classified-transient acquisition
 * failures with bounded backoff. Both the promise form (used by the Prisma
 * adapter for transactions) and the callback form (used internally by
 * `Pool.query`) are covered, so every Prisma query benefits.
 *
 * Acquisition is idempotent — no statement has run when it fails — so the
 * retry can never duplicate work.
 */
class ResilientPool extends Pool {
  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    if (typeof callback === "function") {
      this.connectWithRetries().then(
        // pg-pool passes the checkout-bound `client.release` as `done`; it is
        // assigned as an own arrow-function property at acquisition, so
        // forwarding it unbound matches upstream behavior exactly.
        (client) => callback(undefined, client, client.release ?? noopDone),
        (err) => callback(err, undefined, noopDone)
      );
      return;
    }
    return this.connectWithRetries();
  }

  private connectWithRetries(): Promise<PoolClient> {
    return connectWithRetry(() => super.connect(), {
      retries: connectRetries,
      baseDelayMs: connectRetryBaseDelayMs,
      onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
        poolMonitor.recordConnectRetry(error);
        console.warn(
          `[Prisma] Transient DB connect failure (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms: ${error.message}`
        );
      },
    });
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
  pgPool: Pool | undefined;
};

export type PrismaClientType = ReturnType<typeof createPrismaClient>;

function createPrismaClient(connectionString: string) {
  const pool = new ResilientPool({
    connectionString,
    max: maxPoolSize,
    min: minPoolSize,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    // TCP keepalive so proxies/NAT (e.g. Railway's public Postgres proxy)
    // don't silently kill pooled sockets — surfaces otherwise as
    // "Connection terminated unexpectedly" on the next query.
    keepAlive: true,
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
      allowBypass: tenantBypassEnabled,
    })
  );

  console.log(
    `[Prisma] Initialized with pool size: ${maxPoolSize} (min: ${minPoolSize}), idle timeout: ${idleTimeoutMillis}ms, connection timeout: ${connectionTimeoutMillis}ms, connect retries: ${connectRetries}`
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

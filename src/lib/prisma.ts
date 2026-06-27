import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolClient } from "pg";
import { poolMonitor } from "./pool-monitor";
import { withConnectionAcquisitionRetry } from "./prisma-connect-retry";
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
// Number of connections to open eagerly when the pool is created, so the
// first post-deploy traffic burst doesn't make every request race to open
// a fresh socket at once (the cold-pool stampede behind the boot-time
// "timeout exceeded when trying to connect" bursts). 0 disables.
const warmupConnections = Math.min(
  Math.max(parseInt(process.env.DB_POOL_WARMUP || "4", 10) || 0, 0),
  maxPoolSize
);
const tenantBypassEnabled =
  process.env.PRISMA_TENANT_BYPASS === "true" || process.env.NODE_ENV === "development";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
  pgPool: Pool | undefined;
};

export type PrismaClientType = ReturnType<typeof createPrismaClient>;

/**
 * Eagerly establish a few physical connections, sequentially (each
 * `pool.connect()` is held while the next is opened, so the pool cannot
 * satisfy them from idle clients). Fire-and-forget: failures are logged
 * and never block boot — the pool falls back to on-demand connects.
 */
function warmPool(pool: Pool, count: number): void {
  if (count <= 0 || process.env.NODE_ENV === "test" || process.env.VITEST) {
    return;
  }
  void (async () => {
    const clients: PoolClient[] = [];
    try {
      for (let i = 0; i < count; i++) {
        clients.push(await pool.connect());
      }
      await Promise.all(clients.map((client) => client.query("SELECT 1")));
      console.log(`[Prisma] Warmed ${clients.length} pool connection(s)`);
    } catch (error) {
      console.warn(
        `[Prisma] Pool warmup stopped after ${clients.length} connection(s):`,
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      for (const client of clients) {
        client.release();
      }
    }
  })();
}

function createPrismaClient(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: maxPoolSize,
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
  const extendedClient = client
    .$extends(
      createTenantExtension({
        allowBypass: tenantBypassEnabled,
      })
    )
    // Retry ONLY connection-acquisition timeouts (pool checkout / TLS
    // handshake) — those fail before the query is dispatched, so the
    // retry can never double-apply a write. Softens the cold-pool
    // stampede right after a deploy cutover.
    .$extends({
      name: "connection-acquisition-retry",
      query: {
        $allOperations({ query, args }) {
          return withConnectionAcquisitionRetry(() => query(args));
        },
      },
    });

  // Pre-open a few sockets so the first burst of traffic after boot is
  // served by warm connections instead of a thundering herd of handshakes.
  warmPool(pool, warmupConnections);

  console.log(
    `[Prisma] Initialized with pool size: ${maxPoolSize}, idle timeout: ${idleTimeoutMillis}ms, connection timeout: ${connectionTimeoutMillis}ms, warmup: ${warmupConnections}`
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

/**
 * Return the underlying pg connection pool, initializing the Prisma client
 * (and therefore the pool) on first use.
 *
 * Needed by code that must pin a SINGLE physical connection for the duration
 * of an operation — e.g. session-scoped Postgres advisory locks, where the
 * `pg_try_advisory_lock` and matching `pg_advisory_unlock` must run on the
 * same backend connection. Going through Prisma's `$queryRaw` cannot
 * guarantee that, because the adapter may route the two calls to different
 * pooled connections.
 */
export function getConnectionPool(): Pool {
  getPrismaClient();
  const pool = globalForPrisma.pgPool;
  if (!pool) {
    throw new Error("pg connection pool is not initialized");
  }
  return pool;
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

const RESET_DRAIN_GRACE_MS = 10_000;

/**
 * Rotate the singleton Prisma client after heavy cron work so new requests use
 * a fresh pg adapter/pool, while the old pool drains after a grace window.
 */
export async function resetPrismaClient(): Promise<void> {
  const client = globalForPrisma.prisma;
  const pool = globalForPrisma.pgPool;

  globalForPrisma.prisma = undefined;
  globalForPrisma.pgPool = undefined;
  poolMonitor.detach();

  if (!client && !pool) return;

  const timer = setTimeout(() => {
    void (async () => {
      if (client) {
        try {
          await (client as unknown as { $disconnect?: () => Promise<void> }).$disconnect?.();
        } catch (error) {
          console.warn("[Prisma] $disconnect error during reset:", error);
        }
      }
      if (pool) {
        try {
          await pool.end();
        } catch (error) {
          console.warn("[Prisma] pool.end error during reset:", error);
        }
      }
    })();
  }, RESET_DRAIN_GRACE_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
}

export default prisma;

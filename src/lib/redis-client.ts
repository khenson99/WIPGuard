import { createClient, type RedisClientType } from "redis";

let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
let isConnected = false;

export interface RedisClients {
  pubClient: RedisClientType;
  subClient: RedisClientType;
}

/**
 * Returns the Redis URL from environment variables.
 * Returns null if not configured.
 */
export function getRedisUrl(): string | null {
  return process.env.REDIS_URL || null;
}

/**
 * Creates and connects Redis pub/sub client pair for use with Socket.IO adapter.
 * Returns null if REDIS_URL is not configured.
 *
 * @returns {Promise<RedisClients | null>} Connected Redis client pair or null
 */
export async function createRedisClients(): Promise<RedisClients | null> {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    console.log(
      "[Redis] REDIS_URL not configured — using in-memory Socket.IO adapter"
    );
    return null;
  }

  try {
    pubClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            console.error(
              "[Redis] Max reconnection attempts reached. Giving up."
            );
            return new Error("Max reconnection attempts reached");
          }
          const delay = Math.min(retries * 100, 3000);
          console.log(
            `[Redis] Reconnecting in ${delay}ms (attempt ${retries})...`
          );
          return delay;
        },
      },
    });

    subClient = pubClient.duplicate();

    pubClient.on("error", (err) => {
      console.error("[Redis] Pub client error:", err.message);
      isConnected = false;
    });

    subClient.on("error", (err) => {
      console.error("[Redis] Sub client error:", err.message);
      isConnected = false;
    });

    pubClient.on("ready", () => {
      console.log("[Redis] Pub client ready");
    });

    subClient.on("ready", () => {
      console.log("[Redis] Sub client ready");
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);

    isConnected = true;
    console.log("[Redis] Connected successfully for Socket.IO adapter");

    return { pubClient, subClient } as RedisClients;
  } catch (error) {
    console.error(
      "[Redis] Failed to connect:",
      error instanceof Error ? error.message : error
    );
    await disconnectRedisClients();
    return null;
  }
}

/**
 * Gracefully disconnects Redis clients.
 */
export async function disconnectRedisClients(): Promise<void> {
  const disconnectPromises: Promise<void>[] = [];

  if (pubClient) {
    disconnectPromises.push(
      pubClient.disconnect().catch((err) => {
        console.error("[Redis] Error disconnecting pub client:", err.message);
      })
    );
  }

  if (subClient) {
    disconnectPromises.push(
      subClient.disconnect().catch((err) => {
        console.error("[Redis] Error disconnecting sub client:", err.message);
      })
    );
  }

  await Promise.all(disconnectPromises);

  pubClient = null;
  subClient = null;
  isConnected = false;

  console.log("[Redis] Clients disconnected");
}

/**
 * Returns the current Redis connection status.
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

/**
 * Performs a Redis health check by sending a PING command.
 *
 * @returns {Promise<{ connected: boolean; latencyMs: number | null }>}
 */
export async function redisHealthCheck(): Promise<{
  connected: boolean;
  latencyMs: number | null;
}> {
  if (!pubClient || !isConnected) {
    return { connected: false, latencyMs: null };
  }

  try {
    const start = Date.now();
    const result = await pubClient.ping();
    const latencyMs = Date.now() - start;

    return {
      connected: result === "PONG",
      latencyMs,
    };
  } catch {
    return { connected: false, latencyMs: null };
  }
}

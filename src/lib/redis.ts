import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

/**
 * Latched ONLY for the genuinely unrecoverable case: no `REDIS_URL`. That can't
 * change without a process restart, so retrying is pointless and would only spam
 * the log. Connection *failures* are deliberately NOT latched here — see
 * `lastFailureAt` below.
 */
let configMissing = false;

/**
 * Timestamp (epoch ms) of the last connection failure, or 0 when healthy.
 *
 * A dead connection drops the cached client and stamps this; the next
 * `getRedisClient()` after `RECONNECT_COOLDOWN_MS` transparently recreates it.
 * The previous implementation latched a process-wide `connectionFailed` flag on
 * the first blip, which disabled caching for the entire process lifetime (until
 * the next deploy) — the same latched-bad-state anti-pattern that once made
 * `/api/health` report a permanent false 503. A transient Redis outage should
 * degrade caching transiently, not permanently.
 */
let lastFailureAt = 0;
const RECONNECT_COOLDOWN_MS = 30_000;

export function getRedisClient(): Redis | null {
  if (configMissing) return null;
  if (redisClient) return redisClient;

  // Back off after a recent failure instead of spinning up a fresh client (and
  // its reconnection attempts) on every cache call during an outage.
  if (lastFailureAt !== 0 && Date.now() - lastFailureAt < RECONNECT_COOLDOWN_MS) {
    return null;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not set — caching disabled');
    configMissing = true;
    return null;
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.warn(
            '[Redis] Max reconnection attempts reached; will recreate after cooldown'
          );
          // Stop this client's reconnection. getRedisClient() recreates a fresh
          // client once the cooldown elapses (self-healing).
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
      connectTimeout: 5000,
      commandTimeout: 3000,
    });

    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    client.on('connect', () => {
      // Recovered — clear the backoff so we keep using this healthy client.
      lastFailureAt = 0;
      console.log('[Redis] Connected successfully');
    });

    client.on('close', () => {
      console.warn('[Redis] Connection closed');
    });

    // ioredis emits 'end' once it stops reconnecting. Drop the cached client and
    // stamp the failure so the next call recreates it after the cooldown,
    // instead of returning a permanently-dead client until redeploy.
    client.on('end', () => {
      if (redisClient === client) {
        redisClient = null;
        lastFailureAt = Date.now();
      }
    });

    redisClient = client;
    return redisClient;
  } catch (err) {
    console.error('[Redis] Failed to create client:', err);
    lastFailureAt = Date.now();
    redisClient = null;
    return null;
  }
}

/**
 * Health check against the live cache client: returns connectivity + ping
 * latency. Reports on the SAME ioredis client the app actually caches with
 * (previously the health endpoint pinged a separate node-redis pub/sub client
 * that was never connected, so it always reported "disconnected").
 */
export async function redisHealthCheck(): Promise<{
  connected: boolean;
  latencyMs: number | null;
}> {
  const client = getRedisClient();
  if (!client) {
    return { connected: false, latencyMs: null };
  }
  try {
    const start = Date.now();
    const pong = await client.ping();
    return { connected: pong === "PONG", latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: null };
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    // Clear the reference before quitting so the resulting 'end' event is
    // recognized as an intentional shutdown and doesn't arm the reconnect
    // backoff.
    const client = redisClient;
    redisClient = null;
    await client.quit();
  }
}

/**
 * Reset the module state — useful for testing.
 */
export function resetRedisState(): void {
  redisClient = null;
  configMissing = false;
  lastFailureAt = 0;
}

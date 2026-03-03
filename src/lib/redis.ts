import { Redis } from 'ioredis';

let redisClient: Redis | null = null;
let connectionFailed = false;

export function getRedisClient(): Redis | null {
  if (connectionFailed) return null;

  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      console.warn('[Redis] REDIS_URL not set — caching disabled');
      connectionFailed = true;
      return null;
    }

    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 3) {
            console.warn('[Redis] Max reconnection attempts reached');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: false,
        connectTimeout: 5000,
        commandTimeout: 3000,
      });

      redisClient.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('[Redis] Connected successfully');
      });

      redisClient.on('close', () => {
        console.warn('[Redis] Connection closed');
      });
    } catch (err) {
      console.error('[Redis] Failed to create client:', err);
      connectionFailed = true;
      return null;
    }
  }

  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Reset the module state — useful for testing
 */
export function resetRedisState(): void {
  redisClient = null;
  connectionFailed = false;
}

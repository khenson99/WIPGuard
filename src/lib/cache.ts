import { getRedisClient } from './redis';

const CACHE_PREFIX = 'the-mother-node:';

/**
 * Get a cached value by key.
 * Returns undefined if key doesn't exist or Redis is unavailable.
 * Returns the parsed value (which may be null) when the key exists.
 */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const client = getRedisClient();
    if (!client) return undefined;

    const raw = await client.get(`${CACHE_PREFIX}${key}`);
    if (raw === null) return undefined;

    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[Cache] Error getting key "${key}":`, err);
    return undefined;
  }
}

/**
 * Set a cached value with a TTL in seconds.
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const client = getRedisClient();
    if (!client) return;

    const serialized = JSON.stringify(value);
    await client.setex(`${CACHE_PREFIX}${key}`, ttlSeconds, serialized);
  } catch (err) {
    console.error(`[Cache] Error setting key "${key}":`, err);
  }
}

/**
 * Invalidate cache keys matching a pattern.
 * Supports Redis glob-style patterns (e.g., "company:*").
 */
export async function cacheInvalidate(pattern: string): Promise<number> {
  try {
    const client = getRedisClient();
    if (!client) return 0;

    const fullPattern = `${CACHE_PREFIX}${pattern}`;
    let cursor = '0';
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        fullPattern,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const pipeline = client.pipeline();
        keys.forEach((k) => pipeline.del(k));
        await pipeline.exec();
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    return deletedCount;
  } catch (err) {
    console.error(`[Cache] Error invalidating pattern "${pattern}":`, err);
    return 0;
  }
}

/**
 * Delete a single cache key.
 */
export async function cacheDelete(key: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) return false;

    const result = await client.del(`${CACHE_PREFIX}${key}`);
    return result > 0;
  } catch (err) {
    console.error(`[Cache] Error deleting key "${key}":`, err);
    return false;
  }
}

/**
 * Get or set pattern: returns cached value if exists,
 * otherwise calls the fetcher, caches the result, and returns it.
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const fresh = await fetcher();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

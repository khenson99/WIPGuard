/**
 * Higher-order functions for integrating caching into data access patterns.
 * These wrap existing data fetchers with cache-aside logic.
 */

import { cacheGet, cacheSet, cacheInvalidate } from './cache';

type AsyncFn<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

/**
 * Wraps an async function with cache-aside logic.
 * The keyFn generates a cache key from the function's arguments.
 */
export function withCache<TArgs extends unknown[], TResult>(
  fn: AsyncFn<TArgs, TResult>,
  keyFn: (...args: TArgs) => string,
  ttlSeconds: number
): AsyncFn<TArgs, TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const cacheKey = keyFn(...args);

    // Try cache first
    const cached = await cacheGet<TResult>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Cache miss — execute the original function
    const result = await fn(...args);

    // Store in cache (fire and forget)
    cacheSet(cacheKey, result, ttlSeconds).catch(() => {
      // Silently ignore cache write failures
    });

    return result;
  };
}

/**
 * Wraps a mutation function to invalidate cache after execution.
 * The patternFn generates invalidation patterns from the function's arguments.
 */
export function withCacheInvalidation<TArgs extends unknown[], TResult>(
  fn: AsyncFn<TArgs, TResult>,
  patternFn: (...args: TArgs) => string | string[]
): AsyncFn<TArgs, TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    // Execute the mutation first
    const result = await fn(...args);

    // Invalidate cache after successful mutation
    const patterns = patternFn(...args);
    const patternList = Array.isArray(patterns) ? patterns : [patterns];

    await Promise.allSettled(
      patternList.map((pattern) => cacheInvalidate(pattern))
    );

    return result;
  };
}

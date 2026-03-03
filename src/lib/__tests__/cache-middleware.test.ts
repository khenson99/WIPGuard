import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withCache, withCacheInvalidation } from '../cache-middleware';

// Mock the cache module
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheInvalidate = vi.fn();

vi.mock('../cache', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

describe('cache-middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheInvalidate.mockResolvedValue(0);
  });

  describe('withCache', () => {
    it('should return cached value on cache hit', async () => {
      const cachedData = { id: '1', name: 'Cached' };
      mockCacheGet.mockResolvedValue(cachedData);

      const originalFn = vi.fn();
      const cachedFn = withCache(
        originalFn,
        (id: string) => `test:${id}`,
        60
      );

      const result = await cachedFn('123');

      expect(result).toEqual(cachedData);
      expect(originalFn).not.toHaveBeenCalled();
      expect(mockCacheGet).toHaveBeenCalledWith('test:123');
    });

    it('should call original function and cache result on miss', async () => {
      const freshData = { id: '2', name: 'Fresh' };
      mockCacheGet.mockResolvedValue(null);

      const originalFn = vi.fn().mockResolvedValue(freshData);
      const cachedFn = withCache(
        originalFn,
        (id: string) => `test:${id}`,
        120
      );

      const result = await cachedFn('456');

      expect(result).toEqual(freshData);
      expect(originalFn).toHaveBeenCalledWith('456');
      expect(mockCacheSet).toHaveBeenCalledWith('test:456', freshData, 120);
    });

    it('should still return result even if cache write fails', async () => {
      const freshData = { id: '3' };
      mockCacheGet.mockResolvedValue(null);
      mockCacheSet.mockRejectedValue(new Error('Write failed'));

      const originalFn = vi.fn().mockResolvedValue(freshData);
      const cachedFn = withCache(
        originalFn,
        (id: string) => `test:${id}`,
        60
      );

      const result = await cachedFn('789');

      expect(result).toEqual(freshData);
    });
  });

  describe('withCacheInvalidation', () => {
    it('should execute mutation then invalidate single pattern', async () => {
      const mutationResult = { success: true };
      const originalFn = vi.fn().mockResolvedValue(mutationResult);

      const wrappedFn = withCacheInvalidation(
        originalFn,
        (companyId: string) => `company:${companyId}:*`
      );

      const result = await wrappedFn('comp-1');

      expect(result).toEqual(mutationResult);
      expect(originalFn).toHaveBeenCalledWith('comp-1');
      expect(mockCacheInvalidate).toHaveBeenCalledWith('company:comp-1:*');
    });

    it('should invalidate multiple patterns', async () => {
      const originalFn = vi.fn().mockResolvedValue({ ok: true });

      const wrappedFn = withCacheInvalidation(
        originalFn,
        (companyId: string) => [
          `company:${companyId}:projects*`,
          `company:${companyId}:analytics*`,
        ]
      );

      await wrappedFn('comp-2');

      expect(mockCacheInvalidate).toHaveBeenCalledTimes(2);
      expect(mockCacheInvalidate).toHaveBeenCalledWith('company:comp-2:projects*');
      expect(mockCacheInvalidate).toHaveBeenCalledWith('company:comp-2:analytics*');
    });

    it('should still return result if invalidation fails', async () => {
      mockCacheInvalidate.mockRejectedValue(new Error('Invalidation failed'));
      const originalFn = vi.fn().mockResolvedValue({ data: 'important' });

      const wrappedFn = withCacheInvalidation(
        originalFn,
        () => 'some:pattern:*'
      );

      const result = await wrappedFn();

      expect(result).toEqual({ data: 'important' });
    });
  });
});

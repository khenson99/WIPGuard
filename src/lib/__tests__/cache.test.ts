import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cacheGet, cacheSet, cacheInvalidate, cacheDelete, cacheGetOrSet } from '../cache';

// Mock Redis client
const mockRedisClient = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  scan: vi.fn(),
  pipeline: vi.fn(),
};

const mockPipeline = {
  del: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
};

vi.mock('../redis', () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisClient.pipeline.mockReturnValue(mockPipeline);
  });

  describe('cacheGet', () => {
    it('should return parsed JSON when key exists', async () => {
      const data = { id: '1', name: 'Test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(data));

      const result = await cacheGet<typeof data>('test-key');

      expect(result).toEqual(data);
      expect(mockRedisClient.get).toHaveBeenCalledWith('the-mother-node:test-key');
    });

    it('should return undefined when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheGet('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should return undefined and log error on Redis failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.get.mockRejectedValue(new Error('Connection lost'));

      const result = await cacheGet('failing-key');

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('cacheSet', () => {
    it('should serialize and store value with TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');
      const data = { items: [1, 2, 3] };

      await cacheSet('my-key', data, 60);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'the-mother-node:my-key',
        60,
        JSON.stringify(data)
      );
    });

    it('should handle Redis write failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.setex.mockRejectedValue(new Error('Write failed'));

      await cacheSet('fail-key', { data: true }, 30);

      // Should not throw
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('cacheDelete', () => {
    it('should delete a single key and return true if it existed', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await cacheDelete('delete-me');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('the-mother-node:delete-me');
    });

    it('should return false if key did not exist', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await cacheDelete('no-such-key');

      expect(result).toBe(false);
    });
  });

  describe('cacheInvalidate', () => {
    it('should scan and delete matching keys', async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(['0', ['the-mother-node:company:1:projects', 'the-mother-node:company:1:projects:abc']]);

      const count = await cacheInvalidate('company:1:projects*');

      expect(count).toBe(2);
      expect(mockRedisClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'the-mother-node:company:1:projects*',
        'COUNT',
        100
      );
      expect(mockPipeline.del).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle multiple scan iterations', async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce(['42', ['the-mother-node:key1']])
        .mockResolvedValueOnce(['0', ['the-mother-node:key2']]);

      const count = await cacheInvalidate('key*');

      expect(count).toBe(2);
      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when no keys match', async () => {
      mockRedisClient.scan.mockResolvedValueOnce(['0', []]);

      const count = await cacheInvalidate('nonexistent:*');

      expect(count).toBe(0);
    });
  });

  describe('cacheGetOrSet', () => {
    it('should return cached value if it exists', async () => {
      const cachedData = { cached: true };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));
      const fetcher = vi.fn();

      const result = await cacheGetOrSet('existing-key', fetcher, 60);

      expect(result).toEqual(cachedData);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should call fetcher on cache miss and store result', async () => {
      const freshData = { fresh: true };
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');
      const fetcher = vi.fn().mockResolvedValue(freshData);

      const result = await cacheGetOrSet('miss-key', fetcher, 120);

      expect(result).toEqual(freshData);
      expect(fetcher).toHaveBeenCalledOnce();
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'the-mother-node:miss-key',
        120,
        JSON.stringify(freshData)
      );
    });
  });
});

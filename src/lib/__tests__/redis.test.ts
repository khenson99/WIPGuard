import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('redis', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null when REDIS_URL is not set', async () => {
    delete process.env.REDIS_URL;
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getRedisClient, resetRedisState } = await import('../redis');
    resetRedisState();

    const client = getRedisClient();

    expect(client).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('REDIS_URL not set')
    );
    consoleSpy.mockRestore();
  });
});

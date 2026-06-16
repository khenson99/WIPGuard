import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Shared registry of fake ioredis instances created during a test.
const hoisted = vi.hoisted(() => ({ instances: [] as FakeRedis[] }));

class FakeRedis extends EventEmitter {
  options: unknown;
  quit = vi.fn(async () => {
    this.emit('end');
  });
  constructor(_url: string, options: unknown) {
    super();
    this.options = options;
    hoisted.instances.push(this);
  }
}

vi.mock('ioredis', () => ({ Redis: FakeRedis }));

describe('redis', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    hoisted.instances.length = 0;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  it('returns null when REDIS_URL is not set', async () => {
    delete process.env.REDIS_URL;
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getRedisClient, resetRedisState } = await import('../redis');
    resetRedisState();

    expect(getRedisClient()).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('REDIS_URL not set')
    );
    consoleSpy.mockRestore();
  });

  it('reuses a single cached client across calls', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { getRedisClient, resetRedisState } = await import('../redis');
    resetRedisState();

    const a = getRedisClient();
    const b = getRedisClient();

    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(hoisted.instances).toHaveLength(1);
  });

  it('self-heals after a connection ends instead of latching dead forever', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { getRedisClient, resetRedisState } = await import('../redis');
    resetRedisState();

    const first = getRedisClient();
    expect(first).not.toBeNull();

    // The connection dies and ioredis gives up (emits 'end').
    (first as unknown as FakeRedis).emit('end');

    // Within the cooldown window, we back off rather than thrash reconnects.
    expect(getRedisClient()).toBeNull();
    expect(hoisted.instances).toHaveLength(1);

    // After the cooldown elapses, a fresh client is transparently created —
    // caching recovers without a process restart.
    vi.advanceTimersByTime(31_000);
    const recovered = getRedisClient();
    expect(recovered).not.toBeNull();
    expect(recovered).not.toBe(first);
    expect(hoisted.instances).toHaveLength(2);
  });

  it('does not arm the reconnect backoff on an intentional disconnect', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { getRedisClient, disconnectRedis, resetRedisState } = await import(
      '../redis'
    );
    resetRedisState();

    getRedisClient();
    await disconnectRedis(); // quit() emits 'end', but the reference was cleared first

    // A subsequent call recreates immediately — no spurious cooldown.
    const next = getRedisClient();
    expect(next).not.toBeNull();
    expect(hoisted.instances).toHaveLength(2);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock the redis module before importing the module under test
vi.mock("redis", () => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn(),
    on: vi.fn(),
    ping: vi.fn().mockResolvedValue("PONG"),
  };

  // duplicate returns a new mock with the same shape
  const mockSubClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    ping: vi.fn().mockResolvedValue("PONG"),
  };

  mockClient.duplicate.mockReturnValue(mockSubClient);

  return {
    createClient: vi.fn().mockReturnValue(mockClient),
    __mockPubClient: mockClient,
    __mockSubClient: mockSubClient,
  };
});

describe("redis-client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("getRedisUrl", () => {
    it("returns null when REDIS_URL is not set", async () => {
      delete process.env.REDIS_URL;
      const { getRedisUrl } = await import("../redis-client");
      expect(getRedisUrl()).toBeNull();
    });

    it("returns the REDIS_URL when set", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      const { getRedisUrl } = await import("../redis-client");
      expect(getRedisUrl()).toBe("redis://localhost:6379");
    });
  });

  describe("createRedisClients", () => {
    it("returns null when REDIS_URL is not configured", async () => {
      delete process.env.REDIS_URL;
      const { createRedisClients } = await import("../redis-client");
      const result = await createRedisClients();
      expect(result).toBeNull();
    });

    it("creates and connects pub/sub clients when REDIS_URL is set", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      const { createRedisClients } = await import("../redis-client");
      const redis = await import("redis");

      const result = await createRedisClients();

      expect(result).not.toBeNull();
      expect(redis.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "redis://localhost:6379",
        })
      );
      expect(result!.pubClient).toBeDefined();
      expect(result!.subClient).toBeDefined();
    });

    it("returns null and cleans up when connection fails", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      const redis = await import("redis");
      const mockPub = (redis as Record<string, unknown>).__mockPubClient as {
        connect: ReturnType<typeof vi.fn>;
      };
      mockPub.connect.mockRejectedValueOnce(new Error("Connection refused"));

      const { createRedisClients } = await import("../redis-client");
      const result = await createRedisClients();

      expect(result).toBeNull();
    });
  });

  describe("isRedisConnected", () => {
    it("returns false when no connection has been made", async () => {
      delete process.env.REDIS_URL;
      const { isRedisConnected } = await import("../redis-client");
      expect(isRedisConnected()).toBe(false);
    });

    it("returns true after successful connection", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      const { createRedisClients, isRedisConnected } = await import(
        "../redis-client"
      );
      await createRedisClients();
      expect(isRedisConnected()).toBe(true);
    });
  });

  describe("redisHealthCheck", () => {
    it("returns not connected when Redis is not initialized", async () => {
      delete process.env.REDIS_URL;
      const { redisHealthCheck } = await import("../redis-client");
      const result = await redisHealthCheck();
      expect(result).toEqual({ connected: false, latencyMs: null });
    });

    it("returns connected with latency after successful ping", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      const { createRedisClients, redisHealthCheck } = await import(
        "../redis-client"
      );
      await createRedisClients();

      const result = await redisHealthCheck();
      expect(result.connected).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("disconnectRedisClients", () => {
    it("handles disconnect when no clients exist", async () => {
      const { disconnectRedisClients } = await import("../redis-client");
      // Should not throw
      await expect(disconnectRedisClients()).resolves.toBeUndefined();
    });

    it("disconnects clients and resets state", async () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      const { createRedisClients, disconnectRedisClients, isRedisConnected } =
        await import("../redis-client");

      await createRedisClients();
      expect(isRedisConnected()).toBe(true);

      await disconnectRedisClients();
      expect(isRedisConnected()).toBe(false);
    });
  });
});

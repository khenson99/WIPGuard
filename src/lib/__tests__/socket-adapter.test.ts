import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateRedisClients, mockCreateAdapter } = vi.hoisted(() => ({
  mockCreateRedisClients: vi.fn(),
  mockCreateAdapter: vi.fn().mockReturnValue("redis-adapter-instance"),
}));

vi.mock("../redis-client", () => ({
  createRedisClients: mockCreateRedisClients,
}));

vi.mock("@socket.io/redis-adapter", () => ({
  createAdapter: mockCreateAdapter,
}));

import { configureSocketAdapter } from "../socket-adapter";

describe("socket-adapter", () => {
  let mockIo: Parameters<typeof configureSocketAdapter>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIo = {
      adapter: vi.fn(),
    } as unknown as Parameters<typeof configureSocketAdapter>[0];
  });

  it("returns false and uses in-memory when Redis clients are not available", async () => {
    mockCreateRedisClients.mockResolvedValue(null);

    const result = await configureSocketAdapter(mockIo);

    expect(result).toBe(false);
    expect(mockIo.adapter).not.toHaveBeenCalled();
  });

  it("configures Redis adapter when clients are available", async () => {
    const mockPub = { id: "pub" };
    const mockSub = { id: "sub" };
    mockCreateRedisClients.mockResolvedValue({
      pubClient: mockPub,
      subClient: mockSub,
    });

    const result = await configureSocketAdapter(mockIo);

    expect(result).toBe(true);
    expect(mockCreateAdapter).toHaveBeenCalledWith(mockPub, mockSub);
    expect(mockIo.adapter).toHaveBeenCalledWith("redis-adapter-instance");
  });

  it("falls back to in-memory adapter when Redis adapter setup throws", async () => {
    mockCreateRedisClients.mockRejectedValue(new Error("Connection failed"));

    const result = await configureSocketAdapter(mockIo);

    expect(result).toBe(false);
    expect(mockIo.adapter).not.toHaveBeenCalled();
  });
});

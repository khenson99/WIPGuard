import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDisconnect,
  mockPoolEnd,
  mockPrismaClient,
  mockPoolCtor,
  mockAdapterCtor,
} = vi.hoisted(() => {
  const disconnect = vi.fn();
  const poolEnd = vi.fn().mockResolvedValue(undefined);

  return {
    mockDisconnect: disconnect,
    mockPoolEnd: poolEnd,
    mockPrismaClient: vi.fn(function MockPrismaClient(this: object) {
      return {
        $disconnect: disconnect,
        $queryRaw: vi.fn(),
      };
    }),
    mockPoolCtor: vi.fn(function MockPool(this: object) {
      return {
        end: poolEnd,
      };
    }),
    mockAdapterCtor: vi.fn(function MockPrismaPg(this: object) {
      return {};
    }),
  };
});

vi.mock('@/generated/prisma/client', () => ({
  PrismaClient: mockPrismaClient,
}));

vi.mock('pg', () => ({
  Pool: mockPoolCtor,
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: mockAdapterCtor,
}));

describe('worker prisma', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
    vi.resetModules();
    mockDisconnect.mockReset();
    mockPoolEnd.mockReset();
    mockPrismaClient.mockClear();
    mockPoolCtor.mockClear();
    mockAdapterCtor.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates a PrismaClient with connection pool params', async () => {
    const { getWorkerPrisma } = await import('../prisma');
    const prisma = getWorkerPrisma();
    expect(prisma).toBeTruthy();
  });

  it('returns the same instance on subsequent calls', async () => {
    const { getWorkerPrisma } = await import('../prisma');
    const p1 = getWorkerPrisma();
    const p2 = getWorkerPrisma();
    expect(p1).toBe(p2);
  });

  it('disconnects and nullifies on disconnectWorkerPrisma', async () => {
    const { getWorkerPrisma, disconnectWorkerPrisma } = await import('../prisma');
    getWorkerPrisma();
    await disconnectWorkerPrisma();
    expect(mockDisconnect).toHaveBeenCalledOnce();
    expect(mockPoolEnd).toHaveBeenCalledOnce();
  });

  it('throws if no DATABASE_URL is set', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.WORKER_DATABASE_URL;

    const { getWorkerPrisma } = await import('../prisma');
    expect(() => getWorkerPrisma()).toThrow('Neither WORKER_DATABASE_URL nor DATABASE_URL');
  });

  it('prefers WORKER_DATABASE_URL over DATABASE_URL', async () => {
    process.env.WORKER_DATABASE_URL = 'postgresql://worker:pass@localhost:5432/workerdb';
    process.env.DATABASE_URL = 'postgresql://web:pass@localhost:5432/webdb';

    const { getWorkerPrisma } = await import('../prisma');
    getWorkerPrisma();

    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: expect.stringContaining('workerdb'),
      })
    );
    expect(mockAdapterCtor).toHaveBeenCalledOnce();
    expect(mockPrismaClient).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: expect.any(Object),
      }),
    );
  });
});

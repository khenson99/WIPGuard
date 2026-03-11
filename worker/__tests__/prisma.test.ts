import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock PrismaClient before importing the module
const mockDisconnect = vi.fn();
const mockPrismaClient = vi.fn(function MockPrismaClient(this: object) {
  return {
    $disconnect: mockDisconnect,
    $queryRaw: vi.fn(),
  };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: mockPrismaClient,
}));

describe('worker prisma', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
    vi.resetModules();
    mockDisconnect.mockReset();
    mockPrismaClient.mockClear();
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

    expect(mockPrismaClient).toHaveBeenCalledWith(
      expect.objectContaining({
        datasourceUrl: expect.stringContaining('workerdb'),
      })
    );
  });
});

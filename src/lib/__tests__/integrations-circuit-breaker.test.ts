import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CircuitRow = {
  state: string;
  consecutiveFailures: number;
  openedAt: Date | null;
  currentCooldownMs: number;
  openCount: number;
};

const db = new Map<string, CircuitRow>();

function dbKey(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCircuitState: {
      findUnique: vi.fn(async (args: { where: { userId_key: { userId: string; key: string } } }) => {
        const { userId, key } = args.where.userId_key;
        const row = db.get(dbKey(userId, key));
        if (!row) return null;
        return {
          state: row.state,
          consecutiveFailures: row.consecutiveFailures,
          openedAt: row.openedAt,
          currentCooldownMs: row.currentCooldownMs,
          openCount: row.openCount,
        };
      }),
      create: vi.fn(
        async (args: {
          data: {
            userId: string;
            key: string;
            state: string;
            consecutiveFailures: number;
            openedAt: Date | null;
            currentCooldownMs: number;
            openCount: number;
          };
        }) => {
          const { userId, key, ...row } = args.data;
          db.set(dbKey(userId, key), row);
          return row;
        }
      ),
      update: vi.fn(
        async (args: {
          where: { userId_key: { userId: string; key: string } };
          data: {
            state?: string;
            consecutiveFailures?: { increment: number } | number;
            openedAt?: Date | null;
            currentCooldownMs?: number;
            openCount?: { increment: number } | number;
          };
        }) => {
          const { userId, key } = args.where.userId_key;
          const existing = db.get(dbKey(userId, key));
          if (!existing) {
            throw new Error("Missing circuit state");
          }

          const next: CircuitRow = { ...existing };
          if (args.data.state !== undefined) {
            next.state = args.data.state;
          }
          if (typeof args.data.consecutiveFailures === "number") {
            next.consecutiveFailures = args.data.consecutiveFailures;
          } else if (args.data.consecutiveFailures?.increment) {
            next.consecutiveFailures += args.data.consecutiveFailures.increment;
          }
          if (args.data.openedAt !== undefined) {
            next.openedAt = args.data.openedAt;
          }
          if (args.data.currentCooldownMs !== undefined) {
            next.currentCooldownMs = args.data.currentCooldownMs;
          }
          if (typeof args.data.openCount === "number") {
            next.openCount = args.data.openCount;
          } else if (args.data.openCount?.increment) {
            next.openCount += args.data.openCount.increment;
          }

          db.set(dbKey(userId, key), next);
          return next;
        }
      ),
      upsert: vi.fn(
        async (args: {
          where: { userId_key: { userId: string; key: string } };
          create: {
            userId: string;
            key: string;
            state: string;
            consecutiveFailures: number;
            openedAt: Date | null;
            currentCooldownMs: number;
            openCount: number;
          };
          update: {
            state: string;
            consecutiveFailures: number;
            openedAt: Date | null;
            currentCooldownMs: number;
            openCount: number;
          };
        }) => {
          const { userId, key } = args.where.userId_key;
          const existing = db.get(dbKey(userId, key));
          const next = existing ? { ...existing, ...args.update } : { ...args.create };
          db.set(dbKey(userId, key), {
            state: next.state,
            consecutiveFailures: next.consecutiveFailures,
            openedAt: next.openedAt,
            currentCooldownMs: next.currentCooldownMs,
            openCount: next.openCount,
          });
          return next;
        }
      ),
      deleteMany: vi.fn(async () => {
        db.clear();
        return { count: 0 };
      }),
    },
  },
}));

async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("integrations circuit-breaker persistence", () => {
  beforeEach(() => {
    db.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists OPEN state across module reloads", async () => {
    const provider = "HUBSPOT";
    const userId = "user_1";

    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    const cb1 = await import("@/lib/integrations/circuit-breaker");
    cb1.recordFailure(provider, userId, { failureThreshold: 1, baseCooldownMs: 30_000 });
    await flushAsync();

    expect(await cb1.isCircuitClosed(provider, userId)).toBe(false);

    await vi.resetModules();
    const cb2 = await import("@/lib/integrations/circuit-breaker");

    expect(await cb2.isCircuitClosed(provider, userId)).toBe(false);
  });

  it("transitions to HALF_OPEN after cooldown and persists the transition", async () => {
    const provider = "SLACK";
    const userId = "user_2";

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);

    const cb = await import("@/lib/integrations/circuit-breaker");
    cb.recordFailure(provider, userId, { failureThreshold: 1, baseCooldownMs: 100 });
    await flushAsync();

    expect(await cb.isCircuitClosed(provider, userId)).toBe(false);
    expect(db.get(dbKey(userId, provider))?.state).toBe("OPEN");

    now.mockReturnValue(1_150);
    expect(await cb.isCircuitClosed(provider, userId)).toBe(true);
    expect(db.get(dbKey(userId, provider))?.state).toBe("HALF_OPEN");
  });

  it("increments consecutive failures correctly under concurrent failures", async () => {
    const provider = "CODA";
    const userId = "user_3";

    const cb = await import("@/lib/integrations/circuit-breaker");

    await Promise.all([
      cb.recordFailure(provider, userId, { failureThreshold: 5 }),
      cb.recordFailure(provider, userId, { failureThreshold: 5 }),
    ]);

    expect(db.get(dbKey(userId, provider))).toMatchObject({
      state: "CLOSED",
      consecutiveFailures: 2,
      openCount: 0,
    });
  });

  it("awaits circuit state persistence before rethrowing provider errors", async () => {
    const provider = "REDDIT";
    const userId = "user_4";

    const cb = await import("@/lib/integrations/circuit-breaker");

    await expect(
      cb.withCircuitBreaker(
        provider,
        userId,
        async () => {
          throw new Error("provider failed");
        },
        { failureThreshold: 1, baseCooldownMs: 30_000 }
      )
    ).rejects.toThrow("provider failed");

    expect(db.get(dbKey(userId, provider))).toMatchObject({
      state: "OPEN",
      consecutiveFailures: 1,
      openCount: 1,
    });
    expect(await cb.isCircuitClosed(provider, userId)).toBe(false);
  });
});

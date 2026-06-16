import { afterEach, describe, expect, it, vi } from "vitest";

import { withSyncAdvisoryLock, SYNC_LOCK_KEYS } from "../sync-lock";

/**
 * Minimal pg Pool/PoolClient test double that records the SQL it ran and lets
 * each test decide whether pg_try_advisory_lock "acquires".
 */
function makePool(opts: { acquired: boolean; unlockThrows?: boolean }) {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes("pg_try_advisory_lock")) {
        return { rows: [{ locked: opts.acquired }] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        if (opts.unlockThrows) throw new Error("connection reset");
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
  };
  return { pool: pool as never, client, queries };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withSyncAdvisoryLock", () => {
  it("runs fn and reports ran:true when the lock is acquired", async () => {
    const { pool, client, queries } = makePool({ acquired: true });
    const fn = vi.fn(async () => "did-work");

    const outcome = await withSyncAdvisoryLock(fn, { pool });

    expect(outcome).toEqual({ ran: true, result: "did-work" });
    expect(fn).toHaveBeenCalledTimes(1);
    // acquired with the (WIPG, SYNC) keys, then unlocked, then released.
    expect(queries[0].sql).toContain("pg_try_advisory_lock");
    expect(queries[0].params).toEqual([SYNC_LOCK_KEYS.key1, SYNC_LOCK_KEYS.key2]);
    expect(queries.some((q) => q.sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("skips fn and reports ran:false when the lock is NOT acquired", async () => {
    const { pool, client, queries } = makePool({ acquired: false });
    const fn = vi.fn(async () => "should-not-run");

    const outcome = await withSyncAdvisoryLock(fn, { pool });

    expect(outcome.ran).toBe(false);
    if (!outcome.ran) expect(outcome.reason).toMatch(/already running/i);
    expect(fn).not.toHaveBeenCalled();
    // No unlock when we never acquired; connection still released.
    expect(queries.some((q) => q.sql.includes("pg_advisory_unlock"))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("unlocks and releases even when fn throws, and propagates the error", async () => {
    const { pool, client, queries } = makePool({ acquired: true });
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });

    await expect(withSyncAdvisoryLock(fn, { pool })).rejects.toThrow("boom");

    expect(queries.some((q) => q.sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("still returns the result and releases when unlock itself fails", async () => {
    const { pool, client } = makePool({ acquired: true, unlockThrows: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = vi.fn(async () => 42);

    const outcome = await withSyncAdvisoryLock(fn, { pool });

    expect(outcome).toEqual({ ran: true, result: 42 });
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });
});

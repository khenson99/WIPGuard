import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IMLADRIS_MATERIALIZATION_LOCK_KEYS,
  withImladrisMaterializationAdvisoryLock,
} from "./materialization-lock";
import { SYNC_LOCK_KEYS } from "@/lib/sync/sync-lock";

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

describe("withImladrisMaterializationAdvisoryLock", () => {
  it("uses lock keys distinct from the global sync lock", async () => {
    expect(IMLADRIS_MATERIALIZATION_LOCK_KEYS.key1).toBe(SYNC_LOCK_KEYS.key1);
    expect(IMLADRIS_MATERIALIZATION_LOCK_KEYS.key2).not.toBe(SYNC_LOCK_KEYS.key2);
  });

  it("runs fn and unlocks when the materialization lock is acquired", async () => {
    const { pool, client, queries } = makePool({ acquired: true });
    const fn = vi.fn(async () => "did-work");

    const outcome = await withImladrisMaterializationAdvisoryLock(fn, { pool });

    expect(outcome).toEqual({ ran: true, result: "did-work" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(queries[0].sql).toContain("pg_try_advisory_lock");
    expect(queries[0].params).toEqual([
      IMLADRIS_MATERIALIZATION_LOCK_KEYS.key1,
      IMLADRIS_MATERIALIZATION_LOCK_KEYS.key2,
    ]);
    expect(queries.some((q) => q.sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("skips fn when another materialization run holds the lock", async () => {
    const { pool, client, queries } = makePool({ acquired: false });
    const fn = vi.fn(async () => "should-not-run");

    const outcome = await withImladrisMaterializationAdvisoryLock(fn, { pool });

    expect(outcome).toEqual({
      ran: false,
      reason: "another Imladris materialization is already running",
    });
    expect(fn).not.toHaveBeenCalled();
    expect(queries.some((q) => q.sql.includes("pg_advisory_unlock"))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

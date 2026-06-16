/**
 * Generic Postgres session-level advisory lock.
 *
 * Postgres advisory locks are shared across connections AND processes, so they
 * serialize work across the web app, the worker, and multiple replicas — which
 * is why they're used here instead of an in-process mutex. Callers pick a
 * distinct (key1, key2) pair per critical section.
 */
import type { Pool } from "pg";
import { getConnectionPool } from "@/lib/prisma";

export type AdvisoryLockKeys = { key1: number; key2: number };

export type AdvisoryLockOutcome<T> =
  | { ran: true; result: T }
  | { ran: false; reason: string };

export interface AdvisoryLockOptions {
  pool?: Pool;
  /** Message returned as `reason` when the lock is already held by someone else. */
  busyReason?: string;
}

/**
 * Run `fn` while holding the advisory lock identified by (key1, key2). If the
 * lock is already held, `fn` is NOT run and `{ ran: false }` is returned.
 *
 * Uses `pg_try_advisory_lock` (non-blocking) on a single pinned pool connection;
 * the matching `pg_advisory_unlock` runs on the SAME connection in a `finally`,
 * before the connection is released. If unlock throws (e.g. the connection
 * died), the lock clears automatically when the session ends, so it is never
 * leaked permanently.
 */
export async function withAdvisoryLock<T>(
  keys: AdvisoryLockKeys,
  fn: () => Promise<T>,
  options: AdvisoryLockOptions = {}
): Promise<AdvisoryLockOutcome<T>> {
  const pool = options.pool ?? getConnectionPool();
  const client = await pool.connect();
  try {
    const locked = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [keys.key1, keys.key2]
    );
    if (!locked.rows[0]?.locked) {
      return {
        ran: false,
        reason: options.busyReason ?? "advisory lock is already held",
      };
    }
    try {
      const result = await fn();
      return { ran: true, result };
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [
          keys.key1,
          keys.key2,
        ]);
      } catch (error) {
        console.warn(
          "[advisory-lock] unlock failed (lock will clear on session end):",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  } finally {
    client.release();
  }
}

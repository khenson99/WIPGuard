/**
 * Global advisory lock for the periodic sync work (analytics refresh +
 * imladris/retention materialization).
 *
 * The crash this prevents: `POST /api/cron/sync` schedules its heavy work via
 * `after()` on a Railway cron that fires every 10 minutes, with no guard. A
 * cycle that runs longer than the interval overlaps the next one, and because
 * each cycle loads large raw-record sets into memory, stacked cycles drove the
 * WIPGuard-app heap monotonically to the ~4GB V8 limit (OOM crash loop).
 *
 * With this lock, a cycle that starts while another is still running is
 * skipped instead of piling on, so peak memory is bounded to a single cycle.
 * The lock is global (not per-user) so the web cron and the worker process
 * cannot run overlapping cycles either.
 */
import type { Pool } from "pg";
import { withAdvisoryLock, type AdvisoryLockOutcome } from "@/lib/advisory-lock";

// Postgres session-level advisory lock keys. Distinct from the migration lock
// in migrate.cjs (WIPG/MIGR); this one is keyed (WIPG, SYNC). Both halves must
// fit in a signed int32.
const SYNC_LOCK_KEY_1 = 0x57495047; // "WIPG"
const SYNC_LOCK_KEY_2 = 0x53594e43; // "SYNC"

export const SYNC_LOCK_KEYS = {
  key1: SYNC_LOCK_KEY_1,
  key2: SYNC_LOCK_KEY_2,
} as const;

export type SyncLockOutcome<T> = AdvisoryLockOutcome<T>;

/**
 * Run `fn` while holding the global sync advisory lock. If the lock is already
 * held by another cycle, `fn` is NOT run and `{ ran: false }` is returned.
 */
export async function withSyncAdvisoryLock<T>(
  fn: () => Promise<T>,
  options: { pool?: Pool } = {}
): Promise<SyncLockOutcome<T>> {
  return withAdvisoryLock(SYNC_LOCK_KEYS, fn, {
    pool: options.pool,
    busyReason: "another sync cycle is already running",
  });
}

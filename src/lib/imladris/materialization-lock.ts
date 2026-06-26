/**
 * Advisory lock for isolated Imladris materialization runs.
 *
 * This is intentionally distinct from the global sync lock. The web cron can
 * hold (WIPG, SYNC) for most of a 10-minute window, while materialization now
 * runs in a separate memory-capped worker process. This lock serializes
 * materialization with itself without making it wait behind web sync cycles.
 */
import type { Pool } from "pg";
import { withAdvisoryLock, type AdvisoryLockOutcome } from "@/lib/advisory-lock";

// Postgres session-level advisory lock keys: (WIPG, IMLA).
// Both halves must fit in a signed int32.
const IMLADRIS_MATERIALIZATION_LOCK_KEY_1 = 0x57495047; // "WIPG"
const IMLADRIS_MATERIALIZATION_LOCK_KEY_2 = 0x494d4c41; // "IMLA"

export const IMLADRIS_MATERIALIZATION_LOCK_KEYS = {
  key1: IMLADRIS_MATERIALIZATION_LOCK_KEY_1,
  key2: IMLADRIS_MATERIALIZATION_LOCK_KEY_2,
} as const;

export type ImladrisMaterializationLockOutcome<T> = AdvisoryLockOutcome<T>;

export async function withImladrisMaterializationAdvisoryLock<T>(
  fn: () => Promise<T>,
  options: { pool?: Pool } = {},
): Promise<ImladrisMaterializationLockOutcome<T>> {
  return withAdvisoryLock(IMLADRIS_MATERIALIZATION_LOCK_KEYS, fn, {
    pool: options.pool,
    busyReason: "another Imladris materialization is already running",
  });
}

/**
 * Retry helper for Postgres connection-ACQUISITION failures.
 *
 * Right after a deploy cutover the pool is cold: the first burst of
 * traffic makes every request open a fresh socket (TCP + TLS through
 * Railway's Postgres proxy) at once, and checkouts that wait longer than
 * `connectionTimeoutMillis` fail with pg-pool's "timeout exceeded when
 * trying to connect". Observed as a Prisma error burst during the
 * 2026-06-11 deploy outages.
 *
 * Both matched failure modes happen BEFORE a query is handed to a
 * connection, so retrying can never double-apply a write:
 * - "timeout exceeded when trying to connect"            (pg-pool checkout timeout)
 * - "Connection terminated due to connection timeout"    (pg client handshake timeout;
 *    see commit 2e0513d1 for the keepalive half of this story)
 *
 * Anything that fails AFTER dispatch ("Connection terminated
 * unexpectedly", query errors, constraint violations) is intentionally
 * NOT retried here.
 */

const ACQUISITION_TIMEOUT_PATTERNS = [
  /timeout exceeded when trying to connect/i,
  /connection terminated due to connection timeout/i,
];

const MAX_CAUSE_DEPTH = 5;

function messageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return null;
}

/**
 * True when the error (or anything in its `cause` chain / AggregateError
 * members — Prisma driver-adapter errors wrap the original pg error) is a
 * connection-acquisition timeout that is safe to retry.
 */
export function isConnectionAcquisitionTimeout(
  error: unknown,
  depth = 0
): boolean {
  if (error == null || depth > MAX_CAUSE_DEPTH) return false;

  const message = messageOf(error);
  if (
    message &&
    ACQUISITION_TIMEOUT_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return true;
  }

  if (typeof error === "object") {
    const cause = (error as { cause?: unknown }).cause;
    if (cause && isConnectionAcquisitionTimeout(cause, depth + 1)) {
      return true;
    }
    const aggregated = (error as { errors?: unknown }).errors;
    if (Array.isArray(aggregated)) {
      return aggregated.some((inner) =>
        isConnectionAcquisitionTimeout(inner, depth + 1)
      );
    }
  }

  return false;
}

export interface ConnectionRetryOptions {
  /** Additional attempts after the first failure. */
  retries?: number;
  /** Base for the exponential backoff between attempts. */
  baseDelayMs?: number;
  /** Cap for a single backoff delay (before jitter). */
  maxDelayMs?: number;
  /** Hook for logging/metrics; defaults to a console.warn. */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRIES = (() => {
  const parsed = parseInt(process.env.DB_CONNECT_ACQUIRE_RETRIES || "2", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2;
})();

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function defaultOnRetry(attempt: number, delayMs: number, error: unknown) {
  console.warn(
    `[Prisma] Connection acquisition timed out (attempt ${attempt}); retrying in ${delayMs}ms:`,
    messageOf(error) ?? String(error)
  );
}

/**
 * Run `fn`, retrying only on connection-acquisition timeouts with
 * exponential backoff + full jitter. Total added latency with defaults
 * (2 retries, 300ms base) is at most ~1.5s — small next to the 10s pool
 * checkout timeout each attempt already waited.
 */
export async function withConnectionAcquisitionRetry<T>(
  fn: () => Promise<T>,
  options: ConnectionRetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  const onRetry = options.onRetry ?? defaultOnRetry;
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > retries || !isConnectionAcquisitionTimeout(error)) {
        throw error;
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.round(backoff + Math.random() * baseDelayMs);
      onRetry(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }
}

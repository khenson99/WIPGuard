/**
 * Transient-failure retry policy for acquiring Postgres connections.
 *
 * Motivated by the 2026-06-11 production incident: the Postgres volume hit
 * ENOSPC for ~3 minutes, new connection establishment stalled past the pg
 * pool's 10s connection timeout, and every affected request failed
 * immediately with "timeout exceeded when trying to connect" — including the
 * NextAuth jwt callback, which broke Google sign-in. A single bounded retry
 * with backoff would have ridden out most of that window.
 *
 * See docs/runbooks/incident-2026-06-11-prisma-connect-timeouts.md
 *
 * Design constraints:
 * - Retry ONLY errors that occur while acquiring a connection. Acquisition is
 *   idempotent (no statement has run yet), so retrying is always safe.
 * - Retry ONLY classified-transient failures. Auth failures, missing
 *   databases, TLS misconfiguration, etc. fail fast.
 * - Bounded attempts with exponential backoff + jitter so a hard outage adds
 *   bounded latency and no thundering herd.
 */

const TRANSIENT_MESSAGE_SNIPPETS = [
  // pg-pool checkout/establishment timeout (connectionTimeoutMillis).
  "timeout exceeded when trying to connect",
  // Socket died during establishment (proxy/NAT kills, server restart).
  "Connection terminated unexpectedly",
  "Connection terminated due to connection timeout",
];

const TRANSIENT_ERRNO_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
]);

/**
 * Postgres SQLSTATE codes that indicate a temporarily unavailable server
 * rather than a misconfigured client.
 */
const TRANSIENT_PG_CODES = new Set([
  "57P03", // cannot_connect_now (starting up / shutting down)
  "53300", // too_many_connections (deploy overlap, brief saturation)
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
]);

export function isTransientConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") {
    if (TRANSIENT_ERRNO_CODES.has(code) || TRANSIENT_PG_CODES.has(code)) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : "";
  return TRANSIENT_MESSAGE_SNIPPETS.some((snippet) =>
    message.includes(snippet)
  );
}

export interface ConnectRetryOptions {
  /** Additional attempts after the first failure. 0 disables retrying. */
  retries: number;
  /** Backoff base; attempt n waits ~baseDelayMs * 2^n (+ jitter). */
  baseDelayMs: number;
  /** Upper bound for a single backoff delay. */
  maxDelayMs?: number;
  /** Invoked before each retry sleep — use for logging/metrics. */
  onRetry?: (info: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: Error;
  }) => void;
  /** Overridable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Overridable for tests; defaults to isTransientConnectionError. */
  isRetryable?: (error: unknown) => boolean;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `acquire` (an idempotent connection-acquisition function), retrying
 * transient failures with exponential backoff + full jitter.
 */
export async function connectWithRetry<T>(
  acquire: () => Promise<T>,
  options: ConnectRetryOptions
): Promise<T> {
  const {
    retries,
    baseDelayMs,
    maxDelayMs = 5_000,
    onRetry,
    sleep = defaultSleep,
    isRetryable = isTransientConnectionError,
  } = options;

  const maxAttempts = Math.max(0, retries) + 1;

  let attempt = 1;
  for (;;) {
    try {
      return await acquire();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const expDelay = baseDelayMs * 2 ** (attempt - 1);
      const cappedDelay = Math.min(Math.max(0, expDelay), maxDelayMs);
      // Full jitter: uniform in [cappedDelay/2, cappedDelay] to decorrelate
      // concurrent waiters without collapsing the backoff floor.
      const delayMs = Math.round(
        cappedDelay / 2 + Math.random() * (cappedDelay / 2)
      );

      onRetry?.({
        attempt,
        maxAttempts,
        delayMs,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      await sleep(delayMs);
      attempt++;
    }
  }
}

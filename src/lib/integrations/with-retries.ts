import { computeRetryDelayMs } from "@/lib/outbox-worker";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Represents an HTTP-like error with a status code, used to detect
 * rate-limit (429) responses and read Retry-After headers.
 */
export interface HttpLikeError {
  status?: number;
  headers?: { get?(name: string): string | null };
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 3000;

/**
 * Detects whether a response or error represents a 429 rate-limit response.
 */
export function isRateLimited(errorOrResponse: unknown): boolean {
  if (!errorOrResponse || typeof errorOrResponse !== "object") return false;
  const obj = errorOrResponse as HttpLikeError;
  return obj.status === 429;
}

/**
 * Extracts the Retry-After delay from a rate-limit response.
 * Supports both seconds (numeric) and HTTP-date formats.
 * Returns delay in milliseconds, or null if not present/parseable.
 */
export function parseRetryAfterMs(errorOrResponse: unknown): number | null {
  if (!errorOrResponse || typeof errorOrResponse !== "object") return null;
  const obj = errorOrResponse as HttpLikeError;

  const raw = obj.headers?.get?.("retry-after") ?? null;
  if (!raw) return null;

  // Numeric value = seconds
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }

  // HTTP-date value
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : null;
  }

  return null;
}

/**
 * Shared retry utility with rate-limit (429) awareness.
 *
 * On 429 responses, respects Retry-After header if present.
 * Otherwise uses exponential backoff with jitter (via computeRetryDelayMs).
 *
 * The `fn` callback may throw errors that carry `.status` and `.headers`
 * (e.g. from fetch response wrappers) — these are inspected for 429 handling.
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw error;
      }

      let waitMs: number;

      if (isRateLimited(error)) {
        // Respect Retry-After header if available, otherwise use a longer backoff
        const retryAfter = parseRetryAfterMs(error);
        waitMs = retryAfter ?? Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        console.warn(
          `[withRetries] rate-limited (429), waiting ${waitMs}ms before attempt ${attempt + 1}/${maxAttempts}`,
        );
      } else {
        waitMs = computeRetryDelayMs(attempt, { baseDelayMs, maxDelayMs });
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown retry failure");
}

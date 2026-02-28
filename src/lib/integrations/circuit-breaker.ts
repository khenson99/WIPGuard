/**
 * Circuit Breaker for Integration Providers
 *
 * Tracks consecutive failures per provider+user and opens the circuit after
 * a configurable threshold, preventing further attempts during an exponential
 * cooldown period. This avoids hammering failing providers and cascading
 * resource exhaustion.
 *
 * States:
 *  - CLOSED  – requests flow normally
 *  - OPEN    – requests are rejected immediately (cooldown active)
 *  - HALF_OPEN – one probe request is allowed through to test recovery
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Base cooldown in ms when the circuit first opens. Default: 30_000 (30s) */
  baseCooldownMs?: number;
  /** Maximum cooldown in ms after repeated openings. Default: 600_000 (10min) */
  maxCooldownMs?: number;
  /** Multiplier applied to cooldown on each successive open. Default: 2 */
  cooldownMultiplier?: number;
}

interface CircuitEntry {
  /** Number of consecutive failures since last success. */
  consecutiveFailures: number;
  /** Current circuit state. */
  state: CircuitState;
  /** Timestamp (ms) when the circuit was last opened. */
  openedAt: number | null;
  /** Current cooldown duration in ms (grows exponentially). */
  currentCooldownMs: number;
  /** How many times the circuit has opened (used for exponential backoff). */
  openCount: number;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  baseCooldownMs: 30_000,
  maxCooldownMs: 600_000,
  cooldownMultiplier: 2,
};

// ---------------------------------------------------------------------------
// Durable store (DB) + small in-memory cache
// ---------------------------------------------------------------------------

const cache = new Map<string, { entry: CircuitEntry; loadedAt: number }>();
const CACHE_TTL_MS = 10_000;

function cacheKey(provider: string, userId: string): string {
  return `${provider}:${userId}`;
}

function defaultEntry(): CircuitEntry {
  return {
    consecutiveFailures: 0,
    state: "CLOSED",
    openedAt: null,
    currentCooldownMs: 0,
    openCount: 0,
  };
}

function normalizeState(value: unknown): CircuitState {
  return value === "OPEN" || value === "HALF_OPEN" || value === "CLOSED" ? value : "CLOSED";
}

async function loadEntry(provider: string, userId: string): Promise<CircuitEntry> {
  const key = cacheKey(provider, userId);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt <= CACHE_TTL_MS) {
    return cached.entry;
  }

  const row = await prisma.integrationCircuitState.findUnique({
    where: { userId_key: { userId, key: provider } },
    select: {
      state: true,
      consecutiveFailures: true,
      openedAt: true,
      currentCooldownMs: true,
      openCount: true,
    },
  });

  const entry: CircuitEntry = row
    ? {
        consecutiveFailures: row.consecutiveFailures,
        state: normalizeState(row.state),
        openedAt: row.openedAt ? row.openedAt.getTime() : null,
        currentCooldownMs: row.currentCooldownMs,
        openCount: row.openCount,
      }
    : defaultEntry();

  cache.set(key, { entry, loadedAt: Date.now() });
  return entry;
}

async function saveEntry(provider: string, userId: string, entry: CircuitEntry): Promise<void> {
  await prisma.integrationCircuitState.upsert({
    where: { userId_key: { userId, key: provider } },
    create: {
      userId,
      key: provider,
      state: entry.state,
      consecutiveFailures: entry.consecutiveFailures,
      openedAt: entry.openedAt ? new Date(entry.openedAt) : null,
      currentCooldownMs: entry.currentCooldownMs,
      openCount: entry.openCount,
    },
    update: {
      state: entry.state,
      consecutiveFailures: entry.consecutiveFailures,
      openedAt: entry.openedAt ? new Date(entry.openedAt) : null,
      currentCooldownMs: entry.currentCooldownMs,
      openCount: entry.openCount,
    },
  });
  cache.set(cacheKey(provider, userId), { entry, loadedAt: Date.now() });
}

function resolvedOptions(opts?: CircuitBreakerOptions): Required<CircuitBreakerOptions> {
  return { ...DEFAULT_OPTIONS, ...opts };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if the circuit allows a request through.
 *
 * Returns `true` if the request should proceed, `false` if the circuit is
 * open and the caller should skip this sync cycle.
 *
 * When the cooldown has elapsed the circuit transitions to HALF_OPEN,
 * allowing a single probe request.
 */
export async function isCircuitClosed(
  provider: string,
  userId: string,
  opts?: CircuitBreakerOptions
): Promise<boolean> {
  const entry = await loadEntry(provider, userId);
  const options = resolvedOptions(opts);

  if (entry.state === "CLOSED") {
    return true;
  }

  if (entry.state === "HALF_OPEN") {
    // Already allowing a probe — let it through
    return true;
  }

  // State is OPEN — check if cooldown has elapsed
  const cooldownMs =
    entry.currentCooldownMs && entry.currentCooldownMs > 0
      ? entry.currentCooldownMs
      : options.baseCooldownMs;
  const elapsed = Date.now() - (entry.openedAt ?? 0);
  if (elapsed >= cooldownMs) {
    entry.state = "HALF_OPEN";
    entry.currentCooldownMs = cooldownMs;
    console.info("integration.circuit_breaker.half_open", {
      provider,
      userId,
      cooldownMs,
      openCount: entry.openCount,
    });
    await saveEntry(provider, userId, entry);
    return true;
  }

  // Still within cooldown
  return false;
}

/**
 * Record a successful request. Resets the circuit to CLOSED.
 */
export async function recordSuccess(provider: string, userId: string): Promise<void> {
  try {
    const entry = await loadEntry(provider, userId);

    if (entry.state !== "CLOSED" || entry.consecutiveFailures > 0) {
      console.info("integration.circuit_breaker.closed", {
        provider,
        userId,
        previousState: entry.state,
        previousFailures: entry.consecutiveFailures,
      });
    }

    entry.consecutiveFailures = 0;
    entry.state = "CLOSED";
    entry.openedAt = null;
    entry.currentCooldownMs = 0;
    entry.openCount = 0;
    await saveEntry(provider, userId, entry);
  } catch (err) {
    console.error("integration.circuit_breaker.recordSuccess failed", { provider, userId, err });
  }
}

/**
 * Record a failed request. If the failure threshold is reached, the circuit
 * opens with an exponential cooldown.
 */
export async function recordFailure(
  provider: string,
  userId: string,
  opts?: CircuitBreakerOptions
): Promise<void> {
  try {
    const entry = await loadEntry(provider, userId);
    const _opts = resolvedOptions(opts);

    entry.consecutiveFailures += 1;

    if (entry.consecutiveFailures >= _opts.failureThreshold && entry.state !== "OPEN") {
      entry.state = "OPEN";
      entry.openedAt = Date.now();
      entry.openCount += 1;

      // Exponential cooldown: base * multiplier^(openCount - 1), capped at max
      entry.currentCooldownMs = Math.min(
        _opts.baseCooldownMs * Math.pow(_opts.cooldownMultiplier, entry.openCount - 1),
        _opts.maxCooldownMs
      );

      console.warn("integration.circuit_breaker.opened", {
        provider,
        userId,
        consecutiveFailures: entry.consecutiveFailures,
        cooldownMs: entry.currentCooldownMs,
        openCount: entry.openCount,
      });
    }

    await saveEntry(provider, userId, entry);
  } catch (err) {
    console.error("integration.circuit_breaker.recordFailure failed", { provider, userId, err });
  }
}

/**
 * Get the current circuit state for observability.
 */
export function getCircuitState(provider: string, userId: string): CircuitState {
  const cached = cache.get(cacheKey(provider, userId));
  if (cached) return cached.entry.state;
  return "CLOSED";
}

/**
 * Error thrown when the circuit is open and the request is rejected.
 */
export class CircuitOpenError extends Error {
  public readonly provider: string;
  public readonly userId: string;
  public readonly state: CircuitState;

  constructor(provider: string, userId: string, state: CircuitState) {
    super(`Circuit breaker is ${state} for ${provider} (user ${userId})`);
    this.name = "CircuitOpenError";
    this.provider = provider;
    this.userId = userId;
    this.state = state;
  }
}

/**
 * Wrap an async function with circuit breaker guards.
 *
 * - If the circuit is open, throws `CircuitOpenError` immediately.
 * - On success, records success (resets circuit).
 * - On failure, records failure (may open circuit).
 */
export async function withCircuitBreaker<T>(
  provider: string,
  userId: string,
  fn: () => Promise<T>,
  opts?: CircuitBreakerOptions
): Promise<T> {
  if (!(await isCircuitClosed(provider, userId, opts))) {
    throw new CircuitOpenError(provider, userId, getCircuitState(provider, userId));
  }

  try {
    const result = await fn();
    await recordSuccess(provider, userId);
    return result;
  } catch (error) {
    await recordFailure(provider, userId, opts);
    throw error;
  }
}

/**
 * Reset a specific circuit (e.g., when a user reconnects an integration).
 */
export async function resetCircuit(provider: string, userId: string): Promise<void> {
  cache.delete(cacheKey(provider, userId));
  await prisma.integrationCircuitState.deleteMany({
    where: { userId, key: provider },
  });
}

/**
 * Reset all circuits (useful for testing).
 */
export async function resetAllCircuits(): Promise<void> {
  cache.clear();
  await prisma.integrationCircuitState.deleteMany({});
}

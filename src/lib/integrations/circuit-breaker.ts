/**
 * Circuit Breaker for Integration Providers
 *
 * Tracks consecutive failures per provider+user and opens the circuit after
 * a configurable threshold, preventing further attempts during an exponential
 * cooldown period. This avoids hammering failing providers and cascading
 * resource exhaustion.
 *
 * Architecture: synchronous in-memory Map for the hot path, with async
 * write-behind to the DB so state survives restarts / cold starts.
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
// In-memory cache + async DB persistence
// ---------------------------------------------------------------------------

const circuits = new Map<string, CircuitEntry>();

/** Keys that have been loaded from DB at least once this process lifetime. */
const hydrated = new Set<string>();

function circuitKey(provider: string, userId: string): string {
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
  return value === "OPEN" || value === "HALF_OPEN" || value === "CLOSED"
    ? value
    : "CLOSED";
}

/**
 * Get or create an in-memory entry. If this key hasn't been hydrated from DB
 * yet, kick off an async load (best-effort; the entry starts as CLOSED so
 * worst case we allow one extra probe before the DB state loads in).
 */
function getOrCreate(provider: string, userId: string): CircuitEntry {
  const key = circuitKey(provider, userId);
  let entry = circuits.get(key);
  if (!entry) {
    entry = defaultEntry();
    circuits.set(key, entry);
  }

  // Lazy-hydrate from DB on first access (non-blocking)
  if (!hydrated.has(key)) {
    hydrated.add(key);
    hydrateFromDb(provider, userId, key).catch((err) =>
      console.error("circuit_breaker.hydrate_failed", { provider, userId, err })
    );
  }

  return entry;
}

async function hydrateFromDb(
  provider: string,
  userId: string,
  key: string
): Promise<void> {
  const row = await prisma.integrationCircuitState.findUnique({
    where: { userId_key: { userId, key: provider } },
  });
  if (!row) return;

  const dbEntry: CircuitEntry = {
    consecutiveFailures: row.consecutiveFailures,
    state: normalizeState(row.state),
    openedAt: row.openedAt ? row.openedAt.getTime() : null,
    currentCooldownMs: row.currentCooldownMs,
    openCount: row.openCount,
  };

  // Only overwrite the in-memory entry if it's still in its default state
  // (no mutations happened between getOrCreate and this hydration completing)
  const current = circuits.get(key);
  if (
    current &&
    current.consecutiveFailures === 0 &&
    current.state === "CLOSED"
  ) {
    circuits.set(key, dbEntry);
  }
}

/**
 * Persist the current in-memory state to DB (fire-and-forget with logging).
 */
function persistToDb(
  provider: string,
  userId: string,
  entry: CircuitEntry
): void {
  prisma.integrationCircuitState
    .upsert({
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
    })
    .catch((err) =>
      console.error("circuit_breaker.persist_failed", {
        provider,
        userId,
        err,
      })
    );
}

function resolvedOptions(
  opts?: CircuitBreakerOptions
): Required<CircuitBreakerOptions> {
  return { ...DEFAULT_OPTIONS, ...opts };
}

// ---------------------------------------------------------------------------
// Public API (synchronous — operates on in-memory cache)
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
export function isCircuitClosed(
  provider: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _opts?: CircuitBreakerOptions
): boolean {
  const entry = getOrCreate(provider, userId);

  if (entry.state === "CLOSED") {
    return true;
  }

  if (entry.state === "HALF_OPEN") {
    // Already allowing a probe — let it through
    return true;
  }

  // State is OPEN — check if cooldown has elapsed
  const elapsed = Date.now() - (entry.openedAt ?? 0);
  if (elapsed >= entry.currentCooldownMs) {
    entry.state = "HALF_OPEN";
    console.info("integration.circuit_breaker.half_open", {
      provider,
      userId,
      cooldownMs: entry.currentCooldownMs,
      openCount: entry.openCount,
    });
    persistToDb(provider, userId, entry);
    return true;
  }

  // Still within cooldown
  return false;
}

/**
 * Record a successful request. Resets the circuit to CLOSED.
 */
export function recordSuccess(provider: string, userId: string): void {
  const entry = getOrCreate(provider, userId);

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

  persistToDb(provider, userId, entry);
}

/**
 * Record a failed request. If the failure threshold is reached, the circuit
 * opens with an exponential cooldown.
 */
export function recordFailure(
  provider: string,
  userId: string,
  opts?: CircuitBreakerOptions
): void {
  const entry = getOrCreate(provider, userId);
  const _opts = resolvedOptions(opts);

  entry.consecutiveFailures += 1;

  if (
    entry.consecutiveFailures >= _opts.failureThreshold &&
    entry.state !== "OPEN"
  ) {
    entry.state = "OPEN";
    entry.openedAt = Date.now();
    entry.openCount += 1;

    // Exponential cooldown: base * multiplier^(openCount - 1), capped at max
    entry.currentCooldownMs = Math.min(
      _opts.baseCooldownMs *
        Math.pow(_opts.cooldownMultiplier, entry.openCount - 1),
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

  persistToDb(provider, userId, entry);
}

/**
 * Get the current circuit state for observability.
 */
export function getCircuitState(
  provider: string,
  userId: string
): CircuitState {
  return getOrCreate(provider, userId).state;
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
  if (!isCircuitClosed(provider, userId, opts)) {
    throw new CircuitOpenError(
      provider,
      userId,
      getCircuitState(provider, userId)
    );
  }

  try {
    const result = await fn();
    recordSuccess(provider, userId);
    return result;
  } catch (error) {
    recordFailure(provider, userId, opts);
    throw error;
  }
}

/**
 * Reset a specific circuit (e.g., when a user reconnects an integration).
 */
export function resetCircuit(provider: string, userId: string): void {
  circuits.delete(circuitKey(provider, userId));
  hydrated.delete(circuitKey(provider, userId));
  prisma.integrationCircuitState
    .deleteMany({ where: { userId, key: provider } })
    .catch((err) =>
      console.error("circuit_breaker.reset_failed", {
        provider,
        userId,
        err,
      })
    );
}

/**
 * Reset all circuits (useful for testing).
 */
export function resetAllCircuits(): void {
  circuits.clear();
  hydrated.clear();
  prisma.integrationCircuitState
    .deleteMany({})
    .catch((err) =>
      console.error("circuit_breaker.reset_all_failed", { err })
    );
}

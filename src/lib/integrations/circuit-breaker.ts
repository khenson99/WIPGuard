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
const updateQueue = new Map<string, Promise<void>>();
const CACHE_TTL_MS = 2_000;

const CIRCUIT_ENTRY_SELECT = {
  state: true,
  consecutiveFailures: true,
  openedAt: true,
  currentCooldownMs: true,
  openCount: true,
} as const;

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

function cloneEntry(entry: CircuitEntry): CircuitEntry {
  return { ...entry };
}

function normalizeState(value: unknown): CircuitState {
  return value === "OPEN" || value === "HALF_OPEN" || value === "CLOSED" ? value : "CLOSED";
}

function toCircuitEntry(
  row: {
    state: string;
    consecutiveFailures: number;
    openedAt: Date | null;
    currentCooldownMs: number;
    openCount: number;
  } | null
): CircuitEntry {
  return row
    ? {
        consecutiveFailures: row.consecutiveFailures,
        state: normalizeState(row.state),
        openedAt: row.openedAt ? row.openedAt.getTime() : null,
        currentCooldownMs: row.currentCooldownMs,
        openCount: row.openCount,
      }
    : defaultEntry();
}

function setCachedEntry(provider: string, userId: string, entry: CircuitEntry): void {
  cache.set(cacheKey(provider, userId), {
    entry: cloneEntry(entry),
    loadedAt: Date.now(),
  });
}

async function loadEntry(provider: string, userId: string): Promise<CircuitEntry> {
  const key = cacheKey(provider, userId);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt <= CACHE_TTL_MS) {
    return cloneEntry(cached.entry);
  }

  const row = await prisma.integrationCircuitState.findUnique({
    where: { userId_key: { userId, key: provider } },
    select: CIRCUIT_ENTRY_SELECT,
  });

  const entry = toCircuitEntry(row);

  setCachedEntry(provider, userId, entry);
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
  setCachedEntry(provider, userId, entry);
}

function queueCircuitUpdate<T>(
  provider: string,
  userId: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = cacheKey(provider, userId);
  const previous = updateQueue.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  const queueEntry = next.then(() => undefined, () => undefined);
  updateQueue.set(key, queueEntry);

  return next.finally(() => {
    if (updateQueue.get(key) === queueEntry) {
      updateQueue.delete(key);
    }
  });
}

async function ensureCircuitRow(provider: string, userId: string): Promise<void> {
  const existing = await prisma.integrationCircuitState.findUnique({
    where: { userId_key: { userId, key: provider } },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.integrationCircuitState.create({
    data: {
      userId,
      key: provider,
      state: "CLOSED",
      consecutiveFailures: 0,
      openedAt: null,
      currentCooldownMs: 0,
      openCount: 0,
    },
  });
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
export function isCircuitClosed(
  provider: string,
  userId: string,
  opts?: CircuitBreakerOptions
): Promise<boolean> {
  return (async () => {
  const entry = await loadEntry(provider, userId);
  void resolvedOptions(opts);

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
    await saveEntry(provider, userId, entry);
    return true;
  }

  // Still within cooldown
  return false;
  })();
}

/**
 * Record a successful request. Resets the circuit to CLOSED.
 */
export async function recordSuccess(provider: string, userId: string): Promise<void> {
  try {
    await queueCircuitUpdate(provider, userId, async () => {
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
    });
  } catch (error) {
    console.error("integration.circuit_breaker.record_success_failed", {
      provider,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
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
    await queueCircuitUpdate(provider, userId, async () => {
      const _opts = resolvedOptions(opts);
      await ensureCircuitRow(provider, userId);

      const incrementedRow = await prisma.integrationCircuitState.update({
        where: { userId_key: { userId, key: provider } },
        data: {
          consecutiveFailures: { increment: 1 },
        },
        select: CIRCUIT_ENTRY_SELECT,
      });

      let entry = toCircuitEntry(incrementedRow);

      if (entry.consecutiveFailures >= _opts.failureThreshold && entry.state !== "OPEN") {
        const nextOpenCount = entry.openCount + 1;
        const openedAtMs = Date.now();
        const currentCooldownMs = Math.min(
          _opts.baseCooldownMs * Math.pow(_opts.cooldownMultiplier, nextOpenCount - 1),
          _opts.maxCooldownMs
        );

        const openedRow = await prisma.integrationCircuitState.update({
          where: { userId_key: { userId, key: provider } },
          data: {
            state: "OPEN",
            openedAt: new Date(openedAtMs),
            openCount: { increment: 1 },
            currentCooldownMs,
          },
          select: CIRCUIT_ENTRY_SELECT,
        });

        entry = toCircuitEntry(openedRow);

        console.warn("integration.circuit_breaker.opened", {
          provider,
          userId,
          consecutiveFailures: entry.consecutiveFailures,
          cooldownMs: entry.currentCooldownMs,
          openCount: entry.openCount,
        });
      }

      setCachedEntry(provider, userId, entry);
    });
  } catch (error) {
    console.error("integration.circuit_breaker.record_failure_failed", {
      provider,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
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

export interface CircuitSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  currentCooldownMs: number;
  openCount: number;
  openedAt: number | null;
  /** When the circuit will transition to HALF_OPEN (null if CLOSED or already past cooldown). */
  nextRetryAt: Date | null;
}

/**
 * Async read of the full circuit entry for observability endpoints.
 * Reads from DB to ensure accuracy (in-memory cache may be cold).
 */
export async function getCircuitSnapshot(
  provider: string,
  userId: string,
): Promise<CircuitSnapshot> {
  const entry = await loadEntry(provider, userId);

  let nextRetryAt: Date | null = null;
  if (entry.state === "OPEN" && entry.openedAt !== null) {
    const retryAtMs = entry.openedAt + entry.currentCooldownMs;
    if (retryAtMs > Date.now()) {
      nextRetryAt = new Date(retryAtMs);
    }
  }

  return {
    state: entry.state,
    consecutiveFailures: entry.consecutiveFailures,
    currentCooldownMs: entry.currentCooldownMs,
    openCount: entry.openCount,
    openedAt: entry.openedAt,
    nextRetryAt,
  };
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
export function resetCircuit(provider: string, userId: string): void {
  cache.delete(cacheKey(provider, userId));
  updateQueue.delete(cacheKey(provider, userId));
  void prisma.integrationCircuitState.deleteMany({
    where: { userId, key: provider },
  });
}

/**
 * Reset all circuits (useful for testing).
 */
export function resetAllCircuits(): void {
  cache.clear();
  updateQueue.clear();
  void prisma.integrationCircuitState.deleteMany({});
}

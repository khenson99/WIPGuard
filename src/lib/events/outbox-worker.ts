/**
 * Outbox Worker — Poll, dispatch, retry, dead-letter
 *
 * Pure functions implementing the outbox processing loop.
 * All database interactions are injected via client interfaces
 * so the worker logic is fully testable without infrastructure.
 *
 * @module events/outbox-worker
 */

import type {
  DomainEventType,
  EventHandler,
  HandlerRegistry,
  OutboxEvent,
  OutboxEventStatus,
} from "./outbox-types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WorkerConfig {
  /** Max events to fetch per poll cycle. Default: 50 */
  batchSize: number;
  /** Max retry attempts before dead-lettering. Default: 5 */
  maxRetries: number;
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseDelayMs: number;
  /** Maximum delay cap in ms. Default: 300_000 (5 min) */
  maxDelayMs: number;
  /** Jitter ratio (0-1) applied to delay. Default: 0.2 */
  jitterRatio: number;
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  batchSize: 50,
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 300_000,
  jitterRatio: 0.2,
};

// ---------------------------------------------------------------------------
// Injected database interface
// ---------------------------------------------------------------------------

export interface WorkerDbClient {
  outboxEvent: {
    findMany: (args: {
      where: {
        status: { in: OutboxEventStatus[] };
        nextAttemptAt: { lte: Date };
      };
      orderBy: Array<Record<string, "asc" | "desc">>;
      take: number;
    }) => Promise<OutboxEvent[]>;
    update: (args: {
      where: { id: string };
      data: Partial<OutboxEvent>;
    }) => Promise<OutboxEvent>;
  };
}

// ---------------------------------------------------------------------------
// Retry delay computation
// ---------------------------------------------------------------------------

/**
 * Compute jitter-adjusted exponential backoff delay.
 *
 * delay = min(baseDelayMs * 2^(retryCount - 1), maxDelayMs) * jitter
 */
export function computeRetryDelay(
  retryCount: number,
  config?: Partial<WorkerConfig>,
  random?: () => number
): number {
  const base = config?.baseDelayMs ?? DEFAULT_WORKER_CONFIG.baseDelayMs;
  const max = config?.maxDelayMs ?? DEFAULT_WORKER_CONFIG.maxDelayMs;
  const jitter = config?.jitterRatio ?? DEFAULT_WORKER_CONFIG.jitterRatio;
  const rng = random ?? Math.random;

  const exponential = Math.min(base * 2 ** Math.max(retryCount - 1, 0), max);
  const jitterMultiplier = 1 + (rng() * 2 - 1) * jitter;
  return Math.max(0, Math.min(Math.round(exponential * jitterMultiplier), max));
}

// ---------------------------------------------------------------------------
// Event polling
// ---------------------------------------------------------------------------

const RETRYABLE_STATUSES: OutboxEventStatus[] = ["PENDING", "FAILED"];

/**
 * Fetch the next batch of retryable events ordered by nextAttemptAt.
 */
export async function pollPendingEvents(
  db: WorkerDbClient,
  options?: { batchSize?: number; now?: Date }
): Promise<OutboxEvent[]> {
  const now = options?.now ?? new Date();
  const batchSize = options?.batchSize ?? DEFAULT_WORKER_CONFIG.batchSize;

  return db.outboxEvent.findMany({
    where: {
      status: { in: RETRYABLE_STATUSES },
      nextAttemptAt: { lte: now },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
  });
}

// ---------------------------------------------------------------------------
// Event status transitions
// ---------------------------------------------------------------------------

export async function markDispatched(
  db: WorkerDbClient,
  eventId: string,
  now = new Date()
): Promise<void> {
  await db.outboxEvent.update({
    where: { id: eventId },
    data: {
      status: "DISPATCHED",
      dispatchedAt: now,
      lastAttemptAt: now,
      failedAt: null,
      error: null,
    },
  });
}

export async function markFailed(
  db: WorkerDbClient,
  event: Pick<OutboxEvent, "id" | "retryCount">,
  errorMessage: string,
  config?: Partial<WorkerConfig>,
  options?: { now?: Date; random?: () => number }
): Promise<OutboxEventStatus> {
  const now = options?.now ?? new Date();
  const maxRetries = config?.maxRetries ?? DEFAULT_WORKER_CONFIG.maxRetries;
  const nextRetryCount = event.retryCount + 1;
  const exhausted = nextRetryCount >= maxRetries;
  const status: OutboxEventStatus = exhausted ? "DEAD_LETTER" : "FAILED";

  const nextAttemptAt = exhausted
    ? now
    : new Date(now.getTime() + computeRetryDelay(nextRetryCount, config, options?.random));

  await db.outboxEvent.update({
    where: { id: event.id },
    data: {
      status,
      retryCount: nextRetryCount,
      nextAttemptAt,
      lastAttemptAt: now,
      failedAt: now,
      error: errorMessage,
      dispatchedAt: null,
    },
  });

  return status;
}

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

/**
 * Create a mutable handler registry that maps event types to handler arrays.
 */
export function createHandlerRegistry(): HandlerRegistry {
  return {};
}

/**
 * Register a handler for a specific event type. Multiple handlers can be
 * registered for the same event type and will be invoked sequentially.
 */
export function registerHandler<T extends DomainEventType>(
  registry: HandlerRegistry,
  eventType: T,
  handler: EventHandler<T>
): void {
  if (!registry[eventType]) {
    (registry as Record<string, unknown>)[eventType] = [];
  }
  (registry[eventType] as EventHandler<T>[]).push(handler);
}

/**
 * Resolve handlers for a given event type from the registry.
 */
export function resolveHandlers(
  registry: HandlerRegistry,
  eventType: string
): EventHandler[] {
  return (registry[eventType as DomainEventType] as EventHandler[] | undefined) ?? [];
}

// ---------------------------------------------------------------------------
// Single event dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch a single event through all registered handlers.
 * If any handler throws, the error propagates to the caller.
 */
export async function dispatchEvent(
  registry: HandlerRegistry,
  event: OutboxEvent
): Promise<void> {
  const handlers = resolveHandlers(registry, event.eventType);

  if (handlers.length === 0) {
    // No handlers registered — still mark as dispatched (no-op event)
    return;
  }

  for (const handler of handlers) {
    await handler(event as OutboxEvent & { payload: never });
  }
}

// ---------------------------------------------------------------------------
// Batch dispatch
// ---------------------------------------------------------------------------

export interface DispatchBatchResult {
  attempted: number;
  dispatched: number;
  failed: number;
  deadLetter: number;
}

/**
 * Poll and process a batch of pending outbox events.
 *
 * For each event:
 * 1. Invoke all registered handlers
 * 2. On success -> mark DISPATCHED
 * 3. On failure -> increment retryCount, compute next attempt delay
 * 4. If retries exhausted -> mark DEAD_LETTER
 */
export async function processOutboxBatch(
  db: WorkerDbClient,
  registry: HandlerRegistry,
  config?: Partial<WorkerConfig>,
  options?: { now?: Date; random?: () => number }
): Promise<DispatchBatchResult> {
  const now = options?.now ?? new Date();
  const events = await pollPendingEvents(db, {
    batchSize: config?.batchSize,
    now,
  });

  let dispatched = 0;
  let failed = 0;
  let deadLetter = 0;

  for (const event of events) {
    try {
      await dispatchEvent(registry, event);
      await markDispatched(db, event.id, now);
      dispatched += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = await markFailed(db, event, message, config, {
        now,
        random: options?.random,
      });
      if (status === "DEAD_LETTER") {
        deadLetter += 1;
      } else {
        failed += 1;
      }
    }
  }

  return {
    attempted: events.length,
    dispatched,
    failed,
    deadLetter,
  };
}

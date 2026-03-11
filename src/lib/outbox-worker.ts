import type {
  OutboxEvent,
  OutboxEventStatus,
} from "@/generated/prisma/client";
import type { PrismaClientType } from "@/lib/prisma";

export const RETRYABLE_EVENT_STATUSES: OutboxEventStatus[] = [
  "PENDING",
  "FAILED",
];

export interface DispatchBatchOptions {
  batchSize?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  now?: Date;
  random?: () => number;
}

export interface ReplayOptions {
  eventIds?: string[];
  statuses?: Array<"FAILED" | "DEAD_LETTER">;
  limit?: number;
  now?: Date;
}

export interface OutboxOperationalMetrics {
  counts: {
    pending: number;
    failed: number;
    deadLetter: number;
    dispatched: number;
    total: number;
  };
  lag: {
    oldestRetryableEventAgeSeconds: number | null;
    oldestRetryableEventId: string | null;
  };
  failuresByEventType: Array<{ eventType: string; count: number }>;
  recentDeadLetters: Array<{
    id: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    retryCount: number;
    failedAt: string | null;
    error: string | null;
  }>;
}

type OutboxDelegate = PrismaClientType["outboxEvent"];

type OutboxClient = {
  outboxEvent: OutboxDelegate;
};

export type OutboxDispatcher = (event: OutboxEvent) => Promise<void>;

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 300000;
const DEFAULT_JITTER_RATIO = 0.2;

function computeJitterMultiplier(jitterRatio: number, random: () => number): number {
  const centered = random() * 2 - 1;
  return 1 + centered * jitterRatio;
}

export function computeRetryDelayMs(
  retryCount: number,
  options?: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
    random?: () => number;
  }
): number {
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = options?.jitterRatio ?? DEFAULT_JITTER_RATIO;
  const random = options?.random ?? Math.random;

  const exponentialDelay = Math.min(baseDelayMs * 2 ** Math.max(retryCount - 1, 0), maxDelayMs);
  const jitteredDelay = Math.round(exponentialDelay * computeJitterMultiplier(jitterRatio, random));
  return Math.max(0, Math.min(jitteredDelay, maxDelayMs));
}

export async function fetchRetryableOutboxEvents(
  db: OutboxClient,
  options?: Pick<DispatchBatchOptions, "batchSize" | "now">
): Promise<OutboxEvent[]> {
  const now = options?.now ?? new Date();
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

  return db.outboxEvent.findMany({
    where: {
      status: { in: [...RETRYABLE_EVENT_STATUSES] },
      nextAttemptAt: { lte: now },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: batchSize,
  });
}

export async function markOutboxEventDispatched(
  db: OutboxClient,
  eventId: string,
  now = new Date()
): Promise<void> {
  await db.outboxEvent.update({
    where: { id: eventId },
    data: {
      status: "DISPATCHED",
      dispatchedAt: now,
      failedAt: null,
      error: null,
      lastAttemptAt: now,
    },
  });
}

export async function markOutboxEventFailure(
  db: OutboxClient,
  event: Pick<OutboxEvent, "id" | "retryCount">,
  errorMessage: string,
  options?: Pick<DispatchBatchOptions, "maxRetries" | "baseDelayMs" | "maxDelayMs" | "jitterRatio" | "now" | "random">
): Promise<"FAILED" | "DEAD_LETTER"> {
  const now = options?.now ?? new Date();
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const nextRetryCount = event.retryCount + 1;
  const exhausted = nextRetryCount >= maxRetries;
  const status = exhausted ? "DEAD_LETTER" : "FAILED";
  const nextAttemptAt = exhausted
    ? now
    : new Date(
        now.getTime() +
          computeRetryDelayMs(nextRetryCount, {
            baseDelayMs: options?.baseDelayMs,
            maxDelayMs: options?.maxDelayMs,
            jitterRatio: options?.jitterRatio,
            random: options?.random,
          })
      );

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

export async function dispatchOutboxBatch(
  db: OutboxClient,
  dispatch: OutboxDispatcher,
  options?: DispatchBatchOptions
): Promise<{ attempted: number; dispatched: number; failed: number; deadLetter: number }> {
  const events = await fetchRetryableOutboxEvents(db, {
    batchSize: options?.batchSize,
    now: options?.now,
  });

  let dispatched = 0;
  let failed = 0;
  let deadLetter = 0;

  for (const event of events) {
    const startedAt = Date.now();
    console.info("outbox.event.dispatch_started", {
      eventId: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      retryCount: event.retryCount,
      status: event.status,
    });

    try {
      await dispatch(event);
      await markOutboxEventDispatched(db, event.id, options?.now ?? new Date());
      dispatched += 1;
      console.info("outbox.event.dispatch_succeeded", {
        eventId: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        dispatchDurationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = await markOutboxEventFailure(db, event, message, options);
      console.error("outbox.event.dispatch_failed", {
        eventId: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        retryCount: event.retryCount + 1,
        nextStatus: status,
        error: message,
        dispatchDurationMs: Date.now() - startedAt,
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

export async function replayOutboxEvents(
  db: OutboxClient,
  options?: ReplayOptions
): Promise<number> {
  const statuses: OutboxEventStatus[] = options?.statuses?.length
    ? options.statuses
    : ["FAILED", "DEAD_LETTER"];
  const now = options?.now ?? new Date();

  let eventIds = options?.eventIds?.filter(Boolean) ?? [];

  if (!eventIds.length) {
    const limit = options?.limit ?? 100;
    const replayableEvents = await db.outboxEvent.findMany({
      where: { status: { in: statuses } },
      orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { id: true },
    });
    eventIds = replayableEvents.map((event) => event.id);
  }

  if (!eventIds.length) {
    return 0;
  }

  const result = await db.outboxEvent.updateMany({
    where: {
      id: { in: eventIds },
      status: { in: statuses },
    },
    data: {
      status: "PENDING",
      retryCount: 0,
      nextAttemptAt: now,
      failedAt: null,
      error: null,
      lastAttemptAt: null,
    },
  });

  return result.count;
}

async function countByStatus(db: OutboxClient, status: OutboxEvent["status"]): Promise<number> {
  return db.outboxEvent.count({ where: { status } });
}

export async function getOutboxOperationalMetrics(
  db: OutboxClient,
  now = new Date()
): Promise<OutboxOperationalMetrics> {
  const [pending, failed, deadLetter, dispatched] = await Promise.all([
    countByStatus(db, "PENDING"),
    countByStatus(db, "FAILED"),
    countByStatus(db, "DEAD_LETTER"),
    countByStatus(db, "DISPATCHED"),
  ]);

  const oldestRetryableEvent = await db.outboxEvent.findFirst({
    where: { status: { in: [...RETRYABLE_EVENT_STATUSES] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true },
  });

  const failedAndDeadLetterEvents = await db.outboxEvent.findMany({
    where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
    select: { eventType: true },
    take: 1000,
  });

  const failuresByEventType = Array.from(
    failedAndDeadLetterEvents.reduce((map, event) => {
      const current = map.get(event.eventType) ?? 0;
      map.set(event.eventType, current + 1);
      return map;
    }, new Map<string, number>())
  )
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const recentDeadLetters = await db.outboxEvent.findMany({
    where: { status: "DEAD_LETTER" },
    orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: {
      id: true,
      eventType: true,
      aggregateType: true,
      aggregateId: true,
      retryCount: true,
      failedAt: true,
      error: true,
    },
  });

  return {
    counts: {
      pending,
      failed,
      deadLetter,
      dispatched,
      total: pending + failed + deadLetter + dispatched,
    },
    lag: {
      oldestRetryableEventAgeSeconds: oldestRetryableEvent
        ? Math.max(0, Math.floor((now.getTime() - oldestRetryableEvent.createdAt.getTime()) / 1000))
        : null,
      oldestRetryableEventId: oldestRetryableEvent?.id ?? null,
    },
    failuresByEventType,
    recentDeadLetters: recentDeadLetters.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      retryCount: event.retryCount,
      failedAt: event.failedAt?.toISOString() ?? null,
      error: event.error,
    })),
  };
}

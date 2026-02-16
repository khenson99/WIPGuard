/**
 * Event Metrics — Operational dashboard aggregation
 *
 * Pure aggregation functions for event lag, failure rates, and
 * dead-letter counts. All database access is injected so the
 * aggregation logic is testable without infrastructure.
 *
 * @module events/event-metrics
 */

import type { OutboxEvent, OutboxEventStatus } from "./outbox-types";

// ---------------------------------------------------------------------------
// Injected database interface
// ---------------------------------------------------------------------------

export interface MetricsDbClient {
  outboxEvent: {
    count: (args: { where: { status: OutboxEventStatus } }) => Promise<number>;
    findFirst: (args: {
      where: { status: { in: OutboxEventStatus[] } };
      orderBy: { createdAt: "asc" };
      select: { id: true; createdAt: true };
    }) => Promise<{ id: string; createdAt: Date } | null>;
    findMany: (args: {
      where: { status: { in: OutboxEventStatus[] } };
      select: Record<string, boolean>;
      take?: number;
      orderBy?: Array<Record<string, "asc" | "desc">>;
    }) => Promise<Array<Partial<OutboxEvent>>>;
  };
}

// ---------------------------------------------------------------------------
// Metrics output shape
// ---------------------------------------------------------------------------

export interface OutboxMetrics {
  counts: {
    pending: number;
    failed: number;
    deadLetter: number;
    dispatched: number;
    total: number;
  };
  lag: {
    oldestRetryableAgeSeconds: number | null;
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

// ---------------------------------------------------------------------------
// Pure aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Group an array of objects by a string property and count occurrences.
 * Returns sorted by count descending.
 */
export function countByProperty<T extends Record<string, unknown>>(
  items: T[],
  property: keyof T,
  maxResults = 10
): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();

  for (const item of items) {
    const value = String(item[property] ?? "unknown");
    map.set(value, (map.get(value) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxResults);
}

/**
 * Compute the age in seconds between a date and now.
 */
export function computeAgeSeconds(timestamp: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1000));
}

// ---------------------------------------------------------------------------
// Metrics collection
// ---------------------------------------------------------------------------

const RETRYABLE_STATUSES: OutboxEventStatus[] = ["PENDING", "FAILED"];
const FAILURE_STATUSES: OutboxEventStatus[] = ["FAILED", "DEAD_LETTER"];

/**
 * Collect operational metrics for the outbox event bus.
 */
export async function collectOutboxMetrics(
  db: MetricsDbClient,
  now = new Date()
): Promise<OutboxMetrics> {
  // Parallel status counts
  const [pending, failed, deadLetter, dispatched] = await Promise.all([
    db.outboxEvent.count({ where: { status: "PENDING" } }),
    db.outboxEvent.count({ where: { status: "FAILED" } }),
    db.outboxEvent.count({ where: { status: "DEAD_LETTER" } }),
    db.outboxEvent.count({ where: { status: "DISPATCHED" } }),
  ]);

  // Oldest retryable event for lag computation
  const oldestRetryable = await db.outboxEvent.findFirst({
    where: { status: { in: RETRYABLE_STATUSES } },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true },
  });

  // Failure distribution by event type
  const failedEvents = await db.outboxEvent.findMany({
    where: { status: { in: FAILURE_STATUSES } },
    select: { eventType: true },
    take: 1000,
  });

  const failuresByEventType = countByProperty(
    failedEvents as Array<{ eventType: string }>,
    "eventType"
  ).map(({ key, count }) => ({ eventType: key, count }));

  // Recent dead-letter events for investigation
  const recentDeadLetters = await db.outboxEvent.findMany({
    where: { status: { in: ["DEAD_LETTER"] } },
    orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      eventType: true,
      aggregateType: true,
      aggregateId: true,
      retryCount: true,
      failedAt: true,
      error: true,
    },
    take: 20,
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
      oldestRetryableAgeSeconds: oldestRetryable
        ? computeAgeSeconds(oldestRetryable.createdAt, now)
        : null,
      oldestRetryableEventId: oldestRetryable?.id ?? null,
    },
    failuresByEventType,
    recentDeadLetters: recentDeadLetters.map((e) => ({
      id: e.id as string,
      eventType: e.eventType as string,
      aggregateType: e.aggregateType as string,
      aggregateId: e.aggregateId as string,
      retryCount: e.retryCount as number,
      failedAt: e.failedAt instanceof Date ? e.failedAt.toISOString() : null,
      error: (e.error as string) ?? null,
    })),
  };
}

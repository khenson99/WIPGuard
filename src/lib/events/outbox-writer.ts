/**
 * Outbox Writer — Transactional event publishing
 *
 * Pure functions that write domain events to the outbox table.
 * All database interactions are injected via a client interface so
 * business logic is testable without a real database.
 *
 * @module events/outbox-writer
 */

import type {
  DomainEvent,
  DomainEventType,
  OutboxEvent,
  OutboxWriteInput,
} from "./outbox-types";
import { generateIdempotencyKey } from "./idempotency";

// ---------------------------------------------------------------------------
// Injected database interface
// ---------------------------------------------------------------------------

export interface OutboxWriteClient {
  outboxEvent: {
    upsert: (args: {
      where: { idempotencyKey: string };
      update: Record<string, never>;
      create: {
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        schemaVersion: number;
        payload: unknown;
        idempotencyKey: string;
        status: "PENDING";
        retryCount: 0;
        nextAttemptAt: Date;
      };
    }) => Promise<OutboxEvent>;
    findUnique: (args: {
      where: { idempotencyKey: string };
    }) => Promise<OutboxEvent | null>;
  };
}

// ---------------------------------------------------------------------------
// Core writer
// ---------------------------------------------------------------------------

/**
 * Enqueue a single outbox event using upsert for idempotency.
 * The upsert ensures that duplicate idempotency keys are safely ignored.
 */
export async function writeOutboxEvent(
  db: OutboxWriteClient,
  input: OutboxWriteInput,
  options?: { now?: Date }
): Promise<OutboxEvent> {
  const now = options?.now ?? new Date();

  return db.outboxEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      schemaVersion: input.schemaVersion ?? 1,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      status: "PENDING",
      retryCount: 0,
      nextAttemptAt: now,
    },
  });
}

/**
 * Check whether an event with the given idempotency key already exists.
 * Returns the existing event or null.
 */
export async function findExistingEvent(
  db: OutboxWriteClient,
  idempotencyKey: string
): Promise<OutboxEvent | null> {
  return db.outboxEvent.findUnique({
    where: { idempotencyKey },
  });
}

// ---------------------------------------------------------------------------
// Typed domain event writer
// ---------------------------------------------------------------------------

/**
 * Publish a typed domain event to the outbox. The idempotency key is
 * generated from the event payload using SHA-256 hashing.
 */
export async function publishTypedDomainEvent<T extends DomainEventType>(
  db: OutboxWriteClient,
  event: Extract<DomainEvent, { eventType: T }> & { aggregateId: string },
  options?: { now?: Date; schemaVersion?: number; idempotencyKey?: string }
): Promise<OutboxEvent> {
  const idempotencyKey =
    options?.idempotencyKey ??
    generateIdempotencyKey({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as Record<string, unknown>,
    });

  return writeOutboxEvent(db, {
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload as Record<string, unknown>,
    idempotencyKey,
    schemaVersion: options?.schemaVersion,
  }, { now: options?.now });
}

// ---------------------------------------------------------------------------
// Batch writer
// ---------------------------------------------------------------------------

export interface BatchWriteResult {
  written: number;
  duplicates: number;
  events: OutboxEvent[];
}

/**
 * Write multiple events in a single pass. Each event is upserted
 * independently so duplicates are safely skipped.
 */
export async function writeOutboxEventBatch(
  db: OutboxWriteClient,
  inputs: OutboxWriteInput[],
  options?: { now?: Date }
): Promise<BatchWriteResult> {
  const events: OutboxEvent[] = [];
  let duplicates = 0;

  for (const input of inputs) {
    const existing = await findExistingEvent(db, input.idempotencyKey);
    if (existing) {
      duplicates += 1;
      events.push(existing);
      continue;
    }

    const event = await writeOutboxEvent(db, input, options);
    events.push(event);
  }

  return {
    written: inputs.length - duplicates,
    duplicates,
    events,
  };
}

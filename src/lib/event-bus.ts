import type { OutboxEvent, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface DomainEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  idempotencyKey: string;
  schemaVersion?: number;
}

type OutboxEventWriteClient = Pick<Prisma.TransactionClient, "outboxEvent">;

function normalizeIdempotencyPart(value: string): string {
  return value.trim().toLowerCase();
}

export function buildOutboxIdempotencyKey(input: {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  ruleVariant?: string;
}): string {
  const parts = [
    normalizeIdempotencyPart(input.aggregateType),
    normalizeIdempotencyPart(input.aggregateId),
    normalizeIdempotencyPart(input.eventType),
  ];

  if (input.ruleVariant) {
    parts.push(normalizeIdempotencyPart(input.ruleVariant));
  }

  return parts.join(":");
}

export async function enqueueOutboxEvent(
  db: OutboxEventWriteClient,
  input: DomainEventInput
): Promise<OutboxEvent> {
  const event = await db.outboxEvent.upsert({
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
      nextAttemptAt: new Date(),
    },
  });

  console.info("outbox.event.enqueued", {
    eventId: event.id,
    eventType: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    idempotencyKey: event.idempotencyKey,
    status: event.status,
  });

  return event;
}

export async function publishDomainEvent(
  input: DomainEventInput,
  tx?: OutboxEventWriteClient
): Promise<OutboxEvent> {
  if (tx) {
    return enqueueOutboxEvent(tx, input);
  }

  return prisma.$transaction((transaction) => enqueueOutboxEvent(transaction, input));
}

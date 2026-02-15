import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOutboxIdempotencyKey,
  enqueueOutboxEvent,
  publishDomainEvent,
} from "@/lib/event-bus";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe("event-bus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds canonical idempotency keys", () => {
    const key = buildOutboxIdempotencyKey({
      aggregateType: " Task ",
      aggregateId: "ABC-123",
      eventType: " Status.Changed ",
      ruleVariant: " default ",
    });

    expect(key).toBe("task:abc-123:status.changed:default");
  });

  it("upserts outbox events by idempotency key", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "evt_1" });
    const db = {
      outboxEvent: {
        upsert,
      },
    } as unknown as Parameters<typeof enqueueOutboxEvent>[0];

    await enqueueOutboxEvent(db, {
      eventType: "task.status.changed",
      aggregateType: "task",
      aggregateId: "task_1",
      payload: { to: "ACTIVE" },
      idempotencyKey: "task:task_1:task.status.changed",
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: "task:task_1:task.status.changed" },
      update: {},
      create: {
        eventType: "task.status.changed",
        aggregateType: "task",
        aggregateId: "task_1",
        schemaVersion: 1,
        payload: { to: "ACTIVE" },
        idempotencyKey: "task:task_1:task.status.changed",
        status: "PENDING",
        retryCount: 0,
        nextAttemptAt: expect.any(Date),
      },
    });
  });

  it("publishes inside a prisma transaction when no tx is provided", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "evt_2" });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({ outboxEvent: { upsert } } as never)
    );

    await publishDomainEvent({
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task_2",
      payload: { title: "Test" },
      idempotencyKey: "task:task_2:task.created",
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
import type {
  OutboxEvent,
} from "@/lib/events/outbox-types";
import { DOMAIN_EVENT_TYPES } from "@/lib/events/outbox-types";

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------
import {
  writeOutboxEvent,
  writeOutboxEventBatch,
  findExistingEvent,
  publishTypedDomainEvent,
} from "@/lib/events/outbox-writer";

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
import {
  computeRetryDelay,
  pollPendingEvents,
  markDispatched,
  markFailed,
  createHandlerRegistry,
  registerHandler,
  resolveHandlers,
  dispatchEvent,
  processOutboxBatch,
  DEFAULT_WORKER_CONFIG,
} from "@/lib/events/outbox-worker";

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------
import {
  generateIdempotencyKey,
  canonicalize,
  isValidIdempotencyKey,
  checkDuplicate,
  replayEvents,
} from "@/lib/events/idempotency";

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
import {
  collectOutboxMetrics,
  countByProperty,
  computeAgeSeconds,
} from "@/lib/events/event-metrics";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeOutboxEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: "evt_1",
    eventType: "task.created",
    aggregateType: "task",
    aggregateId: "task_1",
    schemaVersion: 1,
    payload: { taskId: "task_1", title: "Test", projectId: null, assigneeId: null, priority: null, createdBy: "user_1" },
    idempotencyKey: "task:task.created:sha256:abc123",
    status: "PENDING",
    retryCount: 0,
    nextAttemptAt: new Date("2026-02-15T00:00:00Z"),
    lastAttemptAt: null,
    dispatchedAt: null,
    failedAt: null,
    error: null,
    createdAt: new Date("2026-02-15T00:00:00Z"),
    updatedAt: new Date("2026-02-15T00:00:00Z"),
    ...overrides,
  };
}

function makeWriteClient(overrides: Record<string, unknown> = {}) {
  return {
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue(makeOutboxEvent()),
      findUnique: vi.fn().mockResolvedValue(null),
      ...overrides,
    },
  };
}

function makeWorkerClient(overrides: Record<string, unknown> = {}) {
  return {
    outboxEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(makeOutboxEvent()),
      ...overrides,
    },
  };
}

// ============================================================================
// TYPES
// ============================================================================

describe("outbox-types", () => {
  it("exports all expected domain event types", () => {
    expect(DOMAIN_EVENT_TYPES).toContain("task.created");
    expect(DOMAIN_EVENT_TYPES).toContain("task.moved");
    expect(DOMAIN_EVENT_TYPES).toContain("task.assigned");
    expect(DOMAIN_EVENT_TYPES).toContain("sprint.started");
    expect(DOMAIN_EVENT_TYPES).toContain("sprint.completed");
    expect(DOMAIN_EVENT_TYPES).toContain("integration.sync");
    expect(DOMAIN_EVENT_TYPES).toHaveLength(11);
  });
});

// ============================================================================
// WRITER
// ============================================================================

describe("outbox-writer", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("writeOutboxEvent", () => {
    it("upserts event by idempotency key", async () => {
      const db = makeWriteClient();
      const now = new Date("2026-02-15T00:00:00Z");

      await writeOutboxEvent(db, {
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "task_1",
        payload: { title: "New task" },
        idempotencyKey: "task:task.created:sha256:abc",
      }, { now });

      expect(db.outboxEvent.upsert).toHaveBeenCalledWith({
        where: { idempotencyKey: "task:task.created:sha256:abc" },
        update: {},
        create: {
          eventType: "task.created",
          aggregateType: "task",
          aggregateId: "task_1",
          schemaVersion: 1,
          payload: { title: "New task" },
          idempotencyKey: "task:task.created:sha256:abc",
          status: "PENDING",
          retryCount: 0,
          nextAttemptAt: now,
        },
      });
    });

    it("respects custom schema version", async () => {
      const db = makeWriteClient();

      await writeOutboxEvent(db, {
        eventType: "task.moved",
        aggregateType: "task",
        aggregateId: "task_1",
        payload: { fromColumn: "TODO", toColumn: "DOING" },
        idempotencyKey: "key_1",
        schemaVersion: 2,
      });

      expect(db.outboxEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ schemaVersion: 2 }),
        })
      );
    });
  });

  describe("findExistingEvent", () => {
    it("returns null when no event exists", async () => {
      const db = makeWriteClient();
      const result = await findExistingEvent(db, "nonexistent");
      expect(result).toBeNull();
    });

    it("returns existing event when found", async () => {
      const existing = makeOutboxEvent();
      const db = makeWriteClient({
        findUnique: vi.fn().mockResolvedValue(existing),
      });

      const result = await findExistingEvent(db, existing.idempotencyKey);
      expect(result).toBe(existing);
    });
  });

  describe("publishTypedDomainEvent", () => {
    it("generates idempotency key from payload and writes event", async () => {
      const db = makeWriteClient();

      await publishTypedDomainEvent(db, {
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "task_99",
        payload: { taskId: "task_99", title: "Auto", projectId: null, assigneeId: null, priority: null, createdBy: "u1" },
      });

      expect(db.outboxEvent.upsert).toHaveBeenCalledTimes(1);
      const call = db.outboxEvent.upsert.mock.calls[0][0];
      expect(call.create.idempotencyKey).toMatch(/^task:task\.created:sha256:[a-f0-9]{64}$/);
      expect(call.create.eventType).toBe("task.created");
      expect(call.create.aggregateId).toBe("task_99");
    });

    it("uses provided idempotency key when given", async () => {
      const db = makeWriteClient();

      await publishTypedDomainEvent(
        db,
        {
          eventType: "task.moved",
          aggregateType: "task",
          aggregateId: "task_1",
          payload: { taskId: "task_1", fromColumn: "TODO", toColumn: "DOING", movedBy: "u1" },
        },
        { idempotencyKey: "custom-key-123" }
      );

      const call = db.outboxEvent.upsert.mock.calls[0][0];
      expect(call.where.idempotencyKey).toBe("custom-key-123");
    });
  });

  describe("writeOutboxEventBatch", () => {
    it("writes multiple events and counts duplicates", async () => {
      const existingEvent = makeOutboxEvent({ id: "dup_1", idempotencyKey: "key_dup" });

      const db = makeWriteClient({
        findUnique: vi.fn().mockImplementation(async (args: { where: { idempotencyKey: string } }) => {
          return args.where.idempotencyKey === "key_dup" ? existingEvent : null;
        }),
        upsert: vi.fn().mockImplementation(async (args: { create: Partial<OutboxEvent> }) =>
          makeOutboxEvent({ idempotencyKey: args.create.idempotencyKey as string })
        ),
      });

      const result = await writeOutboxEventBatch(db, [
        { eventType: "task.created", aggregateType: "task", aggregateId: "t1", payload: {}, idempotencyKey: "key_1" },
        { eventType: "task.created", aggregateType: "task", aggregateId: "t2", payload: {}, idempotencyKey: "key_dup" },
        { eventType: "task.moved", aggregateType: "task", aggregateId: "t3", payload: {}, idempotencyKey: "key_3" },
      ]);

      expect(result.written).toBe(2);
      expect(result.duplicates).toBe(1);
      expect(result.events).toHaveLength(3);
    });
  });
});

// ============================================================================
// WORKER
// ============================================================================

describe("outbox-worker", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("computeRetryDelay", () => {
    it("computes exponential delay with deterministic jitter", () => {
      const delay = computeRetryDelay(3, {
        baseDelayMs: 1000,
        maxDelayMs: 60000,
        jitterRatio: 0.2,
      }, () => 0.5);

      // 1000 * 2^2 = 4000, jitter multiplier = 1 + (0.5*2-1)*0.2 = 1.0
      expect(delay).toBe(4000);
    });

    it("caps delay at maxDelayMs", () => {
      const delay = computeRetryDelay(20, {
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        jitterRatio: 0,
      }, () => 0.5);

      expect(delay).toBeLessThanOrEqual(5000);
    });

    it("returns non-negative values", () => {
      const delay = computeRetryDelay(0, {
        baseDelayMs: 1000,
        jitterRatio: 0.5,
      }, () => 0.0);

      expect(delay).toBeGreaterThanOrEqual(0);
    });

    it("uses default config when none provided", () => {
      const delay = computeRetryDelay(1, undefined, () => 0.5);
      expect(delay).toBe(DEFAULT_WORKER_CONFIG.baseDelayMs);
    });
  });

  describe("pollPendingEvents", () => {
    it("fetches retryable events that are due", async () => {
      const events = [makeOutboxEvent(), makeOutboxEvent({ id: "evt_2" })];
      const db = makeWorkerClient({
        findMany: vi.fn().mockResolvedValue(events),
      });
      const now = new Date("2026-02-15T00:00:00Z");

      const result = await pollPendingEvents(db, { batchSize: 10, now });

      expect(result).toHaveLength(2);
      expect(db.outboxEvent.findMany).toHaveBeenCalledWith({
        where: {
          status: { in: ["PENDING", "FAILED"] },
          nextAttemptAt: { lte: now },
        },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        take: 10,
      });
    });

    it("uses default batch size when not specified", async () => {
      const db = makeWorkerClient();
      await pollPendingEvents(db);

      expect(db.outboxEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: DEFAULT_WORKER_CONFIG.batchSize })
      );
    });
  });

  describe("markDispatched", () => {
    it("updates event to DISPATCHED status", async () => {
      const db = makeWorkerClient();
      const now = new Date("2026-02-15T01:00:00Z");

      await markDispatched(db, "evt_1", now);

      expect(db.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: "evt_1" },
        data: {
          status: "DISPATCHED",
          dispatchedAt: now,
          lastAttemptAt: now,
          failedAt: null,
          error: null,
        },
      });
    });
  });

  describe("markFailed", () => {
    it("marks event as FAILED when retries remain", async () => {
      const db = makeWorkerClient();
      const now = new Date("2026-02-15T00:00:00Z");

      const status = await markFailed(
        db,
        { id: "evt_1", retryCount: 1 },
        "connection timeout",
        { maxRetries: 5 },
        { now, random: () => 0.5 }
      );

      expect(status).toBe("FAILED");
      expect(db.outboxEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            retryCount: 2,
            error: "connection timeout",
          }),
        })
      );
    });

    it("marks event as DEAD_LETTER when retries exhausted", async () => {
      const db = makeWorkerClient();
      const now = new Date("2026-02-15T00:00:00Z");

      const status = await markFailed(
        db,
        { id: "evt_1", retryCount: 4 },
        "permanent failure",
        { maxRetries: 5 },
        { now }
      );

      expect(status).toBe("DEAD_LETTER");
      expect(db.outboxEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "DEAD_LETTER",
            retryCount: 5,
          }),
        })
      );
    });

    it("sets nextAttemptAt in the future for retryable failures", async () => {
      const db = makeWorkerClient();
      const now = new Date("2026-02-15T00:00:00Z");

      await markFailed(
        db,
        { id: "evt_1", retryCount: 0 },
        "transient error",
        { maxRetries: 5, baseDelayMs: 1000, jitterRatio: 0 },
        { now, random: () => 0.5 }
      );

      const updateCall = db.outboxEvent.update.mock.calls[0][0];
      const nextAttempt = updateCall.data.nextAttemptAt as Date;
      expect(nextAttempt.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe("handler registry", () => {
    it("creates an empty registry", () => {
      const registry = createHandlerRegistry();
      expect(Object.keys(registry)).toHaveLength(0);
    });

    it("registers and resolves handlers for event types", () => {
      const registry = createHandlerRegistry();
      const handler = vi.fn();

      registerHandler(registry, "task.created", handler);

      const resolved = resolveHandlers(registry, "task.created");
      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toBe(handler);
    });

    it("supports multiple handlers per event type", () => {
      const registry = createHandlerRegistry();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      registerHandler(registry, "task.moved", handler1);
      registerHandler(registry, "task.moved", handler2);

      expect(resolveHandlers(registry, "task.moved")).toHaveLength(2);
    });

    it("returns empty array for unregistered event types", () => {
      const registry = createHandlerRegistry();
      expect(resolveHandlers(registry, "task.deleted")).toHaveLength(0);
    });
  });

  describe("dispatchEvent", () => {
    it("calls all registered handlers sequentially", async () => {
      const registry = createHandlerRegistry();
      const callOrder: number[] = [];

      registerHandler(registry, "task.created", async () => {
        callOrder.push(1);
      });
      registerHandler(registry, "task.created", async () => {
        callOrder.push(2);
      });

      await dispatchEvent(registry, makeOutboxEvent());

      expect(callOrder).toEqual([1, 2]);
    });

    it("succeeds silently when no handlers registered", async () => {
      const registry = createHandlerRegistry();
      await expect(dispatchEvent(registry, makeOutboxEvent())).resolves.toBeUndefined();
    });

    it("propagates handler errors", async () => {
      const registry = createHandlerRegistry();
      registerHandler(registry, "task.created", async () => {
        throw new Error("handler failure");
      });

      await expect(dispatchEvent(registry, makeOutboxEvent())).rejects.toThrow("handler failure");
    });
  });

  describe("processOutboxBatch", () => {
    it("dispatches events and marks them as DISPATCHED", async () => {
      const events = [makeOutboxEvent({ id: "ok_1" }), makeOutboxEvent({ id: "ok_2" })];
      const db = makeWorkerClient({
        findMany: vi.fn().mockResolvedValue(events),
      });

      const registry = createHandlerRegistry();
      registerHandler(registry, "task.created", vi.fn());

      const now = new Date("2026-02-15T00:00:00Z");
      const result = await processOutboxBatch(db, registry, {}, { now });

      expect(result).toEqual({
        attempted: 2,
        dispatched: 2,
        failed: 0,
        deadLetter: 0,
      });
      expect(db.outboxEvent.update).toHaveBeenCalledTimes(2);
    });

    it("handles mixed success and failure", async () => {
      const events = [
        makeOutboxEvent({ id: "ok_1" }),
        makeOutboxEvent({ id: "fail_1" }),
      ];
      const db = makeWorkerClient({
        findMany: vi.fn().mockResolvedValue(events),
      });

      const registry = createHandlerRegistry();
      registerHandler(registry, "task.created", async (event) => {
        if (event.id === "fail_1") throw new Error("boom");
      });

      const now = new Date("2026-02-15T00:00:00Z");
      const result = await processOutboxBatch(
        db,
        registry,
        { maxRetries: 3 },
        { now, random: () => 0.5 }
      );

      expect(result.attempted).toBe(2);
      expect(result.dispatched).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.deadLetter).toBe(0);
    });

    it("dead-letters events that exceed max retries", async () => {
      const events = [
        makeOutboxEvent({ id: "exhaust_1", retryCount: 4 }),
      ];
      const db = makeWorkerClient({
        findMany: vi.fn().mockResolvedValue(events),
      });

      const registry = createHandlerRegistry();
      registerHandler(registry, "task.created", async () => {
        throw new Error("always fails");
      });

      const now = new Date("2026-02-15T00:00:00Z");
      const result = await processOutboxBatch(
        db,
        registry,
        { maxRetries: 5 },
        { now }
      );

      expect(result.deadLetter).toBe(1);
      expect(result.failed).toBe(0);
    });

    it("returns zero counts when no events are pending", async () => {
      const db = makeWorkerClient();
      const registry = createHandlerRegistry();

      const result = await processOutboxBatch(db, registry);

      expect(result).toEqual({
        attempted: 0,
        dispatched: 0,
        failed: 0,
        deadLetter: 0,
      });
    });
  });
});

// ============================================================================
// IDEMPOTENCY
// ============================================================================

describe("idempotency", () => {
  describe("canonicalize", () => {
    it("produces deterministic JSON with sorted keys", () => {
      const a = canonicalize({
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "t1",
        payload: { z: 1, a: 2 },
      });
      const b = canonicalize({
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "t1",
        payload: { a: 2, z: 1 },
      });

      expect(a).toBe(b);
    });

    it("handles nested objects with sorted keys", () => {
      const result = canonicalize({
        eventType: "task.updated",
        aggregateType: "task",
        aggregateId: "t1",
        payload: { changes: { z: 1, a: 2 }, updatedBy: "u1" },
      });

      const parsed = JSON.parse(result);
      const payloadKeys = Object.keys(parsed.payload);
      expect(payloadKeys).toEqual(["changes", "updatedBy"]);

      const changeKeys = Object.keys(parsed.payload.changes);
      expect(changeKeys).toEqual(["a", "z"]);
    });
  });

  describe("generateIdempotencyKey", () => {
    it("generates a prefixed SHA-256 key", () => {
      const key = generateIdempotencyKey({
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "task_1",
        payload: { title: "Test" },
      });

      expect(key).toMatch(/^task:task\.created:sha256:[a-f0-9]{64}$/);
    });

    it("produces the same key for identical inputs", () => {
      const input = {
        eventType: "task.moved",
        aggregateType: "task",
        aggregateId: "t1",
        payload: { from: "TODO", to: "DOING" },
      };

      const key1 = generateIdempotencyKey(input);
      const key2 = generateIdempotencyKey(input);

      expect(key1).toBe(key2);
    });

    it("produces different keys for different payloads", () => {
      const base = {
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "task_1",
      };

      const key1 = generateIdempotencyKey({ ...base, payload: { title: "A" } });
      const key2 = generateIdempotencyKey({ ...base, payload: { title: "B" } });

      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different aggregate IDs", () => {
      const base = {
        eventType: "task.created",
        aggregateType: "task",
        payload: { title: "Same" },
      };

      const key1 = generateIdempotencyKey({ ...base, aggregateId: "t1" });
      const key2 = generateIdempotencyKey({ ...base, aggregateId: "t2" });

      expect(key1).not.toBe(key2);
    });
  });

  describe("isValidIdempotencyKey", () => {
    it("validates well-formed keys", () => {
      const key = generateIdempotencyKey({
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "t1",
        payload: {},
      });
      expect(isValidIdempotencyKey(key)).toBe(true);
    });

    it("rejects keys without sha256 prefix", () => {
      expect(isValidIdempotencyKey("task:task.created:md5:abc")).toBe(false);
    });

    it("rejects keys with wrong hash length", () => {
      expect(isValidIdempotencyKey("task:task.created:sha256:abc")).toBe(false);
    });

    it("rejects keys with too few parts", () => {
      expect(isValidIdempotencyKey("task:sha256")).toBe(false);
    });
  });

  describe("checkDuplicate", () => {
    it("returns isDuplicate=false when no event exists", async () => {
      const db = {
        outboxEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await checkDuplicate(db, "key_1");

      expect(result.isDuplicate).toBe(false);
      expect(result.existingEvent).toBeNull();
    });

    it("returns isDuplicate=true with existing event", async () => {
      const existing = makeOutboxEvent();
      const db = {
        outboxEvent: {
          findUnique: vi.fn().mockResolvedValue(existing),
        },
      };

      const result = await checkDuplicate(db, existing.idempotencyKey);

      expect(result.isDuplicate).toBe(true);
      expect(result.existingEvent).toBe(existing);
    });
  });

  describe("replayEvents", () => {
    it("replays failed events by resetting to PENDING", async () => {
      const db = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([{ id: "evt_1" }, { id: "evt_2" }]),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      const now = new Date("2026-02-15T00:00:00Z");
      const result = await replayEvents(db, { limit: 10, now });

      expect(result.replayed).toBe(2);
      expect(result.eventIds).toEqual(["evt_1", "evt_2"]);
      expect(db.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["evt_1", "evt_2"] },
          status: { in: ["FAILED", "DEAD_LETTER"] },
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
    });

    it("replays specific event IDs when provided", async () => {
      const db = {
        outboxEvent: {
          findMany: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const result = await replayEvents(db, {
        eventIds: ["evt_specific"],
        now: new Date("2026-02-15T00:00:00Z"),
      });

      expect(result.replayed).toBe(1);
      // findMany should NOT be called when eventIds are provided
      expect(db.outboxEvent.findMany).not.toHaveBeenCalled();
    });

    it("returns zero when no events match", async () => {
      const db = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn(),
        },
      };

      const result = await replayEvents(db);

      expect(result.replayed).toBe(0);
      expect(result.eventIds).toEqual([]);
      expect(db.outboxEvent.updateMany).not.toHaveBeenCalled();
    });

    it("filters by custom statuses", async () => {
      const db = {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([{ id: "dead_1" }]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      await replayEvents(db, { statuses: ["DEAD_LETTER"] });

      expect(db.outboxEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { in: ["DEAD_LETTER"] } },
        })
      );
    });
  });
});

// ============================================================================
// METRICS
// ============================================================================

describe("event-metrics", () => {
  describe("countByProperty", () => {
    it("groups and counts by property value", () => {
      const items = [
        { eventType: "task.created" },
        { eventType: "task.created" },
        { eventType: "task.moved" },
        { eventType: "sprint.started" },
      ];

      const result = countByProperty(items, "eventType");

      expect(result).toEqual([
        { key: "task.created", count: 2 },
        { key: "task.moved", count: 1 },
        { key: "sprint.started", count: 1 },
      ]);
    });

    it("respects maxResults limit", () => {
      const items = Array.from({ length: 20 }, (_, i) => ({ type: `type_${i}` }));
      const result = countByProperty(items, "type", 5);
      expect(result).toHaveLength(5);
    });

    it("handles empty arrays", () => {
      expect(countByProperty([], "key")).toEqual([]);
    });
  });

  describe("computeAgeSeconds", () => {
    it("computes age in seconds", () => {
      const timestamp = new Date("2026-02-15T00:00:00Z");
      const now = new Date("2026-02-15T00:01:00Z");

      expect(computeAgeSeconds(timestamp, now)).toBe(60);
    });

    it("returns 0 for future timestamps", () => {
      const timestamp = new Date("2026-02-16T00:00:00Z");
      const now = new Date("2026-02-15T00:00:00Z");

      expect(computeAgeSeconds(timestamp, now)).toBe(0);
    });
  });

  describe("collectOutboxMetrics", () => {
    it("collects comprehensive metrics from the database", async () => {
      const count = vi.fn()
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(3)  // failed
        .mockResolvedValueOnce(1)  // deadLetter
        .mockResolvedValueOnce(20); // dispatched

      const findFirst = vi.fn().mockResolvedValue({
        id: "oldest_1",
        createdAt: new Date("2026-02-14T23:50:00Z"),
      });

      const findMany = vi.fn()
        .mockResolvedValueOnce([
          { eventType: "task.created" },
          { eventType: "task.created" },
          { eventType: "task.moved" },
        ])
        .mockResolvedValueOnce([
          {
            id: "dead_1",
            eventType: "task.created",
            aggregateType: "task",
            aggregateId: "task_1",
            retryCount: 5,
            failedAt: new Date("2026-02-15T00:00:00Z"),
            error: "timeout",
          },
        ]);

      const db = {
        outboxEvent: { count, findFirst, findMany },
      };

      const now = new Date("2026-02-15T00:00:00Z");
      const metrics = await collectOutboxMetrics(db, now);

      expect(metrics.counts).toEqual({
        pending: 5,
        failed: 3,
        deadLetter: 1,
        dispatched: 20,
        total: 29,
      });

      expect(metrics.lag.oldestRetryableEventId).toBe("oldest_1");
      expect(metrics.lag.oldestRetryableAgeSeconds).toBe(600); // 10 minutes

      expect(metrics.failuresByEventType).toEqual([
        { eventType: "task.created", count: 2 },
        { eventType: "task.moved", count: 1 },
      ]);

      expect(metrics.recentDeadLetters).toHaveLength(1);
      expect(metrics.recentDeadLetters[0]).toEqual({
        id: "dead_1",
        eventType: "task.created",
        aggregateType: "task",
        aggregateId: "task_1",
        retryCount: 5,
        failedAt: "2026-02-15T00:00:00.000Z",
        error: "timeout",
      });
    });

    it("handles empty database gracefully", async () => {
      const db = {
        outboxEvent: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      const metrics = await collectOutboxMetrics(db);

      expect(metrics.counts.total).toBe(0);
      expect(metrics.lag.oldestRetryableAgeSeconds).toBeNull();
      expect(metrics.lag.oldestRetryableEventId).toBeNull();
      expect(metrics.failuresByEventType).toEqual([]);
      expect(metrics.recentDeadLetters).toEqual([]);
    });
  });
});

// ============================================================================
// INTEGRATION: Full flow test
// ============================================================================

describe("outbox event bus — full flow", () => {
  it("write -> poll -> dispatch -> mark dispatched", async () => {
    // Step 1: Write event
    const writtenEvent = makeOutboxEvent({ id: "flow_1" });
    const writeDb = makeWriteClient({
      upsert: vi.fn().mockResolvedValue(writtenEvent),
    });

    const event = await writeOutboxEvent(writeDb, {
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "task_1",
      payload: { title: "Flow test" },
      idempotencyKey: "flow:test:key",
    });
    expect(event.status).toBe("PENDING");

    // Step 2: Poll and dispatch
    const workerDb = makeWorkerClient({
      findMany: vi.fn().mockResolvedValue([writtenEvent]),
    });

    const registry = createHandlerRegistry();
    const handler = vi.fn();
    registerHandler(registry, "task.created", handler);

    const now = new Date("2026-02-15T00:00:00Z");
    const result = await processOutboxBatch(workerDb, registry, {}, { now });

    expect(handler).toHaveBeenCalledWith(writtenEvent);
    expect(result.dispatched).toBe(1);
    expect(workerDb.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DISPATCHED" }),
      })
    );
  });

  it("write -> fail -> retry -> dead-letter flow", async () => {
    // Event at retry count 4 (one away from dead-letter with maxRetries=5)
    const failingEvent = makeOutboxEvent({
      id: "fail_flow",
      retryCount: 4,
      status: "FAILED",
    });

    const workerDb = makeWorkerClient({
      findMany: vi.fn().mockResolvedValue([failingEvent]),
    });

    const registry = createHandlerRegistry();
    registerHandler(registry, "task.created", async () => {
      throw new Error("service unavailable");
    });

    const now = new Date("2026-02-15T00:00:00Z");
    const result = await processOutboxBatch(
      workerDb,
      registry,
      { maxRetries: 5 },
      { now }
    );

    expect(result.deadLetter).toBe(1);
    expect(result.failed).toBe(0);
    expect(workerDb.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DEAD_LETTER",
          retryCount: 5,
          error: "service unavailable",
        }),
      })
    );
  });

  it("idempotency prevents duplicate writes", async () => {
    const payload = { taskId: "t1", title: "Test", projectId: null, assigneeId: null, priority: null, createdBy: "u1" };
    const key = generateIdempotencyKey({
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t1",
      payload,
    });

    // First write succeeds
    const db1 = makeWriteClient();
    await writeOutboxEvent(db1, {
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t1",
      payload,
      idempotencyKey: key,
    });
    expect(db1.outboxEvent.upsert).toHaveBeenCalledTimes(1);

    // Second write with same key: upsert's update:{} means it's a no-op
    const db2 = makeWriteClient();
    await writeOutboxEvent(db2, {
      eventType: "task.created",
      aggregateType: "task",
      aggregateId: "t1",
      payload,
      idempotencyKey: key,
    });
    expect(db2.outboxEvent.upsert).toHaveBeenCalledTimes(1);
    // The upsert update:{} ensures no data mutation on duplicate
    expect(db2.outboxEvent.upsert.mock.calls[0][0].update).toEqual({});
  });
});

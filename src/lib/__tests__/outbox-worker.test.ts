import { describe, expect, it, vi } from "vitest";
import {
  computeRetryDelayMs,
  deadLetterOutboxEvents,
  dispatchOutboxBatch,
  getOutboxOperationalMetrics,
  markOutboxEventFailure,
  replayOutboxEvents,
} from "@/lib/outbox-worker";

describe("outbox-worker", () => {
  it("computes exponential retry delay with deterministic jitter", () => {
    const delay = computeRetryDelayMs(3, {
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      jitterRatio: 0.2,
      random: () => 0.5,
    });

    expect(delay).toBe(4000);
  });

  it("marks events as dead-letter after max retries", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = {
      outboxEvent: {
        update,
      },
    } as never;

    const status = await markOutboxEventFailure(
      db,
      { id: "evt_1", retryCount: 4 },
      "dispatcher unavailable",
      {
        maxRetries: 5,
        now: new Date("2026-02-15T00:00:00.000Z"),
      }
    );

    expect(status).toBe("DEAD_LETTER");
    expect(update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: {
        status: "DEAD_LETTER",
        retryCount: 5,
        nextAttemptAt: new Date("2026-02-15T00:00:00.000Z"),
        lastAttemptAt: new Date("2026-02-15T00:00:00.000Z"),
        failedAt: new Date("2026-02-15T00:00:00.000Z"),
        error: "dispatcher unavailable",
        dispatchedAt: null,
      },
    });
  });

  it("dispatches retryable events and updates outcomes", async () => {
    const update = vi.fn().mockResolvedValue({});
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "evt_ok",
        status: "PENDING",
        retryCount: 0,
        nextAttemptAt: new Date("2026-02-15T00:00:00.000Z"),
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
      },
      {
        id: "evt_fail",
        status: "FAILED",
        retryCount: 0,
        nextAttemptAt: new Date("2026-02-15T00:00:00.000Z"),
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
      },
    ]);

    const db = {
      outboxEvent: {
        findMany,
        update,
      },
    } as never;

    const dispatch = vi.fn().mockImplementation(async (event: { id: string }) => {
      if (event.id === "evt_fail") {
        throw new Error("boom");
      }
    });

    const now = new Date("2026-02-15T00:00:00.000Z");

    const result = await dispatchOutboxBatch(db, dispatch, {
      now,
      maxRetries: 3,
      jitterRatio: 0,
      random: () => 0.5,
    });

    expect(result).toEqual({
      attempted: 2,
      dispatched: 1,
      failed: 1,
      deadLetter: 0,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("replays failed/dead-letter events by status", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "evt_1" }, { id: "evt_2" }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });

    const db = {
      outboxEvent: {
        findMany,
        updateMany,
      },
    } as never;

    const replayed = await replayOutboxEvents(db, {
      limit: 2,
      now: new Date("2026-02-15T00:00:00.000Z"),
    });

    expect(replayed).toBe(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
      orderBy: [{ failedAt: "desc" }, { createdAt: "desc" }],
      take: 2,
      select: { id: true },
    });
  });

  it("manually dead-letters retryable events with a reason", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const db = {
      outboxEvent: {
        updateMany,
      },
    } as never;
    const now = new Date("2026-02-15T00:00:00.000Z");

    const deadLettered = await deadLetterOutboxEvents(db, {
      eventIds: ["evt_1", "evt_2", "evt_1"],
      reason: "manual queue unblock",
      now,
    });

    expect(deadLettered).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["evt_1", "evt_2"] },
        status: { in: ["PENDING", "FAILED"] },
      },
      data: {
        status: "DEAD_LETTER",
        nextAttemptAt: now,
        failedAt: now,
        lastAttemptAt: now,
        dispatchedAt: null,
        error: "manual queue unblock",
      },
    });
  });

  it("returns operational metrics for dashboards", async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(10);

    const findFirst = vi.fn().mockResolvedValue({
      id: "evt_oldest",
      createdAt: new Date("2026-02-14T23:59:00.000Z"),
    });

    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { eventType: "metric.refreshed" },
        { eventType: "metric.refreshed" },
        { eventType: "metric.updated" },
      ])
      .mockResolvedValueOnce([
        {
          id: "dead_1",
          eventType: "metric.refreshed",
          aggregateType: "metric",
          aggregateId: "metric_1",
          retryCount: 5,
          failedAt: new Date("2026-02-15T00:00:00.000Z"),
          error: "timeout",
        },
      ]);

    const db = {
      outboxEvent: {
        count,
        findFirst,
        findMany,
      },
    } as never;

    const metrics = await getOutboxOperationalMetrics(
      db,
      new Date("2026-02-15T00:00:00.000Z")
    );

    expect(metrics.counts).toEqual({
      pending: 3,
      failed: 2,
      deadLetter: 1,
      dispatched: 10,
      total: 16,
    });
    expect(metrics.lag.oldestRetryableEventId).toBe("evt_oldest");
    expect(metrics.failuresByEventType).toEqual([
      { eventType: "metric.refreshed", count: 2 },
      { eventType: "metric.updated", count: 1 },
    ]);
    expect(metrics.recentDeadLetters).toHaveLength(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { pruneOutboxEvents } from "@/lib/events/outbox-retention";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * prisma.$executeRaw`...` invokes the mock as a tagged template:
 * (strings, ...boundValues).
 */
type SqlCall = [TemplateStringsArray, ...unknown[]];

function sqlTextOf(call: SqlCall): string {
  return call[0].join(" ¶ ");
}

function boundValuesOf(call: SqlCall): unknown[] {
  return call.slice(1);
}

function createPrismaMock(input: { dispatchedCounts: number[]; deadLetterCounts: number[] }) {
  const dispatched = [...input.dispatchedCounts];
  const deadLetter = [...input.deadLetterCounts];
  const $executeRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join(" ");
    if (sql.includes("DEAD_LETTER")) return deadLetter.shift() ?? 0;
    return dispatched.shift() ?? 0;
  });
  return { $executeRaw };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pruneOutboxEvents", () => {
  it("deletes terminal events with status-specific cutoffs and never touches the retry queue", async () => {
    const prisma = createPrismaMock({ dispatchedCounts: [3], deadLetterCounts: [1] });

    const result = await pruneOutboxEvents({ prisma: prisma as never, now: NOW });

    expect(result).toEqual({
      deletedDispatched: 3,
      deletedDeadLetter: 1,
      batches: 2,
      dispatchedCutoff: new Date(NOW.getTime() - 14 * DAY_MS).toISOString(),
      deadLetterCutoff: new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
      completed: true,
      durationMs: expect.any(Number),
    });

    const [dispatchedCall, deadLetterCall] = prisma.$executeRaw.mock.calls as SqlCall[];

    const dispatchedSql = sqlTextOf(dispatchedCall);
    expect(dispatchedSql).toContain('DELETE FROM "OutboxEvent"');
    expect(dispatchedSql).toContain(`"status" = 'DISPATCHED'`);
    // dispatchedAt is authoritative for terminal success; createdAt is only a
    // fallback for rows that never recorded it.
    expect(dispatchedSql).toContain('COALESCE("dispatchedAt", "createdAt")');
    expect(dispatchedSql).toContain("LIMIT");
    expect(boundValuesOf(dispatchedCall)).toEqual([
      new Date(NOW.getTime() - 14 * DAY_MS),
      10_000,
    ]);

    const deadLetterSql = sqlTextOf(deadLetterCall);
    expect(deadLetterSql).toContain(`"status" = 'DEAD_LETTER'`);
    expect(deadLetterSql).toContain('"createdAt" <');
    expect(boundValuesOf(deadLetterCall)).toEqual([
      new Date(NOW.getTime() - 30 * DAY_MS),
      10_000,
    ]);

    // PENDING and FAILED are the live retry queue (pollPendingEvents) — they
    // must never appear in a retention DELETE.
    for (const sql of [dispatchedSql, deadLetterSql]) {
      expect(sql).not.toContain("PENDING");
      expect(sql).not.toContain("'FAILED'");
    }
  });

  it("loops in bounded batches until each backlog drains", async () => {
    const prisma = createPrismaMock({
      dispatchedCounts: [2, 2, 1],
      deadLetterCounts: [2, 0],
    });

    const result = await pruneOutboxEvents({
      prisma: prisma as never,
      now: NOW,
      batchSize: 2,
    });

    expect(result.deletedDispatched).toBe(5);
    expect(result.deletedDeadLetter).toBe(2);
    expect(result.batches).toBe(5);
    expect(result.completed).toBe(true);
  });

  it("stops at the time budget and leaves the dead-letter phase for the next cycle", async () => {
    const ticks = [0, 10, 200, 250];
    const clock = vi.fn(() => (ticks.length > 1 ? (ticks.shift() as number) : ticks[0]));
    const prisma = createPrismaMock({
      // A full batch means the dispatched backlog is not yet drained when the
      // budget expires.
      dispatchedCounts: [2],
      deadLetterCounts: [99],
    });

    const result = await pruneOutboxEvents({
      prisma: prisma as never,
      now: NOW,
      batchSize: 2,
      budgetMs: 100,
      clock,
    });

    expect(result.completed).toBe(false);
    expect(result.deletedDispatched).toBe(2);
    expect(result.deletedDeadLetter).toBe(0);
    expect(result.batches).toBe(1);
    expect(result.durationMs).toBe(250);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("reads retention windows from env when no overrides are provided", async () => {
    vi.stubEnv("OUTBOX_DISPATCHED_RETENTION_DAYS", "2");
    vi.stubEnv("OUTBOX_DEAD_LETTER_RETENTION_DAYS", "4");
    const prisma = createPrismaMock({ dispatchedCounts: [0], deadLetterCounts: [0] });

    const result = await pruneOutboxEvents({ prisma: prisma as never, now: NOW });

    expect(result.dispatchedCutoff).toBe(new Date(NOW.getTime() - 2 * DAY_MS).toISOString());
    expect(result.deadLetterCutoff).toBe(new Date(NOW.getTime() - 4 * DAY_MS).toISOString());
  });

  it("honors explicit retention overrides over env", async () => {
    vi.stubEnv("OUTBOX_DISPATCHED_RETENTION_DAYS", "2");
    const prisma = createPrismaMock({ dispatchedCounts: [0], deadLetterCounts: [0] });

    const result = await pruneOutboxEvents({
      prisma: prisma as never,
      now: NOW,
      dispatchedRetentionDays: 7,
      deadLetterRetentionDays: 9,
    });

    expect(result.dispatchedCutoff).toBe(new Date(NOW.getTime() - 7 * DAY_MS).toISOString());
    expect(result.deadLetterCutoff).toBe(new Date(NOW.getTime() - 9 * DAY_MS).toISOString());
  });
});

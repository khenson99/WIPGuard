import { afterEach, describe, expect, it, vi } from "vitest";
import { pruneImladrisRawSourceRecords } from "@/lib/imladris/raw-source-retention";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 365;

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

function createPrismaMock(deleteCounts: number[]) {
  const counts = [...deleteCounts];
  return {
    $executeRaw: vi.fn(async () => counts.shift() ?? 0),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pruneImladrisRawSourceRecords", () => {
  it("completes immediately when nothing is left to prune", async () => {
    const prisma = createPrismaMock([0]);

    const result = await pruneImladrisRawSourceRecords({
      prisma: prisma as never,
      now: NOW,
    });

    expect(result).toEqual({
      deletedRows: 0,
      batches: 1,
      cutoff: new Date(NOW.getTime() - DEFAULT_RETENTION_DAYS * DAY_MS).toISOString(),
      completed: true,
      durationMs: expect.any(Number),
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("only deletes old, lineage-free raw records (updatedAt, not createdAt)", async () => {
    const prisma = createPrismaMock([0]);

    await pruneImladrisRawSourceRecords({ prisma: prisma as never, now: NOW });

    const call = prisma.$executeRaw.mock.calls[0] as unknown as SqlCall;
    const sql = sqlTextOf(call);
    expect(sql).toContain('DELETE FROM "ImladrisRawSourceRecord"');
    // Prune column is updatedAt: it refreshes on every in-place upsert, so it is
    // always >= the row's source timestamps. createdAt is fixed at first insert
    // and would wrongly delete re-synced, reader-visible rows.
    expect(sql).toContain('r."updatedAt" <');
    expect(sql).not.toContain('"createdAt"');
    // Rows still referenced by metric-value lineage are untouchable: keeps the
    // SetNull FK action from firing (DELETEs stay LIMIT-bounded) and protects
    // raw records whose provenance a current metric still points at.
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain(
      'FROM "ImladrisMetricLineage" l WHERE l."rawRecordId" = r."id"',
    );
    expect(sql).toContain("LIMIT");
    // Bound values, in order: cutoff, batch size.
    expect(boundValuesOf(call)).toEqual([
      new Date(NOW.getTime() - DEFAULT_RETENTION_DAYS * DAY_MS),
      10_000,
    ]);
  });

  it("loops in bounded batches until the backlog drains", async () => {
    const prisma = createPrismaMock([2, 2, 1]);

    const result = await pruneImladrisRawSourceRecords({
      prisma: prisma as never,
      now: NOW,
      batchSize: 2,
    });

    expect(result.deletedRows).toBe(5);
    expect(result.batches).toBe(3);
    expect(result.completed).toBe(true);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("stops at the time budget and reports an incomplete pass", async () => {
    const ticks = [0, 10, 200, 250];
    const clock = vi.fn(() => (ticks.length > 1 ? (ticks.shift() as number) : ticks[0]));
    // A full batch means more rows remain when the budget expires.
    const prisma = createPrismaMock([2]);

    const result = await pruneImladrisRawSourceRecords({
      prisma: prisma as never,
      now: NOW,
      batchSize: 2,
      budgetMs: 100,
      clock,
    });

    expect(result.completed).toBe(false);
    expect(result.deletedRows).toBe(2);
    expect(result.batches).toBe(1);
    expect(result.durationMs).toBe(250);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("defaults the retention window to 365 days (>= the 180d longest reader window)", async () => {
    const prisma = createPrismaMock([0]);

    const result = await pruneImladrisRawSourceRecords({
      prisma: prisma as never,
      now: NOW,
    });

    expect(result.cutoff).toBe(
      new Date(NOW.getTime() - 365 * DAY_MS).toISOString(),
    );
  });

  it("honors an explicit retentionDays override", async () => {
    const prisma = createPrismaMock([0]);

    const result = await pruneImladrisRawSourceRecords({
      prisma: prisma as never,
      now: NOW,
      retentionDays: 200,
    });

    expect(result.cutoff).toBe(new Date(NOW.getTime() - 200 * DAY_MS).toISOString());
  });

  it("reads IMLADRIS_RAW_SOURCE_RETENTION_DAYS when no override is provided", async () => {
    vi.stubEnv("IMLADRIS_RAW_SOURCE_RETENTION_DAYS", "400");
    const prisma = createPrismaMock([0]);

    const result = await pruneImladrisRawSourceRecords({
      prisma: prisma as never,
      now: NOW,
    });

    expect(result.cutoff).toBe(new Date(NOW.getTime() - 400 * DAY_MS).toISOString());
    const call = prisma.$executeRaw.mock.calls[0] as unknown as SqlCall;
    expect(boundValuesOf(call)).toContainEqual(new Date(NOW.getTime() - 400 * DAY_MS));
  });
});

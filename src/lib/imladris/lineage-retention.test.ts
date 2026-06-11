import { afterEach, describe, expect, it, vi } from "vitest";
import { pruneImladrisMetricLineage } from "@/lib/imladris/lineage-retention";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * prisma.$queryRaw`...` / prisma.$executeRaw`...` invoke the mock as a tagged
 * template: (strings, ...boundValues).
 */
type SqlCall = [TemplateStringsArray, ...unknown[]];

function sqlTextOf(call: SqlCall): string {
  return call[0].join(" ¶ ");
}

function boundValuesOf(call: SqlCall): unknown[] {
  return call.slice(1);
}

function createPrismaMock(input: {
  candidateBatches: Array<Array<{ id: string }>>;
  deleteCounts: number[];
}) {
  const candidateBatches = [...input.candidateBatches];
  const deleteCounts = [...input.deleteCounts];
  return {
    $queryRaw: vi.fn(async () => candidateBatches.shift() ?? []),
    $executeRaw: vi.fn(async () => deleteCounts.shift() ?? 0),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pruneImladrisMetricLineage", () => {
  it("completes immediately when no superseded lineage remains", async () => {
    const prisma = createPrismaMock({ candidateBatches: [[]], deleteCounts: [] });

    const result = await pruneImladrisMetricLineage({
      prisma: prisma as never,
      now: NOW,
    });

    expect(result).toEqual({
      deletedRows: 0,
      prunedMetricValues: 0,
      batches: 0,
      cutoff: new Date(NOW.getTime() - 14 * DAY_MS).toISOString(),
      completed: true,
      durationMs: expect.any(Number),
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("only targets superseded, reader-invisible-by-now metric values that still carry lineage", async () => {
    const prisma = createPrismaMock({ candidateBatches: [[]], deleteCounts: [] });

    await pruneImladrisMetricLineage({ prisma: prisma as never, now: NOW });

    const call = prisma.$queryRaw.mock.calls[0] as unknown as SqlCall;
    const sql = sqlTextOf(call);
    // The latest reader-visible value per scope group keeps its lineage…
    expect(sql).toContain('DISTINCT ON ("organizationId", "userId", "metricKey")');
    expect(sql).toContain('ORDER BY "organizationId", "userId", "metricKey", "periodEnd" DESC, "computedAt" DESC');
    expect(sql).toContain('NOT IN (SELECT "id" FROM latest)');
    // …and already-pruned values drop out of future scans.
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('LIMIT');
    // Bound values, in order: latest-CTE visibility guards (periodEnd <= now,
    // computedAt <= now), retention cutoff, candidate visibility guard
    // (periodEnd <= now), id batch size.
    expect(boundValuesOf(call)).toEqual([
      NOW,
      NOW,
      new Date(NOW.getTime() - 14 * DAY_MS),
      NOW,
      200,
    ]);
  });

  it("drains each id batch with bounded DELETE statements and keeps scanning until empty", async () => {
    const prisma = createPrismaMock({
      // First scan finds two superseded values; the rescan finds nothing left.
      candidateBatches: [[{ id: "mv_old_1" }, { id: "mv_old_2" }], []],
      // Two full delete batches, then a short batch signals the ids are drained.
      deleteCounts: [2, 2, 1],
    });

    const result = await pruneImladrisMetricLineage({
      prisma: prisma as never,
      now: NOW,
      rowBatchSize: 2,
    });

    expect(result.deletedRows).toBe(5);
    expect(result.prunedMetricValues).toBe(2);
    expect(result.batches).toBe(3);
    expect(result.completed).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    for (const rawCall of prisma.$executeRaw.mock.calls) {
      const call = rawCall as unknown as SqlCall;
      const sql = sqlTextOf(call);
      expect(sql).toContain('DELETE FROM "ImladrisMetricLineage"');
      // Every statement is LIMIT-bounded via the id subquery — the safety
      // property that keeps locks/WAL flat on the multi-GB backlog.
      expect(sql).toContain('LIMIT');
      expect(sql).toContain('"metricValueId" = ANY');
      expect(boundValuesOf(call)).toEqual([["mv_old_1", "mv_old_2"], 2]);
    }
  });

  it("stops at the time budget mid-backlog and reports an incomplete pass", async () => {
    const ticks = [0, 10, 200, 250];
    const clock = vi.fn(() => (ticks.length > 1 ? (ticks.shift() as number) : ticks[0]));
    const prisma = createPrismaMock({
      candidateBatches: [[{ id: "mv_old_1" }]],
      // A full batch means more rows remain for this id when the budget hits.
      deleteCounts: [2],
    });

    const result = await pruneImladrisMetricLineage({
      prisma: prisma as never,
      now: NOW,
      rowBatchSize: 2,
      budgetMs: 100,
      clock,
    });

    expect(result.completed).toBe(false);
    expect(result.deletedRows).toBe(2);
    expect(result.batches).toBe(1);
    expect(result.durationMs).toBe(250);
    // No further scans once the budget is spent — the next sync cycle resumes.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("does no work at all when the budget is already exhausted", async () => {
    const ticks = [0, 100];
    const clock = vi.fn(() => (ticks.length > 1 ? (ticks.shift() as number) : ticks[0]));
    const prisma = createPrismaMock({
      candidateBatches: [[{ id: "mv_old_1" }]],
      deleteCounts: [1],
    });

    const result = await pruneImladrisMetricLineage({
      prisma: prisma as never,
      now: NOW,
      budgetMs: 50,
      clock,
    });

    expect(result.completed).toBe(false);
    expect(result.deletedRows).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("honors an explicit retentionDays override", async () => {
    const prisma = createPrismaMock({ candidateBatches: [[]], deleteCounts: [] });

    const result = await pruneImladrisMetricLineage({
      prisma: prisma as never,
      now: NOW,
      retentionDays: 3,
    });

    expect(result.cutoff).toBe(new Date(NOW.getTime() - 3 * DAY_MS).toISOString());
  });

  it("reads IMLADRIS_LINEAGE_RETENTION_DAYS when no override is provided", async () => {
    vi.stubEnv("IMLADRIS_LINEAGE_RETENTION_DAYS", "5");
    const prisma = createPrismaMock({ candidateBatches: [[]], deleteCounts: [] });

    const result = await pruneImladrisMetricLineage({
      prisma: prisma as never,
      now: NOW,
    });

    expect(result.cutoff).toBe(new Date(NOW.getTime() - 5 * DAY_MS).toISOString());
    const call = prisma.$queryRaw.mock.calls[0] as unknown as SqlCall;
    expect(boundValuesOf(call)).toContainEqual(new Date(NOW.getTime() - 5 * DAY_MS));
  });

  it("falls back to the default retention when the env value is invalid", async () => {
    vi.stubEnv("IMLADRIS_LINEAGE_RETENTION_DAYS", "not-a-number");
    const prisma = createPrismaMock({ candidateBatches: [[]], deleteCounts: [] });

    const result = await pruneImladrisMetricLineage({
      prisma: prisma as never,
      now: NOW,
    });

    expect(result.cutoff).toBe(new Date(NOW.getTime() - 14 * DAY_MS).toISOString());
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { pruneImladrisMetricValues } from "@/lib/imladris/metric-value-retention";

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

function createPrismaMock(deleteCounts: number[]) {
  const counts = [...deleteCounts];
  return {
    $executeRaw: vi.fn(async () => counts.shift() ?? 0),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pruneImladrisMetricValues", () => {
  it("completes immediately when nothing is left to thin", async () => {
    const prisma = createPrismaMock([0]);

    const result = await pruneImladrisMetricValues({
      prisma: prisma as never,
      now: NOW,
    });

    expect(result).toEqual({
      deletedRows: 0,
      batches: 1,
      cutoff: new Date(NOW.getTime() - 14 * DAY_MS).toISOString(),
      completed: true,
      durationMs: expect.any(Number),
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("only thins old, reader-visible, non-keeper, lineage-free rows", async () => {
    const prisma = createPrismaMock([0]);

    await pruneImladrisMetricValues({ prisma: prisma as never, now: NOW });

    const call = prisma.$executeRaw.mock.calls[0] as unknown as SqlCall;
    const sql = sqlTextOf(call);
    expect(sql).toContain('DELETE FROM "ImladrisCanonicalMetricValue"');
    // One keeper per scope group per UTC day survives (the day's last value).
    expect(sql).toContain(
      `"organizationId", "userId", "metricKey", date_trunc('day', "periodEnd")`,
    );
    expect(sql).toContain('"periodEnd" DESC, "computedAt" DESC');
    // Rows still carrying lineage are untouchable: keeps the overall-latest
    // value safe, defers to the lineage pruner, and guarantees the cascade
    // from ImladrisCanonicalMetricValue → ImladrisMetricLineage never fires.
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain(
      'FROM "ImladrisMetricLineage" l WHERE l."metricValueId" = mv."id"',
    );
    expect(sql).toContain("LIMIT");
    // Bound values, in order: intraday cutoff, candidate visibility guard
    // (periodEnd <= now), keeper visibility guards (periodEnd/computedAt <=
    // now), batch size.
    expect(boundValuesOf(call)).toEqual([
      new Date(NOW.getTime() - 14 * DAY_MS),
      NOW,
      NOW,
      NOW,
      10_000,
    ]);
  });

  it("loops in bounded batches until the backlog drains", async () => {
    const prisma = createPrismaMock([2, 2, 1]);

    const result = await pruneImladrisMetricValues({
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

    const result = await pruneImladrisMetricValues({
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

  it("honors an explicit retentionDays override", async () => {
    const prisma = createPrismaMock([0]);

    const result = await pruneImladrisMetricValues({
      prisma: prisma as never,
      now: NOW,
      retentionDays: 30,
    });

    expect(result.cutoff).toBe(new Date(NOW.getTime() - 30 * DAY_MS).toISOString());
  });

  it("reads IMLADRIS_METRIC_VALUE_INTRADAY_RETENTION_DAYS when no override is provided", async () => {
    vi.stubEnv("IMLADRIS_METRIC_VALUE_INTRADAY_RETENTION_DAYS", "7");
    const prisma = createPrismaMock([0]);

    const result = await pruneImladrisMetricValues({
      prisma: prisma as never,
      now: NOW,
    });

    expect(result.cutoff).toBe(new Date(NOW.getTime() - 7 * DAY_MS).toISOString());
    const call = prisma.$executeRaw.mock.calls[0] as unknown as SqlCall;
    expect(boundValuesOf(call)).toContainEqual(new Date(NOW.getTime() - 7 * DAY_MS));
  });
});

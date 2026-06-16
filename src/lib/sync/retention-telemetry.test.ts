import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectRetentionDbStats,
  emitRetentionTelemetry,
} from "@/lib/sync/retention-telemetry";

const NOW = new Date("2026-06-16T12:00:00.000Z");

/**
 * The telemetry module issues three $queryRaw calls in this fixed order:
 *   1. pg_database_size            -> [{ bytes }]
 *   2. pg_class.reltuples estimate -> [{ rows }]
 *   3. MIN(computedAt) w/ lineage  -> [{ oldest }]
 * This mock returns those rows by call index so tests can shape each read.
 */
function createPrismaMock(rows: {
  dbBytes?: unknown;
  lineageRows?: unknown;
  oldest?: unknown;
  throwOn?: 1 | 2 | 3;
}) {
  let call = 0;
  return {
    $queryRaw: vi.fn(async () => {
      call += 1;
      if (rows.throwOn === call) throw new Error(`query ${call} failed`);
      if (call === 1) return [{ bytes: rows.dbBytes ?? null }];
      if (call === 2) return [{ rows: rows.lineageRows ?? null }];
      return [{ oldest: rows.oldest ?? null }];
    }),
  };
}

function parseLastLog(spy: ReturnType<typeof vi.spyOn>, index: number) {
  const call = spy.mock.calls[index];
  return JSON.parse(call[1] as string) as Record<string, unknown>;
}

const baseLineage = {
  deletedRows: 100,
  prunedMetricValues: 5,
  batches: 2,
  cutoff: "2026-06-02T12:00:00.000Z",
  completed: true,
  durationMs: 50,
};
const baseMetricValue = {
  deletedRows: 30,
  batches: 1,
  cutoff: "2026-06-02T12:00:00.000Z",
  completed: true,
  durationMs: 20,
};
const baseOutbox = {
  deletedDispatched: 7,
  deletedDeadLetter: 2,
  batches: 1,
  dispatchedCutoff: "2026-06-02T12:00:00.000Z",
  deadLetterCutoff: "2026-05-17T12:00:00.000Z",
  completed: true,
  durationMs: 10,
};

describe("collectRetentionDbStats", () => {
  it("parses byte, row, and oldest-age stats from the catalog queries", async () => {
    const prisma = createPrismaMock({
      dbBytes: 8_000_000_000,
      lineageRows: 22_000_000.7,
      // 10 days before NOW.
      oldest: new Date("2026-06-06T12:00:00.000Z"),
    });

    const stats = await collectRetentionDbStats(prisma as never, NOW);

    expect(stats.dbBytes).toBe(8_000_000_000);
    expect(stats.lineageRows).toBe(22_000_001); // reltuples rounded
    expect(stats.oldestLineageAgeDays).toBe(10);
  });

  it("accepts an ISO string for the oldest timestamp", async () => {
    const prisma = createPrismaMock({ oldest: "2026-06-15T12:00:00.000Z" });
    const stats = await collectRetentionDbStats(prisma as never, NOW);
    expect(stats.oldestLineageAgeDays).toBe(1);
  });

  it("falls back to null per-query without throwing when a read fails", async () => {
    const prisma = createPrismaMock({ dbBytes: 100, lineageRows: 5, throwOn: 3 });
    const stats = await collectRetentionDbStats(prisma as never, NOW);
    expect(stats.dbBytes).toBe(100);
    expect(stats.lineageRows).toBe(5);
    expect(stats.oldestLineageAgeDays).toBeNull();
  });

  it("returns null oldest age when no lineage-bearing rows exist", async () => {
    const prisma = createPrismaMock({ oldest: null });
    const stats = await collectRetentionDbStats(prisma as never, NOW);
    expect(stats.oldestLineageAgeDays).toBeNull();
  });
});

describe("emitRetentionTelemetry", () => {
  let info: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  const originalRetentionDays = process.env.IMLADRIS_LINEAGE_RETENTION_DAYS;
  const originalGraceDays = process.env.RETENTION_LINEAGE_ALERT_GRACE_DAYS;

  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    delete process.env.IMLADRIS_LINEAGE_RETENTION_DAYS;
    delete process.env.RETENTION_LINEAGE_ALERT_GRACE_DAYS;
  });

  afterEach(() => {
    info.mockRestore();
    error.mockRestore();
    if (originalRetentionDays == null) delete process.env.IMLADRIS_LINEAGE_RETENTION_DAYS;
    else process.env.IMLADRIS_LINEAGE_RETENTION_DAYS = originalRetentionDays;
    if (originalGraceDays == null) delete process.env.RETENTION_LINEAGE_ALERT_GRACE_DAYS;
    else process.env.RETENTION_LINEAGE_ALERT_GRACE_DAYS = originalGraceDays;
  });

  it("emits one [retention:metrics] info line with delete counts and DB stats", async () => {
    const prisma = createPrismaMock({
      dbBytes: 9_000_000_000,
      lineageRows: 1_000_000,
      oldest: new Date("2026-06-13T12:00:00.000Z"), // 3 days
    });

    await emitRetentionTelemetry(
      {
        prisma: prisma as never,
        lineagePruning: baseLineage,
        metricValuePruning: baseMetricValue,
        outboxPruning: baseOutbox,
      },
      NOW,
    );

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe("[retention:metrics]");
    const payload = parseLastLog(info, 0);
    expect(payload).toEqual({
      lineageDeleted: 100,
      metricValueDeleted: 30,
      outboxDeleted: 9, // dispatched + dead-letter
      dbBytes: 9_000_000_000,
      lineageRows: 1_000_000,
      oldestLineageAgeDays: 3,
      lineageRetentionDays: 14,
    });
    // No alerts under healthy conditions.
    expect(error).not.toHaveBeenCalled();
  });

  it("reports null delete counts when a prune outcome is an error", async () => {
    const prisma = createPrismaMock({ oldest: null });

    await emitRetentionTelemetry(
      {
        prisma: prisma as never,
        lineagePruning: { error: "lineage prune exploded" },
        metricValuePruning: baseMetricValue,
        outboxPruning: baseOutbox,
      },
      NOW,
    );

    const payload = parseLastLog(info, 0);
    expect(payload.lineageDeleted).toBeNull();
    expect(payload.metricValueDeleted).toBe(30);
    // A null (unknown) delete count must NOT trigger the should-have-pruned
    // alert — that requires lineageDeleted === 0.
    expect(error).not.toHaveBeenCalled();
  });

  it("fires the should-have-pruned alert when old lineage survives a zero-delete cycle", async () => {
    const prisma = createPrismaMock({
      dbBytes: 9_000_000_000,
      lineageRows: 22_000_000,
      oldest: new Date("2026-05-01T12:00:00.000Z"), // 46 days, well past 14 + 1
    });

    await emitRetentionTelemetry(
      {
        prisma: prisma as never,
        lineagePruning: { ...baseLineage, deletedRows: 0 },
        metricValuePruning: baseMetricValue,
        outboxPruning: baseOutbox,
      },
      NOW,
    );

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toBe("[retention:alert]");
    const payload = parseLastLog(error, 0);
    expect(payload).toMatchObject({
      reason: "lineage_not_pruning",
      oldestLineageAgeDays: 46,
      lineageRetentionDays: 14,
      alertThresholdDays: 15,
      lineageDeleted: 0,
    });
  });

  it("does NOT fire the should-have-pruned alert when the cycle deleted rows", async () => {
    const prisma = createPrismaMock({
      oldest: new Date("2026-05-01T12:00:00.000Z"), // 46 days
    });

    await emitRetentionTelemetry(
      {
        prisma: prisma as never,
        lineagePruning: { ...baseLineage, deletedRows: 500 }, // actively draining backlog
        metricValuePruning: baseMetricValue,
        outboxPruning: baseOutbox,
      },
      NOW,
    );

    expect(error).not.toHaveBeenCalled();
  });

  it("does NOT fire the alert for age within the TTL + grace window", async () => {
    const prisma = createPrismaMock({
      oldest: new Date("2026-06-01T12:00:00.000Z"), // 15 days, == 14 + 1, not strictly greater
    });

    await emitRetentionTelemetry(
      {
        prisma: prisma as never,
        lineagePruning: { ...baseLineage, deletedRows: 0 },
        metricValuePruning: baseMetricValue,
        outboxPruning: baseOutbox,
      },
      NOW,
    );

    expect(error).not.toHaveBeenCalled();
  });

  it("honors IMLADRIS_LINEAGE_RETENTION_DAYS and grace env overrides", async () => {
    process.env.IMLADRIS_LINEAGE_RETENTION_DAYS = "30";
    process.env.RETENTION_LINEAGE_ALERT_GRACE_DAYS = "2";
    const prisma = createPrismaMock({
      oldest: new Date("2026-05-10T12:00:00.000Z"), // 37 days > 30 + 2
    });

    await emitRetentionTelemetry(
      {
        prisma: prisma as never,
        lineagePruning: { ...baseLineage, deletedRows: 0 },
        metricValuePruning: baseMetricValue,
        outboxPruning: baseOutbox,
      },
      NOW,
    );

    const metricsPayload = parseLastLog(info, 0);
    expect(metricsPayload.lineageRetentionDays).toBe(30);
    const alertPayload = parseLastLog(error, 0);
    expect(alertPayload).toMatchObject({
      reason: "lineage_not_pruning",
      lineageRetentionDays: 30,
      alertThresholdDays: 32,
    });
  });

  it("emits budget-exhaustion alerts for incomplete prune passes", async () => {
    const prisma = createPrismaMock({ oldest: null });

    await emitRetentionTelemetry(
      {
        prisma: prisma as never,
        lineagePruning: { ...baseLineage, completed: false, durationMs: 60_000 },
        metricValuePruning: baseMetricValue,
        outboxPruning: { ...baseOutbox, completed: false, durationMs: 15_000 },
      },
      NOW,
    );

    const reasons = (error.mock.calls as unknown[][])
      .filter((call) => call[0] === "[retention:alert]")
      .map((call) => (JSON.parse(call[1] as string) as { reason: string }).reason);
    expect(reasons).toContain("lineage_budget_exhausted");
    expect(reasons).toContain("outbox_budget_exhausted");
    expect(reasons).not.toContain("metric_value_budget_exhausted");
  });

  it("never throws even if every read fails", async () => {
    const prisma = { $queryRaw: vi.fn(async () => { throw new Error("db down"); }) };

    await expect(
      emitRetentionTelemetry(
        {
          prisma: prisma as never,
          lineagePruning: baseLineage,
          metricValuePruning: baseMetricValue,
          outboxPruning: baseOutbox,
        },
        NOW,
      ),
    ).resolves.toBeUndefined();

    // Stats are null but the info line still emits.
    const payload = parseLastLog(info, 0);
    expect(payload.dbBytes).toBeNull();
    expect(payload.lineageRows).toBeNull();
    expect(payload.oldestLineageAgeDays).toBeNull();
    expect(payload.lineageDeleted).toBe(100);
  });
});

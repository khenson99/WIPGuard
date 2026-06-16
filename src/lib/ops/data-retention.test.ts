import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadDataRetentionConfig,
  runDataRetentionSweep,
  type DataRetentionConfig,
  type DataRetentionPrisma,
} from "./data-retention";

function testConfig(overrides: Partial<DataRetentionConfig> = {}): DataRetentionConfig {
  return {
    enabled: true,
    dryRun: false,
    batchSize: 100,
    maxRowsPerTablePerRun: 1000,
    imladrisLineageRetentionDays: 7,
    imladrisMetricRetentionDays: 365,
    outboxDispatchedRetentionDays: 14,
    outboxDeadLetterRetentionDays: 90,
    securityAuditRetentionDays: 365,
    funnelEventRetentionDays: 365,
    ...overrides,
  };
}

interface FakePrisma extends DataRetentionPrisma {
  queries: Array<{ sql: string; values: unknown[] }>;
  executes: Array<{ sql: string; values: unknown[] }>;
}

function fakePrisma(input: {
  /** Metric value ids returned by candidate SELECTs (first call wins, then empty). */
  candidateIds?: string[];
  /** Rows affected per DELETE call, consumed in order; defaults to 0 afterwards. */
  deleteResults?: number[];
  /** Count returned for dry-run count queries. */
  dryRunCount?: number;
} = {}): FakePrisma {
  const candidateBatches: Array<Array<{ id: string }>> = input.candidateIds
    ? [input.candidateIds.map((id) => ({ id }))]
    : [];
  const deleteResults = [...(input.deleteResults ?? [])];

  const prisma: FakePrisma = {
    queries: [],
    executes: [],
    async $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T> {
      prisma.queries.push({ sql, values });
      if (sql.includes("pg_database_size")) {
        return [{ size: BigInt(123) }] as unknown as T;
      }
      if (sql.includes("count(*)")) {
        return [{ count: BigInt(input.dryRunCount ?? 0) }] as unknown as T;
      }
      // Candidate id SELECTs
      return (candidateBatches.shift() ?? []) as unknown as T;
    },
    async $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number> {
      prisma.executes.push({ sql, values });
      const limit = values[values.length - 1];
      const affected = deleteResults.shift() ?? 0;
      // A real DELETE ... LIMIT n can never affect more than n rows.
      return typeof limit === "number" ? Math.min(affected, limit) : affected;
    },
  };
  return prisma;
}

describe("loadDataRetentionConfig", () => {
  const ENV_KEYS = [
    "DATA_RETENTION_ENABLED",
    "DATA_RETENTION_DRY_RUN",
    "DATA_RETENTION_BATCH_SIZE",
    "DATA_RETENTION_MAX_ROWS_PER_RUN",
    "IMLADRIS_LINEAGE_RETENTION_DAYS",
    "IMLADRIS_METRIC_RETENTION_DAYS",
    "OUTBOX_DISPATCHED_RETENTION_DAYS",
    "OUTBOX_DEAD_LETTER_RETENTION_DAYS",
    "SECURITY_AUDIT_RETENTION_DAYS",
    "FUNNEL_EVENT_RETENTION_DAYS",
  ];
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults to enabled, non-dry-run, with conservative windows", () => {
    const config = loadDataRetentionConfig();
    expect(config.enabled).toBe(true);
    expect(config.dryRun).toBe(false);
    expect(config.batchSize).toBe(20_000);
    expect(config.maxRowsPerTablePerRun).toBe(200_000);
    expect(config.imladrisLineageRetentionDays).toBe(7);
    expect(config.imladrisMetricRetentionDays).toBe(365);
    expect(config.outboxDispatchedRetentionDays).toBe(14);
    expect(config.outboxDeadLetterRetentionDays).toBe(90);
    expect(config.securityAuditRetentionDays).toBe(365);
    expect(config.funnelEventRetentionDays).toBe(365);
  });

  it("honours environment overrides", () => {
    process.env.DATA_RETENTION_ENABLED = "false";
    process.env.DATA_RETENTION_DRY_RUN = "true";
    process.env.DATA_RETENTION_BATCH_SIZE = "500";
    process.env.IMLADRIS_LINEAGE_RETENTION_DAYS = "3";

    const config = loadDataRetentionConfig();
    expect(config.enabled).toBe(false);
    expect(config.dryRun).toBe(true);
    expect(config.batchSize).toBe(500);
    expect(config.imladrisLineageRetentionDays).toBe(3);
  });

  it("ignores invalid numeric overrides", () => {
    process.env.DATA_RETENTION_BATCH_SIZE = "not-a-number";
    process.env.OUTBOX_DEAD_LETTER_RETENTION_DAYS = "-5";
    const config = loadDataRetentionConfig();
    expect(config.batchSize).toBe(20_000);
    expect(config.outboxDeadLetterRetentionDays).toBe(90);
  });
});

describe("runDataRetentionSweep", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when disabled", async () => {
    const prisma = fakePrisma();
    const summary = await runDataRetentionSweep({
      prisma,
      config: testConfig({ enabled: false }),
    });

    expect(summary.enabled).toBe(false);
    expect(summary.steps).toHaveLength(0);
    expect(summary.totalDeleted).toBe(0);
    expect(prisma.executes).toHaveLength(0);
  });

  it("runs every step and reports per-step results", async () => {
    const prisma = fakePrisma({ deleteResults: [50, 10, 0, 0, 0] });
    const summary = await runDataRetentionSweep({
      prisma,
      now: new Date("2026-06-12T10:00:00.000Z"),
      config: testConfig(),
    });

    expect(summary.enabled).toBe(true);
    expect(summary.steps.map((step) => step.step)).toEqual([
      "imladrisSupersededLineage",
      "imladrisExpiredMetricValues",
      "outboxDispatched",
      "outboxDeadLetter",
      "securityAuditEvents",
      "funnelEvents",
    ]);
    for (const step of summary.steps) {
      expect(step.error).toBeUndefined();
    }
    expect(summary.databaseSizeBytes).toBe(123);
  });

  it("deletes lineage in batches for superseded metric values", async () => {
    const prisma = fakePrisma({
      candidateIds: ["mv_1"],
      // Two full batches then a partial one for mv_1's lineage.
      deleteResults: [100, 100, 40],
    });
    const summary = await runDataRetentionSweep({
      prisma,
      now: new Date("2026-06-12T10:00:00.000Z"),
      config: testConfig(),
    });

    const lineageStep = summary.steps.find(
      (step) => step.step === "imladrisSupersededLineage",
    );
    expect(lineageStep).toMatchObject({ deleted: 240, capped: false });

    const lineageDeletes = prisma.executes.filter((call) =>
      call.sql.includes('"ImladrisMetricLineage"'),
    );
    expect(lineageDeletes.length).toBeGreaterThanOrEqual(3);
    expect(lineageDeletes[0].values).toEqual(["mv_1", 100]);
  });

  it("stops at the per-table cap and reports capped=true", async () => {
    const prisma = fakePrisma({
      candidateIds: ["mv_1"],
      // Every batch comes back full so only the cap stops the loop.
      deleteResults: Array(50).fill(100),
    });
    const summary = await runDataRetentionSweep({
      prisma,
      now: new Date("2026-06-12T10:00:00.000Z"),
      config: testConfig({ maxRowsPerTablePerRun: 250 }),
    });

    const lineageStep = summary.steps.find(
      (step) => step.step === "imladrisSupersededLineage",
    );
    expect(lineageStep?.capped).toBe(true);
    expect(lineageStep?.deleted).toBe(250);
  });

  it("counts without deleting in dry-run mode", async () => {
    const prisma = fakePrisma({ dryRunCount: 42 });
    const summary = await runDataRetentionSweep({
      prisma,
      now: new Date("2026-06-12T10:00:00.000Z"),
      config: testConfig({ dryRun: true }),
    });

    expect(summary.dryRun).toBe(true);
    expect(prisma.executes).toHaveLength(0);
    const outboxStep = summary.steps.find((step) => step.step === "outboxDeadLetter");
    expect(outboxStep?.deleted).toBe(42);
  });

  it("captures step failures without throwing", async () => {
    const prisma = fakePrisma();
    prisma.$executeRawUnsafe = async () => {
      throw new Error("permission denied");
    };

    const summary = await runDataRetentionSweep({
      prisma,
      now: new Date("2026-06-12T10:00:00.000Z"),
      config: testConfig(),
    });

    const failing = summary.steps.filter((step) => step.error);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing[0].error).toContain("permission denied");
  });

  it("uses cutoffs derived from the provided now", async () => {
    const prisma = fakePrisma();
    const now = new Date("2026-06-12T00:00:00.000Z");
    await runDataRetentionSweep({ prisma, now, config: testConfig() });

    const dispatchedDelete = prisma.executes.find((call) =>
      call.sql.includes("'DISPATCHED'"),
    );
    expect(dispatchedDelete).toBeDefined();
    const cutoff = dispatchedDelete?.values[0] as Date;
    expect(cutoff.toISOString()).toBe("2026-05-29T00:00:00.000Z");
  });
});

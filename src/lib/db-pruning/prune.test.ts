import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { getImladrisHistoricalWindow } from "@/lib/imladris/ingestion";
import type { DbPrunePolicy } from "@/lib/db-pruning/policy";
import {
  FINANCE_STANDING_OBJECT_TYPE_VARIANTS,
  MONTHLY_HISTORY_SNAPSHOT_EXEMPTION,
  runDbPrune,
  type DbPrunePrismaClient,
} from "@/lib/db-pruning/prune";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const NOW = new Date("2026-06-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function testPolicy(overrides: Partial<DbPrunePolicy> = {}): DbPrunePolicy {
  return {
    rawRecordRetentionDays: 425,
    syncRunRetentionDays: 90,
    metricHistoryRetentionDays: 425,
    securityAuditRetentionDays: 425,
    analyticsSnapshotRetentionDays: 30,
    batchSize: 1000,
    maxBatchesPerTable: 200,
    timeBudgetMs: 240_000,
    forceDryRun: false,
    ...overrides,
  };
}

interface CapturedQuery {
  text: string;
  values: unknown[];
}

function capture(query: Prisma.Sql): CapturedQuery {
  return { text: query.text, values: [...query.values] };
}

function buildMockPrisma(options?: {
  executeImpl?: (query: Prisma.Sql) => Promise<number>;
  counts?: number;
}) {
  const executed: CapturedQuery[] = [];
  const queried: CapturedQuery[] = [];

  const $executeRaw = vi.fn(async (query: Prisma.Sql) => {
    executed.push(capture(query));
    if (options?.executeImpl) return options.executeImpl(query);
    return 0;
  });
  const $queryRaw = vi.fn(async (query: Prisma.Sql) => {
    queried.push(capture(query));
    return [{ count: options?.counts ?? 0 }];
  });

  const prisma: DbPrunePrismaClient = {
    $executeRaw: $executeRaw as unknown as DbPrunePrismaClient["$executeRaw"],
    $queryRaw: $queryRaw as unknown as DbPrunePrismaClient["$queryRaw"],
  };

  return { prisma, executed, queried, $executeRaw, $queryRaw };
}

const noopLogger = () => {};

afterEach(() => {
  vi.useRealTimers();
});

describe("runDbPrune dry run", () => {
  it("only counts — never issues a delete", async () => {
    const { prisma, executed, queried } = buildMockPrisma({ counts: 7 });

    const result = await runDbPrune({
      prisma,
      dryRun: true,
      now: NOW,
      policy: testPolicy(),
      logger: noopLogger,
    });

    expect(executed).toHaveLength(0);
    expect(queried).toHaveLength(5);
    expect(queried.every((query) => /^\s*SELECT COUNT\(\*\)/.test(query.text))).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.totalRows).toBe(5 * 7);
    expect(result.tables.map((table) => table.table)).toEqual([
      "ImladrisRawSourceRecord",
      "ImladrisSourceSyncRun",
      "MetricHistory",
      "SecurityAuditEvent",
      "AnalyticsSnapshot",
    ]);
  });

  it("is forced by policy.forceDryRun even when the caller asks for a real run", async () => {
    const { prisma, executed } = buildMockPrisma({ counts: 3 });

    const result = await runDbPrune({
      prisma,
      dryRun: false,
      now: NOW,
      policy: testPolicy({ forceDryRun: true }),
      logger: noopLogger,
    });

    expect(result.dryRun).toBe(true);
    expect(executed).toHaveLength(0);
  });
});

describe("raw source record protection", () => {
  async function rawRecordDeleteQuery(policy: DbPrunePolicy): Promise<CapturedQuery> {
    const { prisma, executed } = buildMockPrisma();
    await runDbPrune({ prisma, now: NOW, policy, logger: noopLogger });
    const query = executed.find((entry) =>
      entry.text.includes('DELETE FROM "ImladrisRawSourceRecord"'),
    );
    expect(query).toBeDefined();
    return query as CapturedQuery;
  }

  it("requires EVERY timestamp on the row to be older than the cutoff", async () => {
    const query = await rawRecordDeleteQuery(testPolicy());

    for (const column of [
      "createdAt",
      "updatedAt",
      "occurredAt",
      "sourceCreatedAt",
      "sourceUpdatedAt",
    ]) {
      expect(query.text).toContain(`"${column}"`);
    }
    // Nullable source timestamps treat NULL as old — the non-null
    // createdAt/updatedAt guards still apply.
    expect(query.text).toContain(`COALESCE(r."occurredAt", 'epoch'::timestamp)`);

    const expectedCutoff = new Date(NOW.getTime() - 425 * DAY_MS);
    const dateValues = query.values.filter((value): value is Date => value instanceof Date);
    expect(dateValues).toHaveLength(5);
    for (const value of dateValues) {
      expect(value.getTime()).toBe(expectedCutoff.getTime());
    }
  });

  it("never deletes inside the 13-month Imladris lookback window", async () => {
    const query = await rawRecordDeleteQuery(testPolicy());
    const { windowStart } = getImladrisHistoricalWindow(NOW);

    const dateValues = query.values.filter((value): value is Date => value instanceof Date);
    expect(dateValues.length).toBeGreaterThan(0);
    for (const cutoff of dateValues) {
      expect(cutoff.getTime()).toBeLessThan(windowStart.getTime());
    }
  });

  it("never deletes lineage-referenced rows — the check lives inside the DELETE statement", async () => {
    const query = await rawRecordDeleteQuery(testPolicy());

    expect(query.text).toMatch(
      /NOT EXISTS \(\s*SELECT 1\s*FROM "ImladrisMetricLineage" l\s*WHERE l\."rawRecordId" = r\."id"\s*\)/,
    );
  });

  it("never deletes standing finance object types (read at any age)", async () => {
    const query = await rawRecordDeleteQuery(testPolicy());

    expect(query.text).toContain('"objectType" NOT IN');
    expect(FINANCE_STANDING_OBJECT_TYPE_VARIANTS.length).toBeGreaterThan(0);
    for (const variant of FINANCE_STANDING_OBJECT_TYPE_VARIANTS) {
      expect(query.values).toContain(variant);
    }
    expect(FINANCE_STANDING_OBJECT_TYPE_VARIANTS).toEqual(
      expect.arrayContaining(["subscription", "deals", "activeCustomerRef", "balance"]),
    );
  });
});

describe("sync run pruning", () => {
  it("only deletes runs with no remaining raw records (cascade safety)", async () => {
    const { prisma, executed } = buildMockPrisma();
    await runDbPrune({ prisma, now: NOW, policy: testPolicy(), logger: noopLogger });

    const query = executed.find((entry) =>
      entry.text.includes('DELETE FROM "ImladrisSourceSyncRun"'),
    );
    expect(query).toBeDefined();
    expect(query?.text).toMatch(
      /NOT EXISTS \(\s*SELECT 1\s*FROM "ImladrisRawSourceRecord" r\s*WHERE r\."syncRunId" = s\."id"\s*\)/,
    );
  });
});

describe("analytics snapshot pruning", () => {
  it("exempts the monthly P&L history context", async () => {
    const { prisma, executed } = buildMockPrisma();
    await runDbPrune({ prisma, now: NOW, policy: testPolicy(), logger: noopLogger });

    const query = executed.find((entry) =>
      entry.text.includes('DELETE FROM "AnalyticsSnapshot"'),
    );
    expect(query).toBeDefined();
    expect(query?.text).toContain('NOT (');
    expect(query?.values).toContain(MONTHLY_HISTORY_SNAPSHOT_EXEMPTION.contextKey);
    expect(query?.values).toContain(MONTHLY_HISTORY_SNAPSHOT_EXEMPTION.rangePreset);
  });

  it("stays in lockstep with the canonical monthly history constants", async () => {
    const { MONTHLY_HISTORY_CONTEXT_KEY, MONTHLY_HISTORY_RANGE_PRESET } = await import(
      "@/lib/analytics/monthly-pnl-history"
    );

    expect(MONTHLY_HISTORY_SNAPSHOT_EXEMPTION.contextKey).toBe(MONTHLY_HISTORY_CONTEXT_KEY);
    expect(MONTHLY_HISTORY_SNAPSHOT_EXEMPTION.rangePreset).toBe(MONTHLY_HISTORY_RANGE_PRESET);
  });
});

describe("batching", () => {
  it("loops until a batch comes back partial and sums deletions", async () => {
    const batchSize = 100;
    const perTableCalls = new Map<string, number>();
    const { prisma, $executeRaw } = buildMockPrisma({
      executeImpl: async (query) => {
        const table = /DELETE FROM "([A-Za-z]+)"/.exec(query.text)?.[1] ?? "unknown";
        const call = (perTableCalls.get(table) ?? 0) + 1;
        perTableCalls.set(table, call);
        if (table === "MetricHistory") {
          // Two full batches, then a partial one.
          return call <= 2 ? batchSize : 40;
        }
        return 0;
      },
    });

    const result = await runDbPrune({
      prisma,
      now: NOW,
      policy: testPolicy({ batchSize }),
      logger: noopLogger,
    });

    const metricHistory = result.tables.find((table) => table.table === "MetricHistory");
    expect(metricHistory?.rows).toBe(240);
    expect(metricHistory?.batches).toBe(3);
    expect(metricHistory?.truncated).toBe(false);
    expect(result.ok).toBe(true);
    // Every batch is a separate statement — no single long-running delete.
    expect($executeRaw.mock.calls.length).toBeGreaterThanOrEqual(7);
    const limits = $executeRaw.mock.calls.map(
      (call) => (call[0] as Prisma.Sql).values.at(-1),
    );
    expect(limits.every((limit) => limit === batchSize)).toBe(true);
  });

  it("stops at the per-table batch cap and reports truncation", async () => {
    const batchSize = 50;
    const { prisma } = buildMockPrisma({
      executeImpl: async (query) =>
        query.text.includes('"SecurityAuditEvent"') ? batchSize : 0,
    });

    const result = await runDbPrune({
      prisma,
      now: NOW,
      policy: testPolicy({ batchSize, maxBatchesPerTable: 4 }),
      logger: noopLogger,
    });

    const audit = result.tables.find((table) => table.table === "SecurityAuditEvent");
    expect(audit?.batches).toBe(4);
    expect(audit?.rows).toBe(200);
    expect(audit?.truncated).toBe(true);
    expect(result.truncated).toBe(true);
    // Truncation is not a failure — the next scheduled run resumes.
    expect(result.ok).toBe(true);
  });

  it("stops when the wall-clock budget is exhausted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const { prisma } = buildMockPrisma({
      executeImpl: async () => {
        vi.setSystemTime(new Date(Date.now() + 7_000));
        return 1000;
      },
    });

    const result = await runDbPrune({
      prisma,
      now: NOW,
      policy: testPolicy({ batchSize: 1000, timeBudgetMs: 10_000 }),
      logger: noopLogger,
    });

    const rawRecords = result.tables.find(
      (table) => table.table === "ImladrisRawSourceRecord",
    );
    expect(rawRecords?.batches).toBe(2);
    expect(rawRecords?.truncated).toBe(true);
    // The budget spans the whole run: later tables get no batches.
    const audit = result.tables.find((table) => table.table === "SecurityAuditEvent");
    expect(audit?.batches).toBe(0);
    expect(audit?.truncated).toBe(false);
  });
});

describe("failure isolation", () => {
  it("records a table error, keeps pruning the rest, and reports ok=false", async () => {
    const { prisma, executed } = buildMockPrisma({
      executeImpl: async (query) => {
        if (query.text.includes('DELETE FROM "ImladrisRawSourceRecord"')) {
          throw new Error("relation is busy");
        }
        return 0;
      },
    });

    const result = await runDbPrune({
      prisma,
      now: NOW,
      policy: testPolicy(),
      logger: noopLogger,
    });

    expect(result.ok).toBe(false);
    const rawRecords = result.tables.find(
      (table) => table.table === "ImladrisRawSourceRecord",
    );
    expect(rawRecords?.error).toBe("relation is busy");
    // The other four tables still ran their deletes.
    const otherDeletes = executed.filter(
      (entry) => !entry.text.includes('DELETE FROM "ImladrisRawSourceRecord"'),
    );
    expect(otherDeletes).toHaveLength(4);
  });
});

describe("structured logging", () => {
  it("emits parseable [db-prune] lines for batches and summaries", async () => {
    const lines: string[] = [];
    const { prisma } = buildMockPrisma({
      executeImpl: async (query) =>
        query.text.includes('"MetricHistory"') ? 10 : 0,
    });

    await runDbPrune({
      prisma,
      now: NOW,
      policy: testPolicy({ batchSize: 100 }),
      logger: (message) => lines.push(message),
    });

    expect(lines.length).toBeGreaterThan(0);
    const events = lines.map((line) => {
      expect(line.startsWith("[db-prune] ")).toBe(true);
      return JSON.parse(line.slice("[db-prune] ".length)) as { event: string };
    });
    expect(events.some((event) => event.event === "run_start")).toBe(true);
    expect(events.some((event) => event.event === "batch")).toBe(true);
    expect(
      events.filter((event) => event.event === "table_summary"),
    ).toHaveLength(5);
    expect(events.at(-1)?.event).toBe("run_summary");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  parseImladrisLineageRetentionDays,
  pruneImladrisMetricLineage,
} from "@/lib/imladris/lineage-retention";

describe("pruneImladrisMetricLineage", () => {
  it("deletes lineage older than the window while excluding the latest row per group", async () => {
    // Returns fewer than the batch limit → drained after one batch.
    const executeRaw = vi.fn(async () => 17);
    const prisma = { $executeRaw: executeRaw } as never;

    const result = await pruneImladrisMetricLineage({
      prisma,
      olderThanDays: 30,
      now: new Date("2026-06-15T00:00:00.000Z"),
    });

    expect(result).toEqual({ deleted: 17, cutoff: "2026-05-16T00:00:00.000Z", capped: false });
    expect(executeRaw).toHaveBeenCalledOnce();

    // The tagged-template SQL must (a) batch via ctid + LIMIT, (b) join lineage
    // to its canonical row, (c) filter by periodEnd < cutoff, and (d) protect
    // the latest row per group.
    const [strings, cutoffParam] = executeRaw.mock.calls[0] as unknown as [string[], Date];
    const sql = strings.join("?");
    expect(sql).toContain('DELETE FROM "ImladrisMetricLineage"');
    expect(sql).toContain("WHERE ctid IN");
    expect(sql).toContain('JOIN "ImladrisCanonicalMetricValue"');
    expect(sql).toContain('v."periodEnd" <');
    expect(sql).toContain("NOT IN");
    expect(sql).toContain("DISTINCT ON");
    expect(sql).toContain("LIMIT");
    expect(cutoffParam).toBeInstanceOf(Date);
    expect(cutoffParam.toISOString()).toBe("2026-05-16T00:00:00.000Z");
  });

  it("drains in batches and stops at the per-run cap", async () => {
    // Plenty of eligible rows: each batch deletes exactly its LIMIT (the last
    // interpolated template param), so the run stops at the per-run cap.
    const executeRaw = vi.fn(async (..._args: unknown[]) => {
      const limit = Number(_args[_args.length - 1]);
      return Math.min(10_000, limit);
    });
    const prisma = { $executeRaw: executeRaw } as never;

    const result = await pruneImladrisMetricLineage({
      prisma,
      olderThanDays: 7,
      maxRowsPerRun: 25_000,
      batchSize: 10_000,
      now: new Date("2026-06-15T00:00:00.000Z"),
    });

    // 10k + 10k + 5k (final batch limited to remaining) = 25k, cap reached.
    expect(result.deleted).toBe(25_000);
    expect(result.capped).toBe(true);
    expect(executeRaw).toHaveBeenCalledTimes(3);
  });

  it("does nothing when the per-run cap is zero", async () => {
    const executeRaw = vi.fn(async () => 10_000);
    const prisma = { $executeRaw: executeRaw } as never;

    const result = await pruneImladrisMetricLineage({
      prisma,
      maxRowsPerRun: 0,
      now: new Date("2026-06-15T00:00:00.000Z"),
    });

    expect(result.deleted).toBe(0);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("clamps non-positive windows to at least one day", async () => {
    const executeRaw = vi.fn(async () => 0);
    const prisma = { $executeRaw: executeRaw } as never;

    const result = await pruneImladrisMetricLineage({
      prisma,
      olderThanDays: 0,
      now: new Date("2026-06-15T00:00:00.000Z"),
    });

    expect(result.cutoff).toBe("2026-06-14T00:00:00.000Z");
  });

  it("coerces a bigint affected-row count to a number", async () => {
    const executeRaw = vi.fn(async () => 9_007_199 as unknown as number);
    const prisma = { $executeRaw: executeRaw } as never;

    const result = await pruneImladrisMetricLineage({
      prisma,
      olderThanDays: 30,
      now: new Date("2026-06-15T00:00:00.000Z"),
    });

    expect(result.deleted).toBe(9_007_199);
  });
});

describe("parseImladrisLineageRetentionDays", () => {
  const KEY = "IMLADRIS_LINEAGE_RETENTION_DAYS";

  it("defaults to 30 days when unset or invalid", () => {
    const previous = process.env[KEY];
    try {
      delete process.env[KEY];
      expect(parseImladrisLineageRetentionDays()).toBe(30);
      process.env[KEY] = "not-a-number";
      expect(parseImladrisLineageRetentionDays()).toBe(30);
      process.env[KEY] = "-5";
      expect(parseImladrisLineageRetentionDays()).toBe(30);
    } finally {
      if (previous === undefined) delete process.env[KEY];
      else process.env[KEY] = previous;
    }
  });

  it("honours a positive override", () => {
    const previous = process.env[KEY];
    try {
      process.env[KEY] = "14";
      expect(parseImladrisLineageRetentionDays()).toBe(14);
    } finally {
      if (previous === undefined) delete process.env[KEY];
      else process.env[KEY] = previous;
    }
  });
});

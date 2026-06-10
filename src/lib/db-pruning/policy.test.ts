import { describe, expect, it } from "vitest";
import { getImladrisHistoricalWindow } from "@/lib/imladris/ingestion";
import {
  ANALYTICS_SNAPSHOT_RETENTION_DEFAULT_DAYS,
  BATCH_SIZE_DEFAULT,
  BATCH_SIZE_MAX,
  BATCH_SIZE_MIN,
  cutoffForRetentionDays,
  MAX_BATCHES_PER_TABLE_DEFAULT,
  METRIC_HISTORY_RETENTION_DEFAULT_DAYS,
  RAW_RECORD_RETENTION_DEFAULT_DAYS,
  RAW_RECORD_RETENTION_FLOOR_DAYS,
  resolveDbPrunePolicy,
  SECURITY_AUDIT_RETENTION_DEFAULT_DAYS,
  SECURITY_AUDIT_RETENTION_FLOOR_DAYS,
  SYNC_RUN_RETENTION_DEFAULT_DAYS,
  SYNC_RUN_RETENTION_FLOOR_DAYS,
  TIME_BUDGET_MS_DEFAULT,
} from "@/lib/db-pruning/policy";

describe("resolveDbPrunePolicy", () => {
  it("returns documented defaults when no env vars are set", () => {
    const policy = resolveDbPrunePolicy({});

    expect(policy).toEqual({
      rawRecordRetentionDays: RAW_RECORD_RETENTION_DEFAULT_DAYS,
      syncRunRetentionDays: SYNC_RUN_RETENTION_DEFAULT_DAYS,
      metricHistoryRetentionDays: METRIC_HISTORY_RETENTION_DEFAULT_DAYS,
      securityAuditRetentionDays: SECURITY_AUDIT_RETENTION_DEFAULT_DAYS,
      analyticsSnapshotRetentionDays: ANALYTICS_SNAPSHOT_RETENTION_DEFAULT_DAYS,
      batchSize: BATCH_SIZE_DEFAULT,
      maxBatchesPerTable: MAX_BATCHES_PER_TABLE_DEFAULT,
      timeBudgetMs: TIME_BUDGET_MS_DEFAULT,
      forceDryRun: false,
    });
  });

  it("honors env overrides above the floors", () => {
    const policy = resolveDbPrunePolicy({
      DB_PRUNE_RAW_RECORD_RETENTION_DAYS: "500",
      DB_PRUNE_SYNC_RUN_RETENTION_DAYS: "45",
      DB_PRUNE_METRIC_HISTORY_RETENTION_DAYS: "200",
      DB_PRUNE_SECURITY_AUDIT_RETENTION_DAYS: "365",
      ANALYTICS_SNAPSHOT_RETENTION_DAYS: "60",
      DB_PRUNE_BATCH_SIZE: "500",
      DB_PRUNE_MAX_BATCHES_PER_TABLE: "50",
      DB_PRUNE_TIME_BUDGET_MS: "60000",
      DB_PRUNE_FORCE_DRY_RUN: "true",
    });

    expect(policy.rawRecordRetentionDays).toBe(500);
    expect(policy.syncRunRetentionDays).toBe(45);
    expect(policy.metricHistoryRetentionDays).toBe(200);
    expect(policy.securityAuditRetentionDays).toBe(365);
    expect(policy.analyticsSnapshotRetentionDays).toBe(60);
    expect(policy.batchSize).toBe(500);
    expect(policy.maxBatchesPerTable).toBe(50);
    expect(policy.timeBudgetMs).toBe(60000);
    expect(policy.forceDryRun).toBe(true);
  });

  it("clamps misconfigured retention windows to their floors", () => {
    const policy = resolveDbPrunePolicy({
      DB_PRUNE_RAW_RECORD_RETENTION_DAYS: "30",
      DB_PRUNE_SYNC_RUN_RETENTION_DAYS: "1",
      DB_PRUNE_SECURITY_AUDIT_RETENTION_DAYS: "1",
    });

    expect(policy.rawRecordRetentionDays).toBe(RAW_RECORD_RETENTION_FLOOR_DAYS);
    expect(policy.syncRunRetentionDays).toBe(SYNC_RUN_RETENTION_FLOOR_DAYS);
    expect(policy.securityAuditRetentionDays).toBe(SECURITY_AUDIT_RETENTION_FLOOR_DAYS);
  });

  it("falls back to defaults for unparseable values", () => {
    const policy = resolveDbPrunePolicy({
      DB_PRUNE_RAW_RECORD_RETENTION_DAYS: "not-a-number",
      DB_PRUNE_BATCH_SIZE: "-5",
      DB_PRUNE_FORCE_DRY_RUN: "banana",
    });

    expect(policy.rawRecordRetentionDays).toBe(RAW_RECORD_RETENTION_DEFAULT_DAYS);
    expect(policy.batchSize).toBe(BATCH_SIZE_DEFAULT);
    expect(policy.forceDryRun).toBe(false);
  });

  it("clamps batch size into its safe range", () => {
    expect(resolveDbPrunePolicy({ DB_PRUNE_BATCH_SIZE: "1" }).batchSize).toBe(BATCH_SIZE_MIN);
    expect(resolveDbPrunePolicy({ DB_PRUNE_BATCH_SIZE: "999999" }).batchSize).toBe(
      BATCH_SIZE_MAX,
    );
  });
});

describe("13-month lookback invariant", () => {
  it("keeps the raw-record cutoff strictly outside every possible Imladris historical window", () => {
    // Sweep a few years of "now" values, including month-length edge cases
    // (leap February, 31st-of-month day clamping in setUTCMonth).
    const starts = [
      new Date("2026-06-10T12:00:00.000Z"),
      new Date("2026-01-31T23:59:59.000Z"),
      new Date("2025-03-31T00:00:00.000Z"),
      new Date("2024-02-29T08:30:00.000Z"),
      new Date("2027-12-31T23:00:00.000Z"),
    ];

    for (const base of starts) {
      for (let offsetDays = 0; offsetDays < 366; offsetDays += 7) {
        const now = new Date(base.getTime() + offsetDays * 24 * 60 * 60 * 1000);
        const { windowStart } = getImladrisHistoricalWindow(now);

        // Even at the clamped floor (the most aggressive configuration the
        // policy permits), the cutoff is strictly older than the window start.
        const flooredPolicy = resolveDbPrunePolicy({
          DB_PRUNE_RAW_RECORD_RETENTION_DAYS: "1",
        });
        const cutoff = cutoffForRetentionDays(now, flooredPolicy.rawRecordRetentionDays);

        expect(cutoff.getTime()).toBeLessThan(windowStart.getTime());
      }
    }
  });

  it("keeps the default raw-record cutoff outside the window too", () => {
    const now = new Date("2026-06-10T00:00:00.000Z");
    const { windowStart } = getImladrisHistoricalWindow(now);
    const policy = resolveDbPrunePolicy({});
    const cutoff = cutoffForRetentionDays(now, policy.rawRecordRetentionDays);

    expect(cutoff.getTime()).toBeLessThan(windowStart.getTime());
  });
});

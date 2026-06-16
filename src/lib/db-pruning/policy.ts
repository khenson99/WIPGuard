/**
 * Retention policy for the database pruning job.
 *
 * Every window is env-configurable but clamped to a floor so that a
 * misconfigured (or fat-fingered) environment variable can never violate a
 * product invariant. The critical floor is the raw-record window: Imladris
 * materialization reads raw source records across a 13-month historical
 * lookback (`getImladrisHistoricalWindow` in src/lib/imladris/ingestion.ts),
 * so raw records may never be deleted inside that window.
 *
 * See docs/runbooks/db-pruning.md for the full design.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 13 consecutive calendar months span at most 403 days (13 × 31 is a strict
 * upper bound). The floor adds a 7-day safety margin on top so the pruning
 * cutoff is always strictly older than any possible 13-month window start.
 */
export const RAW_RECORD_RETENTION_FLOOR_DAYS = 410;
export const RAW_RECORD_RETENTION_DEFAULT_DAYS = 425;

export const SYNC_RUN_RETENTION_FLOOR_DAYS = 30;
export const SYNC_RUN_RETENTION_DEFAULT_DAYS = 90;

export const METRIC_HISTORY_RETENTION_FLOOR_DAYS = 30;
export const METRIC_HISTORY_RETENTION_DEFAULT_DAYS = 425;

export const SECURITY_AUDIT_RETENTION_FLOOR_DAYS = 90;
export const SECURITY_AUDIT_RETENTION_DEFAULT_DAYS = 425;

export const ANALYTICS_SNAPSHOT_RETENTION_FLOOR_DAYS = 7;
export const ANALYTICS_SNAPSHOT_RETENTION_DEFAULT_DAYS = 30;

export const BATCH_SIZE_DEFAULT = 1_000;
export const BATCH_SIZE_MIN = 100;
export const BATCH_SIZE_MAX = 10_000;

export const MAX_BATCHES_PER_TABLE_DEFAULT = 200;
export const MAX_BATCHES_PER_TABLE_MIN = 1;
export const MAX_BATCHES_PER_TABLE_MAX = 10_000;

export const TIME_BUDGET_MS_DEFAULT = 240_000;
export const TIME_BUDGET_MS_MIN = 10_000;
export const TIME_BUDGET_MS_MAX = 3_600_000;

export interface DbPrunePolicy {
  rawRecordRetentionDays: number;
  syncRunRetentionDays: number;
  metricHistoryRetentionDays: number;
  securityAuditRetentionDays: number;
  analyticsSnapshotRetentionDays: number;
  batchSize: number;
  maxBatchesPerTable: number;
  timeBudgetMs: number;
  /** Kill switch: forces every run (including scheduled ones) into dry-run. */
  forceDryRun: boolean;
}

type EnvLike = Record<string, string | undefined>;

function parsePositiveInt(raw: string | undefined): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function clampedEnvInt(input: {
  env: EnvLike;
  key: string;
  defaultValue: number;
  floor: number;
  ceiling?: number;
}): number {
  const parsed = parsePositiveInt(input.env[input.key]) ?? input.defaultValue;
  const floored = Math.max(input.floor, parsed);
  return input.ceiling === undefined ? floored : Math.min(input.ceiling, floored);
}

export function resolveDbPrunePolicy(env: EnvLike = process.env): DbPrunePolicy {
  return {
    rawRecordRetentionDays: clampedEnvInt({
      env,
      key: "DB_PRUNE_RAW_RECORD_RETENTION_DAYS",
      defaultValue: RAW_RECORD_RETENTION_DEFAULT_DAYS,
      floor: RAW_RECORD_RETENTION_FLOOR_DAYS,
    }),
    syncRunRetentionDays: clampedEnvInt({
      env,
      key: "DB_PRUNE_SYNC_RUN_RETENTION_DAYS",
      defaultValue: SYNC_RUN_RETENTION_DEFAULT_DAYS,
      floor: SYNC_RUN_RETENTION_FLOOR_DAYS,
    }),
    metricHistoryRetentionDays: clampedEnvInt({
      env,
      key: "DB_PRUNE_METRIC_HISTORY_RETENTION_DAYS",
      defaultValue: METRIC_HISTORY_RETENTION_DEFAULT_DAYS,
      floor: METRIC_HISTORY_RETENTION_FLOOR_DAYS,
    }),
    securityAuditRetentionDays: clampedEnvInt({
      env,
      key: "DB_PRUNE_SECURITY_AUDIT_RETENTION_DAYS",
      defaultValue: SECURITY_AUDIT_RETENTION_DEFAULT_DAYS,
      floor: SECURITY_AUDIT_RETENTION_FLOOR_DAYS,
    }),
    analyticsSnapshotRetentionDays: clampedEnvInt({
      env,
      // Reuses the env var the existing in-sync snapshot pruning honors
      // (src/app/api/cron/sync/route.ts parseRetentionDays) so the two
      // pruners can never disagree about the snapshot window.
      key: "ANALYTICS_SNAPSHOT_RETENTION_DAYS",
      defaultValue: ANALYTICS_SNAPSHOT_RETENTION_DEFAULT_DAYS,
      floor: ANALYTICS_SNAPSHOT_RETENTION_FLOOR_DAYS,
    }),
    batchSize: clampedEnvInt({
      env,
      key: "DB_PRUNE_BATCH_SIZE",
      defaultValue: BATCH_SIZE_DEFAULT,
      floor: BATCH_SIZE_MIN,
      ceiling: BATCH_SIZE_MAX,
    }),
    maxBatchesPerTable: clampedEnvInt({
      env,
      key: "DB_PRUNE_MAX_BATCHES_PER_TABLE",
      defaultValue: MAX_BATCHES_PER_TABLE_DEFAULT,
      floor: MAX_BATCHES_PER_TABLE_MIN,
      ceiling: MAX_BATCHES_PER_TABLE_MAX,
    }),
    timeBudgetMs: clampedEnvInt({
      env,
      key: "DB_PRUNE_TIME_BUDGET_MS",
      defaultValue: TIME_BUDGET_MS_DEFAULT,
      floor: TIME_BUDGET_MS_MIN,
      ceiling: TIME_BUDGET_MS_MAX,
    }),
    forceDryRun: env.DB_PRUNE_FORCE_DRY_RUN?.trim().toLowerCase() === "true",
  };
}

/** Rows with every relevant timestamp strictly before this date are prunable. */
export function cutoffForRetentionDays(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * Worker-specific configuration.
 * Separated from the main Next.js app config to allow independent tuning.
 */

function parseIntegerEnv(name: string, fallback: number, minimum = 1): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const value = Math.floor(parsed);
  return value >= minimum ? value : fallback;
}

export const workerConfig = {
  /**
   * Database connection pool size for the worker.
   * Kept smaller than the web server pool since sync is sequential/batched.
   */
  databasePoolSize: parseIntegerEnv('WORKER_DB_POOL_SIZE', 5),

  /**
   * Connection timeout in milliseconds for the worker's DB pool.
   */
  databaseTimeout: parseIntegerEnv('WORKER_DB_TIMEOUT', 30000),

  /**
   * Health check server port for the worker process.
   */
  healthCheckPort: parseIntegerEnv('WORKER_HEALTH_PORT', 8081, 0),

  /**
   * Maximum time (ms) a single sync cycle is allowed to run before being considered stuck.
   */
  syncTimeoutMs: parseIntegerEnv('WORKER_SYNC_TIMEOUT', 300000),

  /**
   * Interval (ms) between sync cycles when running in continuous mode.
   * Default: 5 minutes (300000ms). Set to 0 for single-run mode.
   */
  syncIntervalMs: parseIntegerEnv('WORKER_SYNC_INTERVAL', 300000),

  /**
   * Whether to run once and exit (for Railway cron) or loop continuously.
   */
  runOnce: process.env.WORKER_RUN_ONCE === 'true',

  /**
   * Log level for the worker process.
   */
  logLevel: process.env.WORKER_LOG_LEVEL || 'info',

  /**
   * Enable/disable specific sync modules.
   */
  modules: {
    hubspot: process.env.WORKER_SYNC_HUBSPOT === 'true',
    slack: process.env.WORKER_SYNC_SLACK === 'true',
    // Coda task-migration sync is retired with task/WIP tooling; ignore stale env flags.
    coda: false,
    google: process.env.WORKER_SYNC_GOOGLE === 'true',
    providerRules: process.env.WORKER_SYNC_PROVIDER_RULES !== 'false',
    visitorFunnelEnrichment:
      process.env.WORKER_SYNC_VISITOR_FUNNEL_ENRICHMENT !== 'false',
    analytics: process.env.WORKER_SYNC_ANALYTICS !== 'false',
    automations: process.env.WORKER_SYNC_AUTOMATIONS !== 'false',
    healthChecks: process.env.WORKER_SYNC_HEALTH_CHECKS !== 'false',
  },
} as const;

export type WorkerConfig = typeof workerConfig;

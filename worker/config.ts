/**
 * Worker-specific configuration.
 * Separated from the main Next.js app config to allow independent tuning.
 */

export const workerConfig = {
  /**
   * Database connection pool size for the worker.
   * Kept smaller than the web server pool since sync is sequential/batched.
   */
  databasePoolSize: parseInt(process.env.WORKER_DB_POOL_SIZE || '5', 10),

  /**
   * Connection timeout in milliseconds for the worker's DB pool.
   */
  databaseTimeout: parseInt(process.env.WORKER_DB_TIMEOUT || '30000', 10),

  /**
   * Health check server port for the worker process.
   */
  healthCheckPort: parseInt(process.env.WORKER_HEALTH_PORT || '8081', 10),

  /**
   * Maximum time (ms) a single sync cycle is allowed to run before being considered stuck.
   */
  syncTimeoutMs: parseInt(process.env.WORKER_SYNC_TIMEOUT || '300000', 10),

  /**
   * Interval (ms) between sync cycles when running in continuous mode.
   * Default: 5 minutes (300000ms). Set to 0 for single-run mode.
   */
  syncIntervalMs: parseInt(process.env.WORKER_SYNC_INTERVAL || '300000', 10),

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
    hubspot: process.env.WORKER_SYNC_HUBSPOT !== 'false',
    slack: process.env.WORKER_SYNC_SLACK !== 'false',
    coda: process.env.WORKER_SYNC_CODA !== 'false',
    google: process.env.WORKER_SYNC_GOOGLE !== 'false',
    analytics: process.env.WORKER_SYNC_ANALYTICS !== 'false',
    healthChecks: process.env.WORKER_SYNC_HEALTH_CHECKS !== 'false',
  },
} as const;

export type WorkerConfig = typeof workerConfig;

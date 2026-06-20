#!/usr/bin/env node
/**
 * Standalone sync worker process.
 *
 * This is the main entry point for the worker service that runs integration
 * sync operations (provider rules, analytics, enrichment, automations, health checks)
 * in a dedicated process, separate from the Next.js web server.
 *
 * Usage:
 *   # Single run (for Railway cron):
 *   WORKER_RUN_ONCE=true npx tsx worker/sync-runner.ts
 *
 *   # Continuous mode (for Railway worker service):
 *   npx tsx worker/sync-runner.ts
 *
 * Architecture:
 *   [Railway Cron / Service] → [This Worker] → runRules() + analytics + health checks
 *                                               ↕ dedicated DB pool
 *                              [Next.js Server] → API routes (user-facing)
 *                                                 ↕ separate DB pool
 *
 * See issue #380 for design rationale.
 */

import { workerConfig } from './config';
import { logger } from './logger';
import { getWorkerPrisma, getWorkerPool, disconnectWorkerPrisma } from './prisma';
import { startHealthServer, updateSyncStatus, setReady } from './health';
import { withTimeout } from './timeout';
import { assertSyncResultsHealthy } from './sync-results';
import { loadOrchestrator } from './orchestrator-loader';
import { withSyncAdvisoryLock } from '@/lib/sync/sync-lock';

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

let shuttingDown = false;
let healthServer: ReturnType<typeof startHealthServer> | null = null;

async function shutdown(signal: string, exitCode = 0, error?: unknown) {
  if (shuttingDown) {
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
    return;
  }
  shuttingDown = true;
  setReady(false);

  logger.info(`Received ${signal}, shutting down gracefully...`, {
    exitCode,
    error:
      error instanceof Error
        ? error.message
        : error == null
          ? undefined
          : String(error),
  });

  if (healthServer) {
    try {
      await new Promise<void>((resolve, reject) => {
        healthServer?.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve();
        });
      });
      healthServer = null;
    } catch (err) {
      logger.error('Error during health server shutdown', { error: String(err) });
    }
  }

  try {
    await disconnectWorkerPrisma();
  } catch (err) {
    logger.error('Error during Prisma disconnect', { error: String(err) });
  }

  process.exit(exitCode);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  void shutdown('unhandledRejection', 1, reason);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  void shutdown('uncaughtException', 1, error);
});

// ─── Sync Orchestration ──────────────────────────────────────────────────────

/**
 * Run a single sync cycle with timeout protection.
 */
async function runSyncCycle(): Promise<void> {
  const startTime = Date.now();
  updateSyncStatus('running');

  logger.info('Starting sync cycle', {
    modules: workerConfig.modules,
    timeoutMs: workerConfig.syncTimeoutMs,
  });

  const prisma = getWorkerPrisma();

  try {
    const orchestrator = await loadOrchestrator();
    // Run under the global sync advisory lock so the worker can never run a
    // heavy cycle concurrently with the web cron (/api/cron/sync) or another
    // worker replica. Overlapping cycles each load large raw-record sets and
    // drove the heap monotonically to the V8 limit — the OOM crash loop (see
    // docs/runbooks/oom-crash-loop.md). The lock is taken on the worker's own
    // pool, but Postgres advisory locks coordinate across processes.
    const outcome = await withSyncAdvisoryLock(
      () =>
        withTimeout(
          orchestrator.runSync(prisma, workerConfig.modules),
          workerConfig.syncTimeoutMs,
          `Sync cycle timed out after ${workerConfig.syncTimeoutMs}ms`
        ),
      { pool: getWorkerPool() }
    );

    if (!outcome.ran) {
      // Another cycle holds the lock — skip rather than stack. This is the
      // guard working, not an error, so report it as a successful no-op.
      const durationMs = Date.now() - startTime;
      updateSyncStatus('success', durationMs);
      logger.info('Sync cycle skipped — another sync cycle is already running', {
        reason: outcome.reason,
        durationMs,
      });
      return;
    }

    assertSyncResultsHealthy(outcome.result);

    const durationMs = Date.now() - startTime;
    updateSyncStatus('success', durationMs);
    logger.info('Sync cycle completed successfully', { durationMs });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    updateSyncStatus('error', durationMs, errorMessage);
    logger.error('Sync cycle failed', {
      error: errorMessage,
      stack: err instanceof Error ? err.stack : undefined,
      durationMs,
    });

    // Don't re-throw in continuous mode — just log and continue
    if (workerConfig.runOnce) {
      throw err;
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  logger.info('The Mother Node sync worker starting', {
    runOnce: workerConfig.runOnce,
    syncIntervalMs: workerConfig.syncIntervalMs,
    poolSize: workerConfig.databasePoolSize,
    modules: workerConfig.modules,
  });

  // Start health check server (even in run-once mode, useful for debugging)
  if (!workerConfig.runOnce) {
    healthServer = startHealthServer();
  }

  setReady(true);

  if (workerConfig.runOnce) {
    // Single run mode: execute once and exit
    try {
      await runSyncCycle();
      await disconnectWorkerPrisma();
      process.exit(0);
    } catch {
      await disconnectWorkerPrisma();
      process.exit(1);
    }
  } else {
    // Continuous mode: run sync cycles on an interval
    const runLoop = async () => {
      while (!shuttingDown) {
        await runSyncCycle();

        if (!shuttingDown && workerConfig.syncIntervalMs > 0) {
          logger.debug(`Sleeping ${workerConfig.syncIntervalMs}ms until next cycle`);
          await new Promise((resolve) => setTimeout(resolve, workerConfig.syncIntervalMs));
        }
      }
    };

    runLoop().catch((err) => {
      logger.error('Worker loop crashed', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
  }
}

main().catch((err) => {
  logger.error('Worker failed to start', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

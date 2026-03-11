#!/usr/bin/env node
/**
 * Standalone sync worker process.
 *
 * This is the main entry point for the worker service that runs integration
 * sync operations (HubSpot, Slack, Coda, Google, analytics, health checks)
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
import { getWorkerPrisma, disconnectWorkerPrisma } from './prisma';
import { startHealthServer, updateSyncStatus, setReady } from './health';
import { withTimeout } from './timeout';

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
 * Attempts to dynamically import the existing sync orchestrator.
 * Falls back to a stub if the orchestrator module isn't found.
 *
 * The orchestrator is expected to live at one of these paths:
 *   - src/lib/sync/orchestrator
 *   - src/lib/cron/sync
 *   - lib/sync/orchestrator
 *
 * This indirection allows the worker to be developed and tested
 * before the orchestrator is fully extracted.
 */
async function loadOrchestrator(): Promise<{
  runSync: (prisma: ReturnType<typeof getWorkerPrisma>, modules: typeof workerConfig.modules) => Promise<void>;
} | null> {
  const candidates = [
    '../src/lib/sync/orchestrator',
    '../src/lib/cron/sync',
    '../lib/sync/orchestrator',
  ];

  for (const modulePath of candidates) {
    try {
      const mod = await import(modulePath);
      if (typeof mod.runSync === 'function') {
        logger.info(`Loaded orchestrator from ${modulePath}`);
        return mod;
      }
      // Some modules might export the function differently
      if (typeof mod.default?.runSync === 'function') {
        logger.info(`Loaded orchestrator (default export) from ${modulePath}`);
        return mod.default;
      }
    } catch {
      // Module not found, try next candidate
    }
  }

  return null;
}

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

    if (orchestrator) {
      await withTimeout(
        orchestrator.runSync(prisma, workerConfig.modules),
        workerConfig.syncTimeoutMs,
        `Sync cycle timed out after ${workerConfig.syncTimeoutMs}ms`
      );
    } else {
      // No orchestrator found — run a stub that logs what would happen.
      // This allows deploying the worker infrastructure before the
      // orchestrator is fully extracted from the cron endpoint.
      logger.warn(
        'No orchestrator module found. Running in stub mode. ' +
          'Please implement src/lib/sync/orchestrator.ts with a runSync() export.'
      );
      await runStubSync(prisma);
    }

    const durationMs = Date.now() - startTime;
    updateSyncStatus('success', durationMs);
    logger.info('Sync cycle completed successfully', { durationMs });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    updateSyncStatus('error', durationMs);
    logger.error('Sync cycle failed', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      durationMs,
    });

    // Don't re-throw in continuous mode — just log and continue
    if (workerConfig.runOnce) {
      throw err;
    }
  }
}

/**
 * Stub sync function for when the orchestrator hasn't been extracted yet.
 * Verifies the database connection and logs enabled modules.
 */
async function runStubSync(
  prisma: ReturnType<typeof getWorkerPrisma>
): Promise<void> {
  // Verify database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection verified');
  } catch (err) {
    logger.error('Database connection failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const enabledModules = Object.entries(workerConfig.modules)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);

  logger.info('Stub sync completed. Enabled modules (not yet wired):', {
    modules: enabledModules,
  });
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

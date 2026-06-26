#!/usr/bin/env node

import { disconnectWorkerPrisma } from "./prisma";
import { logger } from "./logger";
import { runImladrisMaterializationWorkerOnce } from "./imladris-materialization-worker";

async function main(): Promise<void> {
  logger.info("Imladris materialization worker starting", {
    rawBatchSize: process.env.IMLADRIS_MATERIALIZATION_RAW_BATCH_SIZE,
    maxRawRecordsPerSource: process.env.IMLADRIS_MATERIALIZATION_MAX_RAW_RECORDS_PER_SOURCE,
    maxRawRecordsTotal: process.env.IMLADRIS_MATERIALIZATION_MAX_RAW_RECORDS_TOTAL,
    departmentLimit: process.env.IMLADRIS_MATERIALIZATION_DEPARTMENT_LIMIT,
  });

  const outcome = await runImladrisMaterializationWorkerOnce();
  if (outcome.skipped) {
    logger.info("Imladris materialization skipped", {
      reason: outcome.reason,
    });
    return;
  }

  logger.info("Imladris materialization completed", {
    materialization: outcome.result,
  });
  if (outcome.result.contextsFailed > 0) {
    throw new Error(
      `Imladris materialization failed for ${outcome.result.contextsFailed} context(s)`,
    );
  }
}

main()
  .catch((error) => {
    logger.error("Imladris materialization worker failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectWorkerPrisma();
  });

import {
  runImladrisMaterializationJob,
  type ImladrisMaterializationJobResult,
} from "@/lib/imladris/materialization-job";
import type { PrismaClientType } from "@/lib/prisma";
import { withSyncAdvisoryLock } from "@/lib/sync/sync-lock";
import { getWorkerPool, getWorkerPrisma } from "./prisma";

export type ImladrisMaterializationWorkerResult =
  | {
      skipped: false;
      result: ImladrisMaterializationJobResult;
    }
  | {
      skipped: true;
      reason: string;
    };

export async function runImladrisMaterializationWorkerOnce(): Promise<ImladrisMaterializationWorkerResult> {
  const prisma = getWorkerPrisma() as unknown as PrismaClientType;
  const outcome = await withSyncAdvisoryLock(
    () => runImladrisMaterializationJob({ prisma }),
    { pool: getWorkerPool() },
  );

  if (!outcome.ran) {
    return {
      skipped: true,
      reason: outcome.reason,
    };
  }

  return {
    skipped: false,
    result: outcome.result,
  };
}

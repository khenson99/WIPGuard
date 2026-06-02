import type { workerConfig } from "./config";
import type { getWorkerPrisma } from "./prisma";

type WorkerPrisma = ReturnType<typeof getWorkerPrisma>;
type WorkerModules = typeof workerConfig.modules;

export type SyncOrchestrator = {
  runSync: (prisma: WorkerPrisma, modules: WorkerModules) => Promise<unknown>;
};

export type OrchestratorImporter = (modulePath: string) => Promise<unknown>;

const ORCHESTRATOR_CANDIDATES = [
  "../src/lib/sync/orchestrator",
  "../src/lib/cron/sync",
  "../lib/sync/orchestrator",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickOrchestratorModule(moduleValue: unknown): SyncOrchestrator | null {
  const moduleRecord = asRecord(moduleValue);
  if (!moduleRecord) return null;

  if (typeof moduleRecord.runSync === "function") {
    return { runSync: moduleRecord.runSync as SyncOrchestrator["runSync"] };
  }

  const defaultRecord = asRecord(moduleRecord.default);
  if (typeof defaultRecord?.runSync === "function") {
    return { runSync: defaultRecord.runSync as SyncOrchestrator["runSync"] };
  }

  return null;
}

function missingModuleSpecifier(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /Cannot find (?:module|package) ['"]([^'"]+)['"]/.exec(message);
  return match?.[1] ?? null;
}

function isMissingCandidateModule(error: unknown, candidate: string): boolean {
  const record = asRecord(error);
  const code = typeof record?.code === "string" ? record.code : null;
  if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") {
    return false;
  }

  const specifier = missingModuleSpecifier(error);
  if (!specifier) return false;

  const normalizedSpecifier = specifier.replace(/\\/g, "/");
  const normalizedCandidate = candidate.replace(/\\/g, "/");
  const suffix = normalizedCandidate.replace(/^\.\.\//, "/");

  return (
    normalizedSpecifier === normalizedCandidate ||
    normalizedSpecifier.endsWith(suffix) ||
    normalizedSpecifier.endsWith(`${suffix}.ts`)
  );
}

export async function loadOrchestrator(
  importer: OrchestratorImporter = (modulePath) => import(modulePath),
): Promise<SyncOrchestrator> {
  const missingCandidates: string[] = [];

  for (const modulePath of ORCHESTRATOR_CANDIDATES) {
    try {
      const orchestrator = pickOrchestratorModule(await importer(modulePath));
      if (!orchestrator) {
        throw new Error(`Sync orchestrator candidate ${modulePath} does not export runSync`);
      }
      return orchestrator;
    } catch (error) {
      if (isMissingCandidateModule(error, modulePath)) {
        missingCandidates.push(modulePath);
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot load sync orchestrator candidate ${modulePath}: ${message}`, {
        cause: error,
      });
    }
  }

  throw new Error(`No sync orchestrator module found. Tried: ${missingCandidates.join(", ")}`);
}

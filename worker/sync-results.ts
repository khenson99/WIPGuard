interface SyncModuleResult {
  module?: unknown;
  success?: unknown;
  error?: unknown;
}

function formatFailedModule(result: SyncModuleResult): string {
  const moduleName = typeof result.module === "string" && result.module.trim()
    ? result.module
    : "unknown";
  const error = typeof result.error === "string" && result.error.trim()
    ? result.error
    : "failed without error detail";

  return `${moduleName}: ${error}`;
}

export function assertSyncResultsHealthy(result: unknown): void {
  if (!Array.isArray(result)) {
    return;
  }

  const failedModules = result
    .filter((entry): entry is SyncModuleResult => {
      if (!entry || typeof entry !== "object") return false;
      return (entry as SyncModuleResult).success === false;
    })
    .map(formatFailedModule);

  if (failedModules.length > 0) {
    throw new Error(`Sync cycle completed with failed modules: ${failedModules.join("; ")}`);
  }
}

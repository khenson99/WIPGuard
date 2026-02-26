import { CircuitOpenError, getCircuitState } from "./circuit-breaker";

/**
 * Structured observability wrapper for integration sync operations.
 *
 * Logs a single structured entry per sync invocation with:
 *  - provider & syncType identification
 *  - userId (for per-user debugging)
 *  - timing (durationMs)
 *  - outcome (success / error / circuit_open)
 *  - key metrics extracted from the result (tasks created, errors, etc.)
 *  - circuit breaker state at the time of the call
 *
 * Usage in route handlers:
 *   const result = await withSyncObservability(
 *     "hubspot", "bidirectional-sync", userId,
 *     () => runHubSpotBidirectionalSync({ userId, dryRun }),
 *   );
 */

export interface SyncLogEntry {
  event: "integration.sync";
  provider: string;
  syncType: string;
  userId: string;
  durationMs: number;
  outcome: "success" | "error" | "circuit_open";
  circuitState: string;
  dryRun?: boolean;
  /** Key numeric metrics pulled from the result, e.g. { createdTasks: 3, errors: 1 } */
  metrics?: Record<string, number>;
  error?: string;
}

/**
 * Extract numeric fields from a sync result object for the log entry.
 * Picks any top-level number values, skipping internal identifiers.
 */
function extractMetrics(result: unknown): Record<string, number> | undefined {
  if (!result || typeof result !== "object") return undefined;
  const metrics: Record<string, number> = {};
  const skip = new Set(["ruleId"]);
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (typeof value === "number" && !skip.has(key)) {
      metrics[key] = value;
    }
  }
  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

/**
 * Wrap a sync function call with structured observability logging.
 *
 * The wrapper is transparent — it returns the same result or rethrows
 * the same error after logging.
 */
export async function withSyncObservability<T>(
  provider: string,
  syncType: string,
  userId: string,
  fn: () => Promise<T>,
  options?: { dryRun?: boolean },
): Promise<T> {
  const start = performance.now();

  const logEntry: SyncLogEntry = {
    event: "integration.sync",
    provider,
    syncType,
    userId,
    durationMs: 0,
    outcome: "success",
    circuitState: getCircuitState(provider, userId),
    dryRun: options?.dryRun ?? undefined,
  };

  try {
    const result = await fn();
    logEntry.durationMs = Math.round(performance.now() - start);
    logEntry.metrics = extractMetrics(result);
    console.info("[integration.sync]", JSON.stringify(logEntry));
    return result;
  } catch (error) {
    logEntry.durationMs = Math.round(performance.now() - start);
    logEntry.circuitState = getCircuitState(provider, userId);

    if (error instanceof CircuitOpenError) {
      logEntry.outcome = "circuit_open";
      logEntry.error = error.message;
      console.warn("[integration.sync]", JSON.stringify(logEntry));
    } else {
      logEntry.outcome = "error";
      logEntry.error = error instanceof Error ? error.message : String(error);
      console.error("[integration.sync]", JSON.stringify(logEntry));
    }

    throw error;
  }
}

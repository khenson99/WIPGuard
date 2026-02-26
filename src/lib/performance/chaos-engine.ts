/**
 * Chaos Engine
 *
 * Chaos testing framework for integration endpoint failures.
 * Simulates network partitions, service timeouts, and random failure injection
 * while validating data integrity throughout.
 */

import { createSeededRandom } from "./load-test-harness";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FailureType =
  | "network_partition"
  | "service_timeout"
  | "connection_reset"
  | "rate_limit"
  | "corrupt_response"
  | "dns_failure";

export interface FailureInjection {
  type: FailureType;
  /** Probability of this failure occurring per request (0-1) */
  probability: number;
  /** Duration of the failure condition in ms */
  durationMs: number;
  /** Services targeted by this injection */
  targetServices: string[];
}

export interface ChaosScenario {
  scenarioId: string;
  seed: number;
  /** Failure injections active during this scenario */
  injections: FailureInjection[];
  /** Total scenario duration in ms */
  durationMs: number;
  /** Number of concurrent operations to simulate */
  concurrentOps: number;
  /** Data records to track for integrity verification */
  dataRecordCount: number;
}

export interface OperationOutcome {
  service: string;
  success: boolean;
  failureType?: FailureType;
  latencyMs: number;
  retryCount: number;
  dataCorrupted: boolean;
}

export interface DataIntegrityReport {
  totalRecords: number;
  corruptedRecords: number;
  missingRecords: number;
  duplicateRecords: number;
  integrityScore: number;
}

export interface ChaosResult {
  scenarioId: string;
  totalOperations: number;
  outcomes: OperationOutcome[];
  failuresByType: Record<FailureType, number>;
  dataIntegrity: DataIntegrityReport;
  meanRecoveryTimeMs: number;
  maxRecoveryTimeMs: number;
  servicesAffected: string[];
  gracefulDegradations: number;
}

// ---------------------------------------------------------------------------
// Failure injection
// ---------------------------------------------------------------------------

/**
 * Determine whether a failure should be injected for a given operation.
 * Returns the failure type or null if no failure is injected.
 */
export function injectFailure(
  rand: () => number,
  injections: FailureInjection[],
  service: string,
  elapsedMs: number,
): FailureType | null {
  for (const injection of injections) {
    // Check if service is targeted
    if (!injection.targetServices.includes(service)) continue;

    // Check if within injection duration window
    if (elapsedMs > injection.durationMs) continue;

    // Roll against probability
    if (rand() < injection.probability) {
      return injection.type;
    }
  }
  return null;
}

/**
 * Simulate the latency impact of a given failure type.
 */
function failureLatency(rand: () => number, failureType: FailureType): number {
  switch (failureType) {
    case "network_partition":
      return 5000 + Math.round(rand() * 10000); // 5-15s
    case "service_timeout":
      return 30000; // Fixed 30s timeout
    case "connection_reset":
      return Math.round(rand() * 100); // Very fast failure
    case "rate_limit":
      return 1000 + Math.round(rand() * 2000); // 1-3s backoff
    case "corrupt_response":
      return 50 + Math.round(rand() * 200); // Normal-ish latency
    case "dns_failure":
      return 3000 + Math.round(rand() * 5000); // 3-8s DNS timeout
  }
}

/**
 * Simulate a retry loop for a failed operation.
 * Returns the total latency and number of retries.
 */
function simulateRetry(
  rand: () => number,
  failureType: FailureType,
  maxRetries: number = 3,
): { totalLatencyMs: number; retryCount: number; recovered: boolean } {
  let totalLatencyMs = 0;
  let retryCount = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    retryCount++;
    // Exponential backoff: 100ms, 200ms, 400ms...
    const backoff = 100 * Math.pow(2, attempt);
    totalLatencyMs += backoff;

    // Recovery probability increases with each retry
    const recoveryChance = 0.3 + attempt * 0.25;
    if (rand() < recoveryChance) {
      // Add normal operation latency on recovery
      totalLatencyMs += 50 + Math.round(rand() * 150);
      return { totalLatencyMs, retryCount, recovered: true };
    }
    totalLatencyMs += failureLatency(rand, failureType) * 0.3; // Partial failure latency on retry
  }

  return { totalLatencyMs, retryCount, recovered: false };
}

// ---------------------------------------------------------------------------
// Data integrity validation
// ---------------------------------------------------------------------------

/**
 * Validate data integrity after chaos operations.
 * Checks for corruption, missing records, and duplicates.
 */
export function validateDataIntegrity(
  rand: () => number,
  totalRecords: number,
  corruptResponseCount: number,
  failedOperations: number,
): DataIntegrityReport {
  // Corruption only happens if corrupt_response failures occurred AND
  // the system failed to catch them. We simulate a 95% catch rate.
  const uncaughtCorruptions = Math.round(
    corruptResponseCount * (rand() < 0.95 ? 0 : 0.1),
  );

  // Missing records: very rare, only under sustained partition (0.1% of failures)
  const missingRecords = Math.round(failedOperations * 0.001);

  // Duplicates: can happen on retry success (idempotency should catch 99%)
  const potentialDuplicates = Math.round(failedOperations * 0.01);
  const actualDuplicates = Math.round(potentialDuplicates * (1 - 0.99));

  const corruptedRecords = uncaughtCorruptions;

  const integrityScore =
    totalRecords > 0
      ? Math.max(
          0,
          1 -
            (corruptedRecords + missingRecords + actualDuplicates) /
              totalRecords,
        )
      : 1;

  return {
    totalRecords,
    corruptedRecords,
    missingRecords,
    duplicateRecords: actualDuplicates,
    integrityScore,
  };
}

// ---------------------------------------------------------------------------
// Scenario execution
// ---------------------------------------------------------------------------

/**
 * Execute a full chaos scenario simulation.
 */
export function runChaosScenario(scenario: ChaosScenario): ChaosResult {
  const rand = createSeededRandom(scenario.seed);

  const services = [
    ...new Set(scenario.injections.flatMap((i) => i.targetServices)),
  ];
  if (services.length === 0) services.push("default");

  const outcomes: OperationOutcome[] = [];
  const failuresByType: Record<FailureType, number> = {
    network_partition: 0,
    service_timeout: 0,
    connection_reset: 0,
    rate_limit: 0,
    corrupt_response: 0,
    dns_failure: 0,
  };

  let corruptResponseCount = 0;
  let gracefulDegradations = 0;
  const recoveryTimes: number[] = [];

  const tickMs = 200;
  const opsPerTick = Math.max(
    1,
    Math.round(
      scenario.concurrentOps / (scenario.durationMs / tickMs),
    ),
  );

  for (let t = 0; t < scenario.durationMs; t += tickMs) {
    for (let i = 0; i < opsPerTick; i++) {
      const service = services[Math.floor(rand() * services.length)];
      const failure = injectFailure(rand, scenario.injections, service, t);

      if (failure) {
        failuresByType[failure]++;
        if (failure === "corrupt_response") corruptResponseCount++;

        const retryResult = simulateRetry(rand, failure);
        const totalLatency =
          failureLatency(rand, failure) + retryResult.totalLatencyMs;

        if (retryResult.recovered) {
          recoveryTimes.push(totalLatency);
          gracefulDegradations++;
        }

        outcomes.push({
          service,
          success: retryResult.recovered,
          failureType: failure,
          latencyMs: totalLatency,
          retryCount: retryResult.retryCount,
          dataCorrupted: failure === "corrupt_response" && !retryResult.recovered,
        });
      } else {
        // Normal operation
        const latency = 20 + Math.round(rand() * 180);
        outcomes.push({
          service,
          success: true,
          latencyMs: latency,
          retryCount: 0,
          dataCorrupted: false,
        });
      }
    }
  }

  const failedOps = outcomes.filter((o) => !o.success).length;
  const dataIntegrity = validateDataIntegrity(
    rand,
    scenario.dataRecordCount,
    corruptResponseCount,
    failedOps,
  );

  return {
    scenarioId: scenario.scenarioId,
    totalOperations: outcomes.length,
    outcomes,
    failuresByType,
    dataIntegrity,
    meanRecoveryTimeMs:
      recoveryTimes.length > 0
        ? Math.round(
            recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length,
          )
        : 0,
    maxRecoveryTimeMs:
      recoveryTimes.length > 0 ? Math.max(...recoveryTimes) : 0,
    servicesAffected: services,
    gracefulDegradations,
  };
}

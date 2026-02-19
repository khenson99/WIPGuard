/**
 * Load Test Harness
 *
 * Deterministic load testing framework for concurrent board users
 * and event bursts. All randomness is seeded for reproducibility.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32) for deterministic test runs
// ---------------------------------------------------------------------------
export function createSeededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RampPattern = "linear" | "step" | "spike";

export interface ConcurrencyProfile {
  /** Maximum number of concurrent users */
  maxUsers: number;
  /** Ramp-up pattern */
  rampPattern: RampPattern;
  /** Total duration of the ramp-up phase in ms */
  rampDurationMs: number;
  /** Duration to sustain peak load in ms */
  sustainDurationMs: number;
}

export interface LoadTestConfig {
  /** Unique test run identifier */
  testId: string;
  /** Seed for deterministic randomness */
  seed: number;
  /** Concurrency profile */
  concurrency: ConcurrencyProfile;
  /** Target operations per second per user */
  opsPerSecondPerUser: number;
  /** Simulated operation latency range [min, max] in ms */
  latencyRange: [number, number];
  /** Timeout for individual operations in ms */
  operationTimeoutMs: number;
}

export interface LatencyBucket {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  mean: number;
}

export interface LoadTestResult {
  testId: string;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  timedOutOperations: number;
  successRate: number;
  latency: LatencyBucket;
  peakConcurrentUsers: number;
  throughputOpsPerSec: number;
  /** Chronological latency samples */
  samples: number[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Generate the number of concurrent users at a given time point.
 */
export function generateConcurrentUsers(
  profile: ConcurrencyProfile,
  elapsedMs: number,
): number {
  const { maxUsers, rampPattern, rampDurationMs, sustainDurationMs } = profile;

  // After ramp + sustain, begin ramp-down (mirror of ramp)
  const totalActiveMs = rampDurationMs + sustainDurationMs;
  if (elapsedMs >= totalActiveMs + rampDurationMs) return 0;
  if (elapsedMs >= totalActiveMs) {
    const rampDownElapsed = elapsedMs - totalActiveMs;
    const fraction = 1 - rampDownElapsed / rampDurationMs;
    return Math.max(1, Math.round(maxUsers * Math.max(0, fraction)));
  }

  // Sustain phase
  if (elapsedMs >= rampDurationMs) return maxUsers;

  // Ramp-up phase
  const fraction = Math.min(1, elapsedMs / rampDurationMs);

  switch (rampPattern) {
    case "linear":
      return Math.max(1, Math.round(maxUsers * fraction));
    case "step": {
      const steps = 5;
      const stepFraction = Math.floor(fraction * steps) / steps;
      return Math.max(1, Math.round(maxUsers * stepFraction));
    }
    case "spike":
      // Exponential ramp
      return Math.max(
        1,
        Math.round(maxUsers * Math.pow(fraction, 0.3)),
      );
  }
}

/**
 * Simulate a single operation latency based on seeded random and config.
 */
export function measureLatency(
  rand: () => number,
  config: LoadTestConfig,
): { latencyMs: number; success: boolean; timedOut: boolean } {
  const [minLat, maxLat] = config.latencyRange;
  const base = minLat + rand() * (maxLat - minLat);

  // 5% chance of a slow operation (2-5x base latency)
  const slowFactor = rand() < 0.05 ? 2 + rand() * 3 : 1;
  const latencyMs = Math.round(base * slowFactor);

  const timedOut = latencyMs > config.operationTimeoutMs;

  // 2% base failure rate, increases with latency
  const failureChance = 0.02 + (latencyMs / config.operationTimeoutMs) * 0.03;
  const success = !timedOut && rand() > failureChance;

  return { latencyMs: Math.min(latencyMs, config.operationTimeoutMs), success, timedOut };
}

/**
 * Aggregate an array of latency samples into percentile buckets.
 */
export function aggregateResults(samples: number[]): LatencyBucket {
  if (samples.length === 0) {
    return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, max: 0, min: 0, mean: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  };

  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    max: sorted[sorted.length - 1],
    min: sorted[0],
    mean: Math.round(sum / sorted.length),
  };
}

/**
 * Execute a full load test simulation. Fully deterministic given the config seed.
 */
export function runLoadTest(config: LoadTestConfig): LoadTestResult {
  const rand = createSeededRandom(config.seed);
  const { concurrency, opsPerSecondPerUser } = config;
  const totalDurationMs =
    concurrency.rampDurationMs * 2 + concurrency.sustainDurationMs;

  const samples: number[] = [];
  let successCount = 0;
  let failCount = 0;
  let timedOutCount = 0;
  let peakUsers = 0;

  // Simulate at 100ms tick intervals
  const tickMs = 100;
  const opsPerTick = opsPerSecondPerUser / (1000 / tickMs);

  for (let t = 0; t < totalDurationMs; t += tickMs) {
    const users = generateConcurrentUsers(concurrency, t);
    peakUsers = Math.max(peakUsers, users);

    // Each user generates opsPerTick operations per tick
    const opsThisTick = Math.round(users * opsPerTick);

    for (let i = 0; i < opsThisTick; i++) {
      const result = measureLatency(rand, config);
      samples.push(result.latencyMs);

      if (result.timedOut) {
        timedOutCount++;
      } else if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  const totalOps = successCount + failCount + timedOutCount;
  const durationSec = totalDurationMs / 1000;

  return {
    testId: config.testId,
    totalOperations: totalOps,
    successfulOperations: successCount,
    failedOperations: failCount,
    timedOutOperations: timedOutCount,
    successRate: totalOps > 0 ? successCount / totalOps : 0,
    latency: aggregateResults(samples),
    peakConcurrentUsers: peakUsers,
    throughputOpsPerSec: totalOps > 0 ? Math.round(totalOps / durationSec) : 0,
    samples,
    durationMs: totalDurationMs,
  };
}

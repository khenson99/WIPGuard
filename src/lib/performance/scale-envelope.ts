/**
 * Scale Envelope
 *
 * Derives safe operating limits from load test and chaos test data.
 * Produces tuning recommendations with before/after evidence.
 *
 * Key thresholds:
 * - SAFETY_MARGIN: 0.80 (80%)
 * - MIN_SUCCESS_RATE: 0.95
 * - MAX_P95_LATENCY_MS: 2000
 */

import type { LoadTestResult } from "./load-test-harness";
import type { ChaosResult } from "./chaos-engine";
import type { WebSocketResilienceResult } from "./websocket-resilience";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SAFETY_MARGIN = 0.8;
export const MIN_SUCCESS_RATE = 0.95;
export const MAX_P95_LATENCY_MS = 2000;
export const MAX_DATA_LOSS_RATE = 0.001; // 0.1%
export const MIN_DATA_INTEGRITY_SCORE = 0.999;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = "info" | "warning" | "critical";
export type Category =
  | "concurrency"
  | "latency"
  | "throughput"
  | "resilience"
  | "data_integrity"
  | "websocket";

export interface ScaleEnvelope {
  /** Maximum safe concurrent users (with safety margin) */
  maxSafeConcurrentUsers: number;
  /** Maximum raw concurrent users observed at threshold */
  maxRawConcurrentUsers: number;
  /** Maximum safe throughput (ops/sec with safety margin) */
  maxSafeThroughput: number;
  /** P95 latency at safe operating point */
  p95LatencyAtSafePoint: number;
  /** Success rate at safe operating point */
  successRateAtSafePoint: number;
  /** Data integrity score under chaos */
  dataIntegrityScore: number;
  /** Mean recovery time from failures */
  meanRecoveryTimeMs: number;
  /** WebSocket reconnection success rate */
  wsReconnectRate: number;
  /** Data loss rate under disconnect */
  wsDataLossRate: number;
  /** Whether envelope meets all thresholds */
  meetsAllThresholds: boolean;
  /** Individual threshold results */
  thresholds: ThresholdResult[];
}

export interface ThresholdResult {
  name: string;
  category: Category;
  threshold: number;
  actual: number;
  passed: boolean;
  margin: number;
}

export interface TuningRecommendation {
  id: string;
  severity: Severity;
  category: Category;
  title: string;
  description: string;
  currentValue: number;
  recommendedValue: number;
  expectedImprovement: string;
}

export interface ScaleReport {
  generatedAt: string;
  envelope: ScaleEnvelope;
  recommendations: TuningRecommendation[];
  loadTestSummary: {
    testId: string;
    totalOps: number;
    successRate: number;
    p95Latency: number;
    peakUsers: number;
  };
  chaosTestSummary: {
    scenarioId: string;
    totalOps: number;
    integrityScore: number;
    gracefulDegradations: number;
  } | null;
  wsTestSummary: {
    testId: string;
    reconnectRate: number;
    dataLossRate: number;
    meanReconnectTimeMs: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Envelope derivation
// ---------------------------------------------------------------------------

/**
 * Define the scale envelope from test results.
 */
export function defineScaleEnvelope(
  loadResult: LoadTestResult,
  chaosResult?: ChaosResult,
  wsResult?: WebSocketResilienceResult,
): ScaleEnvelope {
  // Apply safety margin to peak observed values
  const maxSafeConcurrentUsers = Math.floor(
    loadResult.peakConcurrentUsers * SAFETY_MARGIN,
  );
  const maxSafeThroughput = Math.floor(
    loadResult.throughputOpsPerSec * SAFETY_MARGIN,
  );

  const dataIntegrityScore = chaosResult?.dataIntegrity.integrityScore ?? 1;
  const meanRecoveryTimeMs = chaosResult?.meanRecoveryTimeMs ?? 0;
  const wsReconnectRate = wsResult
    ? wsResult.clientsReconnected / wsResult.totalClients
    : 1;
  const wsDataLossRate = wsResult?.dataLossRate ?? 0;

  const thresholds: ThresholdResult[] = [
    {
      name: "Success Rate",
      category: "throughput",
      threshold: MIN_SUCCESS_RATE,
      actual: loadResult.successRate,
      passed: loadResult.successRate >= MIN_SUCCESS_RATE,
      margin: loadResult.successRate - MIN_SUCCESS_RATE,
    },
    {
      name: "P95 Latency",
      category: "latency",
      threshold: MAX_P95_LATENCY_MS,
      actual: loadResult.latency.p95,
      passed: loadResult.latency.p95 <= MAX_P95_LATENCY_MS,
      margin: MAX_P95_LATENCY_MS - loadResult.latency.p95,
    },
    {
      name: "Data Integrity",
      category: "data_integrity",
      threshold: MIN_DATA_INTEGRITY_SCORE,
      actual: dataIntegrityScore,
      passed: dataIntegrityScore >= MIN_DATA_INTEGRITY_SCORE,
      margin: dataIntegrityScore - MIN_DATA_INTEGRITY_SCORE,
    },
    {
      name: "Data Loss Rate",
      category: "websocket",
      threshold: MAX_DATA_LOSS_RATE,
      actual: wsDataLossRate,
      passed: wsDataLossRate <= MAX_DATA_LOSS_RATE,
      margin: MAX_DATA_LOSS_RATE - wsDataLossRate,
    },
  ];

  return {
    maxSafeConcurrentUsers,
    maxRawConcurrentUsers: loadResult.peakConcurrentUsers,
    maxSafeThroughput,
    p95LatencyAtSafePoint: loadResult.latency.p95,
    successRateAtSafePoint: loadResult.successRate,
    dataIntegrityScore,
    meanRecoveryTimeMs,
    wsReconnectRate,
    wsDataLossRate,
    meetsAllThresholds: thresholds.every((t) => t.passed),
    thresholds,
  };
}

// ---------------------------------------------------------------------------
// Tuning recommendations
// ---------------------------------------------------------------------------

/**
 * Generate tuning recommendations based on envelope analysis.
 */
export function generateTuningRecommendations(
  envelope: ScaleEnvelope,
  loadResult: LoadTestResult,
  chaosResult?: ChaosResult,
  wsResult?: WebSocketResilienceResult,
): TuningRecommendation[] {
  const recommendations: TuningRecommendation[] = [];
  let idCounter = 1;

  // Check success rate
  if (loadResult.successRate < MIN_SUCCESS_RATE) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "critical",
      category: "throughput",
      title: "Increase operation success rate",
      description:
        "Success rate is below the minimum threshold. Consider increasing timeouts, adding retry logic, or reducing concurrent load.",
      currentValue: loadResult.successRate,
      recommendedValue: MIN_SUCCESS_RATE,
      expectedImprovement: `${((MIN_SUCCESS_RATE - loadResult.successRate) * 100).toFixed(1)}% improvement needed`,
    });
  }

  // Check P95 latency
  if (loadResult.latency.p95 > MAX_P95_LATENCY_MS) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "critical",
      category: "latency",
      title: "Reduce P95 latency",
      description:
        "P95 latency exceeds the maximum threshold. Consider optimizing database queries, adding caching, or reducing payload sizes.",
      currentValue: loadResult.latency.p95,
      recommendedValue: MAX_P95_LATENCY_MS,
      expectedImprovement: `${loadResult.latency.p95 - MAX_P95_LATENCY_MS}ms reduction needed`,
    });
  }

  // Check P99 vs P95 spread (tail latency)
  const tailSpread = loadResult.latency.p99 - loadResult.latency.p95;
  if (tailSpread > loadResult.latency.p95 * 0.5) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "warning",
      category: "latency",
      title: "Reduce tail latency spread",
      description:
        "Large gap between P95 and P99 indicates inconsistent performance. Consider circuit breakers or request hedging.",
      currentValue: tailSpread,
      recommendedValue: Math.round(loadResult.latency.p95 * 0.3),
      expectedImprovement: "More predictable response times",
    });
  }

  // Concurrency headroom
  if (envelope.maxSafeConcurrentUsers < 10) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "warning",
      category: "concurrency",
      title: "Increase concurrency headroom",
      description:
        "Safe concurrent user limit is very low. Consider horizontal scaling or connection pooling.",
      currentValue: envelope.maxSafeConcurrentUsers,
      recommendedValue: 20,
      expectedImprovement: "Support more simultaneous users",
    });
  }

  // Data integrity under chaos
  if (chaosResult && chaosResult.dataIntegrity.integrityScore < MIN_DATA_INTEGRITY_SCORE) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "critical",
      category: "data_integrity",
      title: "Improve data integrity under failure",
      description:
        "Data integrity score is below threshold during chaos testing. Strengthen idempotency keys and transactional boundaries.",
      currentValue: chaosResult.dataIntegrity.integrityScore,
      recommendedValue: MIN_DATA_INTEGRITY_SCORE,
      expectedImprovement: "Zero data corruption under failure",
    });
  }

  // Recovery time
  if (chaosResult && chaosResult.meanRecoveryTimeMs > 5000) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "warning",
      category: "resilience",
      title: "Reduce mean recovery time",
      description:
        "Mean recovery time is high. Consider faster health checks, pre-warmed connections, or circuit breaker pattern.",
      currentValue: chaosResult.meanRecoveryTimeMs,
      recommendedValue: 3000,
      expectedImprovement: `${chaosResult.meanRecoveryTimeMs - 3000}ms faster recovery`,
    });
  }

  // WebSocket data loss
  if (wsResult && wsResult.dataLossRate > MAX_DATA_LOSS_RATE) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "critical",
      category: "websocket",
      title: "Reduce WebSocket data loss rate",
      description:
        "Data loss during WebSocket disconnects exceeds threshold. Increase message queue size or implement server-side buffering.",
      currentValue: wsResult.dataLossRate,
      recommendedValue: MAX_DATA_LOSS_RATE,
      expectedImprovement: "Near-zero message loss during reconnection",
    });
  }

  // WebSocket reconnection rate
  if (wsResult && wsResult.clientsReconnected / wsResult.totalClients < 0.9) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "warning",
      category: "websocket",
      title: "Improve WebSocket reconnection success rate",
      description:
        "Too many clients failing to reconnect. Adjust backoff parameters or increase max retry attempts.",
      currentValue: wsResult.clientsReconnected / wsResult.totalClients,
      recommendedValue: 0.95,
      expectedImprovement: "More reliable client reconnection",
    });
  }

  // Throughput efficiency
  const opsPerUser =
    loadResult.peakConcurrentUsers > 0
      ? loadResult.throughputOpsPerSec / loadResult.peakConcurrentUsers
      : 0;
  if (opsPerUser < 1) {
    recommendations.push({
      id: `tune-${idCounter++}`,
      severity: "info",
      category: "throughput",
      title: "Optimize per-user throughput",
      description:
        "Operations per second per user is below 1. Consider request batching or reducing per-request overhead.",
      currentValue: Math.round(opsPerUser * 100) / 100,
      recommendedValue: 2,
      expectedImprovement: "Better utilization of concurrent connections",
    });
  }

  return recommendations;
}

// ---------------------------------------------------------------------------
// Envelope validation
// ---------------------------------------------------------------------------

/**
 * Validate that a scale envelope meets all defined thresholds.
 */
export function validateEnvelope(envelope: ScaleEnvelope): {
  valid: boolean;
  failures: string[];
} {
  const failures: string[] = [];

  for (const threshold of envelope.thresholds) {
    if (!threshold.passed) {
      failures.push(
        `${threshold.name}: actual=${threshold.actual.toFixed(4)}, threshold=${threshold.threshold.toFixed(4)}`,
      );
    }
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

/**
 * Format a complete scale report.
 */
export function formatScaleReport(
  envelope: ScaleEnvelope,
  recommendations: TuningRecommendation[],
  loadResult: LoadTestResult,
  chaosResult?: ChaosResult,
  wsResult?: WebSocketResilienceResult,
): ScaleReport {
  return {
    generatedAt: new Date().toISOString(),
    envelope,
    recommendations,
    loadTestSummary: {
      testId: loadResult.testId,
      totalOps: loadResult.totalOperations,
      successRate: loadResult.successRate,
      p95Latency: loadResult.latency.p95,
      peakUsers: loadResult.peakConcurrentUsers,
    },
    chaosTestSummary: chaosResult
      ? {
          scenarioId: chaosResult.scenarioId,
          totalOps: chaosResult.totalOperations,
          integrityScore: chaosResult.dataIntegrity.integrityScore,
          gracefulDegradations: chaosResult.gracefulDegradations,
        }
      : null,
    wsTestSummary: wsResult
      ? {
          testId: wsResult.testId,
          reconnectRate:
            wsResult.clientsReconnected / wsResult.totalClients,
          dataLossRate: wsResult.dataLossRate,
          meanReconnectTimeMs: wsResult.meanReconnectTimeMs,
        }
      : null,
  };
}

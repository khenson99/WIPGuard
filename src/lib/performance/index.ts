/**
 * Performance & Resilience Validation
 *
 * Barrel export for load testing, chaos engineering, websocket
 * resilience, and scale envelope analysis.
 */

export {
  createSeededRandom,
  generateConcurrentUsers,
  measureLatency,
  aggregateResults,
  runLoadTest,
} from "./load-test-harness";

export type {
  RampPattern,
  ConcurrencyProfile,
  LoadTestConfig,
  LatencyBucket,
  LoadTestResult,
} from "./load-test-harness";

export {
  injectFailure,
  runChaosScenario,
  validateDataIntegrity,
} from "./chaos-engine";

export type {
  FailureType,
  FailureInjection,
  ChaosScenario,
  OperationOutcome,
  DataIntegrityReport,
  ChaosResult,
} from "./chaos-engine";

export {
  calculateBackoffDelay,
  simulateDisconnect,
  validateMessageOrdering,
  testQueueOverflow,
  testReconnectBehavior,
} from "./websocket-resilience";

export type {
  DisconnectReason,
  WebSocketTestConfig,
  DisconnectEvent,
  ReconnectAttempt,
  DisconnectResult,
  MessageOrderingResult,
  QueueOverflowResult,
  WebSocketResilienceResult,
} from "./websocket-resilience";

export {
  SAFETY_MARGIN,
  MIN_SUCCESS_RATE,
  MAX_P95_LATENCY_MS,
  MAX_DATA_LOSS_RATE,
  MIN_DATA_INTEGRITY_SCORE,
  defineScaleEnvelope,
  generateTuningRecommendations,
  validateEnvelope,
  formatScaleReport,
} from "./scale-envelope";

export type {
  Severity,
  Category,
  ScaleEnvelope,
  ThresholdResult,
  TuningRecommendation,
  ScaleReport,
} from "./scale-envelope";

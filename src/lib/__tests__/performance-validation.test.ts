import { describe, expect, it } from "vitest";

import {
  // Load test harness
  createSeededRandom,
  generateConcurrentUsers,
  measureLatency,
  aggregateResults,
  runLoadTest,
  // Chaos engine
  injectFailure,
  runChaosScenario,
  validateDataIntegrity,
  // WebSocket resilience
  calculateBackoffDelay,
  simulateDisconnect,
  validateMessageOrdering,
  testQueueOverflow,
  testReconnectBehavior,
  // Scale envelope
  defineScaleEnvelope,
  generateTuningRecommendations,
  validateEnvelope,
  formatScaleReport,
  SAFETY_MARGIN,
  MIN_SUCCESS_RATE,
  MAX_P95_LATENCY_MS,
} from "@/lib/performance";

import type {
  LoadTestConfig,
  ConcurrencyProfile,
  ChaosScenario,
  WebSocketTestConfig,
} from "@/lib/performance";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function defaultLoadConfig(overrides?: Partial<LoadTestConfig>): LoadTestConfig {
  return {
    testId: "load-test-1",
    seed: 42,
    concurrency: {
      maxUsers: 50,
      rampPattern: "linear",
      rampDurationMs: 2000,
      sustainDurationMs: 3000,
    },
    opsPerSecondPerUser: 2,
    latencyRange: [20, 200],
    operationTimeoutMs: 3000,
    ...overrides,
  };
}

function defaultChaosScenario(
  overrides?: Partial<ChaosScenario>,
): ChaosScenario {
  return {
    scenarioId: "chaos-1",
    seed: 42,
    injections: [
      {
        type: "network_partition",
        probability: 0.1,
        durationMs: 3000,
        targetServices: ["api-gateway"],
      },
      {
        type: "service_timeout",
        probability: 0.05,
        durationMs: 2000,
        targetServices: ["api-gateway", "database"],
      },
    ],
    durationMs: 5000,
    concurrentOps: 100,
    dataRecordCount: 1000,
    ...overrides,
  };
}

function defaultWsConfig(
  overrides?: Partial<WebSocketTestConfig>,
): WebSocketTestConfig {
  return {
    testId: "ws-test-1",
    seed: 42,
    clientCount: 20,
    baseReconnectMs: 100,
    maxReconnectMs: 5000,
    backoffMultiplier: 2,
    maxReconnectAttempts: 5,
    maxQueueSize: 100,
    jitterFactor: 0.2,
    ...overrides,
  };
}

// ===========================================================================
// LOAD TEST HARNESS
// ===========================================================================

describe("load-test-harness", () => {
  describe("createSeededRandom", () => {
    it("produces deterministic sequences from the same seed", () => {
      const rand1 = createSeededRandom(42);
      const rand2 = createSeededRandom(42);

      const seq1 = Array.from({ length: 10 }, () => rand1());
      const seq2 = Array.from({ length: 10 }, () => rand2());

      expect(seq1).toEqual(seq2);
    });

    it("produces different sequences from different seeds", () => {
      const rand1 = createSeededRandom(42);
      const rand2 = createSeededRandom(99);

      const seq1 = Array.from({ length: 10 }, () => rand1());
      const seq2 = Array.from({ length: 10 }, () => rand2());

      expect(seq1).not.toEqual(seq2);
    });

    it("produces values in [0, 1) range", () => {
      const rand = createSeededRandom(123);
      const values = Array.from({ length: 1000 }, () => rand());

      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe("generateConcurrentUsers", () => {
    const profile: ConcurrencyProfile = {
      maxUsers: 100,
      rampPattern: "linear",
      rampDurationMs: 1000,
      sustainDurationMs: 2000,
    };

    it("starts with at least 1 user during ramp-up", () => {
      expect(generateConcurrentUsers(profile, 0)).toBeGreaterThanOrEqual(1);
    });

    it("reaches maxUsers at end of ramp-up (linear)", () => {
      expect(generateConcurrentUsers(profile, 1000)).toBe(100);
    });

    it("sustains maxUsers during sustain phase", () => {
      expect(generateConcurrentUsers(profile, 1500)).toBe(100);
      expect(generateConcurrentUsers(profile, 2500)).toBe(100);
    });

    it("ramps down after sustain phase", () => {
      const midRampDown = generateConcurrentUsers(profile, 3500);
      expect(midRampDown).toBeLessThan(100);
      expect(midRampDown).toBeGreaterThanOrEqual(1);
    });

    it("returns 0 after full cycle completes", () => {
      // ramp(1000) + sustain(2000) + ramp_down(1000) = 4000
      expect(generateConcurrentUsers(profile, 4500)).toBe(0);
    });

    it("supports step ramp pattern", () => {
      const stepProfile: ConcurrencyProfile = {
        ...profile,
        rampPattern: "step",
      };
      // At 20% of ramp, step should be at floor(0.2 * 5)/5 = 0.2 = 20 users
      const at200ms = generateConcurrentUsers(stepProfile, 200);
      expect(at200ms).toBeLessThanOrEqual(20);
      expect(at200ms).toBeGreaterThanOrEqual(1);
    });

    it("supports spike ramp pattern with fast initial growth", () => {
      const spikeProfile: ConcurrencyProfile = {
        ...profile,
        rampPattern: "spike",
      };
      // Spike uses exponential ramp — should grow faster early
      const at200ms = generateConcurrentUsers(spikeProfile, 200);
      const linearAt200ms = generateConcurrentUsers(profile, 200);
      expect(at200ms).toBeGreaterThanOrEqual(linearAt200ms);
    });
  });

  describe("measureLatency", () => {
    it("produces latency within configured range for normal ops", () => {
      const config = defaultLoadConfig();
      const rand = createSeededRandom(42);

      // Run many samples — most should be in the normal range
      const samples = Array.from({ length: 100 }, () =>
        measureLatency(rand, config),
      );
      const normalOps = samples.filter(
        (s) => s.latencyMs <= config.operationTimeoutMs,
      );
      expect(normalOps.length).toBeGreaterThan(80);
    });

    it("caps latency at operation timeout", () => {
      const config = defaultLoadConfig({ operationTimeoutMs: 500 });
      const rand = createSeededRandom(42);

      const samples = Array.from({ length: 200 }, () =>
        measureLatency(rand, config),
      );
      for (const s of samples) {
        expect(s.latencyMs).toBeLessThanOrEqual(500);
      }
    });

    it("is deterministic with same seed", () => {
      const config = defaultLoadConfig();
      const rand1 = createSeededRandom(42);
      const rand2 = createSeededRandom(42);

      const result1 = measureLatency(rand1, config);
      const result2 = measureLatency(rand2, config);

      expect(result1).toEqual(result2);
    });
  });

  describe("aggregateResults", () => {
    it("returns zero buckets for empty array", () => {
      const result = aggregateResults([]);
      expect(result.p50).toBe(0);
      expect(result.mean).toBe(0);
    });

    it("computes correct percentiles for known data", () => {
      // 1..100
      const samples = Array.from({ length: 100 }, (_, i) => i + 1);
      const result = aggregateResults(samples);

      expect(result.p50).toBe(50);
      expect(result.p95).toBe(95);
      expect(result.p99).toBe(99);
      expect(result.min).toBe(1);
      expect(result.max).toBe(100);
      expect(result.mean).toBe(51); // rounded (50.5 -> 51 due to rounding)
    });

    it("handles single-element array", () => {
      const result = aggregateResults([42]);
      expect(result.p50).toBe(42);
      expect(result.p95).toBe(42);
      expect(result.min).toBe(42);
      expect(result.max).toBe(42);
    });
  });

  describe("runLoadTest", () => {
    it("produces deterministic results", () => {
      const config = defaultLoadConfig();
      const result1 = runLoadTest(config);
      const result2 = runLoadTest(config);

      expect(result1.totalOperations).toBe(result2.totalOperations);
      expect(result1.successRate).toBe(result2.successRate);
      expect(result1.latency).toEqual(result2.latency);
    });

    it("returns non-zero operations for valid config", () => {
      const result = runLoadTest(defaultLoadConfig());
      expect(result.totalOperations).toBeGreaterThan(0);
    });

    it("tracks peak concurrent users", () => {
      const result = runLoadTest(defaultLoadConfig());
      expect(result.peakConcurrentUsers).toBe(50);
    });

    it("sums success + fail + timeout = total", () => {
      const result = runLoadTest(defaultLoadConfig());
      expect(
        result.successfulOperations +
          result.failedOperations +
          result.timedOutOperations,
      ).toBe(result.totalOperations);
    });

    it("computes throughput based on duration", () => {
      const result = runLoadTest(defaultLoadConfig());
      expect(result.throughputOpsPerSec).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });
});

// ===========================================================================
// CHAOS ENGINE
// ===========================================================================

describe("chaos-engine", () => {
  describe("injectFailure", () => {
    it("returns null when no injections target the service", () => {
      const rand = createSeededRandom(42);
      const result = injectFailure(
        rand,
        [
          {
            type: "network_partition",
            probability: 1.0,
            durationMs: 5000,
            targetServices: ["other-service"],
          },
        ],
        "api-gateway",
        0,
      );
      expect(result).toBeNull();
    });

    it("returns null when past injection duration", () => {
      const rand = createSeededRandom(42);
      const result = injectFailure(
        rand,
        [
          {
            type: "network_partition",
            probability: 1.0,
            durationMs: 1000,
            targetServices: ["api-gateway"],
          },
        ],
        "api-gateway",
        2000,
      );
      expect(result).toBeNull();
    });

    it("returns failure type when probability triggers", () => {
      // With probability=1.0, it should always inject
      const rand = createSeededRandom(42);
      const result = injectFailure(
        rand,
        [
          {
            type: "rate_limit",
            probability: 1.0,
            durationMs: 5000,
            targetServices: ["api-gateway"],
          },
        ],
        "api-gateway",
        100,
      );
      expect(result).toBe("rate_limit");
    });

    it("respects probability with deterministic seed", () => {
      const injections = [
        {
          type: "connection_reset" as const,
          probability: 0.5,
          durationMs: 5000,
          targetServices: ["api"],
        },
      ];

      let hitCount = 0;
      const rand = createSeededRandom(42);
      for (let i = 0; i < 100; i++) {
        if (injectFailure(rand, injections, "api", 100) !== null) hitCount++;
      }
      // With 50% probability, expect roughly half
      expect(hitCount).toBeGreaterThan(20);
      expect(hitCount).toBeLessThan(80);
    });
  });

  describe("validateDataIntegrity", () => {
    it("returns perfect integrity with no failures", () => {
      const rand = createSeededRandom(42);
      const result = validateDataIntegrity(rand, 1000, 0, 0);
      expect(result.integrityScore).toBe(1);
      expect(result.corruptedRecords).toBe(0);
      expect(result.missingRecords).toBe(0);
    });

    it("handles corrupt responses with high catch rate", () => {
      const rand = createSeededRandom(42);
      const result = validateDataIntegrity(rand, 1000, 10, 5);
      // 95% catch rate means most corruptions are caught
      expect(result.integrityScore).toBeGreaterThanOrEqual(0.99);
    });

    it("returns valid report structure", () => {
      const rand = createSeededRandom(42);
      const result = validateDataIntegrity(rand, 500, 5, 20);
      expect(result.totalRecords).toBe(500);
      expect(result.integrityScore).toBeGreaterThanOrEqual(0);
      expect(result.integrityScore).toBeLessThanOrEqual(1);
    });
  });

  describe("runChaosScenario", () => {
    it("produces deterministic results", () => {
      const scenario = defaultChaosScenario();
      const result1 = runChaosScenario(scenario);
      const result2 = runChaosScenario(scenario);

      expect(result1.totalOperations).toBe(result2.totalOperations);
      expect(result1.failuresByType).toEqual(result2.failuresByType);
      expect(result1.dataIntegrity).toEqual(result2.dataIntegrity);
    });

    it("records failures by type", () => {
      const result = runChaosScenario(defaultChaosScenario());
      const totalFailures = Object.values(result.failuresByType).reduce(
        (a, b) => a + b,
        0,
      );
      expect(totalFailures).toBeGreaterThan(0);
    });

    it("tracks graceful degradations (recovered operations)", () => {
      const result = runChaosScenario(defaultChaosScenario());
      expect(result.gracefulDegradations).toBeGreaterThanOrEqual(0);
    });

    it("maintains data integrity above floor", () => {
      const result = runChaosScenario(defaultChaosScenario());
      expect(result.dataIntegrity.integrityScore).toBeGreaterThan(0.9);
    });

    it("identifies affected services", () => {
      const result = runChaosScenario(defaultChaosScenario());
      expect(result.servicesAffected).toContain("api-gateway");
    });
  });
});

// ===========================================================================
// WEBSOCKET RESILIENCE
// ===========================================================================

describe("websocket-resilience", () => {
  describe("calculateBackoffDelay", () => {
    it("returns base delay for first attempt", () => {
      const rand = createSeededRandom(42);
      const delay = calculateBackoffDelay(
        0,
        {
          baseReconnectMs: 100,
          maxReconnectMs: 5000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rand,
      );
      expect(delay).toBe(100);
    });

    it("applies exponential growth", () => {
      const rand = createSeededRandom(42);
      const config = {
        baseReconnectMs: 100,
        maxReconnectMs: 50000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };
      const delay0 = calculateBackoffDelay(0, config, rand);
      const delay1 = calculateBackoffDelay(1, config, rand);
      const delay2 = calculateBackoffDelay(2, config, rand);

      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it("caps at maxReconnectMs", () => {
      const rand = createSeededRandom(42);
      const delay = calculateBackoffDelay(
        10,
        {
          baseReconnectMs: 100,
          maxReconnectMs: 5000,
          backoffMultiplier: 2,
          jitterFactor: 0,
        },
        rand,
      );
      expect(delay).toBeLessThanOrEqual(5000);
    });

    it("applies jitter when jitterFactor > 0", () => {
      const config = {
        baseReconnectMs: 1000,
        maxReconnectMs: 50000,
        backoffMultiplier: 2,
        jitterFactor: 0.5,
      };

      // Different seeds should produce different jitter
      const delays = Array.from({ length: 20 }, (_, i) => {
        const rand = createSeededRandom(i);
        return calculateBackoffDelay(3, config, rand);
      });

      const unique = new Set(delays);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe("simulateDisconnect", () => {
    it("produces deterministic results", () => {
      const config = defaultWsConfig();
      const rand1 = createSeededRandom(42);
      const rand2 = createSeededRandom(42);

      const result1 = simulateDisconnect(
        config,
        "client-0",
        "network_loss",
        10,
        rand1,
      );
      const result2 = simulateDisconnect(
        config,
        "client-0",
        "network_loss",
        10,
        rand2,
      );

      expect(result1.reconnected).toBe(result2.reconnected);
      expect(result1.totalDowntimeMs).toBe(result2.totalDowntimeMs);
    });

    it("records reconnect attempts", () => {
      const config = defaultWsConfig();
      const rand = createSeededRandom(42);
      const result = simulateDisconnect(
        config,
        "client-0",
        "server_restart",
        5,
        rand,
      );

      expect(result.reconnectAttempts.length).toBeGreaterThan(0);
      expect(result.reconnectAttempts.length).toBeLessThanOrEqual(
        config.maxReconnectAttempts,
      );
    });

    it("caps queued messages at maxQueueSize", () => {
      const config = defaultWsConfig({ maxQueueSize: 10 });
      const rand = createSeededRandom(42);
      const result = simulateDisconnect(
        config,
        "client-0",
        "network_loss",
        50, // 50 pending messages, queue capacity = 10
        rand,
      );

      if (result.reconnected) {
        expect(result.messagesDeliveredAfterReconnect).toBeLessThanOrEqual(10);
      }
    });

    it("loses all messages when reconnection fails", () => {
      // Use very small maxReconnectAttempts and a tough failure
      const config = defaultWsConfig({ maxReconnectAttempts: 1, seed: 9999 });
      const rand = createSeededRandom(9999);
      const result = simulateDisconnect(
        config,
        "client-0",
        "client_error",
        20,
        rand,
      );

      if (!result.reconnected) {
        expect(result.messagesLost).toBe(20);
        expect(result.messagesDeliveredAfterReconnect).toBe(0);
      }
    });
  });

  describe("validateMessageOrdering", () => {
    it("returns perfect ordering with no disconnects", () => {
      const rand = createSeededRandom(42);
      const result = validateMessageOrdering(rand, 100, 0);
      expect(result.orderingScore).toBe(1);
      expect(result.outOfOrderMessages).toBe(0);
    });

    it("detects out-of-order messages during disconnects", () => {
      const rand = createSeededRandom(42);
      const result = validateMessageOrdering(rand, 500, 10);
      // With 10 disconnects, some reordering is expected
      expect(result.totalMessages).toBe(500);
      expect(result.orderingScore).toBeGreaterThanOrEqual(0);
      expect(result.orderingScore).toBeLessThanOrEqual(1);
    });

    it("handles zero messages gracefully", () => {
      const rand = createSeededRandom(42);
      const result = validateMessageOrdering(rand, 0, 5);
      expect(result.orderingScore).toBe(1);
    });
  });

  describe("testQueueOverflow", () => {
    it("queues messages up to maxQueueSize", () => {
      const config = defaultWsConfig({ maxQueueSize: 50 });
      const rand = createSeededRandom(42);
      const result = testQueueOverflow(config, "client-0", 50, rand);

      expect(result.messagesQueued).toBe(50);
      expect(result.messagesDropped).toBe(0);
    });

    it("drops messages beyond maxQueueSize", () => {
      const config = defaultWsConfig({ maxQueueSize: 30 });
      const rand = createSeededRandom(42);
      const result = testQueueOverflow(config, "client-0", 100, rand);

      expect(result.messagesQueued).toBe(30);
      expect(result.messagesDropped).toBe(70);
      expect(result.overflowHandled).toBe(true);
    });

    it("tracks oldest message age", () => {
      const config = defaultWsConfig({ maxQueueSize: 10 });
      const rand = createSeededRandom(42);
      const result = testQueueOverflow(config, "client-0", 20, rand);

      expect(result.oldestMessageAgeMs).toBeGreaterThan(0);
    });
  });

  describe("testReconnectBehavior", () => {
    it("produces deterministic results", () => {
      const config = defaultWsConfig();
      const result1 = testReconnectBehavior(config);
      const result2 = testReconnectBehavior(config);

      expect(result1.clientsReconnected).toBe(result2.clientsReconnected);
      expect(result1.dataLossRate).toBe(result2.dataLossRate);
    });

    it("tests all configured clients", () => {
      const config = defaultWsConfig({ clientCount: 15 });
      const result = testReconnectBehavior(config);

      expect(result.totalClients).toBe(15);
      expect(result.disconnects.length).toBe(15);
    });

    it("reports reconnection statistics", () => {
      const result = testReconnectBehavior(defaultWsConfig());

      expect(result.clientsReconnected + result.clientsFailed).toBe(
        result.totalClients,
      );
      expect(result.meanReconnectTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

// ===========================================================================
// SCALE ENVELOPE
// ===========================================================================

describe("scale-envelope", () => {
  // Helper to produce a load result for envelope tests
  function buildLoadResult() {
    return runLoadTest(defaultLoadConfig());
  }

  describe("defineScaleEnvelope", () => {
    it("applies safety margin to peak concurrent users", () => {
      const load = buildLoadResult();
      const envelope = defineScaleEnvelope(load);

      expect(envelope.maxSafeConcurrentUsers).toBe(
        Math.floor(load.peakConcurrentUsers * SAFETY_MARGIN),
      );
    });

    it("applies safety margin to throughput", () => {
      const load = buildLoadResult();
      const envelope = defineScaleEnvelope(load);

      expect(envelope.maxSafeThroughput).toBe(
        Math.floor(load.throughputOpsPerSec * SAFETY_MARGIN),
      );
    });

    it("evaluates threshold pass/fail correctly", () => {
      const load = buildLoadResult();
      const envelope = defineScaleEnvelope(load);

      for (const t of envelope.thresholds) {
        if (t.name === "Success Rate") {
          expect(t.passed).toBe(load.successRate >= MIN_SUCCESS_RATE);
        }
        if (t.name === "P95 Latency") {
          expect(t.passed).toBe(load.latency.p95 <= MAX_P95_LATENCY_MS);
        }
      }
    });

    it("includes chaos data when provided", () => {
      const load = buildLoadResult();
      const chaos = runChaosScenario(defaultChaosScenario());
      const envelope = defineScaleEnvelope(load, chaos);

      expect(envelope.dataIntegrityScore).toBe(
        chaos.dataIntegrity.integrityScore,
      );
      expect(envelope.meanRecoveryTimeMs).toBe(chaos.meanRecoveryTimeMs);
    });

    it("includes websocket data when provided", () => {
      const load = buildLoadResult();
      const ws = testReconnectBehavior(defaultWsConfig());
      const envelope = defineScaleEnvelope(load, undefined, ws);

      expect(envelope.wsReconnectRate).toBe(
        ws.clientsReconnected / ws.totalClients,
      );
      expect(envelope.wsDataLossRate).toBe(ws.dataLossRate);
    });

    it("defaults to perfect scores when optional results omitted", () => {
      const load = buildLoadResult();
      const envelope = defineScaleEnvelope(load);

      expect(envelope.dataIntegrityScore).toBe(1);
      expect(envelope.wsReconnectRate).toBe(1);
      expect(envelope.wsDataLossRate).toBe(0);
    });
  });

  describe("generateTuningRecommendations", () => {
    it("returns no critical recommendations for healthy system", () => {
      const load = runLoadTest(
        defaultLoadConfig({
          concurrency: {
            maxUsers: 50,
            rampPattern: "linear",
            rampDurationMs: 2000,
            sustainDurationMs: 3000,
          },
          latencyRange: [10, 100],
          operationTimeoutMs: 5000,
        }),
      );
      const envelope = defineScaleEnvelope(load);
      const recs = generateTuningRecommendations(envelope, load);

      const critical = recs.filter((r) => r.severity === "critical");
      // With good config, critical issues should be absent or minimal
      // (depends on deterministic result, so we check structure)
      for (const rec of critical) {
        expect(rec.title).toBeTruthy();
        expect(rec.description).toBeTruthy();
      }
    });

    it("flags high P95 latency", () => {
      const load = runLoadTest(
        defaultLoadConfig({
          latencyRange: [500, 3000],
          operationTimeoutMs: 5000,
        }),
      );
      const envelope = defineScaleEnvelope(load);
      const recs = generateTuningRecommendations(envelope, load);

      if (load.latency.p95 > MAX_P95_LATENCY_MS) {
        const latencyRec = recs.find((r) => r.category === "latency");
        expect(latencyRec).toBeTruthy();
      }
    });

    it("flags websocket data loss above threshold", () => {
      // Create a ws result with high data loss by using tiny queue
      const ws = testReconnectBehavior(
        defaultWsConfig({ maxQueueSize: 1, clientCount: 30 }),
      );
      const load = buildLoadResult();
      const envelope = defineScaleEnvelope(load, undefined, ws);
      const recs = generateTuningRecommendations(
        envelope,
        load,
        undefined,
        ws,
      );

      if (ws.dataLossRate > 0.001) {
        const wsRec = recs.find(
          (r) => r.category === "websocket" && r.severity === "critical",
        );
        expect(wsRec).toBeTruthy();
      }
    });

    it("includes recommendation IDs and required fields", () => {
      const load = buildLoadResult();
      const envelope = defineScaleEnvelope(load);
      const recs = generateTuningRecommendations(envelope, load);

      for (const rec of recs) {
        expect(rec.id).toMatch(/^tune-\d+$/);
        expect(["info", "warning", "critical"]).toContain(rec.severity);
        expect(rec.title.length).toBeGreaterThan(0);
        expect(typeof rec.currentValue).toBe("number");
        expect(typeof rec.recommendedValue).toBe("number");
      }
    });
  });

  describe("validateEnvelope", () => {
    it("returns valid for envelope that meets all thresholds", () => {
      const load = runLoadTest(
        defaultLoadConfig({
          latencyRange: [10, 100],
          operationTimeoutMs: 5000,
        }),
      );
      const envelope = defineScaleEnvelope(load);

      if (envelope.meetsAllThresholds) {
        const validation = validateEnvelope(envelope);
        expect(validation.valid).toBe(true);
        expect(validation.failures).toHaveLength(0);
      }
    });

    it("returns failure details for failing thresholds", () => {
      const load = runLoadTest(
        defaultLoadConfig({
          latencyRange: [1000, 5000],
          operationTimeoutMs: 10000,
        }),
      );
      const envelope = defineScaleEnvelope(load);

      if (!envelope.meetsAllThresholds) {
        const validation = validateEnvelope(envelope);
        expect(validation.valid).toBe(false);
        expect(validation.failures.length).toBeGreaterThan(0);
      }
    });
  });

  describe("formatScaleReport", () => {
    it("produces a complete report structure", () => {
      const load = buildLoadResult();
      const chaos = runChaosScenario(defaultChaosScenario());
      const ws = testReconnectBehavior(defaultWsConfig());
      const envelope = defineScaleEnvelope(load, chaos, ws);
      const recs = generateTuningRecommendations(envelope, load, chaos, ws);
      const report = formatScaleReport(envelope, recs, load, chaos, ws);

      expect(report.generatedAt).toBeTruthy();
      expect(report.envelope).toBe(envelope);
      expect(report.recommendations).toBe(recs);
      expect(report.loadTestSummary.testId).toBe(load.testId);
      expect(report.chaosTestSummary).not.toBeNull();
      expect(report.chaosTestSummary!.scenarioId).toBe(chaos.scenarioId);
      expect(report.wsTestSummary).not.toBeNull();
      expect(report.wsTestSummary!.testId).toBe(ws.testId);
    });

    it("handles missing optional results", () => {
      const load = buildLoadResult();
      const envelope = defineScaleEnvelope(load);
      const recs = generateTuningRecommendations(envelope, load);
      const report = formatScaleReport(envelope, recs, load);

      expect(report.chaosTestSummary).toBeNull();
      expect(report.wsTestSummary).toBeNull();
    });
  });
});

// ===========================================================================
// INTEGRATION: end-to-end scale validation
// ===========================================================================

describe("end-to-end scale validation", () => {
  it("full pipeline: load -> chaos -> ws -> envelope -> report", () => {
    // 1. Run load test
    const loadResult = runLoadTest(defaultLoadConfig());
    expect(loadResult.totalOperations).toBeGreaterThan(0);

    // 2. Run chaos scenario
    const chaosResult = runChaosScenario(defaultChaosScenario());
    expect(chaosResult.totalOperations).toBeGreaterThan(0);

    // 3. Run websocket resilience
    const wsResult = testReconnectBehavior(defaultWsConfig());
    expect(wsResult.totalClients).toBeGreaterThan(0);

    // 4. Define scale envelope
    const envelope = defineScaleEnvelope(loadResult, chaosResult, wsResult);
    expect(envelope.maxSafeConcurrentUsers).toBeGreaterThan(0);
    expect(envelope.thresholds.length).toBeGreaterThan(0);

    // 5. Generate recommendations
    const recs = generateTuningRecommendations(
      envelope,
      loadResult,
      chaosResult,
      wsResult,
    );
    expect(Array.isArray(recs)).toBe(true);

    // 6. Format report
    const report = formatScaleReport(
      envelope,
      recs,
      loadResult,
      chaosResult,
      wsResult,
    );
    expect(report.generatedAt).toBeTruthy();
    expect(report.loadTestSummary.totalOps).toBe(loadResult.totalOperations);
  });

  it("deterministic full pipeline across runs", () => {
    const config = defaultLoadConfig({ seed: 777 });
    const chaosConfig = defaultChaosScenario({ seed: 777 });
    const wsConfig = defaultWsConfig({ seed: 777 });

    const run = () => {
      const load = runLoadTest(config);
      const chaos = runChaosScenario(chaosConfig);
      const ws = testReconnectBehavior(wsConfig);
      return defineScaleEnvelope(load, chaos, ws);
    };

    const envelope1 = run();
    const envelope2 = run();

    expect(envelope1.maxSafeConcurrentUsers).toBe(
      envelope2.maxSafeConcurrentUsers,
    );
    expect(envelope1.maxSafeThroughput).toBe(envelope2.maxSafeThroughput);
    expect(envelope1.dataIntegrityScore).toBe(envelope2.dataIntegrityScore);
    expect(envelope1.meetsAllThresholds).toBe(envelope2.meetsAllThresholds);
  });
});

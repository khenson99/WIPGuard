import { describe, it, expect, beforeEach } from "vitest";

// --- Breach Detector ---
import {
  updateBreachHistory,
  detectBreaches,
  oldestBreachAgeSeconds,
  isDetectionSloMet,
  DEFAULT_BREACH_CONFIG,
  type BreachRecord,
  type BreachDetectorConfig,
} from "@/lib/observability/breach-detector";

// --- Structured Logger ---
import {
  createLogEntry,
  createMetric,
  createTraceSpan,
  instrumentOutboxDispatch,
  instrumentIntegrationSync,
  instrumentMetricEvent,
  instrumentWebsocketDelivery,
  createInstrumentationSnapshot,
  resetIdCounter,
  sequentialIdGenerator,
} from "@/lib/observability/structured-logger";

// --- Runbooks ---
import {
  RUNBOOK_SYNC_LAG,
  RUNBOOK_QUEUE_BACKUP,
  RUNBOOK_WEBSOCKET_DEGRADATION,
  getAllRunbooks,
  getRunbookById,
  getRunbooksForSlo,
  getSuggestedRunbooks,
  simulateRunbookExecution,
} from "@/lib/observability/runbooks";

// --- On-Call Dashboard ---
import {
  assembleOnCallDashboard,
  filterLogsByCategory,
  filterMetricsByPrefix,
  getActiveBreachSloKeys,
  computeMTTR,
} from "@/lib/observability/oncall-dashboard";

// --- SLO types ---
import type { ObservabilitySloReport } from "@/lib/observability/slo";
import { evaluateObservabilitySlos } from "@/lib/observability/slo";
import type { OutboxOperationalMetrics } from "@/lib/outbox-worker";

// ─── Constants ────────────────────────────────────────────────
const NOW = new Date("2026-02-16T15:00:00.000Z");

// ─── Helpers ──────────────────────────────────────────────────

function baseOutboxMetrics(
  overrides: Partial<OutboxOperationalMetrics> = {}
): OutboxOperationalMetrics {
  return {
    counts: { pending: 0, failed: 0, deadLetter: 0, dispatched: 10, total: 10 },
    lag: { oldestRetryableEventAgeSeconds: 0, oldestRetryableEventId: null },
    failuresByEventType: [],
    recentDeadLetters: [],
    ...overrides,
  };
}

function healthySloReport(now: Date = NOW): ObservabilitySloReport {
  return evaluateObservabilitySlos({
    now,
    outboxMetrics: baseOutboxMetrics(),
    connections: [],
    rules: [],
  });
}

function breachedSloReport(now: Date = NOW): ObservabilitySloReport {
  return evaluateObservabilitySlos({
    now,
    outboxMetrics: baseOutboxMetrics({
      lag: { oldestRetryableEventAgeSeconds: 600, oldestRetryableEventId: "evt_1" },
      counts: { pending: 5, failed: 15, deadLetter: 10, dispatched: 10, total: 40 },
    }),
    connections: [
      { provider: "SLACK", status: "ERROR", lastSyncedAt: null, lastError: "token expired" },
    ],
    rules: [
      { provider: "SLACK", enabled: true, lastRunAt: "2026-02-16T14:00:00.000Z", lastError: "sync failed" },
    ],
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Breach Detector
// ═══════════════════════════════════════════════════════════════

describe("breach-detector: updateBreachHistory", () => {
  it("creates new breach records for newly breached SLOs", () => {
    const report = breachedSloReport();
    const records = updateBreachHistory([], report, NOW);

    const active = records.filter((r) => r.resolvedAt === null);
    expect(active.length).toBeGreaterThan(0);
    expect(active[0].detectedAt).toBe(NOW.toISOString());
    expect(active[0].durationSeconds).toBe(0);
  });

  it("continues existing breach records on re-evaluation", () => {
    const report = breachedSloReport();
    const initial = updateBreachHistory([], report, NOW);

    // Re-evaluate 60 seconds later
    const later = new Date(NOW.getTime() + 60_000);
    const reportLater = breachedSloReport(later);
    const updated = updateBreachHistory(initial, reportLater, later);

    const active = updated.filter((r) => r.resolvedAt === null);
    expect(active.length).toBeGreaterThan(0);

    // Duration should have increased
    const continued = active.find((r) => r.detectedAt === NOW.toISOString());
    expect(continued).toBeTruthy();
    expect(continued!.durationSeconds).toBe(60);
  });

  it("resolves breach records when SLO recovers", () => {
    // First: breach detected
    const breached = breachedSloReport();
    const initial = updateBreachHistory([], breached, NOW);
    expect(initial.filter((r) => r.resolvedAt === null).length).toBeGreaterThan(0);

    // Then: SLO recovers
    const later = new Date(NOW.getTime() + 120_000);
    const healthy = healthySloReport(later);
    const updated = updateBreachHistory(initial, healthy, later);

    const resolved = updated.filter((r) => r.resolvedAt !== null);
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved[0].resolvedAt).toBe(later.toISOString());
    expect(resolved[0].durationSeconds).toBe(120);
  });

  it("prunes resolved records outside the window", () => {
    const config: BreachDetectorConfig = {
      ...DEFAULT_BREACH_CONFIG,
      windowMinutes: 5,
    };

    // Create a resolved record from 10 minutes ago
    const oldResolvedRecord: BreachRecord = {
      sloKey: "outbox_delivery_lag",
      severity: "critical",
      detectedAt: new Date(NOW.getTime() - 15 * 60_000).toISOString(),
      resolvedAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
      durationSeconds: 300,
      value: "600s",
      threshold: "<= 300s",
      runbookIds: ["queue-backup"],
    };

    const report = healthySloReport();
    const updated = updateBreachHistory([oldResolvedRecord], report, NOW, config);

    // Old resolved record should be pruned (resolved 10 min ago, window is 5 min)
    expect(updated.find((r) => r.sloKey === "outbox_delivery_lag")).toBeUndefined();
  });

  it("keeps resolved records within the window", () => {
    const config: BreachDetectorConfig = {
      ...DEFAULT_BREACH_CONFIG,
      windowMinutes: 60,
    };

    const recentResolved: BreachRecord = {
      sloKey: "outbox_delivery_lag",
      severity: "critical",
      detectedAt: new Date(NOW.getTime() - 15 * 60_000).toISOString(),
      resolvedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
      durationSeconds: 600,
      value: "600s",
      threshold: "<= 300s",
      runbookIds: ["queue-backup"],
    };

    const report = healthySloReport();
    const updated = updateBreachHistory([recentResolved], report, NOW, config);

    expect(updated.find((r) => r.sloKey === "outbox_delivery_lag")).toBeTruthy();
  });
});

describe("breach-detector: detectBreaches", () => {
  it("returns isHealthy=true when all SLOs pass", () => {
    const report = healthySloReport();
    const result = detectBreaches(report, [], NOW);

    expect(result.isHealthy).toBe(true);
    expect(result.activeBreaches).toHaveLength(0);
    expect(result.escalationRequired).toBe(false);
    expect(result.summary).toContain("healthy");
  });

  it("returns active breaches and escalation for critical SLOs", () => {
    const report = breachedSloReport();
    const result = detectBreaches(report, [], NOW);

    expect(result.isHealthy).toBe(false);
    expect(result.activeBreaches.length).toBeGreaterThan(0);
    expect(result.summary).toContain("active breach");
  });

  it("triggers escalation for long-running breaches", () => {
    const config: BreachDetectorConfig = {
      ...DEFAULT_BREACH_CONFIG,
      escalationThreshold: 2,
      detectionTargetSeconds: 60,
    };

    // Create a breach that's been running for 130s (> 2*60 = 120s threshold)
    const longBreach: BreachRecord = {
      sloKey: "outbox_delivery_lag",
      severity: "warning",
      detectedAt: new Date(NOW.getTime() - 130_000).toISOString(),
      resolvedAt: null,
      durationSeconds: 130,
      value: "400s",
      threshold: "<= 300s",
      runbookIds: ["queue-backup"],
    };

    const report = breachedSloReport();
    const result = detectBreaches(report, [longBreach], NOW, config);

    expect(result.escalationRequired).toBe(true);
  });

  it("provides breach window metadata", () => {
    const report = healthySloReport();
    const result = detectBreaches(report, [], NOW);

    expect(result.breachWindow.windowDurationMinutes).toBe(DEFAULT_BREACH_CONFIG.windowMinutes);
    expect(result.evaluatedAt).toBe(NOW.toISOString());
  });

  it("includes recently resolved breaches in detection result", () => {
    // Create a breach, then resolve it
    const breached = breachedSloReport();
    const initial = updateBreachHistory([], breached, NOW);

    const later = new Date(NOW.getTime() + 60_000);
    const healthy = healthySloReport(later);
    const result = detectBreaches(healthy, initial, later);

    expect(result.recentlyResolved.length).toBeGreaterThan(0);
  });
});

describe("breach-detector: utility functions", () => {
  it("oldestBreachAgeSeconds returns null when no active breaches", () => {
    expect(oldestBreachAgeSeconds([], NOW)).toBeNull();
  });

  it("oldestBreachAgeSeconds computes correct age", () => {
    const breach: BreachRecord = {
      sloKey: "test",
      severity: "warning",
      detectedAt: new Date(NOW.getTime() - 120_000).toISOString(),
      resolvedAt: null,
      durationSeconds: 120,
      value: "test",
      threshold: "test",
      runbookIds: [],
    };
    expect(oldestBreachAgeSeconds([breach], NOW)).toBe(120);
  });

  it("isDetectionSloMet returns true for intervals <= target", () => {
    expect(isDetectionSloMet(60)).toBe(true);
    expect(isDetectionSloMet(300)).toBe(true);
    expect(isDetectionSloMet(301)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Structured Logger
// ═══════════════════════════════════════════════════════════════

describe("structured-logger: createLogEntry", () => {
  it("creates a complete structured log entry", () => {
    const entry = createLogEntry("info", "metrics", "metrics.refreshed", "Metric refreshed", {
      traceId: "trace_1",
      spanId: "span_1",
      duration_ms: 42,
      metadata: { metricId: "metric_123" },
      now: NOW,
    });

    expect(entry.timestamp).toBe(NOW.toISOString());
    expect(entry.level).toBe("info");
    expect(entry.category).toBe("metrics");
    expect(entry.event).toBe("metrics.refreshed");
    expect(entry.message).toBe("Metric refreshed");
    expect(entry.traceId).toBe("trace_1");
    expect(entry.spanId).toBe("span_1");
    expect(entry.duration_ms).toBe(42);
    expect(entry.metadata).toEqual({ metricId: "metric_123" });
  });

  it("defaults to null for optional trace fields", () => {
    const entry = createLogEntry("warn", "outbox", "test", "test", { now: NOW });
    expect(entry.traceId).toBeNull();
    expect(entry.spanId).toBeNull();
    expect(entry.parentSpanId).toBeNull();
    expect(entry.duration_ms).toBeNull();
    expect(entry.metadata).toEqual({});
  });
});

describe("structured-logger: createMetric", () => {
  it("creates a metric point with tags", () => {
    const metric = createMetric("outbox.lag", 42, "seconds", { region: "us-east-1" }, NOW);

    expect(metric.name).toBe("outbox.lag");
    expect(metric.value).toBe(42);
    expect(metric.unit).toBe("seconds");
    expect(metric.tags).toEqual({ region: "us-east-1" });
    expect(metric.timestamp).toBe(NOW.toISOString());
  });
});

describe("structured-logger: createTraceSpan", () => {
  beforeEach(() => resetIdCounter());

  it("creates a trace span with computed duration", () => {
    const start = new Date(NOW.getTime() - 100);
    const span = createTraceSpan("test.op", "metrics", {
      traceId: "t1",
      spanId: "s1",
      startedAt: start,
      endedAt: NOW,
      attributes: { key: "value" },
    });

    expect(span.traceId).toBe("t1");
    expect(span.spanId).toBe("s1");
    expect(span.operation).toBe("test.op");
    expect(span.category).toBe("metrics");
    expect(span.duration_ms).toBe(100);
    expect(span.status).toBe("ok");
  });

  it("generates IDs from sequential generator when not provided", () => {
    const span = createTraceSpan("test.op", "outbox", {
      startedAt: NOW,
      idGen: sequentialIdGenerator,
    });

    expect(span.traceId).toMatch(/^span_\d{6}$/);
    expect(span.spanId).toMatch(/^span_\d{6}$/);
  });

  it("returns null duration for spans without endedAt", () => {
    const span = createTraceSpan("in.progress", "sync", {
      traceId: "t1",
      spanId: "s1",
      startedAt: NOW,
    });

    expect(span.endedAt).toBeNull();
    expect(span.duration_ms).toBeNull();
  });
});

describe("structured-logger: domain event instrumentation", () => {
  beforeEach(() => resetIdCounter());

  it("instrumentOutboxDispatch produces log, metrics, and span", () => {
    const result = instrumentOutboxDispatch(10, 8, 2, 150, NOW);

    expect(result.log.level).toBe("warn"); // has failures
    expect(result.log.category).toBe("outbox");
    expect(result.log.event).toBe("outbox.dispatch.completed");
    expect(result.log.duration_ms).toBe(150);

    expect(result.metrics).toHaveLength(4);
    expect(result.metrics[0].name).toBe("outbox.dispatch.batch_size");
    expect(result.metrics[0].value).toBe(10);

    expect(result.span.status).toBe("error"); // failures
    expect(result.span.duration_ms).toBe(150);
  });

  it("instrumentOutboxDispatch with zero failures uses info level", () => {
    const result = instrumentOutboxDispatch(5, 5, 0, 50, NOW);
    expect(result.log.level).toBe("info");
    expect(result.span.status).toBe("ok");
  });

  it("instrumentIntegrationSync produces instrumentation for success", () => {
    const result = instrumentIntegrationSync("SLACK", 42, 200, null, NOW);

    expect(result.log.level).toBe("info");
    expect(result.log.category).toBe("sync");
    expect(result.log.message).toContain("42 records");
    expect(result.metrics).toHaveLength(3);
    expect(result.span.status).toBe("ok");
  });

  it("instrumentIntegrationSync produces instrumentation for error", () => {
    const result = instrumentIntegrationSync("JIRA", 0, 50, "auth failed", NOW);

    expect(result.log.level).toBe("error");
    expect(result.log.message).toContain("auth failed");
    expect(result.span.status).toBe("error");
  });

  it("instrumentMetricEvent produces log and metric", () => {
    const result = instrumentMetricEvent("refreshed", "metric_123", { source: "linear" }, NOW);

    expect(result.log.category).toBe("metrics");
    expect(result.log.event).toBe("metrics.refreshed");
    expect(result.metric.name).toBe("metrics.refreshed");
    expect(result.metric.value).toBe(1);
  });

  it("instrumentWebsocketDelivery calculates drop rate correctly", () => {
    const result = instrumentWebsocketDelivery("metric.updated", 10, 8, 15, NOW);

    expect(result.log.category).toBe("websocket");
    expect(result.metrics[2].name).toBe("websocket.delivery.drop_rate");
    expect(result.metrics[2].value).toBe(20); // (10-8)/10 * 100
    expect(result.span.status).toBe("ok"); // < 50%
  });

  it("instrumentWebsocketDelivery flags high drop rate", () => {
    const result = instrumentWebsocketDelivery("metric.updated", 10, 3, 15, NOW);

    expect(result.log.level).toBe("warn"); // > 10% drop
    expect(result.span.status).toBe("error"); // > 50% drop
  });

  it("instrumentWebsocketDelivery handles zero connected clients", () => {
    const result = instrumentWebsocketDelivery("metric.updated", 0, 0, 15, NOW);
    expect(result.metrics[2].value).toBe(0); // no division by zero
  });
});

describe("structured-logger: createInstrumentationSnapshot", () => {
  it("assembles snapshot from logs, metrics, traces", () => {
    const log = createLogEntry("info", "metrics", "test", "test", { now: NOW });
    const metric = createMetric("test", 1, "count", {}, NOW);

    resetIdCounter();
    const span = createTraceSpan("test", "metrics", {
      traceId: "t1",
      spanId: "s1",
      startedAt: NOW,
    });

    const snapshot = createInstrumentationSnapshot([log], [metric], [span], NOW);

    expect(snapshot.collectedAt).toBe(NOW.toISOString());
    expect(snapshot.logs).toHaveLength(1);
    expect(snapshot.metrics).toHaveLength(1);
    expect(snapshot.traces).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Runbooks
// ═══════════════════════════════════════════════════════════════

describe("runbooks: definitions", () => {
  it("sync-lag runbook has complete structure", () => {
    expect(RUNBOOK_SYNC_LAG.id).toBe("sync-lag");
    expect(RUNBOOK_SYNC_LAG.steps.length).toBeGreaterThanOrEqual(3);
    expect(RUNBOOK_SYNC_LAG.escalation.target).toBeTruthy();
    expect(RUNBOOK_SYNC_LAG.sloKeys).toContain("integration_sync_freshness");
    expect(RUNBOOK_SYNC_LAG.sloKeys).toContain("integration_connection_health");

    // Verify step ordering
    for (let i = 0; i < RUNBOOK_SYNC_LAG.steps.length - 1; i++) {
      expect(RUNBOOK_SYNC_LAG.steps[i].order).toBeLessThan(
        RUNBOOK_SYNC_LAG.steps[i + 1].order
      );
    }
  });

  it("queue-backup runbook has diagnostic, remediation, and verification steps", () => {
    expect(RUNBOOK_QUEUE_BACKUP.id).toBe("queue-backup");
    expect(RUNBOOK_QUEUE_BACKUP.severity).toBe("critical");

    const stepTypes = new Set(RUNBOOK_QUEUE_BACKUP.steps.map((s) => s.type));
    expect(stepTypes.has("diagnostic")).toBe(true);
    expect(stepTypes.has("remediation")).toBe(true);
    expect(stepTypes.has("verification")).toBe(true);
  });

  it("websocket-degradation runbook references websocket SLO", () => {
    expect(RUNBOOK_WEBSOCKET_DEGRADATION.id).toBe("websocket-degradation");
    expect(RUNBOOK_WEBSOCKET_DEGRADATION.sloKeys).toContain("websocket_delivery_proxy");
    expect(RUNBOOK_WEBSOCKET_DEGRADATION.steps.length).toBeGreaterThanOrEqual(3);
  });

  it("all runbooks have unique step IDs", () => {
    for (const runbook of getAllRunbooks()) {
      const ids = runbook.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("all runbook steps have non-empty fields", () => {
    for (const runbook of getAllRunbooks()) {
      for (const step of runbook.steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.description.length).toBeGreaterThan(0);
        expect(step.expectedOutcome.length).toBeGreaterThan(0);
        expect(step.timeoutMinutes).toBeGreaterThan(0);
      }
    }
  });
});

describe("runbooks: registry functions", () => {
  it("getAllRunbooks returns all 3 runbooks", () => {
    expect(getAllRunbooks()).toHaveLength(3);
  });

  it("getRunbookById finds runbook by ID", () => {
    expect(getRunbookById("sync-lag")).toBeTruthy();
    expect(getRunbookById("queue-backup")).toBeTruthy();
    expect(getRunbookById("websocket-degradation")).toBeTruthy();
    expect(getRunbookById("nonexistent")).toBeNull();
  });

  it("getRunbooksForSlo returns runbooks matching SLO key", () => {
    const syncRunbooks = getRunbooksForSlo("integration_sync_freshness");
    expect(syncRunbooks.length).toBeGreaterThanOrEqual(1);
    expect(syncRunbooks.some((rb) => rb.id === "sync-lag")).toBe(true);

    const lagRunbooks = getRunbooksForSlo("outbox_delivery_lag");
    expect(lagRunbooks.some((rb) => rb.id === "queue-backup")).toBe(true);
  });

  it("getSuggestedRunbooks deduplicates and sorts by severity", () => {
    const suggested = getSuggestedRunbooks([
      "outbox_delivery_lag",
      "outbox_failure_budget",
      "websocket_delivery_proxy",
    ]);

    // queue-backup is critical and websocket-degradation is high
    expect(suggested[0].severity).toBe("critical");
    expect(suggested[0].id).toBe("queue-backup");

    // No duplicates
    const ids = suggested.map((rb) => rb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getSuggestedRunbooks returns empty for unmatched SLO keys", () => {
    expect(getSuggestedRunbooks(["nonexistent_slo"])).toHaveLength(0);
  });
});

describe("runbooks: simulateRunbookExecution", () => {
  it("simulates a fully passing execution", () => {
    const result = simulateRunbookExecution(
      RUNBOOK_SYNC_LAG,
      {}, // all steps default to true
      NOW
    );

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toBe(RUNBOOK_SYNC_LAG.steps.length);
    expect(result.failedStepId).toBeNull();
    expect(result.notes.every((n) => n.startsWith("[PASS]"))).toBe(true);
  });

  it("simulates execution with a failing step", () => {
    const result = simulateRunbookExecution(
      RUNBOOK_QUEUE_BACKUP,
      { "queue-remed-1": false },
      NOW
    );

    expect(result.success).toBe(false);
    expect(result.failedStepId).toBe("queue-remed-1");
    expect(result.stepsCompleted).toBe(3); // steps 1-3 pass, step 4 (queue-remed-1) fails
    expect(result.notes).toContain("[FAIL] Replay failed events");
  });

  it("stops at first failure", () => {
    const result = simulateRunbookExecution(
      RUNBOOK_SYNC_LAG,
      { "sync-lag-diag-1": false },
      NOW
    );

    expect(result.stepsCompleted).toBe(0);
    expect(result.failedStepId).toBe("sync-lag-diag-1");
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 4: On-Call Dashboard
// ═══════════════════════════════════════════════════════════════

describe("oncall-dashboard: assembleOnCallDashboard", () => {
  it("assembles healthy dashboard with no breaches", () => {
    const sloReport = healthySloReport();
    const breachDetection = detectBreaches(sloReport, [], NOW);

    const dashboard = assembleOnCallDashboard({
      sloReport,
      breachDetection,
      recentLogs: [],
      recentMetrics: [],
      recentTraces: [],
      suggestedRunbooks: [],
      runbookExecutions: [],
      systemHealth: [
        { component: "outbox-worker", status: "healthy", lastCheckedAt: NOW.toISOString(), details: "ok" },
      ],
      lastCheckAt: NOW,
      now: NOW,
    });

    expect(dashboard.systemStatus).toBe("healthy");
    expect(dashboard.onCallSummary).toContain("All systems operational");
    expect(dashboard.timeSinceLastCheckSeconds).toBe(0);
    expect(dashboard.generatedAt).toBe(NOW.toISOString());
  });

  it("assembles degraded dashboard with active breaches", () => {
    const sloReport = breachedSloReport();
    const breachDetection = detectBreaches(sloReport, [], NOW);
    const suggestedRunbooks = getSuggestedRunbooks(
      breachDetection.activeBreaches.map((b) => b.sloKey)
    );

    const dashboard = assembleOnCallDashboard({
      sloReport,
      breachDetection,
      recentLogs: [],
      recentMetrics: [],
      recentTraces: [],
      suggestedRunbooks,
      runbookExecutions: [],
      systemHealth: [
        { component: "outbox-worker", status: "degraded", lastCheckedAt: NOW.toISOString(), details: "lag" },
      ],
      lastCheckAt: NOW,
      now: NOW,
    });

    expect(dashboard.systemStatus).toBe("critical");
    expect(dashboard.onCallSummary).toContain("CRITICAL");
    expect(dashboard.suggestedRunbooks.length).toBeGreaterThan(0);
  });

  it("caps recent logs at 50 entries", () => {
    const logs = Array.from({ length: 100 }, (_, i) =>
      createLogEntry("info", "metrics", "test", `log ${i}`, { now: NOW })
    );

    const sloReport = healthySloReport();
    const breachDetection = detectBreaches(sloReport, [], NOW);

    const dashboard = assembleOnCallDashboard({
      sloReport,
      breachDetection,
      recentLogs: logs,
      recentMetrics: [],
      recentTraces: [],
      suggestedRunbooks: [],
      runbookExecutions: [],
      systemHealth: [],
      lastCheckAt: NOW,
      now: NOW,
    });

    expect(dashboard.recentLogs).toHaveLength(50);
  });

  it("returns critical when any component is down", () => {
    const sloReport = healthySloReport();
    const breachDetection = detectBreaches(sloReport, [], NOW);

    const dashboard = assembleOnCallDashboard({
      sloReport,
      breachDetection,
      recentLogs: [],
      recentMetrics: [],
      recentTraces: [],
      suggestedRunbooks: [],
      runbookExecutions: [],
      systemHealth: [
        { component: "outbox-worker", status: "down", lastCheckedAt: NOW.toISOString(), details: "crashed" },
      ],
      lastCheckAt: NOW,
      now: NOW,
    });

    expect(dashboard.systemStatus).toBe("critical");
  });

  it("warns about stale SLO checks", () => {
    const sloReport = healthySloReport();
    const breachDetection = detectBreaches(sloReport, [], NOW);
    const staleCheckAt = new Date(NOW.getTime() - 10 * 60_000); // 10 minutes ago

    const dashboard = assembleOnCallDashboard({
      sloReport,
      breachDetection,
      recentLogs: [],
      recentMetrics: [],
      recentTraces: [],
      suggestedRunbooks: [],
      runbookExecutions: [],
      systemHealth: [],
      lastCheckAt: staleCheckAt,
      now: NOW,
    });

    expect(dashboard.timeSinceLastCheckSeconds).toBe(600);
    expect(dashboard.onCallSummary).toContain("Last SLO check was 10 minutes ago");
  });

  it("handles null lastCheckAt gracefully", () => {
    const sloReport = healthySloReport();
    const breachDetection = detectBreaches(sloReport, [], NOW);

    const dashboard = assembleOnCallDashboard({
      sloReport,
      breachDetection,
      recentLogs: [],
      recentMetrics: [],
      recentTraces: [],
      suggestedRunbooks: [],
      runbookExecutions: [],
      systemHealth: [],
      lastCheckAt: null,
      now: NOW,
    });

    expect(dashboard.timeSinceLastCheckSeconds).toBeNull();
  });
});

describe("oncall-dashboard: filtering helpers", () => {
  it("filterLogsByCategory filters correctly", () => {
    const logs = [
      createLogEntry("info", "metrics", "e1", "m1", { now: NOW }),
      createLogEntry("info", "outbox", "e2", "m2", { now: NOW }),
      createLogEntry("info", "metrics", "e3", "m3", { now: NOW }),
    ];

    expect(filterLogsByCategory(logs, "metrics")).toHaveLength(2);
    expect(filterLogsByCategory(logs, "outbox")).toHaveLength(1);
    expect(filterLogsByCategory(logs, "sync")).toHaveLength(0);
  });

  it("filterMetricsByPrefix filters correctly", () => {
    const metrics = [
      createMetric("outbox.lag", 42, "seconds", {}, NOW),
      createMetric("outbox.count", 10, "count", {}, NOW),
      createMetric("metrics.refreshed", 5, "count", {}, NOW),
    ];

    expect(filterMetricsByPrefix(metrics, "outbox.")).toHaveLength(2);
    expect(filterMetricsByPrefix(metrics, "metrics.")).toHaveLength(1);
  });

  it("getActiveBreachSloKeys returns only unresolved breach keys", () => {
    const breaches: BreachRecord[] = [
      {
        sloKey: "outbox_delivery_lag",
        severity: "critical",
        detectedAt: NOW.toISOString(),
        resolvedAt: null,
        durationSeconds: 60,
        value: "400s",
        threshold: "<= 300s",
        runbookIds: [],
      },
      {
        sloKey: "integration_sync_freshness",
        severity: "warning",
        detectedAt: NOW.toISOString(),
        resolvedAt: NOW.toISOString(),
        durationSeconds: 30,
        value: "1 stale",
        threshold: "0",
        runbookIds: [],
      },
    ];

    const keys = getActiveBreachSloKeys(breaches);
    expect(keys).toEqual(["outbox_delivery_lag"]);
  });

  it("computeMTTR calculates mean resolution time", () => {
    const resolved: BreachRecord[] = [
      {
        sloKey: "a",
        severity: "warning",
        detectedAt: NOW.toISOString(),
        resolvedAt: NOW.toISOString(),
        durationSeconds: 120,
        value: "",
        threshold: "",
        runbookIds: [],
      },
      {
        sloKey: "b",
        severity: "warning",
        detectedAt: NOW.toISOString(),
        resolvedAt: NOW.toISOString(),
        durationSeconds: 60,
        value: "",
        threshold: "",
        runbookIds: [],
      },
    ];

    expect(computeMTTR(resolved)).toBe(90); // (120+60)/2
  });

  it("computeMTTR returns null for empty array", () => {
    expect(computeMTTR([])).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Integration — SLO detection within 5 minutes
// ═══════════════════════════════════════════════════════════════

describe("acceptance: SLO breaches detectable within 5 minutes", () => {
  it("breach is detected on the first evaluation cycle (< 5 min latency)", () => {
    const report = breachedSloReport();
    const result = detectBreaches(report, [], NOW);

    // Detection happens immediately on first check
    expect(result.activeBreaches.length).toBeGreaterThan(0);
    expect(result.detectionLatencySeconds).toBeLessThanOrEqual(300);
  });

  it("detection SLO passes for check intervals <= 300s", () => {
    expect(isDetectionSloMet(60)).toBe(true);
    expect(isDetectionSloMet(120)).toBe(true);
    expect(isDetectionSloMet(300)).toBe(true);
  });

  it("detection SLO fails for check intervals > 300s", () => {
    expect(isDetectionSloMet(301)).toBe(false);
    expect(isDetectionSloMet(600)).toBe(false);
  });

  it("breach detection provides runbook IDs for remediation", () => {
    const report = breachedSloReport();
    const result = detectBreaches(report, [], NOW);

    const allRunbookIds = result.activeBreaches.flatMap((b) => b.runbookIds);
    expect(allRunbookIds.length).toBeGreaterThan(0);

    // Every runbook ID referenced should exist in the registry
    for (const id of allRunbookIds) {
      expect(getRunbookById(id)).toBeTruthy();
    }
  });
});

describe("acceptance: runbooks are executable and tested", () => {
  it("all 3 runbooks can be simulated with passing results", () => {
    for (const runbook of getAllRunbooks()) {
      const result = simulateRunbookExecution(runbook, {}, NOW);
      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toBe(runbook.steps.length);
    }
  });

  it("all runbooks have escalation paths defined", () => {
    for (const runbook of getAllRunbooks()) {
      expect(runbook.escalation.target.length).toBeGreaterThan(0);
      expect(runbook.escalation.channel.length).toBeGreaterThan(0);
      expect(runbook.escalation.withinMinutes).toBeGreaterThan(0);
    }
  });

  it("each SLO key maps to at least one runbook", () => {
    const report = healthySloReport();
    for (const slo of report.slos) {
      for (const runbookId of slo.runbookIds) {
        expect(getRunbookById(runbookId)).toBeTruthy();
      }
    }
  });
});

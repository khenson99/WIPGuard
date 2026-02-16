import { describe, expect, it } from "vitest";
import type { OutboxOperationalMetrics } from "@/lib/outbox-worker";
import { evaluateObservabilitySlos } from "@/lib/observability/slo";

function baseOutboxMetrics(): OutboxOperationalMetrics {
  return {
    counts: {
      pending: 0,
      failed: 0,
      deadLetter: 0,
      dispatched: 10,
      total: 10,
    },
    lag: {
      oldestRetryableEventAgeSeconds: 0,
      oldestRetryableEventId: null,
    },
    failuresByEventType: [],
    recentDeadLetters: [],
  };
}

describe("evaluateObservabilitySlos", () => {
  it("returns healthy when lag and integration freshness are within thresholds", () => {
    const now = new Date("2026-02-16T15:00:00.000Z");

    const report = evaluateObservabilitySlos({
      now,
      outboxMetrics: baseOutboxMetrics(),
      connections: [
        {
          provider: "GOOGLE_WORKSPACE",
          status: "CONNECTED",
          lastSyncedAt: "2026-02-16T14:50:00.000Z",
          lastError: null,
        },
      ],
      rules: [
        {
          provider: "GOOGLE_WORKSPACE",
          enabled: true,
          lastRunAt: "2026-02-16T14:45:00.000Z",
          lastError: null,
        },
      ],
    });

    expect(report.overallStatus).toBe("healthy");
    expect(report.breachCount).toBe(0);
  });

  it("flags critical when queue lag and integration errors breach thresholds", () => {
    const now = new Date("2026-02-16T15:00:00.000Z");

    const outbox = baseOutboxMetrics();
    outbox.lag.oldestRetryableEventAgeSeconds = 901;
    outbox.counts.failed = 21;

    const report = evaluateObservabilitySlos({
      now,
      outboxMetrics: outbox,
      connections: [
        {
          provider: "SLACK",
          status: "ERROR",
          lastSyncedAt: "2026-02-16T13:00:00.000Z",
          lastError: "token expired",
        },
      ],
      rules: [
        {
          provider: "SLACK",
          enabled: true,
          lastRunAt: "2026-02-16T13:00:00.000Z",
          lastError: "sync failed",
        },
      ],
    });

    expect(report.overallStatus).toBe("critical");
    expect(report.breachCount).toBeGreaterThanOrEqual(2);
    expect(report.integrationHealth.errorConnections).toBe(1);
    expect(report.integrationHealth.staleRules).toBe(1);
  });
});

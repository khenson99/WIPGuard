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

  it("flags recent enabled rules with errors as degraded integration sync health", () => {
    const now = new Date("2026-02-16T15:00:00.000Z");

    const report = evaluateObservabilitySlos({
      now,
      outboxMetrics: baseOutboxMetrics(),
      connections: [
        {
          provider: "STRIPE",
          status: "CONNECTED",
          lastSyncedAt: "2026-02-16T14:55:00.000Z",
          lastError: null,
        },
      ],
      rules: [
        {
          provider: "STRIPE",
          key: "stripe.revenue-sync",
          enabled: true,
          lastRunAt: "2026-02-16T14:55:00.000Z",
          lastError: "Stripe returned 503",
        },
      ],
    });

    const freshnessSlo = report.slos.find(
      (slo) => slo.key === "integration_sync_freshness"
    );

    expect(report.overallStatus).toBe("degraded");
    expect(report.integrationHealth.erroredRules).toBe(1);
    expect(report.integrationHealth.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "STRIPE",
          erroredRules: 1,
        }),
      ])
    );
    expect(freshnessSlo).toEqual(
      expect.objectContaining({
        breached: true,
        severity: "warning",
        value: "0 stale rule(s), 1 errored rule(s)",
      })
    );
  });
});

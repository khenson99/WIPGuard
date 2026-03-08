import { describe, expect, it } from "vitest";
import {
  buildVisitorFunnelEnrichmentAlerts,
  instrumentVisitorFunnelEnrichmentAlerts,
} from "@/lib/analytics/visitor-funnel-enrichment-alerts";
import type { VisitorFunnelEnrichmentProviderStatus } from "@/lib/analytics/types";

const NOW = new Date("2026-03-08T12:00:00.000Z");

function providerStatus(
  overrides: Partial<VisitorFunnelEnrichmentProviderStatus>,
): VisitorFunnelEnrichmentProviderStatus {
  return {
    provider: "clay",
    label: "Clay",
    deliveryMode: "webhook_push",
    endpointPath: "/api/v1/analytics/funnel/enrich/clay",
    authConfigured: true,
    syncConfigured: true,
    syncEnabled: true,
    totalSignals: 10,
    acceptedSignals: 8,
    acceptedRate: 80,
    lastSignalAt: "2026-03-07T12:00:00.000Z",
    lastAcceptedAt: "2026-03-07T12:00:00.000Z",
    stale: false,
    note: "Provider can post payloads to the versioned enrichment endpoint.",
    ...overrides,
  };
}

describe("buildVisitorFunnelEnrichmentAlerts", () => {
  it("returns critical alerts for enabled but misconfigured providers", () => {
    const alerts = buildVisitorFunnelEnrichmentAlerts([
      providerStatus({
        provider: "unify",
        label: "UNIFY",
        deliveryMode: "cron_pull",
        syncConfigured: false,
        note: "Missing UNIFY_DATA_API_KEY/UNIFY_API_KEY or UNIFY_FUNNEL_OBJECT_NAME.",
      }),
    ], NOW);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: "unify:misconfigured",
      provider: "unify",
      severity: "critical",
      kind: "misconfigured",
    });
  });

  it("escalates long-stale providers to critical", () => {
    const alerts = buildVisitorFunnelEnrichmentAlerts([
      providerStatus({
        provider: "rb2b",
        label: "RB2B",
        lastSignalAt: "2026-02-15T12:00:00.000Z",
        stale: true,
      }),
    ], NOW);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: "rb2b:stale",
      provider: "rb2b",
      severity: "critical",
      kind: "stale",
    });
    expect(alerts[0]?.message).toContain("21 days");
  });
});

describe("instrumentVisitorFunnelEnrichmentAlerts", () => {
  it("builds on-call logs and metrics for active alerts", () => {
    const status = providerStatus({
      provider: "clay",
      label: "Clay",
      lastSignalAt: "2026-03-01T12:00:00.000Z",
      stale: true,
    });

    const telemetry = instrumentVisitorFunnelEnrichmentAlerts([status], NOW);

    expect(telemetry.alerts).toHaveLength(1);
    expect(telemetry.logs).toHaveLength(1);
    expect(telemetry.metrics).toHaveLength(1);
    expect(telemetry.logs[0]).toMatchObject({
      level: "warn",
      category: "oncall",
      event: "visitor_funnel.enrichment.alert.active",
    });
    expect(telemetry.metrics[0]).toMatchObject({
      name: "visitor_funnel.enrichment.alert.active",
      value: 1,
      tags: {
        provider: "clay",
        severity: "warning",
        kind: "stale",
      },
    });
  });
});

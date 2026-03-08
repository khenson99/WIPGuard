import {
  createLogEntry,
  createMetric,
  type MetricPoint,
  type StructuredLogEntry,
} from "@/lib/observability/structured-logger";
import type {
  VisitorFunnelEnrichmentAlert,
  VisitorFunnelEnrichmentProviderStatus,
} from "@/lib/analytics/types";

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const resolved = new Date(value);
  return Number.isNaN(resolved.getTime()) ? null : resolved;
}

function signalAgeDays(now: Date, lastSignalAt: string | null): number | null {
  const lastSignal = safeDate(lastSignalAt);
  if (!lastSignal) return null;
  return Math.max(0, Math.floor((now.getTime() - lastSignal.getTime()) / (24 * 60 * 60 * 1000)));
}

export function buildVisitorFunnelEnrichmentAlerts(
  statuses: VisitorFunnelEnrichmentProviderStatus[],
  now: Date = new Date(),
): VisitorFunnelEnrichmentAlert[] {
  const alerts: VisitorFunnelEnrichmentAlert[] = [];

  for (const status of statuses) {
    if (status.syncEnabled && !status.syncConfigured) {
      alerts.push({
        id: `${status.provider}:misconfigured`,
        provider: status.provider,
        providerLabel: status.label,
        severity: "critical",
        kind: "misconfigured",
        title: `${status.label} enrichment is misconfigured`,
        message: status.note,
        lastSignalAt: status.lastSignalAt,
      });
      continue;
    }

    if (status.syncEnabled && status.stale) {
      const ageDays = signalAgeDays(now, status.lastSignalAt);
      const staleSummary =
        ageDays == null
          ? `${status.label} has gone stale without a recent signal timestamp.`
          : `${status.label} has not delivered an enrichment signal in ${ageDays} day${ageDays === 1 ? "" : "s"}.`;
      alerts.push({
        id: `${status.provider}:stale`,
        provider: status.provider,
        providerLabel: status.label,
        severity: ageDays != null && ageDays >= 14 ? "critical" : "warning",
        kind: "stale",
        title: `${status.label} enrichment is stale`,
        message: `${staleSummary} ${status.note}`.trim(),
        lastSignalAt: status.lastSignalAt,
      });
    }
  }

  return alerts;
}

export function instrumentVisitorFunnelEnrichmentAlerts(
  statuses: VisitorFunnelEnrichmentProviderStatus[],
  now: Date = new Date(),
): {
  alerts: VisitorFunnelEnrichmentAlert[];
  logs: StructuredLogEntry[];
  metrics: MetricPoint[];
} {
  const alerts = buildVisitorFunnelEnrichmentAlerts(statuses, now);
  const logs = alerts.map((alert) =>
    createLogEntry(
      alert.severity === "critical" ? "error" : "warn",
      "oncall",
      "visitor_funnel.enrichment.alert.active",
      alert.title,
      {
        metadata: {
          provider: alert.provider,
          providerLabel: alert.providerLabel,
          severity: alert.severity,
          kind: alert.kind,
          lastSignalAt: alert.lastSignalAt,
          message: alert.message,
        },
        now,
      },
    ),
  );
  const metrics = alerts.map((alert) =>
    createMetric(
      "visitor_funnel.enrichment.alert.active",
      1,
      "count",
      {
        provider: alert.provider,
        severity: alert.severity,
        kind: alert.kind,
      },
      now,
    ),
  );

  return {
    alerts,
    logs,
    metrics,
  };
}

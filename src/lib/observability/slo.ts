import type { OutboxOperationalMetrics } from "@/lib/outbox-worker";

export type SloSeverity = "warning" | "critical";

export interface ObservabilityConnectionSample {
  provider: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface ObservabilityRuleSample {
  provider: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface ObservabilitySlo {
  key: string;
  label: string;
  objective: string;
  thresholdLabel: string;
  value: string;
  breached: boolean;
  severity: SloSeverity | null;
  runbookIds: string[];
}

export interface ProviderHealthSummary {
  provider: string;
  connected: number;
  errored: number;
  staleConnections: number;
  enabledRules: number;
  staleRules: number;
}

export interface IntegrationHealthSummary {
  totalConnections: number;
  connectedConnections: number;
  errorConnections: number;
  staleConnections: number;
  enabledRules: number;
  staleRules: number;
  providers: ProviderHealthSummary[];
}

export interface ObservabilitySloReport {
  overallStatus: "healthy" | "degraded" | "critical";
  breachCount: number;
  criticalBreachCount: number;
  slos: ObservabilitySlo[];
  integrationHealth: IntegrationHealthSummary;
}

interface EvaluateSloInput {
  outboxMetrics: OutboxOperationalMetrics;
  connections: ObservabilityConnectionSample[];
  rules: ObservabilityRuleSample[];
  now?: Date;
}

const OUTBOX_LAG_THRESHOLD_SECONDS = 5 * 60;
const FAILED_EVENT_THRESHOLD = 20;
const INTEGRATION_FRESHNESS_THRESHOLD_MINUTES = 30;

function ageMinutes(now: Date, isoDate: string | null): number | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 60000));
}

function formatValue(value: number | null, suffix: string): string {
  if (value === null) return "n/a";
  return `${value}${suffix}`;
}

function summarizeIntegrationHealth(input: {
  now: Date;
  connections: ObservabilityConnectionSample[];
  rules: ObservabilityRuleSample[];
}): IntegrationHealthSummary {
  const providerMap = new Map<string, ProviderHealthSummary>();

  for (const connection of input.connections) {
    const current = providerMap.get(connection.provider) ?? {
      provider: connection.provider,
      connected: 0,
      errored: 0,
      staleConnections: 0,
      enabledRules: 0,
      staleRules: 0,
    };

    if (connection.status === "CONNECTED") {
      current.connected += 1;
      const minutes = ageMinutes(input.now, connection.lastSyncedAt);
      if (minutes === null || minutes > INTEGRATION_FRESHNESS_THRESHOLD_MINUTES) {
        current.staleConnections += 1;
      }
    }

    if (connection.status === "ERROR") {
      current.errored += 1;
    }

    providerMap.set(connection.provider, current);
  }

  for (const rule of input.rules) {
    const current = providerMap.get(rule.provider) ?? {
      provider: rule.provider,
      connected: 0,
      errored: 0,
      staleConnections: 0,
      enabledRules: 0,
      staleRules: 0,
    };

    if (rule.enabled) {
      current.enabledRules += 1;
      const minutes = ageMinutes(input.now, rule.lastRunAt);
      if (minutes === null || minutes > INTEGRATION_FRESHNESS_THRESHOLD_MINUTES) {
        current.staleRules += 1;
      }
    }

    providerMap.set(rule.provider, current);
  }

  const providers = Array.from(providerMap.values()).sort((a, b) =>
    a.provider.localeCompare(b.provider)
  );

  return {
    totalConnections: input.connections.length,
    connectedConnections: input.connections.filter((item) => item.status === "CONNECTED").length,
    errorConnections: input.connections.filter((item) => item.status === "ERROR").length,
    staleConnections: providers.reduce((sum, provider) => sum + provider.staleConnections, 0),
    enabledRules: providers.reduce((sum, provider) => sum + provider.enabledRules, 0),
    staleRules: providers.reduce((sum, provider) => sum + provider.staleRules, 0),
    providers,
  };
}

export function evaluateObservabilitySlos(input: EvaluateSloInput): ObservabilitySloReport {
  const now = input.now ?? new Date();

  const integrationHealth = summarizeIntegrationHealth({
    now,
    connections: input.connections,
    rules: input.rules,
  });

  const outboxLagSeconds = input.outboxMetrics.lag.oldestRetryableEventAgeSeconds;
  const failedOrDeadLetter =
    input.outboxMetrics.counts.failed + input.outboxMetrics.counts.deadLetter;

  const slos: ObservabilitySlo[] = [
    {
      key: "outbox_delivery_lag",
      label: "Outbox Delivery Lag",
      objective: "Retryable events are dispatched within 5 minutes.",
      thresholdLabel: `<= ${OUTBOX_LAG_THRESHOLD_SECONDS}s`,
      value: formatValue(outboxLagSeconds, "s"),
      breached:
        outboxLagSeconds !== null && outboxLagSeconds > OUTBOX_LAG_THRESHOLD_SECONDS,
      severity:
        outboxLagSeconds !== null && outboxLagSeconds > OUTBOX_LAG_THRESHOLD_SECONDS
          ? "critical"
          : null,
      runbookIds: ["queue-backup"],
    },
    {
      key: "outbox_failure_budget",
      label: "Outbox Failure Budget",
      objective: "Failed + dead-letter events remain below the warning threshold.",
      thresholdLabel: `< ${FAILED_EVENT_THRESHOLD}`,
      value: String(failedOrDeadLetter),
      breached: failedOrDeadLetter >= FAILED_EVENT_THRESHOLD,
      severity: failedOrDeadLetter >= FAILED_EVENT_THRESHOLD ? "warning" : null,
      runbookIds: ["queue-backup"],
    },
    {
      key: "integration_sync_freshness",
      label: "Integration Sync Freshness",
      objective: "Enabled integration rules run at least every 30 minutes.",
      thresholdLabel: `${INTEGRATION_FRESHNESS_THRESHOLD_MINUTES}m`,
      value: `${integrationHealth.staleRules} stale rule(s)`,
      breached: integrationHealth.staleRules > 0,
      severity: integrationHealth.staleRules > 0 ? "warning" : null,
      runbookIds: ["sync-lag"],
    },
    {
      key: "integration_connection_health",
      label: "Integration Connection Health",
      objective: "Connected integrations stay healthy and recently synced.",
      thresholdLabel: "0 errors, 0 stale connections",
      value: `${integrationHealth.errorConnections} error, ${integrationHealth.staleConnections} stale`,
      breached:
        integrationHealth.errorConnections > 0 || integrationHealth.staleConnections > 0,
      severity:
        integrationHealth.errorConnections > 0 || integrationHealth.staleConnections > 0
          ? "critical"
          : null,
      runbookIds: ["sync-lag"],
    },
    {
      key: "websocket_delivery_proxy",
      label: "Realtime Delivery Proxy",
      objective:
        "Realtime event channel remains healthy (proxied by outbox lag and event failures).",
      thresholdLabel: `lag <= ${OUTBOX_LAG_THRESHOLD_SECONDS}s and failed/dead-letter < ${FAILED_EVENT_THRESHOLD}`,
      value: `${formatValue(outboxLagSeconds, "s")} lag / ${failedOrDeadLetter} failed+dead-letter`,
      breached:
        (outboxLagSeconds !== null && outboxLagSeconds > OUTBOX_LAG_THRESHOLD_SECONDS) ||
        failedOrDeadLetter >= FAILED_EVENT_THRESHOLD,
      severity:
        (outboxLagSeconds !== null && outboxLagSeconds > OUTBOX_LAG_THRESHOLD_SECONDS) ||
        failedOrDeadLetter >= FAILED_EVENT_THRESHOLD
          ? "critical"
          : null,
      runbookIds: ["websocket-degradation", "queue-backup"],
    },
  ];

  const breachCount = slos.filter((item) => item.breached).length;
  const criticalBreachCount = slos.filter(
    (item) => item.breached && item.severity === "critical"
  ).length;

  const overallStatus =
    criticalBreachCount > 0 ? "critical" : breachCount > 0 ? "degraded" : "healthy";

  return {
    overallStatus,
    breachCount,
    criticalBreachCount,
    slos,
    integrationHealth,
  };
}

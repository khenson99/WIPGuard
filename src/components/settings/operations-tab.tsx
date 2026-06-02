"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Siren, Wrench } from "lucide-react";

type OverallStatus = "healthy" | "degraded" | "critical";
type SloSeverity = "warning" | "critical" | null;

interface ObservabilityResponse {
  generatedAt: string;
  report: {
    overallStatus: OverallStatus;
    breachCount: number;
    criticalBreachCount: number;
    slos: Array<{
      key: string;
      label: string;
      objective: string;
      thresholdLabel: string;
      value: string;
      breached: boolean;
      severity: SloSeverity;
      runbookIds: string[];
    }>;
    integrationHealth: {
      totalConnections: number;
      connectedConnections: number;
      errorConnections: number;
      staleConnections: number;
      enabledRules: number;
      staleRules: number;
      erroredRules: number;
      providers: Array<{
        provider: string;
        connected: number;
        errored: number;
        staleConnections: number;
        enabledRules: number;
        staleRules: number;
        erroredRules: number;
      }>;
    };
  };
  outboxMetrics: {
    counts: {
      pending: number;
      failed: number;
      deadLetter: number;
      dispatched: number;
      total: number;
    };
    lag: {
      oldestRetryableEventAgeSeconds: number | null;
    };
    failuresByEventType: Array<{ eventType: string; count: number }>;
    recentDeadLetters: Array<{
      id: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      retryCount: number;
      failedAt: string | null;
      error: string | null;
    }>;
  };
  runbooks: Array<{
    id: string;
    title: string;
    description: string;
    path: string;
  }>;
  suggestedRunbookIds: string[];
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: OverallStatus): { label: string; classes: string } {
  if (status === "healthy") {
    return {
      label: "Healthy",
      classes: "bg-[var(--success)]/10 text-[var(--success)]",
    };
  }
  if (status === "degraded") {
    return {
      label: "Degraded",
      classes: "bg-[var(--warning)]/10 text-[var(--warning)]",
    };
  }
  return {
    label: "Critical",
    classes: "bg-[var(--danger)]/10 text-[var(--danger)]",
  };
}

export function OperationsTab() {
  const [data, setData] = useState<ObservabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/ops/observability", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to fetch observability report");
      }

      const payload = (await response.json()) as ObservabilityResponse;
      setData(payload);
      setError(null);
    } catch {
      setError("Could not load observability report.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const suggestedRunbooks = useMemo(() => {
    if (!data) return [];

    const set = new Set(data.suggestedRunbookIds);
    return data.runbooks.filter((runbook) => set.has(runbook.id));
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
            {error}
          </div>
        )}
        <button
          onClick={() => load(true)}
          className="btn-ghost-muted rounded-lg border border-border px-3 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const badge = statusBadge(data.report.overallStatus);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Operations</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Live SLOs, queue pressure, and integration health for on-call triage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.classes}`}>
            {badge.label}
          </span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="btn-ghost-muted inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">SLO Breaches</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{data.report.breachCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Critical Breaches</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{data.report.criticalBreachCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Queue Lag</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {data.outboxMetrics.lag.oldestRetryableEventAgeSeconds ?? 0}s
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Integration Errors</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {data.report.integrationHealth.errorConnections}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Service-level Objectives</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Generated at {formatTimestamp(data.generatedAt)}.
        </p>

        <div className="mt-3 space-y-2">
          {data.report.slos.map((slo) => {
            const icon = slo.breached ? Siren : CheckCircle2;
            const Icon = icon;
            const indicatorClasses =
              slo.breached && slo.severity === "critical"
                ? "text-[var(--danger)]"
                : slo.breached
                  ? "text-[var(--warning)]"
                  : "text-[var(--success)]";

            return (
              <div
                key={slo.key}
                className="rounded-md border border-border bg-secondary/30 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 h-4 w-4 ${indicatorClasses}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{slo.label}</p>
                      <p className="text-xs text-muted-foreground">{slo.objective}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{slo.value}</p>
                    <p className="text-xs text-muted-foreground">Target: {slo.thresholdLabel}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Integration Health</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.report.integrationHealth.providers.map((provider) => (
            <div
              key={provider.provider}
              className="rounded-md border border-border bg-secondary/30 px-3 py-2"
            >
              <p className="text-sm font-medium text-foreground">{provider.provider}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Connected {provider.connected} • Error {provider.errored} • Stale sync {provider.staleConnections}
              </p>
              <p className="text-xs text-muted-foreground">
                Enabled rules {provider.enabledRules} • Stale rules {provider.staleRules} • Error rules {provider.erroredRules}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Runbooks</h3>
        {suggestedRunbooks.length > 0 && (
          <div className="mt-2 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-xs text-foreground">
            Suggested now: {suggestedRunbooks.map((runbook) => runbook.title).join(", ")}
          </div>
        )}
        <div className="mt-3 space-y-2">
          {data.runbooks.map((runbook) => (
            <div
              key={runbook.id}
              className="rounded-md border border-border bg-secondary/30 px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <Wrench className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">{runbook.title}</p>
                  <p className="text-xs text-muted-foreground">{runbook.description}</p>
                  <p className="mt-1 text-xs font-mono text-muted-foreground">{runbook.path}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {data.outboxMetrics.recentDeadLetters.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Recent Dead Letters</h3>
          <div className="mt-2 space-y-2">
            {data.outboxMetrics.recentDeadLetters.slice(0, 8).map((event) => (
              <div
                key={event.id}
                className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2"
              >
                <p className="text-xs font-medium text-foreground">{event.eventType}</p>
                <p className="text-xs text-muted-foreground">
                  {event.aggregateType}:{event.aggregateId} • retries {event.retryCount}
                </p>
                {event.error && (
                  <p className="mt-1 text-xs text-[var(--danger)]">{event.error}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-xs text-foreground">
          {error}
        </div>
      )}
    </div>
  );
}

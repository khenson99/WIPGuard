"use client";

export function DecisionDashboardView({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;
  const northStar = (payload.northStar ?? {}) as Record<string, unknown>;
  const supporting = (payload.supportingMetrics ?? {}) as Record<string, unknown>;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
      <MetricCard label="Internal Execution Reliability" value={northStar.flowReliabilityScore} />
      <MetricCard label="Throughput (30d)" value={northStar.throughput30d} />
      <MetricCard label="On-Time Completion" value={northStar.onTimeCompletionRate} suffix="%" />
      <MetricCard label="Cycle-time Risk Signals" value={supporting.cycleTimeRiskSignals} />
    </div>
  );
}

export function FlowMetricsView({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;
  const leadTime = (payload.leadTime ?? {}) as Record<string, unknown>;
  const cycleTime = (payload.cycleTime ?? {}) as Record<string, unknown>;
  const throughput = Array.isArray(payload.throughput) ? payload.throughput : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <MetricCard label="Lead Time P50 (days)" value={leadTime.p50} />
        <MetricCard label="Lead Time P75 (days)" value={leadTime.p75} />
        <MetricCard label="Cycle Time P50 (days)" value={cycleTime.p50} />
        <MetricCard label="Throughput Buckets" value={throughput.length} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Throughput Timeline</h3>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {throughput.slice(-8).map((item) => {
            const row = item as Record<string, unknown>;
            return (
              <p key={String(row.bucketStart)}>
                {String(row.bucketStart)}: {Number(row.completed ?? 0)} completed
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function FlowRiskView({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;
  const fixedDateAlerts = Array.isArray(payload.fixedDateAlerts) ? payload.fixedDateAlerts : [];
  const staleChains = Array.isArray(payload.staleDependencyChains) ? payload.staleDependencyChains : [];
  const blockers = Array.isArray(payload.chronicBlockers) ? payload.chronicBlockers : [];
  const recs = Array.isArray(payload.recommendations) ? payload.recommendations : [];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
      <MetricCard label="Fixed-Date Alerts" value={fixedDateAlerts.length} />
      <MetricCard label="Stale Dependency Chains" value={staleChains.length} />
      <MetricCard label="Chronic Blockers" value={blockers.length} />
      <MetricCard label="Risk Recommendations" value={recs.length} />
    </div>
  );
}

export function ObservabilityView({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;
  const report = (payload.report ?? {}) as Record<string, unknown>;
  const integration = (report.integrationHealth ?? {}) as Record<string, unknown>;
  const slos = Array.isArray(report.slos) ? report.slos : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <MetricCard label="Overall Status" value={report.overallStatus} />
        <MetricCard label="Breach Count" value={report.breachCount} />
        <MetricCard label="Error Connections" value={integration.errorConnections} />
        <MetricCard label="Stale Rules" value={integration.staleRules} />
        <MetricCard label="Errored Rules" value={integration.erroredRules} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">SLOs</h3>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {slos.map((item) => {
            const slo = item as Record<string, unknown>;
            return (
              <p key={String(slo.key)}>
                {String(slo.label)}: {String(slo.value)} {Boolean(slo.breached) ? "• breached" : ""}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: unknown;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">
        {value === null || value === undefined || value === "" ? "—" : `${value}${suffix || ""}`}
      </p>
    </div>
  );
}

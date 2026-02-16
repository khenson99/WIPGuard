"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

type IntegrationStatus = "Not provisioned" | "Connected but stale" | "Active";

function deriveIntegrationStatus(input: {
  connected: boolean;
  stale: boolean;
  coverageStatus: "active" | "stale" | "not_provisioned" | null;
}): IntegrationStatus {
  if (!input.connected || input.coverageStatus === "not_provisioned") {
    return "Not provisioned";
  }
  if (input.stale || input.coverageStatus === "stale") {
    return "Connected but stale";
  }
  return "Active";
}

function statusClasses(status: IntegrationStatus): string {
  if (status === "Active") {
    return "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]";
  }
  if (status === "Connected but stale") {
    return "border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]";
  }
  return "border-border bg-secondary/30 text-muted-foreground";
}

function buildCombinedTrend(data: AnalyticsDashboardData | null): Array<{ date: string; total: number }> {
  if (!data) return [];
  const buckets = new Map<string, number>();
  const trendSources = [data.slack?.trend ?? [], data.googleWorkspace?.trend ?? [], data.codaOps?.trend ?? []];

  trendSources.forEach((trend) => {
    trend.forEach((item) => {
      buckets.set(item.date, (buckets.get(item.date) ?? 0) + item.createdTasks + item.receipts);
    });
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, total]) => ({ date, total }));
}

export function CustomerSuccessTab({ data }: { data: AnalyticsDashboardData | null }) {
  const pylon = data?.pylon;
  const coda = data?.coda;
  const product = data?.product;
  const googleWorkspace = data?.googleWorkspace;
  const slackOps = data?.slack;
  const codaOps = data?.codaOps;
  const trend = buildCombinedTrend(data);
  const maxTrend = Math.max(1, ...trend.map((item) => item.total));

  const integrationStatuses = [
    {
      label: "Google Workspace",
      status: deriveIntegrationStatus({
        connected: data?.freshness.google_workspace?.status === "CONNECTED",
        stale: Boolean(data?.freshness.google_workspace?.stale),
        coverageStatus: googleWorkspace?.coverageStatus ?? null,
      }),
      details: `${googleWorkspace?.configuredRules.length ?? 0}/${googleWorkspace?.expectedRules.length ?? 0} rules`,
    },
    {
      label: "Slack",
      status: deriveIntegrationStatus({
        connected: data?.freshness.slack?.status === "CONNECTED",
        stale: Boolean(data?.freshness.slack?.stale),
        coverageStatus: slackOps?.coverageStatus ?? null,
      }),
      details: `${slackOps?.configuredRules.length ?? 0}/${slackOps?.expectedRules.length ?? 0} rules`,
    },
    {
      label: "Coda",
      status: deriveIntegrationStatus({
        connected: data?.freshness.coda?.status === "CONNECTED",
        stale: Boolean(data?.freshness.coda?.stale),
        coverageStatus: codaOps?.coverageStatus ?? null,
      }),
      details: `${codaOps?.configuredRules.length ?? 0}/${codaOps?.expectedRules.length ?? 0} rules`,
    },
  ];

  if (!pylon && !coda && !product) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No customer-success data available for this range.
      </div>
    );
  }

  const riskItems = [
    {
      id: "urgent",
      label: "Urgent Support Load",
      value: pylon?.urgentConversations ?? 0,
      threshold: 10,
      description: "High urgent queue can increase churn risk.",
    },
    {
      id: "backlog",
      label: "Backlog Growth",
      value: product?.backlogGrowth ?? 0,
      threshold: 1,
      description: "Growing backlog can degrade response quality.",
    },
    {
      id: "overdue",
      label: "Overdue Open Tasks",
      value: product?.overdueOpenTasks ?? 0,
      threshold: 5,
      description: "Overdue execution creates retention delays.",
    },
  ];

  const actions = [
    {
      title: "Rebalance urgent queue ownership",
      detail: "Assign a daily triage owner and enforce 2-hour response SLA on urgent tickets.",
      impact: "Expected: lower urgent backlog within 1 week.",
    },
    {
      title: "Throttle backlog inflow",
      detail: "Route non-critical requests into weekly batches and prioritize customer-blocking items.",
      impact: "Expected: improved throughput and queue stability.",
    },
    {
      title: "Automate follow-up execution",
      detail: "Use Slack/Coda workflows to auto-create and assign post-resolution follow-up tasks.",
      impact: "Expected: faster closure and improved customer confidence.",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Open Pylon Conversations</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{pylon?.openConversations ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Urgent Conversations</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{pylon?.urgentConversations ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Product Throughput</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatPct(product?.throughputRate)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Coda Cards</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{coda?.totalCards ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Integration Delivery Status</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Operational state for customer-success integrations.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          {integrationStatuses.map((item) => (
            <div key={item.label} className="rounded-md border border-border bg-secondary/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusClasses(item.status)}`}>
                {item.status}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.details}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Customer Ops Trend (7 buckets)</h3>
        {trend.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No workflow trend available in this range.</p>
        ) : (
          <div className="mt-3 grid grid-cols-7 gap-2">
            {trend.map((item) => {
              const height = Math.max(10, Math.round((item.total / maxTrend) * 100));
              return (
                <div key={item.date} className="flex flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end">
                    <div className="w-full rounded-sm bg-primary/75" style={{ height: `${height}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{item.date.slice(5)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Top Risks</h3>
          <div className="mt-3 space-y-2">
            {riskItems.map((risk) => {
              const isHigh = risk.value >= risk.threshold;
              return (
                <div
                  key={risk.id}
                  className={`rounded-md border px-3 py-2 ${
                    isHigh ? "border-red-500/30 bg-red-500/10" : "border-border/60 bg-background"
                  }`}
                >
                  <p className="text-xs font-medium text-foreground">
                    {risk.label}: <span className={isHigh ? "text-red-500" : "text-foreground"}>{risk.value}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{risk.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Recommended Actions</h3>
          <div className="mt-3 space-y-2">
            {actions.map((action) => (
              <div key={action.title} className="rounded-md border border-border/60 bg-background px-3 py-2">
                <p className="text-xs font-medium text-foreground">{action.title}</p>
                <p className="text-[11px] text-muted-foreground">{action.detail}</p>
                <p className="mt-0.5 text-[11px] text-foreground">{action.impact}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  MessageSquare, AlertTriangle, Activity, LayoutGrid,
  Clock, Wifi, WifiOff, RefreshCw,
  Zap, TrendingUp, Shield, Users,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { fmtNumber, fmtPercent } from "@/lib/analytics/format";
import { StatCard } from "./stat-card";

/* ── Integration status derivation ── */

type IntegrationStatus = "Not provisioned" | "Connected but stale" | "Active";

function deriveIntegrationStatus(input: {
  connected: boolean;
  stale: boolean;
  lastSyncedAt: string | null;
}): IntegrationStatus {
  if (!input.connected) return "Not provisioned";
  if (input.stale) return "Connected but stale";
  return "Active";
}

const STATUS_CONFIG: Record<IntegrationStatus, {
  dot: string;
  badge: string;
  icon: typeof Wifi;
}> = {
  Active: {
    dot: "bg-emerald-500",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    icon: Wifi,
  },
  "Connected but stale": {
    dot: "bg-amber-500",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    icon: RefreshCw,
  },
  "Not provisioned": {
    dot: "bg-muted-foreground/40",
    badge: "border-border bg-secondary/30 text-muted-foreground",
    icon: WifiOff,
  },
};

/* ── Ops trend builder ── */

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

/* ── Dynamic action builder from data signals ── */

function buildDynamicActions(data: AnalyticsDashboardData): Array<{
  title: string;
  detail: string;
  impact: string;
  severity: "critical" | "warning" | "info";
}> {
  const actions: Array<{
    title: string;
    detail: string;
    impact: string;
    severity: "critical" | "warning" | "info";
  }> = [];

  // Pull from backend recommendations for customer-success section
  const csRecommendations = data.recommendations?.filter((r) => r.section === "customer-success") ?? [];
  csRecommendations.forEach((rec) => {
    actions.push({
      title: rec.title,
      detail: rec.insight,
      impact: rec.suggestedAction,
      severity: rec.severity,
    });
  });

  // Data-driven actions based on live metrics
  const pylon = data.pylon;
  const product = data.product;

  if (pylon && pylon.urgentConversations >= 10 && !actions.some((a) => a.title.toLowerCase().includes("urgent"))) {
    actions.push({
      title: "Rebalance urgent queue ownership",
      detail: `${pylon.urgentConversations} urgent conversations need immediate triage.`,
      impact: "Assign a daily triage owner and enforce 2-hour response SLA.",
      severity: "critical",
    });
  }

  if (product && product.backlogGrowth > 0 && !actions.some((a) => a.title.toLowerCase().includes("backlog"))) {
    actions.push({
      title: "Throttle backlog inflow",
      detail: `Backlog grew by ${product.backlogGrowth} — inflow exceeds throughput.`,
      impact: "Route non-critical requests into weekly batches and prioritize blockers.",
      severity: product.backlogGrowth > 5 ? "critical" : "warning",
    });
  }

  if (product && product.overdueOpenTasks > 5 && !actions.some((a) => a.title.toLowerCase().includes("overdue"))) {
    actions.push({
      title: "Clear overdue task backlog",
      detail: `${product.overdueOpenTasks} tasks past due — impacts customer confidence.`,
      impact: "Run a focused sprint to close stale items or re-scope.",
      severity: product.overdueOpenTasks > 15 ? "critical" : "warning",
    });
  }

  if (pylon && pylon.avgFirstResponseMinutes !== null && pylon.avgFirstResponseMinutes > 120) {
    actions.push({
      title: "Improve first response time",
      detail: `Average first response is ${Math.round(pylon.avgFirstResponseMinutes)} min — above 2-hour target.`,
      impact: "Set up auto-responder templates and escalation triggers.",
      severity: pylon.avgFirstResponseMinutes > 240 ? "critical" : "warning",
    });
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  actions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return actions.length > 0
    ? actions
    : [
        {
          title: "All systems healthy",
          detail: "No urgent actions detected based on current metrics.",
          impact: "Continue monitoring for changes.",
          severity: "info" as const,
        },
      ];
}

/* ── Main Component ── */

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
      provider: "google_workspace" as const,
      ops: googleWorkspace,
    },
    {
      label: "Slack",
      provider: "slack" as const,
      ops: slackOps,
    },
    {
      label: "Coda",
      provider: "coda" as const,
      ops: codaOps,
    },
  ].map((item) => {
    const freshness = data?.freshness[item.provider];
    const status = deriveIntegrationStatus({
      connected: freshness?.status === "CONNECTED",
      stale: Boolean(freshness?.stale),
      lastSyncedAt: freshness?.lastSyncedAt ?? null,
    });
    return {
      label: item.label,
      status,
      ops: item.ops,
      lastSynced: freshness?.lastSyncedAt ?? null,
      rulesEnabled: item.ops?.enabledRules ?? 0,
      rulesTotal: item.ops?.totalRules ?? 0,
      errored: item.ops?.erroredRules ?? 0,
      receipts: item.ops?.receiptsInRange ?? 0,
    };
  });

  if (!pylon && !coda && !product) {
    return <EmptyState />;
  }

  const riskItems = [
    {
      id: "urgent",
      label: "Urgent Support Load",
      value: pylon?.urgentConversations ?? 0,
      threshold: 10,
      description: "High urgent queue increases churn risk.",
      icon: AlertTriangle,
    },
    {
      id: "backlog",
      label: "Backlog Growth",
      value: product?.backlogGrowth ?? 0,
      threshold: 1,
      description: "Growing backlog degrades response quality.",
      icon: TrendingUp,
    },
    {
      id: "overdue",
      label: "Overdue Open Tasks",
      value: product?.overdueOpenTasks ?? 0,
      threshold: 5,
      description: "Overdue execution creates retention delays.",
      icon: Clock,
    },
  ].sort((a, b) => {
    const aRatio = a.value / a.threshold;
    const bRatio = b.value / b.threshold;
    return bRatio - aRatio;
  });

  const actions = data ? buildDynamicActions(data) : [];

  return (
    <div className="space-y-6">
      {/* ── Top KPI Row ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="animate-analytics-in animate-delay-0"><StatCard
          label="Open Conversations"
          value={pylon ? fmtNumber(pylon.openConversations) : "—"}
          subtitle={pylon ? `${pylon.waitingOnTeam} waiting on team` : "Pylon not connected"}
          icon={MessageSquare}
        /></div>
        <div className="animate-analytics-in animate-delay-1"><StatCard
          label="Urgent Conversations"
          value={pylon ? fmtNumber(pylon.urgentConversations) : "—"}
          changeType={pylon && pylon.urgentConversations >= 10 ? "negative" : pylon ? "positive" : "neutral"}
          subtitle={pylon?.resolvedInRange ? `${pylon.resolvedInRange} resolved` : undefined}
          icon={AlertTriangle}
          iconColor={pylon && pylon.urgentConversations >= 10 ? "#ef4444" : undefined}
        /></div>
        <div className="animate-analytics-in animate-delay-2"><StatCard
          label="Product Throughput"
          value={product?.throughputRate !== null && product?.throughputRate !== undefined
            ? fmtPercent(product.throughputRate)
            : "—"}
          subtitle={product
            ? `${product.completedTasksInRange} completed / ${product.createdTasksInRange} created`
            : "Not connected"}
          changeType={product && product.throughputRate !== null
            ? product.throughputRate >= 80 ? "positive" : product.throughputRate >= 50 ? "neutral" : "negative"
            : "neutral"}
          icon={Activity}
        /></div>
        <div className="animate-analytics-in animate-delay-3"><StatCard
          label="Coda Cards"
          value={coda ? fmtNumber(coda.totalCards) : "—"}
          subtitle={coda?.cardsByStatus.length
            ? coda.cardsByStatus.slice(0, 2).map((s) => `${s.status}: ${s.count}`).join(", ")
            : "Coda not connected"}
          icon={LayoutGrid}
        /></div>
      </div>

      {/* ── Integration Delivery Status ── */}
      <div className="animate-analytics-slide-up rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Integration Delivery Status</h3>
        <p className="mb-4 text-xs text-muted-foreground">Operational state for customer-success integrations</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {integrationStatuses.map((item) => {
            const config = STATUS_CONFIG[item.status];
            const StatusIcon = config.icon;
            return (
              <div key={item.label} className="rounded-xl border border-border bg-secondary/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${config.dot}`} />
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                  </div>
                  <StatusIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="mt-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${config.badge}`}>
                    {item.status}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                  <p>Rules: {item.rulesEnabled}/{item.rulesTotal}{item.errored > 0 ? ` (${item.errored} errored)` : ""}</p>
                  <p>Receipts: {fmtNumber(item.receipts)}</p>
                  {item.lastSynced && (
                    <p>Last sync: {new Date(item.lastSynced).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Customer Ops Trend ── */}
      <div className="animate-analytics-slide-up rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Customer Ops Trend</h3>
        <p className="mb-4 text-xs text-muted-foreground">Combined workflow activity across integrations (7 buckets)</p>
        {trend.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No workflow trend available in this range</p>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {trend.map((item, idx) => {
              const height = Math.max(10, Math.round((item.total / maxTrend) * 100));
              return (
                <div key={item.date} className="group flex flex-col items-center gap-1">
                  <div className="relative flex h-28 w-full items-end">
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-foreground/90 px-2 py-0.5 text-[10px] font-medium text-background group-hover:block">
                      {item.total}
                    </div>
                    <div
                      className="w-full rounded-t-md bg-primary/75 transition-all duration-500 group-hover:bg-primary"
                      style={{
                        height: `${height}%`,
                        animationDelay: `${idx * 50}ms`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] tabular-nums text-muted-foreground">{item.date.slice(5)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Risks & Actions ── */}
      <div className="animate-analytics-slide-up grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top Risks */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="h-4 w-4 text-primary" />
            Top Risks
          </h3>
          <div className="space-y-2">
            {riskItems.map((risk) => {
              const ratio = risk.value / risk.threshold;
              const isHigh = ratio >= 1;
              const isCritical = ratio >= 2;
              const RiskIcon = risk.icon;
              return (
                <div
                  key={risk.id}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
                    isCritical
                      ? "border-red-500/30 bg-red-500/5"
                      : isHigh
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border/60 bg-background"
                  }`}
                >
                  <RiskIcon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      isCritical ? "text-red-500" : isHigh ? "text-amber-500" : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">{risk.label}</p>
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          isCritical ? "text-red-500" : isHigh ? "text-amber-500" : "text-foreground"
                        }`}
                      >
                        {risk.value}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{risk.description}</p>
                    {/* Threshold bar */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCritical ? "bg-red-500" : isHigh ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(ratio * 50, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] tabular-nums text-muted-foreground">
                        threshold: {risk.threshold}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommended Actions (Dynamic) */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="h-4 w-4 text-primary" />
            Recommended Actions
          </h3>
          <div className="space-y-2">
            {actions.map((action, idx) => {
              const severityConfig = {
                critical: {
                  border: "border-red-500/20",
                  bg: "bg-red-500/5",
                  dot: "bg-red-500",
                  text: "text-red-500",
                },
                warning: {
                  border: "border-amber-500/20",
                  bg: "bg-amber-500/5",
                  dot: "bg-amber-500",
                  text: "text-amber-500",
                },
                info: {
                  border: "border-blue-500/20",
                  bg: "bg-blue-500/5",
                  dot: "bg-blue-500",
                  text: "text-blue-500",
                },
              }[action.severity];

              return (
                <div
                  key={idx}
                  className={`rounded-lg border ${severityConfig.border} ${severityConfig.bg} px-3 py-2.5`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityConfig.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold ${severityConfig.text}`}>{action.title}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{action.detail}</p>
                      <p className="mt-1 text-[10px] font-medium text-foreground">{action.impact}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CSAT & Response Time (if Pylon available) ── */}
      {pylon && (pylon.csat !== null || pylon.avgFirstResponseMinutes !== null) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {pylon.csat !== null && (
            <StatCard
              label="CSAT Score"
              value={fmtPercent(pylon.csat)}
              changeType={pylon.csat >= 80 ? "positive" : pylon.csat >= 60 ? "neutral" : "negative"}
              icon={Users}
              size="sm"
            />
          )}
          {pylon.avgFirstResponseMinutes !== null && (
            <StatCard
              label="Avg First Response"
              value={pylon.avgFirstResponseMinutes < 60
                ? `${Math.round(pylon.avgFirstResponseMinutes)}m`
                : `${(pylon.avgFirstResponseMinutes / 60).toFixed(1)}h`}
              changeType={pylon.avgFirstResponseMinutes <= 120 ? "positive" : "negative"}
              subtitle="Target: < 2 hours"
              icon={Clock}
              size="sm"
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Empty State ── */
function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No customer-success data available</p>
        <p className="text-xs text-muted-foreground">Connect Pylon, Coda, or Product tools to see insights</p>
      </div>
    </div>
  );
}

"use client";

import {
  Target, AlertTriangle, TrendingDown, CheckCircle,
  XCircle, Clock, ArrowRight, ArrowDown, Zap,
} from "lucide-react";
import type { AnalyticsDashboardData, DealStage } from "@/lib/analytics/types";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/analytics/format";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";

const FUNNEL_ORDER = [
  "Prospect", "Lead", "Demo Scheduled", "No-Show/Reschedule",
  "Demo Follow-Up", "Budgetary Quote Sent", "Payment Link Sent",
  "Free Trial", "Freemium", "Subscription", "Closed Won",
];

const STAGE_COLORS: Record<string, string> = {
  "Prospect": "#4379f0",
  "Lead": "#60a5fa",
  "Demo Scheduled": "#34d399",
  "No-Show/Reschedule": "#fbbf24",
  "Demo Follow-Up": "#a78bfa",
  "Budgetary Quote Sent": "#f472b6",
  "Payment Link Sent": "#2dd4bf",
  "Free Trial": "#818cf8",
  "Freemium": "#c084fc",
  "Subscription": "#22d3ee",
  "Closed Won": "#22c55e",
  "Closed Lost": "#ef4444",
  "Unlikely": "#f97316",
  "Churn": "#dc2626",
  "Ping Later": "#6b7280",
  "On Hold": "#9ca3af",
};

export function SalesFunnelTab({ data }: { data: AnalyticsDashboardData | null }) {
  if (!data?.hubspot) return <EmptyState />;

  const { funnel } = data.hubspot;

  const orderedStages = FUNNEL_ORDER
    .map((label) => funnel.stages.find((s) => s.label === label))
    .filter(Boolean) as DealStage[];

  const terminalStages = funnel.stages.filter(
    (s) => ["Closed Won", "Closed Lost", "Unlikely", "Churn", "Ping Later", "On Hold"].includes(s.label),
  );

  const maxStageCount = Math.max(...orderedStages.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      {/* ── Top KPI Row ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="animate-analytics-in animate-delay-0"><StatCard
          label="Total Deals"
          value={fmtNumber(funnel.totalDeals)}
          icon={Target}
        /></div>
        <div className="animate-analytics-in animate-delay-1"><StatCard
          label="Win Rate"
          value={fmtPercent(funnel.winRate)}
          subtitle={`${funnel.closedWon} won / ${funnel.closedWon + funnel.closedLost} decided`}
          changeType={funnel.winRate > 50 ? "positive" : "negative"}
          icon={CheckCircle}
        /></div>
        <div className="animate-analytics-in animate-delay-2"><StatCard
          label="Effective Win Rate"
          value={fmtPercent(funnel.effectiveWinRate)}
          subtitle="Won / (Won+Lost+Unlikely+Churn)"
          icon={Zap}
        /></div>
        <div className="animate-analytics-in animate-delay-3"><StatCard
          label="No-Show Rate"
          value={fmtPercent(funnel.noShowRate)}
          changeType={funnel.noShowRate > 15 ? "negative" : "positive"}
          subtitle={`${funnel.noShows} no-shows`}
          icon={Clock}
        /></div>
        <div className="animate-analytics-in animate-delay-4"><StatCard
          label="Avg Deal Size"
          value={fmtCurrency(funnel.avgDealSize)}
          icon={Target}
        /></div>
      </div>

      {/* ── Funnel Visualization with Conversion Arrows ── */}
      <div className="animate-analytics-slide-up rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Sales Pipeline Funnel</h3>
        <p className="mb-5 text-xs text-muted-foreground">Active pipeline stages — ordered by sales process flow</p>
        <div className="space-y-0">
          {orderedStages.map((stage, idx) => {
            const widthPct = Math.max((stage.count / maxStageCount) * 100, 8);
            const nextStage = orderedStages[idx + 1];
            const conversionRate = nextStage && stage.count > 0
              ? ((nextStage.count / stage.count) * 100)
              : null;

            return (
              <div key={stage.stageId}>
                {/* Stage bar */}
                <div className="flex items-center gap-3">
                  <span className="w-40 text-right text-sm text-muted-foreground">
                    {stage.label}
                  </span>
                  <div className="flex-1">
                    <div className="relative h-8 overflow-hidden rounded-md">
                      <div
                        className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: STAGE_COLORS[stage.label] || "#6b7280",
                          minWidth: "60px",
                        }}
                      >
                        <span className="text-xs font-bold text-white drop-shadow">
                          {stage.count}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                    {fmtCurrency(stage.value)}
                  </span>
                </div>

                {/* Conversion arrow between stages */}
                {conversionRate !== null && (
                  <div className="flex items-center gap-3">
                    <span className="w-40" />
                    <div className="flex flex-1 items-center justify-center py-1">
                      <div className="flex items-center gap-1.5">
                        <ArrowDown className="h-3 w-3 text-muted-foreground/50" />
                        <span
                          className={`text-[10px] font-semibold tabular-nums ${
                            conversionRate >= 80
                              ? "text-emerald-500"
                              : conversionRate >= 50
                                ? "text-amber-500"
                                : "text-red-400"
                          }`}
                        >
                          {conversionRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <span className="w-20" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottleneck Analysis + Terminal Stages ── */}
      <div className="animate-analytics-slide-up grid gap-4 lg:grid-cols-2">
        {/* Bottleneck Alerts */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Bottleneck Analysis</h3>
          <div className="space-y-3">
            {funnel.noShowRate > 15 && (
              <BottleneckAlert
                severity="critical"
                title={`${funnel.noShowRate.toFixed(0)}% No-Show Rate`}
                description={`${funnel.noShows} prospects scheduled demos but didn't show.`}
                action="Add SMS reminders & shorten booking windows"
              />
            )}
            {funnel.unlikely > 20 && (
              <BottleneckAlert
                severity="warning"
                title={`${funnel.unlikely} Deals Marked "Unlikely"`}
                description="Large number of deals stalled in unlikely."
                action="Review qualification criteria & archive stale deals"
              />
            )}
            {funnel.churn > 10 && (
              <BottleneckAlert
                severity="warning"
                title={`${funnel.churn} Churned Customers`}
                description="Elevated churn needs attention."
                action="Implement 30/60/90 day check-in cadence"
              />
            )}
            {funnel.demoFollowUp > funnel.closedWon && (
              <BottleneckAlert
                severity="info"
                title="Follow-Up > Closed Won"
                description={`${funnel.demoFollowUp} deals in follow-up vs ${funnel.closedWon} won.`}
                action="Speed up post-demo proposal delivery"
              />
            )}
            {funnel.noShowRate <= 15 && funnel.unlikely <= 20 && funnel.churn <= 10 && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 px-3 py-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-emerald-500">Pipeline health looks good!</span>
              </div>
            )}
          </div>
        </div>

        {/* Terminal Stage Breakdown */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Terminal Stages</h3>
          <div className="mb-4 flex justify-center gap-4">
            <RingStat value={funnel.winRate} max={100} label="Win Rate" color="#22c55e" size={90} />
            <RingStat
              value={100 - funnel.winRate}
              max={100}
              label="Loss Rate"
              color="#ef4444"
              size={90}
            />
          </div>
          <div className="space-y-2">
            {terminalStages
              .sort((a, b) => b.count - a.count)
              .map((stage) => (
                <div key={stage.stageId} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: STAGE_COLORS[stage.label] || "#6b7280" }}
                    />
                    <span className="text-sm text-foreground">{stage.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {stage.count}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {fmtCurrency(stage.value)}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── Deal Sources Performance ── */}
      {funnel.dealsBySource.length > 0 && (
        <div className="animate-analytics-slide-up rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Performance by Source</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Deals</th>
                  <th className="pb-2 text-right font-medium">Pipeline Value</th>
                  <th className="pb-2 text-right font-medium">Avg Value</th>
                  <th className="pb-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {funnel.dealsBySource
                  .sort((a, b) => b.value - a.value)
                  .map((s, i) => {
                    const share = funnel.totalDeals > 0 ? (s.count / funnel.totalDeals) * 100 : 0;
                    return (
                      <tr key={i} className="border-b border-border/40 last:border-0">
                        <td className="py-2.5 font-medium text-foreground">{s.source}</td>
                        <td className="py-2.5 text-right tabular-nums">{s.count}</td>
                        <td className="py-2.5 text-right tabular-nums font-medium">{fmtCurrency(s.value)}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {s.count > 0 ? fmtCurrency(s.value / s.count) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-500"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {share.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Bottleneck Alert ── */
function BottleneckAlert({
  severity,
  title,
  description,
  action,
}: {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  action?: string;
}) {
  const config = {
    critical: {
      border: "border-red-500/20",
      bg: "bg-red-500/5",
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />,
      titleColor: "text-red-500",
      actionBg: "bg-red-500/10 text-red-500 hover:bg-red-500/20",
    },
    warning: {
      border: "border-yellow-500/20",
      bg: "bg-yellow-500/5",
      icon: <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />,
      titleColor: "text-yellow-500",
      actionBg: "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20",
    },
    info: {
      border: "border-blue-500/20",
      bg: "bg-blue-500/5",
      icon: <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />,
      titleColor: "text-blue-500",
      actionBg: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20",
    },
  }[severity];

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border ${config.border} ${config.bg} px-3 py-2.5`}>
      {config.icon}
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${config.titleColor}`}>{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        {action && (
          <div className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${config.actionBg}`}>
            <Zap className="h-3 w-3" />
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Empty State ── */
function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No sales funnel data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot to see pipeline analysis</p>
      </div>
    </div>
  );
}

"use client";

import { AlertTriangle, Clock, TrendingDown, ArrowRight, Activity } from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";

function severityConfig(severity: "critical" | "warning" | "info") {
  return {
    critical: {
      border: "border-red-500/20",
      bg: "bg-red-500/5",
      badge: "bg-red-500 text-white",
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />,
      titleColor: "text-red-500",
    },
    warning: {
      border: "border-yellow-500/20",
      bg: "bg-yellow-500/5",
      badge: "bg-yellow-500 text-white",
      icon: <TrendingDown className="mt-0.5 h-4 w-4 text-yellow-500" />,
      titleColor: "text-yellow-500",
    },
    info: {
      border: "border-blue-500/20",
      bg: "bg-blue-500/5",
      badge: "bg-blue-500 text-white",
      icon: <ArrowRight className="mt-0.5 h-4 w-4 text-blue-500" />,
      titleColor: "text-blue-500",
    },
  }[severity];
}

export function ProcessBottlenecksView({ data }: { data: AnalyticsDashboardData | null }) {
  const process = data?.processAnalytics;
  if (!process) return <EmptyState />;

  const criticalCount = process.bottlenecks.filter((b) => b.severity === "critical").length;
  const warningCount = process.bottlenecks.filter((b) => b.severity === "warning").length;
  const totalDealsAffected = process.bottlenecks.reduce((sum, b) => sum + b.dealCount, 0);
  const worstBottleneck = process.bottlenecks[0];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Bottlenecks"
          value={process.bottlenecks.length.toString()}
          subtitle={`${criticalCount} critical, ${warningCount} warning`}
          changeType={criticalCount > 0 ? "negative" : "positive"}
          icon={AlertTriangle}
        />
        <StatCard
          label="Deals Affected"
          value={totalDealsAffected.toLocaleString()}
          subtitle="across bottleneck stages"
          icon={Activity}
        />
        <StatCard
          label="Worst Stage"
          value={worstBottleneck?.stageLabel ?? "—"}
          subtitle={worstBottleneck ? `${worstBottleneck.avgDays.toFixed(1)}d avg` : undefined}
          icon={Clock}
        />
        <StatCard
          label="Avg Cycle Time"
          value={`${process.avgCycleTimeDays}d`}
          subtitle="across all stages"
          icon={TrendingDown}
        />
      </div>

      {/* Bottleneck Detail Cards */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Bottleneck Analysis</h3>
        {process.bottlenecks.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-sm text-emerald-500">No bottlenecks detected — pipeline flow looks healthy.</p>
          </div>
        ) : (
          process.bottlenecks.map((b) => {
            const config = severityConfig(b.severity);
            const velocityData = process.stageVelocity.find((v) => v.stageLabel === b.stageLabel);
            return (
              <div
                key={b.stageLabel}
                className={`rounded-xl border ${config.border} ${config.bg} p-5`}
              >
                <div className="flex items-start gap-3">
                  {config.icon}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm font-semibold ${config.titleColor}`}>{b.stageLabel}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${config.badge}`}>
                        {b.severity}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Days</p>
                        <p className="text-lg font-bold tabular-nums text-foreground">{b.avgDays.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deals</p>
                        <p className="text-lg font-bold tabular-nums text-foreground">{b.dealCount}</p>
                      </div>
                      {velocityData && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">P90 Days</p>
                          <p className="text-lg font-bold tabular-nums text-foreground">{velocityData.p90Days}</p>
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">{b.recommendation}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Stage Velocity Comparison */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Stage Velocity Comparison</h3>
        <p className="mb-4 text-xs text-muted-foreground">Average days per stage — bottleneck stages highlighted</p>
        <div className="space-y-2">
          {process.stageVelocity.map((v) => {
            const isBottleneck = process.bottlenecks.some((b) => b.stageLabel === v.stageLabel);
            const maxAvg = Math.max(...process.stageVelocity.map((sv) => sv.avgDays), 1);
            const widthPct = Math.max((v.avgDays / maxAvg) * 100, 8);
            return (
              <div key={v.stageId} className="flex items-center gap-3">
                <span className="w-36 text-right text-xs text-muted-foreground">{v.stageLabel}</span>
                <div className="flex-1">
                  <div className="relative h-7 overflow-hidden rounded-md">
                    <div
                      className={`flex h-full items-center rounded-md px-2 transition-all duration-500 ${
                        isBottleneck ? "" : ""
                      }`}
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: isBottleneck ? "#ef4444" : "#4379f0",
                        minWidth: "50px",
                      }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">
                        {v.avgDays.toFixed(1)}d
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-24 text-right">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    med {v.medianDays}d · p90 {v.p90Days}d
                  </span>
                </div>
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                  {v.dealCount}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leakage Points */}
      {process.leakagePoints.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Pipeline Leakage Near Bottlenecks</h3>
          <p className="mb-4 text-xs text-muted-foreground">Stages where deals exit the pipeline</p>
          <div className="space-y-3">
            {process.leakagePoints.map((lp) => (
              <div key={lp.stage} className="flex items-start justify-between rounded-lg bg-secondary/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{lp.stage}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {lp.topReasons.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-foreground">{lp.lostCount} deals</p>
                  <p className="text-xs text-muted-foreground">{lp.pctOfTotal}% of total</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No bottleneck data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot to analyze pipeline bottlenecks</p>
      </div>
    </div>
  );
}

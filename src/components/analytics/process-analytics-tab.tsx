"use client";

import {
  Activity, Gauge, Clock, AlertTriangle,
  TrendingDown, ArrowRight, CheckCircle,
  BarChart3, ArrowDownRight,
} from "lucide-react";
import type { AnalyticsDashboardData, ProcessBottleneck } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function healthColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#fbbf24";
  if (score >= 25) return "#f97316";
  return "#ef4444";
}

function severityConfig(severity: ProcessBottleneck["severity"]) {
  return {
    critical: {
      border: "border-red-500/20",
      bg: "bg-red-500/5",
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />,
      titleColor: "text-red-500",
      badge: "bg-red-500/10 text-red-500",
    },
    warning: {
      border: "border-yellow-500/20",
      bg: "bg-yellow-500/5",
      icon: <TrendingDown className="mt-0.5 h-4 w-4 text-yellow-500" />,
      titleColor: "text-yellow-500",
      badge: "bg-yellow-500/10 text-yellow-500",
    },
    info: {
      border: "border-blue-500/20",
      bg: "bg-blue-500/5",
      icon: <ArrowRight className="mt-0.5 h-4 w-4 text-blue-500" />,
      titleColor: "text-blue-500",
      badge: "bg-blue-500/10 text-blue-500",
    },
  }[severity];
}

export function ProcessAnalyticsTab({ data }: { data: AnalyticsDashboardData | null }) {
  const process = data?.processAnalytics;
  if (!process) return <EmptyState />;

  const totalDeals = process.stageVelocity.reduce((sum, v) => sum + v.dealCount, 0);
  const criticalCount = process.bottlenecks.filter((b) => b.severity === "critical").length;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Health Score"
          value={`${process.healthScore}/100`}
          changeType={process.healthScore >= 60 ? "positive" : "negative"}
          subtitle={process.healthScore >= 75 ? "Healthy" : process.healthScore >= 50 ? "Needs attention" : "Critical"}
          icon={Gauge}
        />
        <StatCard
          label="Avg Cycle Time"
          value={`${process.avgCycleTimeDays}d`}
          subtitle="per pipeline stage"
          icon={Clock}
        />
        <StatCard
          label="Bottlenecks"
          value={process.bottlenecks.length.toLocaleString()}
          subtitle={criticalCount > 0 ? `${criticalCount} critical` : "None critical"}
          changeType={criticalCount > 0 ? "negative" : "positive"}
          icon={AlertTriangle}
        />
        <StatCard
          label="Active Deals"
          value={totalDeals.toLocaleString()}
          subtitle="in pipeline"
          icon={Activity}
        />
      </div>

      {/* Health Score + Bottlenecks */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Health Score Breakdown */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Health Score Breakdown</h3>
          <div className="mb-4 flex justify-center">
            <RingStat
              value={process.healthScore}
              max={100}
              label="Health"
              color={healthColor(process.healthScore)}
              size={110}
            />
          </div>
          <div className="space-y-2">
            {process.healthFactors.map((factor) => (
              <div key={factor.factor} className="flex items-center gap-3">
                <span className="w-28 text-right text-xs text-muted-foreground">
                  {factor.factor}
                </span>
                <div className="flex-1">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${factor.score}%`,
                        backgroundColor: healthColor(factor.score),
                      }}
                    />
                  </div>
                </div>
                <span className="w-10 text-right text-xs font-medium tabular-nums">
                  {factor.score}
                </span>
                <span className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">
                  w{factor.weight}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            {process.healthFactors.map((factor) => (
              <p key={factor.factor} className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{factor.factor}:</span> {factor.detail}
              </p>
            ))}
          </div>
        </div>

        {/* Bottleneck Cards */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Pipeline Bottlenecks</h3>
          <div className="space-y-3">
            {process.bottlenecks.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 px-3 py-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-emerald-500">No significant bottlenecks detected!</span>
              </div>
            ) : (
              process.bottlenecks.map((bn) => {
                const cfg = severityConfig(bn.severity);
                return (
                  <div key={bn.stageLabel} className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
                    <div className="flex items-start gap-2">
                      {cfg.icon}
                      <div className="flex-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${cfg.titleColor}`}>{bn.stageLabel}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
                            {bn.severity}
                          </span>
                        </div>
                        <p className="mt-0.5 text-muted-foreground">
                          {bn.avgDays.toFixed(1)} avg days &middot; {bn.dealCount} deals
                        </p>
                        <p className="mt-1 text-foreground">{bn.recommendation}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Stage Velocity */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Stage Velocity</h3>
        <p className="mb-5 text-xs text-muted-foreground">Average days spent in each pipeline stage</p>
        <div className="space-y-2">
          {process.stageVelocity.map((stage) => {
            const maxDays = Math.max(...process.stageVelocity.map((v) => v.avgDays), 1);
            const widthPct = Math.max((stage.avgDays / maxDays) * 100, 8);
            const isBottleneck = process.bottlenecks.some((b) => b.stageLabel === stage.stageLabel);
            const barColor = isBottleneck ? "#ef4444" : "#4379f0";
            return (
              <div key={stage.stageId} className="flex items-center gap-3">
                <span className="w-40 text-right text-xs text-muted-foreground">
                  {stage.stageLabel}
                  {isBottleneck && <span className="ml-1 text-red-500">*</span>}
                </span>
                <div className="flex-1">
                  <div className="relative h-7 overflow-hidden rounded-md">
                    <div
                      className="flex h-full items-center rounded-md px-2 transition-all duration-500"
                      style={{ width: `${widthPct}%`, backgroundColor: barColor, minWidth: "50px" }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">
                        {stage.avgDays.toFixed(1)}d
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex w-28 items-center gap-2 text-right">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    med {stage.medianDays}d
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    p90 {stage.p90Days}d
                  </span>
                </div>
                <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">
                  {stage.dealCount}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Throughput + Leakage */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weekly Throughput */}
        {process.throughput.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Weekly Throughput</h3>
            <p className="mb-4 text-xs text-muted-foreground">Deals entering and exiting the pipeline</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Week</th>
                    <th className="pb-2 text-right font-medium">Entered</th>
                    <th className="pb-2 text-right font-medium">Exited</th>
                    <th className="pb-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {process.throughput.slice(-8).map((week) => (
                    <tr key={week.week} className="border-b border-border/50 last:border-0">
                      <td className="py-2 text-xs text-muted-foreground">{week.week}</td>
                      <td className="py-2 text-right tabular-nums text-emerald-500">+{week.entered}</td>
                      <td className="py-2 text-right tabular-nums text-red-500">-{week.exited}</td>
                      <td className="py-2 text-right">
                        <span className={`text-xs font-medium tabular-nums ${week.netChange >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {week.netChange >= 0 ? "+" : ""}{week.netChange}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Leakage Points */}
        {process.leakagePoints.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Leakage Analysis</h3>
            <p className="mb-4 text-xs text-muted-foreground">Where deals fall out of the pipeline</p>
            <div className="space-y-3">
              {process.leakagePoints.map((lp) => (
                <div key={lp.stage} className="rounded-lg bg-secondary/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-sm font-medium text-foreground">{lp.stage}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums text-foreground">
                        {lp.lostCount}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {fmt$(lp.lostValue)}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {lp.pctOfTotal}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {lp.topReasons.map((reason) => (
                      <span key={reason} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stage Conversion Rates */}
      {process.conversionByStage.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Stage-to-Stage Conversion</h3>
          <p className="mb-4 text-xs text-muted-foreground">Conversion rates between consecutive pipeline stages</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">From → To</th>
                  <th className="pb-2 text-right font-medium">Deals</th>
                  <th className="pb-2 text-right font-medium">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {process.conversionByStage.map((conv) => (
                  <tr key={`${conv.fromStage}-${conv.toStage}`} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">
                      <span className="text-foreground">{conv.fromStage}</span>
                      <ArrowRight className="mx-1.5 inline h-3 w-3 text-muted-foreground" />
                      <span className="text-foreground">{conv.toStage}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{conv.dealCount}</td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${conv.conversionRate}%`,
                              backgroundColor: conv.conversionRate >= 50 ? "#22c55e" : conv.conversionRate >= 25 ? "#fbbf24" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {conv.conversionRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No process analytics data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot to analyze pipeline velocity and health</p>
      </div>
    </div>
  );
}

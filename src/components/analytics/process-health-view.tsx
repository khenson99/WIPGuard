"use client";

import { Heart, TrendingUp, Shield, CheckCircle, AlertTriangle } from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";

function healthColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#fbbf24";
  return "#ef4444";
}

function healthLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Poor";
  return "Critical";
}

function factorColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function getRecommendation(factor: string, score: number): string | null {
  if (score >= 70) return null;
  const recs: Record<string, string> = {
    "Win Rate": "Improve qualification criteria and invest in sales enablement to boost close rates.",
    "Demo Attendance": "Implement SMS/email reminders 24hr before demos and offer easy rescheduling.",
    "Pipeline Flow": "Review bottleneck stages and set SLAs for deal progression at each stage.",
    "Cycle Time": "Automate follow-ups and streamline approval processes to reduce deal cycle time.",
  };
  return recs[factor] ?? `Improve ${factor.toLowerCase()} to boost overall pipeline health.`;
}

export function ProcessHealthView({ data }: { data: AnalyticsDashboardData | null }) {
  const process = data?.processAnalytics;
  if (!process) return <EmptyState />;

  const healthGrade = healthLabel(process.healthScore);
  const strongFactors = process.healthFactors.filter((f) => f.score >= 70);
  const weakFactors = process.healthFactors.filter((f) => f.score < 70).sort((a, b) => a.score - b.score);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Health Score"
          value={`${process.healthScore}/100`}
          subtitle={healthGrade}
          changeType={process.healthScore >= 60 ? "positive" : "negative"}
          icon={Heart}
        />
        <StatCard
          label="Strong Factors"
          value={strongFactors.length.toString()}
          subtitle={`of ${process.healthFactors.length} factors`}
          changeType="positive"
          icon={Shield}
        />
        <StatCard
          label="Weak Factors"
          value={weakFactors.length.toString()}
          subtitle="need attention"
          changeType={weakFactors.length > 0 ? "negative" : "positive"}
          icon={AlertTriangle}
        />
        <StatCard
          label="Avg Cycle"
          value={`${process.avgCycleTimeDays}d`}
          subtitle="per stage average"
          icon={TrendingUp}
        />
      </div>

      {/* Health Score Gauge + Factor Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Gauge */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Overall Pipeline Health</h3>
          <div className="flex items-center justify-center gap-6">
            <RingStat
              value={process.healthScore}
              max={100}
              label={healthGrade}
              color={healthColor(process.healthScore)}
              size={120}
            />
            <div className="space-y-2">
              {process.healthFactors.map((f) => (
                <div key={f.factor} className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: healthColor(f.score) }} />
                  <span className="text-xs text-muted-foreground">{f.factor}</span>
                  <span className="text-xs font-bold tabular-nums text-foreground">{f.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Factor Detail */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Health Factor Breakdown</h3>
          <div className="space-y-4">
            {process.healthFactors.map((f) => (
              <div key={f.factor}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{f.factor}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">weight: {f.weight}%</span>
                    <span
                      className="text-xs font-bold tabular-nums"
                      style={{ color: healthColor(f.score) }}
                    >
                      {f.score}/100
                    </span>
                  </div>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${factorColor(f.score)}`}
                    style={{ width: `${f.score}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Improvement Recommendations</h3>
        {weakFactors.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 px-3 py-2.5">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-emerald-500">All health factors are above threshold — great work!</span>
          </div>
        ) : (
          <div className="space-y-3">
            {weakFactors.map((f) => {
              const rec = getRecommendation(f.factor, f.score);
              if (!rec) return null;
              const isLow = f.score < 40;
              return (
                <div
                  key={f.factor}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                    isLow
                      ? "border-red-500/20 bg-red-500/5"
                      : "border-yellow-500/20 bg-yellow-500/5"
                  }`}
                >
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 ${isLow ? "text-red-500" : "text-yellow-500"}`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${isLow ? "text-red-500" : "text-yellow-500"}`}>
                        {f.factor}: {f.score}/100
                      </p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        isLow ? "bg-red-500/20 text-red-500" : "bg-yellow-500/20 text-yellow-500"
                      }`}>
                        {isLow ? "critical" : "needs work"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{rec}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground italic">{f.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Throughput Trend */}
      {process.throughput.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Pipeline Throughput Trend</h3>
          <p className="mb-4 text-xs text-muted-foreground">Weekly pipeline inflow/outflow balance</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Week</th>
                  <th className="pb-2 text-right font-medium">Entered</th>
                  <th className="pb-2 text-right font-medium">Exited</th>
                  <th className="pb-2 text-right font-medium">Net Change</th>
                  <th className="pb-2 text-right font-medium">Flow</th>
                </tr>
              </thead>
              <tbody>
                {process.throughput.slice(-8).map((w) => (
                  <tr key={w.week} className="border-b border-border/50 last:border-0">
                    <td className="py-2 text-xs text-muted-foreground">{w.week}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-500">+{w.entered}</td>
                    <td className="py-2 text-right tabular-nums text-red-500">-{w.exited}</td>
                    <td className="py-2 text-right">
                      <span className={`text-xs font-medium tabular-nums ${
                        w.netChange >= 0 ? "text-emerald-500" : "text-red-500"
                      }`}>
                        {w.netChange >= 0 ? "+" : ""}{w.netChange}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <div className="ml-auto flex h-3 w-20 items-center justify-center gap-0 overflow-hidden rounded-full bg-secondary">
                        {w.entered > 0 && (
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${(w.entered / Math.max(w.entered + w.exited, 1)) * 100}%` }}
                          />
                        )}
                        {w.exited > 0 && (
                          <div
                            className="h-full bg-red-500"
                            style={{ width: `${(w.exited / Math.max(w.entered + w.exited, 1)) * 100}%` }}
                          />
                        )}
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
        <Heart className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No pipeline health data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot to monitor pipeline health</p>
      </div>
    </div>
  );
}

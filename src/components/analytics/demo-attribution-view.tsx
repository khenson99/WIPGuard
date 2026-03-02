"use client";

import { TrendingUp, BarChart3, ArrowRight } from "lucide-react";
import type { AnalyticsDashboardData, DemoOutcome } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";
import { DemoVolumeChart } from "./demo-volume-chart";

const OUTCOME_COLORS: Record<DemoOutcome, string> = {
  completed: "#22c55e",
  "no-show": "#ef4444",
  rescheduled: "#fbbf24",
  pending: "#6b7280",
  unknown: "#94a3b8",
};

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function DemoAttributionView({ data }: { data: AnalyticsDashboardData | null }) {
  const demo = data?.demoAnalytics;
  if (!demo || demo.totalScheduled === 0) return <EmptyState />;

  // Source attribution: best source for conversion
  const bestSource = demo.bySource.reduce<typeof demo.bySource[0] | null>((best, src) => {
    if (!best) return src;
    return src.conversionRate > best.conversionRate ? src : best;
  }, null);

  const worstSource = demo.bySource.reduce<typeof demo.bySource[0] | null>((worst, src) => {
    if (!worst) return src;
    return src.conversionRate < worst.conversionRate && src.scheduled >= 3 ? src : worst;
  }, null);

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Top Source"
          value={bestSource?.source ?? "—"}
          subtitle={bestSource ? `${bestSource.conversionRate}% conversion` : undefined}
          icon={TrendingUp}
        />
        <StatCard
          label="Sources Tracked"
          value={demo.bySource.length.toString()}
          subtitle="unique demo sources"
          icon={BarChart3}
        />
        <StatCard
          label="Avg Conversion"
          value={`${demo.bySource.length > 0
            ? Math.round(demo.bySource.reduce((s, x) => s + x.conversionRate, 0) / demo.bySource.length * 10) / 10
            : 0}%`}
          subtitle="across all sources"
          icon={ArrowRight}
        />
        <StatCard
          label="Lowest Conversion"
          value={worstSource?.source ?? "—"}
          subtitle={worstSource ? `${worstSource.conversionRate}% (${worstSource.scheduled} demos)` : undefined}
          changeType="negative"
          icon={TrendingUp}
        />
      </div>

      {/* Demo Volume Chart */}
      <DemoVolumeChart weeklyTrend={demo.weeklyTrend} demos={demo.demos} />

      {/* Source → Outcome Conversion Matrix */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Source → Outcome Matrix</h3>
        <p className="mb-4 text-xs text-muted-foreground">How each source converts through demo outcomes</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 text-left font-medium">Source</th>
                <th className="pb-2 text-right font-medium">Scheduled</th>
                <th className="pb-2 text-right font-medium">Completed</th>
                <th className="pb-2 text-right font-medium">No-Shows</th>
                <th className="pb-2 text-right font-medium">Completion %</th>
                <th className="pb-2 text-right font-medium">No-Show %</th>
              </tr>
            </thead>
            <tbody>
              {demo.bySource.map((src) => {
                const noShowRate = src.scheduled > 0
                  ? Math.round((src.noShows / src.scheduled) * 1000) / 10
                  : 0;
                return (
                  <tr key={src.source} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 font-medium text-foreground">{src.source}</td>
                    <td className="py-2.5 text-right tabular-nums">{src.scheduled}</td>
                    <td className="py-2.5 text-right tabular-nums text-emerald-500">{src.completed}</td>
                    <td className="py-2.5 text-right tabular-nums text-red-500">{src.noShows}</td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${src.conversionRate}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium tabular-nums ${
                          src.conversionRate >= 60 ? "text-emerald-500" : "text-red-500"
                        }`}>
                          {src.conversionRate}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={`text-xs font-medium tabular-nums ${
                        noShowRate <= 15 ? "text-emerald-500" : "text-red-500"
                      }`}>
                        {noShowRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Journey Path Analysis */}
      {demo.journeyPaths && demo.journeyPaths.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            Customer Journey Path Analysis
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Full lifecycle from lead to churn, grouped by acquisition channel
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Channel</th>
                  <th className="pb-2 text-right font-medium">Leads</th>
                  <th className="pb-2 text-right font-medium">Demos</th>
                  <th className="pb-2 text-right font-medium">Completed</th>
                  <th className="pb-2 text-right font-medium">No-Show</th>
                  <th className="pb-2 text-right font-medium">Avg Days</th>
                  <th className="pb-2 text-right font-medium">Won</th>
                  <th className="pb-2 text-right font-medium">Lost</th>
                  <th className="pb-2 text-right font-medium">Onboard</th>
                  <th className="pb-2 text-right font-medium">Avg Value</th>
                  <th className="pb-2 text-right font-medium">Churned</th>
                  <th className="pb-2 text-right font-medium">Not Activated</th>
                </tr>
              </thead>
              <tbody>
                {demo.journeyPaths.map((row) => (
                  <tr key={row.source} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 font-medium text-foreground">{row.source}</td>
                    <td className="py-2.5 text-right tabular-nums">{row.totalLeads}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span>{row.demosBooked}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({row.demosBookedPct}%)
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-emerald-500">
                      <span>{row.demoCompleted}</span>
                      <span className="ml-1 text-[10px] text-emerald-500/60">
                        ({row.demoCompletedPct}%)
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-red-500">
                      <span>{row.demoNoShow}</span>
                      <span className="ml-1 text-[10px] text-red-500/60">
                        ({row.demoNoShowPct}%)
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={row.avgDaysToDecision != null && row.avgDaysToDecision > 14
                        ? "text-yellow-500" : "text-foreground"}>
                        {row.avgDaysToDecision != null ? `${row.avgDaysToDecision}d` : "—"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-emerald-500">
                      <span>{row.closedWon}</span>
                      <span className="ml-1 text-[10px] text-emerald-500/60">
                        ({row.closedWonPct}%)
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-red-500">{row.closedLost}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span>{row.onboarding}</span>
                      {row.onboarding > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({row.onboardingPct}%)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-foreground">
                      {row.avgContractValue != null ? fmt$(row.avgContractValue) : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={row.churned > 0 ? "text-red-500" : "text-muted-foreground"}>
                        {row.churned}
                      </span>
                      {row.churned > 0 && (
                        <span className="ml-1 text-[10px] text-red-500/60">
                          ({row.churnedPct}%)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={row.notActivated > 0 ? "text-orange-500" : "text-muted-foreground"}>
                        {row.notActivated}
                      </span>
                      {row.notActivated > 0 && (
                        <span className="ml-1 text-[10px] text-orange-500/60">
                          ({row.notActivatedPct}%)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Source Quality Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Source Conversion Rates */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Source Conversion Ranking</h3>
          <div className="space-y-2">
            {[...demo.bySource]
              .sort((a, b) => b.conversionRate - a.conversionRate)
              .slice(0, 5)
              .map((src) => {
                const maxRate = demo.bySource[0]
                  ? Math.max(...demo.bySource.map((s) => s.conversionRate), 1)
                  : 100;
                const widthPct = Math.max((src.conversionRate / maxRate) * 100, 8);
                return (
                  <div key={src.source} className="flex items-center gap-3">
                    <span className="w-28 text-right text-xs text-muted-foreground">{src.source}</span>
                    <div className="flex-1">
                      <div className="relative h-6 overflow-hidden rounded-md">
                        <div
                          className="flex h-full items-center rounded-md px-2 transition-all duration-500"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: src.conversionRate >= 60 ? "#22c55e" : src.conversionRate >= 40 ? "#fbbf24" : "#ef4444",
                            minWidth: "40px",
                          }}
                        >
                          <span className="text-[10px] font-bold text-white drop-shadow">
                            {src.conversionRate}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                      {src.scheduled}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Outcome Distribution per Source */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Outcome Distribution by Source</h3>
          <div className="space-y-4">
            {demo.bySource.slice(0, 6).map((src) => {
              const completedPct = src.scheduled > 0 ? (src.completed / src.scheduled) * 100 : 0;
              const noShowPct = src.scheduled > 0 ? (src.noShows / src.scheduled) * 100 : 0;
              const otherPct = 100 - completedPct - noShowPct;
              return (
                <div key={src.source}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{src.source}</span>
                    <span className="text-[10px] text-muted-foreground">{src.scheduled} demos</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full">
                    {completedPct > 0 && (
                      <div
                        className="h-full"
                        style={{ width: `${completedPct}%`, backgroundColor: OUTCOME_COLORS.completed }}
                        title={`Completed: ${src.completed}`}
                      />
                    )}
                    {noShowPct > 0 && (
                      <div
                        className="h-full"
                        style={{ width: `${noShowPct}%`, backgroundColor: OUTCOME_COLORS["no-show"] }}
                        title={`No-Show: ${src.noShows}`}
                      />
                    )}
                    {otherPct > 0 && (
                      <div
                        className="h-full"
                        style={{ width: `${otherPct}%`, backgroundColor: OUTCOME_COLORS.pending }}
                        title={`Other: ${src.scheduled - src.completed - src.noShows}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: OUTCOME_COLORS.completed }} />
              Completed
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: OUTCOME_COLORS["no-show"] }} />
              No-Show
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: OUTCOME_COLORS.pending }} />
              Other
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <TrendingUp className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No demo attribution data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot to track demo sources</p>
      </div>
    </div>
  );
}

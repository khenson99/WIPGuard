"use client";

import { useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, ArrowRight, Percent,
  DollarSign, Clock, BarChart3,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import {
  buildPathConversions,
  buildSourceConversions,
  buildStageConversions,
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  CLOSE_STAGES,
  pct,
} from "@/lib/analytics/customer-journey-conversion";
import {
  bucketJourneysByMonth,
  computeTrends,
  computeTrendIndicator,
  type TrendResult,
  type TrendIndicator,
} from "@/lib/journey-bucketing";
import { TrendsToggle } from "./trends-toggle";
import { TrendBadge } from "./trend-badge";
import { StatCard } from "./stat-card";

// ── Helpers ──

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtTrendChange(
  indicator: TrendIndicator,
  format: "percent" | "absolute",
): string {
  if (indicator.direction === "insufficient") return "—";
  const sign = indicator.absoluteChange > 0 ? "+" : "";
  if (format === "percent" && indicator.percentChange !== null) {
    return `${sign}${indicator.percentChange.toFixed(1)}% vs ${indicator.previousPeriod}`;
  }
  return `${sign}${indicator.absoluteChange.toFixed(0)} vs ${indicator.previousPeriod}`;
}

// ── Component ──

export function CustomerJourneyConversionTab({ data }: { data: AnalyticsDashboardData | null }) {
  const journey = data?.customerJourney;
  const [viewMode, setViewMode] = useState<"snapshot" | "trends">("snapshot");

  const stageConversions = useMemo(
    () => (journey ? buildStageConversions(journey.journeys) : []),
    [journey],
  );

  const sourceConversions = useMemo(
    () => (journey ? buildSourceConversions(journey.journeys) : []),
    [journey],
  );

  const pathConversions = useMemo(
    () => (journey ? buildPathConversions(journey) : []),
    [journey],
  );

  const trendResult = useMemo<TrendResult | null>(() => {
    if (!journey?.journeys.length) return null;
    const records = journey.journeys.map((j) => ({
      id: j.dealId,
      createdAt: j.firstTouch,
      stage: j.currentStage,
      isConverted: CLOSE_STAGES.has(j.currentStage),
    }));
    const buckets = bucketJourneysByMonth(records);
    return computeTrends(buckets);
  }, [journey]);

  // Per-stage transition trends: compare the two most recent complete months by cohort
  const stageTransitionTrends = useMemo<Map<string, TrendIndicator>>(() => {
    if (!journey?.journeys.length || !trendResult?.hasEnoughData) return new Map();
    const now = new Date();
    const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const completeBuckets = trendResult.buckets.filter((b) => b.key < currentMonthKey);
    if (completeBuckets.length < 2) return new Map();
    const curBucket = completeBuckets[completeBuckets.length - 1];
    const prevBucket = completeBuckets[completeBuckets.length - 2];

    const curJourneys = journey.journeys.filter((j) => {
      const d = new Date(j.firstTouch);
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return k === curBucket.key;
    });
    const prevJourneys = journey.journeys.filter((j) => {
      const d = new Date(j.firstTouch);
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return k === prevBucket.key;
    });

    const curConversions = buildStageConversions(curJourneys);
    const prevConversions = buildStageConversions(prevJourneys);

    const map = new Map<string, TrendIndicator>();
    for (const cur of curConversions) {
      const key = `${cur.fromStage}→${cur.toStage}`;
      const prev = prevConversions.find((p) => p.fromStage === cur.fromStage && p.toStage === cur.toStage);
      map.set(
        key,
        computeTrendIndicator(
          cur.conversionRate,
          prev?.conversionRate ?? 0,
          curBucket.label,
          prevBucket.label,
        ),
      );
    }
    return map;
  }, [journey, trendResult]);

  if (!journey || journey.journeys.length === 0) return <EmptyState />;

  const totalJourneys = journey.journeys.length;
  const closedJourneys = journey.journeys.filter((j) => CLOSE_STAGES.has(j.currentStage));
  const overallConversionRate = pct(closedJourneys.length, totalJourneys);
  const totalRevenue = closedJourneys.reduce((sum, j) => sum + j.value, 0);
  const avgDealValue = closedJourneys.length > 0 ? Math.round(totalRevenue / closedJourneys.length) : 0;

  return (
    <div className="space-y-6">
      {/* Header with Snapshot/Trends toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Conversion Overview</h3>
          <p className="text-xs text-muted-foreground">
            {viewMode === "trends"
              ? "Month-over-month comparison of the two most recent complete months"
              : "Current snapshot of conversion metrics"}
          </p>
        </div>
        <TrendsToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Insufficient data notice */}
      {viewMode === "trends" && trendResult && !trendResult.hasEnoughData && (
        <p className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
          Not enough historical data for trend comparison. At least two full calendar months of
          journey data are needed.
        </p>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Overall Conversion"
          value={`${overallConversionRate}%`}
          subtitle={`${closedJourneys.length} of ${totalJourneys} journeys`}
          change={
            viewMode === "trends" && trendResult?.hasEnoughData
              ? fmtTrendChange(trendResult.kpiTrends.overallConversion, "percent")
              : undefined
          }
          changeType={
            viewMode === "trends" && trendResult?.hasEnoughData
              ? trendResult.kpiTrends.overallConversion.direction === "up"
                ? "positive"
                : trendResult.kpiTrends.overallConversion.direction === "down"
                  ? "negative"
                  : "neutral"
              : undefined
          }
          icon={Percent}
        />
        <StatCard
          label="Converted Revenue"
          value={fmt$(totalRevenue)}
          subtitle={`${closedJourneys.length} closed deals`}
          icon={DollarSign}
        />
        <StatCard
          label="Avg Deal Value"
          value={avgDealValue > 0 ? fmt$(avgDealValue) : "—"}
          subtitle="for converted journeys"
          icon={TrendingUp}
        />
        <StatCard
          label="Total Journeys"
          value={totalJourneys.toLocaleString()}
          subtitle="across all journeys"
          change={
            viewMode === "trends" && trendResult?.hasEnoughData
              ? fmtTrendChange(trendResult.kpiTrends.totalJourneys, "absolute")
              : undefined
          }
          changeType={
            viewMode === "trends" && trendResult?.hasEnoughData
              ? trendResult.kpiTrends.totalJourneys.direction === "up"
                ? "positive"
                : trendResult.kpiTrends.totalJourneys.direction === "down"
                  ? "negative"
                  : "neutral"
              : undefined
          }
          icon={Clock}
        />
      </div>

      {/* Stage-to-Stage Conversion */}
      {stageConversions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Stage-to-Stage Conversion</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            How deals progress between pipeline stages
          </p>
          <div className="space-y-3">
            {stageConversions.map((row) => {
              const barColor = row.conversionRate >= 60
                ? "#22c55e"
                : row.conversionRate >= 30
                  ? "#f59e0b"
                  : "#ef4444";
              const stageKey = `${row.fromStage}→${row.toStage}`;
              const stageTrend = viewMode === "trends" ? stageTransitionTrends.get(stageKey) : undefined;
              return (
                <div key={`${row.fromStage}-${row.toStage}`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{row.fromStage}</span>
                      <ArrowRight className="h-2.5 w-2.5" />
                      <span className="font-medium text-foreground">{row.toStage}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-muted-foreground">
                        {row.fromCount} → {row.toCount}
                      </span>
                      <span className="w-14 text-right font-semibold tabular-nums" style={{ color: barColor }}>
                        {row.conversionRate}%
                      </span>
                      {stageTrend && (
                        <TrendBadge trend={stageTrend} format="absolute" />
                      )}
                    </div>
                  </div>
                  <div className="relative h-4 overflow-hidden rounded-md bg-secondary/40">
                    <div
                      className="flex h-full items-center rounded-md px-2 transition-all duration-500"
                      style={{
                        width: `${Math.max(row.conversionRate, 4)}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  {row.revenueAtRisk > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {fmt$(row.revenueAtRisk)} revenue at risk · {row.avgDaysInStage}d avg in stage
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Source Conversion + Path Conversion side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Source Conversion */}
        {sourceConversions.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Conversion by First-Touch Source</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Which acquisition channels produce the most conversions
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Source</th>
                    <th className="pb-2 text-right font-medium">Journeys</th>
                    <th className="pb-2 text-right font-medium">Conv.</th>
                    <th className="pb-2 text-right font-medium">Rate</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceConversions.map((row) => (
                    <tr key={row.source} className="border-b border-border/50 last:border-0">
                      <td className="py-2 font-medium text-foreground">{row.source}</td>
                      <td className="py-2 text-right tabular-nums">{row.totalJourneys}</td>
                      <td className="py-2 text-right tabular-nums">{row.converted}</td>
                      <td className="py-2 text-right tabular-nums">
                        <span
                          className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          style={{
                            backgroundColor: row.conversionRate >= 30 ? "#22c55e" : row.conversionRate >= 15 ? "#f59e0b" : "#ef4444",
                          }}
                        >
                          {row.conversionRate}%
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {row.totalRevenue > 0 ? fmt$(row.totalRevenue) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Path Conversion */}
        {pathConversions.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Highest-Converting Paths</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Multi-touch sequences ranked by conversion rate
            </p>
            <div className="space-y-3">
              {pathConversions.map((row, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {row.channels.map((ch, j) => (
                      <span key={j} className="flex items-center gap-1">
                        {j > 0 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />}
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
                          style={{ backgroundColor: CHANNEL_COLORS[ch] || "#6b7280" }}
                        >
                          {CHANNEL_LABELS[ch]}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {row.convertedCount}/{row.journeyCount} converted
                      </span>
                      <span className="font-semibold tabular-nums" style={{
                        color: row.conversionRate >= 30 ? "#22c55e" : row.conversionRate >= 15 ? "#f59e0b" : "#ef4444",
                      }}>
                        {row.conversionRate}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.avgValue > 0 && (
                        <span className="tabular-nums">{fmt$(row.avgValue)} avg</span>
                      )}
                      <span className="tabular-nums">{row.avgDays}d</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drop-off Heatmap */}
      {stageConversions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Drop-off Summary</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Where deals fall out of the pipeline and potential revenue impact
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stageConversions
              .filter((row) => row.conversionRate < 100)
              .sort((a, b) => a.conversionRate - b.conversionRate)
              .slice(0, 6)
              .map((row) => {
                const dropped = row.fromCount - row.toCount;
                const dropPct = pct(dropped, row.fromCount);
                const severity = dropPct >= 50 ? "critical" : dropPct >= 25 ? "warning" : "info";
                return (
                  <div
                    key={`drop-${row.fromStage}-${row.toStage}`}
                    className={`rounded-lg border px-4 py-3 ${
                      severity === "critical"
                        ? "border-red-500/20 bg-red-500/5"
                        : severity === "warning"
                          ? "border-yellow-500/20 bg-yellow-500/5"
                          : "border-blue-500/20 bg-blue-500/5"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{row.fromStage}</span>
                      <ArrowRight className="h-2.5 w-2.5" />
                      <span className="font-medium text-foreground">{row.toStage}</span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-lg font-bold tabular-nums text-foreground">
                        {dropped}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        dropped ({dropPct}%)
                      </span>
                    </div>
                    {row.revenueAtRisk > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <TrendingDown className="h-3 w-3" />
                        {fmt$(row.revenueAtRisk)} at risk
                      </p>
                    )}
                  </div>
                );
              })}
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
        <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No conversion data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot and other integrations to analyze conversions</p>
      </div>
    </div>
  );
}

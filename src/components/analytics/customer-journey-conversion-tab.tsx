"use client";

import { useMemo } from "react";
import {
  TrendingUp, TrendingDown, ArrowRight, Percent,
  DollarSign, Clock, BarChart3,
} from "lucide-react";
import type {
  AnalyticsDashboardData,
  CustomerJourneyData,
  CustomerJourneyRecord,
  TouchpointChannel,
} from "@/lib/analytics/types";
import { StatCard } from "./stat-card";

// ── Helpers ──

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

const CHANNEL_LABELS: Record<TouchpointChannel, string> = {
  hubspot: "HubSpot",
  stripe: "Stripe",
  "google-workspace": "Google Workspace",
  slack: "Slack",
  webflow: "Webflow",
  coda: "Coda",
  "google-analytics": "Google Analytics",
  "google-ads": "Google Ads",
  "meta-ads": "Meta Ads",
  "reddit-ads": "Reddit Ads",
  pylon: "Pylon",
  mercury: "Mercury",
};

const CHANNEL_COLORS: Record<TouchpointChannel, string> = {
  hubspot: "#ff7a59",
  stripe: "#635bff",
  "google-workspace": "#4285f4",
  slack: "#e01e5a",
  webflow: "#4353ff",
  coda: "#f46a54",
  "google-analytics": "#e37400",
  "google-ads": "#4285f4",
  "meta-ads": "#0081fb",
  "reddit-ads": "#ff4500",
  pylon: "#6366f1",
  mercury: "#1c1c1e",
};

// ── Derived analytics ──

interface StageConversionRow {
  fromStage: string;
  toStage: string;
  fromCount: number;
  toCount: number;
  conversionRate: number;
  avgDaysInStage: number;
  revenueAtRisk: number;
}

interface SourceConversionRow {
  source: string;
  totalJourneys: number;
  converted: number;
  conversionRate: number;
  totalRevenue: number;
  avgDaysToClose: number;
}

interface PathConversionRow {
  path: string;
  channels: TouchpointChannel[];
  journeyCount: number;
  convertedCount: number;
  conversionRate: number;
  avgValue: number;
  avgDays: number;
}

function buildStageConversions(journeys: CustomerJourneyRecord[]): StageConversionRow[] {
  const stageOrder = new Map<string, number>();
  const stageCounts = new Map<string, { count: number; totalDays: number; totalValue: number }>();

  for (const j of journeys) {
    const stage = j.currentStage;
    if (!stageOrder.has(stage)) stageOrder.set(stage, stageOrder.size);
    const entry = stageCounts.get(stage) ?? { count: 0, totalDays: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalDays += j.daysInPipeline;
    entry.totalValue += j.value;
    stageCounts.set(stage, entry);
  }

  const stages = Array.from(stageOrder.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([s]) => s);

  const rows: StageConversionRow[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const from = stageCounts.get(stages[i])!;
    const to = stageCounts.get(stages[i + 1])!;
    rows.push({
      fromStage: stages[i],
      toStage: stages[i + 1],
      fromCount: from.count,
      toCount: to.count,
      conversionRate: pct(to.count, from.count),
      avgDaysInStage: from.count > 0 ? Math.round(from.totalDays / from.count) : 0,
      revenueAtRisk: Math.max(0, from.totalValue - to.totalValue),
    });
  }
  return rows;
}

function buildSourceConversions(journeys: CustomerJourneyRecord[]): SourceConversionRow[] {
  const CLOSE_STAGES = new Set(["Closed Won", "Subscription", "Active"]);
  const byFirstChannel = new Map<TouchpointChannel, { total: number; converted: number; revenue: number; totalDays: number }>();

  for (const j of journeys) {
    const firstChannel = j.touchpoints[0]?.channel;
    if (!firstChannel) continue;
    const entry = byFirstChannel.get(firstChannel) ?? { total: 0, converted: 0, revenue: 0, totalDays: 0 };
    entry.total += 1;
    entry.totalDays += j.daysInPipeline;
    if (CLOSE_STAGES.has(j.currentStage)) {
      entry.converted += 1;
      entry.revenue += j.value;
    }
    byFirstChannel.set(firstChannel, entry);
  }

  return Array.from(byFirstChannel.entries())
    .map(([channel, stats]) => ({
      source: CHANNEL_LABELS[channel] ?? channel,
      totalJourneys: stats.total,
      converted: stats.converted,
      conversionRate: pct(stats.converted, stats.total),
      totalRevenue: stats.revenue,
      avgDaysToClose: stats.total > 0 ? Math.round(stats.totalDays / stats.total) : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function buildPathConversions(journey: CustomerJourneyData): PathConversionRow[] {
  const CLOSE_STAGES = new Set(["Closed Won", "Subscription", "Active"]);

  const pathMap = new Map<string, {
    channels: TouchpointChannel[];
    count: number;
    converted: number;
    totalValue: number;
    totalDays: number;
  }>();

  for (const j of journey.journeys) {
    const channels = [...new Set(j.touchpoints.map((tp) => tp.channel))];
    if (channels.length === 0) continue;
    const key = channels.join(" → ");
    const entry = pathMap.get(key) ?? { channels, count: 0, converted: 0, totalValue: 0, totalDays: 0 };
    entry.count += 1;
    entry.totalDays += j.daysInPipeline;
    if (CLOSE_STAGES.has(j.currentStage)) {
      entry.converted += 1;
      entry.totalValue += j.value;
    }
    pathMap.set(key, entry);
  }

  return Array.from(pathMap.entries())
    .map(([path, stats]) => ({
      path,
      channels: stats.channels,
      journeyCount: stats.count,
      convertedCount: stats.converted,
      conversionRate: pct(stats.converted, stats.count),
      avgValue: stats.converted > 0 ? Math.round(stats.totalValue / stats.converted) : 0,
      avgDays: stats.count > 0 ? Math.round(stats.totalDays / stats.count) : 0,
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate || b.journeyCount - a.journeyCount)
    .slice(0, 10);
}

// ── Component ──

export function CustomerJourneyConversionTab({ data }: { data: AnalyticsDashboardData | null }) {
  const journey = data?.customerJourney;

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

  if (!journey || journey.journeys.length === 0) return <EmptyState />;

  const CLOSE_STAGES = new Set(["Closed Won", "Subscription", "Active"]);
  const totalJourneys = journey.journeys.length;
  const closedJourneys = journey.journeys.filter((j) => CLOSE_STAGES.has(j.currentStage));
  const overallConversionRate = pct(closedJourneys.length, totalJourneys);
  const totalRevenue = closedJourneys.reduce((sum, j) => sum + j.value, 0);
  const avgDealValue = closedJourneys.length > 0 ? Math.round(totalRevenue / closedJourneys.length) : 0;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Overall Conversion"
          value={`${overallConversionRate}%`}
          subtitle={`${closedJourneys.length} of ${totalJourneys} journeys`}
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
          label="Median Days to Close"
          value={`${journey.medianDaysToClose}`}
          subtitle="across all journeys"
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

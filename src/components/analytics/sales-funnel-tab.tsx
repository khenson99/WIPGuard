"use client";

import { useState, useMemo } from "react";
import {
  Target, AlertTriangle, TrendingDown, CheckCircle,
  Clock, ArrowRight, Zap,
} from "lucide-react";
import type { AnalyticsDashboardData, DealStage } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";
import { RepScoreboardCard } from "./rep-scoreboard-card";
import { SalesFunnelFilters } from "./sales-funnel-filters";
import {
  type DateRangePreset,
  type FunnelDeal,
  extractReps,
  filterDeals,
  getDateRangeFromPreset,
  recomputeFunnelMetrics,
} from "@/lib/sales-funnel-filter-utils";

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

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

type HubspotDeal = NonNullable<NonNullable<AnalyticsDashboardData["hubspot"]>["deals"]>[number];

/** Convert a raw HubSpot deal to the FunnelDeal shape for filtering/recomputation. */
function toFunnelDeal(d: HubspotDeal): FunnelDeal {
  return {
    dealId: d.dealId,
    dealName: d.dealName,
    stageId: d.stageId,
    stageLabel: d.stageLabel,
    amount: d.amount,
    source: d.source,
    ownerId: d.ownerId,
    repName: d.repName,
    createdAt: d.createdAt,
    closedAt: d.closedAt,
    stripeCustomerId: d.stripeCustomerId,
  };
}

export function SalesFunnelTab({ data }: { data: AnalyticsDashboardData | null }) {
  if (!data?.hubspot) return <EmptyState />;
  return <SalesFunnelTabInner data={data as AnalyticsDashboardData & { hubspot: NonNullable<AnalyticsDashboardData["hubspot"]> }} />;
}

function SalesFunnelTabInner({
  data,
}: {
  data: AnalyticsDashboardData & { hubspot: NonNullable<AnalyticsDashboardData["hubspot"]> };
}) {
  const { funnel } = data.hubspot;

  // --- Filter state ---
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("all");
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);

  // --- Normalize all raw deals once ---
  const allRawDeals = useMemo<HubspotDeal[]>(
    () => data.hubspot.deals ?? [],
    [data.hubspot.deals]
  );

  const allFunnelDeals = useMemo<FunnelDeal[]>(
    () => allRawDeals.map(toFunnelDeal),
    [allRawDeals]
  );

  // --- Extract reps from full deal set (never filtered) ---
  const reps = useMemo(() => extractReps(allFunnelDeals), [allFunnelDeals]);

  // --- Apply filters ---
  const filteredFunnelDeals = useMemo(() => {
    const range = getDateRangeFromPreset(dateRangePreset);
    return filterDeals(allFunnelDeals, range, selectedRepId);
  }, [allFunnelDeals, dateRangePreset, selectedRepId]);

  // Keep track of filtered raw deals (same indices as filteredFunnelDeals) for RepScoreboardCard
  const filteredRawDeals = useMemo<HubspotDeal[]>(() => {
    const filteredIds = new Set(filteredFunnelDeals.map((d) => d.dealId));
    return allRawDeals.filter((d) => filteredIds.has(d.dealId));
  }, [allRawDeals, filteredFunnelDeals]);

  // --- Decide which funnel metrics to use ---
  // Default state: no filters → use server-computed funnel (more accurate).
  // With any filter: recompute from filtered deals.
  const isFiltered = dateRangePreset !== "all" || selectedRepId !== null;

  const recomputedFunnel = useMemo(
    () => (isFiltered ? recomputeFunnelMetrics(filteredFunnelDeals, FUNNEL_ORDER) : null),
    [isFiltered, filteredFunnelDeals]
  );

  const resolvedFunnel = recomputedFunnel ?? funnel;

  // Build ordered funnel stages
  const orderedStages = useMemo(() => {
    return FUNNEL_ORDER
      .map((label) => resolvedFunnel.stages.find((s) => s.label === label))
      .filter(Boolean) as DealStage[];
  }, [resolvedFunnel.stages]);

  // Terminal stages
  const terminalStages = useMemo(() => {
    return resolvedFunnel.stages.filter(
      (s) =>
        ["Closed Won", "Closed Lost", "Unlikely", "Churn", "Ping Later", "On Hold"].includes(
          s.label
        )
    );
  }, [resolvedFunnel.stages]);

  const maxStageCount = Math.max(...orderedStages.map((s) => s.count), 1);

  // Rep scoreboard: filtered raw deals + filtered dealsByRep
  const scoreboardDeals = isFiltered ? filteredRawDeals : allRawDeals;
  const scoreboardRows = isFiltered
    ? (recomputedFunnel?.dealsByRep ?? [])
    : (funnel.dealsByRep ?? []);

  return (
    <div className="space-y-6">
      {/* Global filters */}
      <SalesFunnelFilters
        reps={reps}
        dateRange={dateRangePreset}
        selectedRepId={selectedRepId}
        filteredCount={filteredFunnelDeals.length}
        totalCount={allFunnelDeals.length}
        onDateRangeChange={setDateRangePreset}
        onRepChange={setSelectedRepId}
      />

      {/* Top KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Total Deals"
          value={resolvedFunnel.totalDeals.toLocaleString()}
          icon={Target}
        />
        <StatCard
          label="Win Rate"
          value={`${resolvedFunnel.winRate.toFixed(1)}%`}
          subtitle={`${resolvedFunnel.closedWon} won / ${resolvedFunnel.closedWon + resolvedFunnel.closedLost} decided`}
          changeType={resolvedFunnel.winRate > 50 ? "positive" : "negative"}
          icon={CheckCircle}
        />
        <StatCard
          label="Effective Win Rate"
          value={`${resolvedFunnel.effectiveWinRate.toFixed(1)}%`}
          subtitle="Won / (Won + Lost + Unlikely + Churn)"
          icon={Zap}
        />
        <StatCard
          label="No-Show Rate"
          value={`${resolvedFunnel.noShowRate.toFixed(1)}%`}
          changeType={resolvedFunnel.noShowRate > 15 ? "negative" : "positive"}
          subtitle={`${resolvedFunnel.noShows} no-shows`}
          icon={Clock}
        />
        <StatCard
          label="Avg Deal Size"
          value={fmt$(resolvedFunnel.avgDealSize)}
          icon={Target}
        />
      </div>

      {/* Funnel Visualization */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Sales Pipeline Funnel</h3>
        <p className="mb-5 text-xs text-muted-foreground">
          Active pipeline stages — ordered by sales process flow
        </p>
        <div className="space-y-2">
          {orderedStages.map((stage) => {
            const widthPct = Math.max((stage.count / maxStageCount) * 100, 8);
            return (
              <div key={stage.stageId} className="flex items-center gap-3">
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
                  {fmt$(stage.value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <RepScoreboardCard
        rows={scoreboardRows}
        deals={scoreboardDeals}
        stripeChurnEvents={data.stripe?.subscriptions?.recentChurnEvents ?? []}
      />

      {/* Bottleneck Analysis + Terminal Stages */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bottleneck Alerts */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Bottleneck Analysis</h3>
          <div className="space-y-3">
            {resolvedFunnel.noShowRate > 15 && (
              <BottleneckAlert
                severity="critical"
                title={`${resolvedFunnel.noShowRate.toFixed(0)}% No-Show Rate`}
                description={`${resolvedFunnel.noShows} prospects scheduled demos but didn't show. Implement SMS reminders + shorter booking windows.`}
              />
            )}
            {resolvedFunnel.unlikely > 20 && (
              <BottleneckAlert
                severity="warning"
                title={`${resolvedFunnel.unlikely} Deals Marked "Unlikely"`}
                description="Large number of deals stalled in unlikely. Review qualification criteria and consider archiving stale deals."
              />
            )}
            {resolvedFunnel.churn > 10 && (
              <BottleneckAlert
                severity="warning"
                title={`${resolvedFunnel.churn} Churned Customers`}
                description="Implement 30/60/90 day check-in cadence and build proactive retention workflows."
              />
            )}
            {resolvedFunnel.demoFollowUp > resolvedFunnel.closedWon && (
              <BottleneckAlert
                severity="info"
                title="Follow-Up > Closed Won"
                description={`${resolvedFunnel.demoFollowUp} deals in follow-up vs ${resolvedFunnel.closedWon} won. Speed up post-demo proposal delivery.`}
              />
            )}
            {resolvedFunnel.noShowRate <= 15 &&
              resolvedFunnel.unlikely <= 20 &&
              resolvedFunnel.churn <= 10 && (
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
            <RingStat
              value={resolvedFunnel.winRate}
              max={100}
              label="Win Rate"
              color="#22c55e"
              size={90}
            />
            <RingStat
              value={100 - resolvedFunnel.winRate}
              max={100}
              label="Loss Rate"
              color="#ef4444"
              size={90}
            />
          </div>
          <div className="space-y-2">
            {[...terminalStages]
              .sort((a, b) => b.count - a.count)
              .map((stage) => (
                <div
                  key={stage.stageId}
                  className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2"
                >
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
                      {fmt$(stage.value)}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Deal Sources Performance */}
      {resolvedFunnel.dealsBySource.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Performance by Source</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Deals</th>
                  <th className="pb-2 text-right font-medium">Pipeline Value</th>
                  <th className="pb-2 text-right font-medium">Avg Value</th>
                  <th className="pb-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {[...resolvedFunnel.dealsBySource]
                  .sort((a, b) => b.value - a.value)
                  .map((s, i) => {
                    const share =
                      resolvedFunnel.totalDeals > 0
                        ? (s.count / resolvedFunnel.totalDeals) * 100
                        : 0;
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 font-medium text-foreground">{s.source}</td>
                        <td className="py-2.5 text-right tabular-nums">{s.count}</td>
                        <td className="py-2.5 text-right tabular-nums font-medium">
                          {fmt$(s.value)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {s.count > 0 ? fmt$(s.value / s.count) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary"
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

function BottleneckAlert({
  severity,
  title,
  description,
}: {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
}) {
  const config = {
    critical: {
      border: "border-red-500/20",
      bg: "bg-red-500/5",
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />,
      titleColor: "text-red-500",
    },
    warning: {
      border: "border-yellow-500/20",
      bg: "bg-yellow-500/5",
      icon: <TrendingDown className="mt-0.5 h-4 w-4 text-yellow-500" />,
      titleColor: "text-yellow-500",
    },
    info: {
      border: "border-blue-500/20",
      bg: "bg-blue-500/5",
      icon: <ArrowRight className="mt-0.5 h-4 w-4 text-blue-500" />,
      titleColor: "text-blue-500",
    },
  }[severity];

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border ${config.border} ${config.bg} px-3 py-2.5`}
    >
      {config.icon}
      <div className="text-xs">
        <p className={`font-semibold ${config.titleColor}`}>{title}</p>
        <p className="mt-0.5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

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

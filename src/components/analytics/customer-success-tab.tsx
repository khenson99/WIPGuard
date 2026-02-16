"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { DashboardSectionCard } from "./dashboard-section-card";
import { AreaTrend, CHART_PALETTE } from "@/components/charts";
import { MessageCircle, AlertTriangle, Activity, LayoutGrid } from "lucide-react";

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
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
  const trend = buildCombinedTrend(data);

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
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Open Conversations"
          value={(pylon?.openConversations ?? 0).toString()}
          icon={MessageCircle}
        />
        <StatCard
          label="Urgent Count"
          value={(pylon?.urgentConversations ?? 0).toString()}
          changeType={(pylon?.urgentConversations ?? 0) > 5 ? "negative" : "positive"}
          icon={AlertTriangle}
        />
        <StatCard
          label="Throughput Rate"
          value={formatPct(product?.throughputRate)}
          icon={Activity}
        />
        <StatCard
          label="Coda Cards"
          value={(coda?.totalCards ?? 0).toString()}
          icon={LayoutGrid}
        />
      </div>

      {/* Hero: Customer Ops Trend */}
      <DashboardSectionCard
        title="Customer Ops Trend"
        subtitle="Combined workflow volume (7 days)"
      >
        {trend.length === 0 ? (
          <p className="text-xs text-muted-foreground">No workflow trend available in this range.</p>
        ) : (
          <AreaTrend
            data={trend}
            xKey="date"
            yKeys={["total"]}
            height={240}
            xFormatter={(v) => v.slice(5)}
          />
        )}
      </DashboardSectionCard>

      {/* Two-column grid: Risks + Actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardSectionCard title="Top Risks">
          <div className="space-y-2">
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
        </DashboardSectionCard>

        <DashboardSectionCard title="Recommended Actions">
          <div className="space-y-2">
            {actions.map((action) => (
              <div key={action.title} className="rounded-md border border-border/60 bg-background px-3 py-2">
                <p className="text-xs font-medium text-foreground">{action.title}</p>
                <p className="text-[11px] text-muted-foreground">{action.detail}</p>
                <p className="mt-0.5 text-[11px] text-foreground">{action.impact}</p>
              </div>
            ))}
          </div>
        </DashboardSectionCard>
      </div>
    </div>
  );
}

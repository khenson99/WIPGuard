"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import {
  SectionCard,
  DataTable,
  InsightCard,
  fmt$,
  fmtN,
  fmtPct,
  type DataTableColumn,
} from "@/components/analytics/dashboard-primitives";
import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { AreaTrend } from "@/components/charts/area-trend";
import { StackedBarChart } from "@/components/charts/stacked-bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { CHART_PALETTE } from "@/components/charts/chart-theme";
import { DEAL_STAGE_LABELS, DEAL_SOURCE_LABELS, type DealStage, type DealSource } from "@/types";

interface PipelineStage {
  stage: DealStage;
  count: number;
  totalAmount: number;
}

interface VelocityTrend {
  month: string;
  avgDays: number;
}

interface MeetingsByMonth {
  month: string;
  count: number;
}

interface CloseRateTrend {
  month: string;
  won: number;
  lost: number;
  rate: number;
}

interface SourceAttr {
  source: DealSource;
  count: number;
  totalAmount: number;
  wonCount: number;
}

interface StaleDeal {
  dealId: string;
  dealName: string;
  stage: string;
  amount: number;
  company: string | null;
  daysSinceActivity: number;
  lastActivityAt: string;
}

interface AnalyticsData {
  pipeline: {
    stages: PipelineStage[];
    totalValue: number;
    totalDeals: number;
  };
  velocity: {
    avgDaysPerStage: Record<string, number>;
    avgTotalDays: number;
    trend: VelocityTrend[];
  };
  meetings: {
    total: number;
    completed: number;
    upcoming: number;
    byMonth: MeetingsByMonth[];
    avgAttendanceRate: number;
  };
  closeRate: {
    won: number;
    lost: number;
    open: number;
    rate: number;
    trend: CloseRateTrend[];
  };
  sourceAttribution: SourceAttr[];
  staleDeals: StaleDeal[];
}

const STAGE_COLORS: Record<string, string> = {
  LEAD: "#94a3b8",
  QUALIFIED: "#3b82f6",
  PROPOSAL: "#8b5cf6",
  NEGOTIATION: "#f59e0b",
  CLOSED_WON: "#10b981",
  CLOSED_LOST: "#ef4444",
};

export function DealsAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/deals/analytics")
      .then((r) => {
        if (!r.ok) throw new Error(`Analytics failed (${r.status})`);
        return r.json();
      })
      .then((payload: AnalyticsData) => {
        setData(payload);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardLoadingState message="Loading analytics..." className="h-[50vh]" />;
  if (!data) {
    return (
      <DashboardEmptyState
        title="Analytics unavailable"
        message={error ?? "No analytics data available."}
      />
    );
  }

  // Build funnel data
  const funnelStages = data.pipeline.stages
    .filter((s) => !["CLOSED_WON", "CLOSED_LOST"].includes(s.stage))
    .map((s) => ({
      label: `${DEAL_STAGE_LABELS[s.stage]} (${s.count})`,
      value: s.totalAmount,
      color: STAGE_COLORS[s.stage] || "#94a3b8",
    }));

  // Source donut
  const sourceSegments = data.sourceAttribution
    .filter((s) => s.count > 0)
    .map((s, i) => ({
      name: DEAL_SOURCE_LABELS[s.source] || s.source,
      value: s.count,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
    }));

  // Attendance donut
  const attendedPct = Math.round(data.meetings.avgAttendanceRate * 100);
  const attendanceSegments = [
    { name: "Attended", value: attendedPct, color: "#10b981" },
    { name: "No-Show", value: 100 - attendedPct, color: "#ef4444" },
  ];

  // Stale deals columns
  const staleColumns: DataTableColumn<StaleDeal>[] = [
    { key: "dealName", header: "Deal" },
    { key: "company", header: "Company", render: (r) => r.company || "—" },
    {
      key: "stage",
      header: "Stage",
      render: (r) => DEAL_STAGE_LABELS[r.stage as DealStage] || r.stage,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => fmt$(r.amount),
    },
    {
      key: "daysSinceActivity",
      header: "Days Stale",
      align: "right",
      render: (r) => (
        <span className="font-medium text-amber-600 dark:text-amber-400">{r.daysSinceActivity}d</span>
      ),
    },
  ];

  // Insights
  const insights: Array<{ title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }> = [];

  if (data.staleDeals.length > 0) {
    const totalStaleValue = data.staleDeals.reduce((s, d) => s + d.amount, 0);
    insights.push({
      title: `${data.staleDeals.length} Stale Deal${data.staleDeals.length > 1 ? "s" : ""}`,
      insight: `${fmt$(totalStaleValue)} in pipeline value has had no activity for 14+ days.`,
      action: "Review stale deals below and schedule follow-ups.",
      severity: data.staleDeals.length >= 5 ? "critical" : "warning",
    });
  }

  if (data.closeRate.rate > 0.5) {
    insights.push({
      title: "Strong Close Rate",
      insight: `${fmtPct(data.closeRate.rate * 100)} win rate across ${data.closeRate.won + data.closeRate.lost} closed deals.`,
      severity: "success",
    });
  } else if (data.closeRate.won + data.closeRate.lost > 0) {
    insights.push({
      title: "Close Rate Below 50%",
      insight: `${fmtPct(data.closeRate.rate * 100)} win rate. Consider reviewing lost deals for patterns.`,
      severity: "warning",
    });
  }

  if (data.velocity.avgTotalDays > 0) {
    insights.push({
      title: "Average Deal Velocity",
      insight: `Deals take an average of ${data.velocity.avgTotalDays} days from first stage to close.`,
      severity: "info",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/deals" className="icon-btn-muted rounded-md p-2" aria-label="Back to deals">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Deals Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pipeline health, velocity, and performance metrics.</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Pipeline Value</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmt$(data.pipeline.totalValue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{fmtN(data.pipeline.totalDeals)} open deals</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Close Rate</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmtPct(data.closeRate.rate * 100)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.closeRate.won}W / {data.closeRate.lost}L</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Avg Deal Velocity</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{data.velocity.avgTotalDays}d</p>
          <p className="mt-1 text-xs text-muted-foreground">average days to close</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Meetings</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmtN(data.meetings.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.meetings.upcoming} upcoming</p>
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((ins, i) => (
            <InsightCard key={i} {...ins} />
          ))}
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Pipeline Funnel" subtitle="Deal value by stage">
          {funnelStages.length > 0 ? (
            <HorizontalFunnel stages={funnelStages} valueFormatter={(v) => fmt$(v)} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No open deals</p>
          )}
        </SectionCard>

        <SectionCard title="Velocity Trend" subtitle="Average days to close by month">
          {data.velocity.trend.length >= 2 ? (
            <AreaTrend
              data={data.velocity.trend as unknown as Record<string, unknown>[]}
              xKey="month"
              yKeys={["avgDays"]}
              yFormatter={(v) => `${v}d`}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Not enough data for trend</p>
          )}
        </SectionCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Meeting Activity" subtitle="Meetings per month">
          {data.meetings.byMonth.length > 0 ? (
            <StackedBarChart
              data={data.meetings.byMonth as unknown as Record<string, unknown>[]}
              xKey="month"
              barKeys={["count"]}
              stacked={false}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No meeting data</p>
          )}
        </SectionCard>

        <SectionCard title="Close Rate Trend" subtitle="Won vs lost by month">
          {data.closeRate.trend.length >= 2 ? (
            <AreaTrend
              data={data.closeRate.trend as unknown as Record<string, unknown>[]}
              xKey="month"
              yKeys={["won", "lost"]}
              colors={["#10b981", "#ef4444"]}
              stacked
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Not enough data for trend</p>
          )}
        </SectionCard>
      </div>

      {/* Charts Row 3 - Donuts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Source Attribution" subtitle="Deals by acquisition source">
          {sourceSegments.length > 0 ? (
            <div className="flex items-center justify-center gap-6">
              <DonutChart
                segments={sourceSegments}
                centerValue={fmtN(data.sourceAttribution.reduce((s, a) => s + a.count, 0))}
                centerLabel="deals"
              />
              <div className="space-y-1.5">
                {sourceSegments.map((seg) => (
                  <div key={seg.name} className="flex items-center gap-2 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="text-muted-foreground">{seg.name}</span>
                    <span className="font-medium tabular-nums text-foreground">{seg.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No source data</p>
          )}
        </SectionCard>

        <SectionCard title="Meeting Attendance" subtitle="Average attendance rate">
          <div className="flex items-center justify-center gap-6">
            <DonutChart
              segments={attendanceSegments}
              centerValue={`${attendedPct}%`}
              centerLabel="attendance"
            />
            <div className="space-y-1.5">
              {attendanceSegments.map((seg) => (
                <div key={seg.name} className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground">{seg.name}</span>
                  <span className="font-medium tabular-nums text-foreground">{seg.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Stale Deals Table */}
      {data.staleDeals.length > 0 && (
        <SectionCard title="Stale Deals" subtitle={`${data.staleDeals.length} deals with no activity in 14+ days`}>
          <DataTable columns={staleColumns} rows={data.staleDeals} />
        </SectionCard>
      )}
    </div>
  );
}

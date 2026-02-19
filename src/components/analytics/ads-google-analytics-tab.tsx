"use client";

import {
  BarChart3, Users, Eye, TrendingDown, TrendingUp,
  Clock, AlertTriangle, Globe, Activity,
} from "lucide-react";
import type { AnalyticsDashboardData, GATrafficChannel, GATopPage } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmt$, fmtN, fmtPct, pctChange, fmtDuration,
  AlertBanner, ChangeIndicator, DataTable, InsightCard,
  SectionCard, type DataTableColumn,
} from "./dashboard-primitives";

interface AdsGoogleAnalyticsTabProps {
  data: AnalyticsDashboardData | null;
}

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search": "#22c55e",
  "Direct": "#818cf8",
  "Social": "#f472b6",
  "Referral": "#2dd4bf",
  "Email": "#f97316",
  "Paid Search": "#eab308",
  "Display": "#c084fc",
  "Affiliate": "#22d3ee",
  "(Other)": "#6b7280",
};

function channelColor(channel: string): string {
  return CHANNEL_COLORS[channel] || "#6b7280";
}

export function AdsGoogleAnalyticsTab({ data }: AdsGoogleAnalyticsTabProps) {
  const ga = data?.ga;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "ga" || entry.source === "googleAnalytics")
      .map((entry) => entry.message),
    ...(data?.freshness?.ga?.lastError ? [data.freshness.ga.lastError] : []),
  ];

  if (!ga) {
    return (
      <FinanceDataEmptyState
        title="Google Analytics data is unavailable"
        message="We could not load Google Analytics traffic and engagement data for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const {
    sessions30d, sessionsPrev30d,
    users30d, usersPrev30d,
    pageviews30d, pageviewsPrev30d,
    bounceRate, avgSessionDuration,
    trafficByChannel, topPages, dailyTrend,
  } = ga;

  const pagesPerSession = sessions30d > 0 ? pageviews30d / sessions30d : 0;

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];

  const sessionsDelta = sessionsPrev30d > 0
    ? ((sessions30d - sessionsPrev30d) / sessionsPrev30d) * 100
    : 0;

  if (sessionsDelta < -20) {
    alerts.push({
      severity: "critical",
      title: `Sessions dropped ${Math.abs(sessionsDelta).toFixed(0)}% MoM`,
      description: `Sessions declined from ${fmtN(sessionsPrev30d)} to ${fmtN(sessions30d)}. Investigate traffic sources and campaign performance.`,
    });
  }
  if (bounceRate > 70) {
    alerts.push({
      severity: "critical",
      title: `Bounce rate at ${fmtPct(bounceRate)}`,
      description: "High bounce rate indicates poor landing page experience or traffic mismatch. Review top pages and ad targeting.",
    });
  }
  if (avgSessionDuration < 60 && sessions30d > 0) {
    alerts.push({
      severity: "warning",
      title: `Avg session duration under 1 minute`,
      description: `Users spend an average of ${fmtDuration(avgSessionDuration / 60)} on site. Consider improving content engagement and page load times.`,
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];

  if (sessionsDelta > 10) {
    insights.push({
      title: "Traffic Growth",
      insight: `Sessions grew ${sessionsDelta.toFixed(0)}% MoM (${fmtN(sessionsPrev30d)} → ${fmtN(sessions30d)}). Momentum is positive.`,
      severity: "success",
    });
  }

  if (trafficByChannel.length > 0) {
    const topChannel = [...trafficByChannel].sort((a, b) => b.sessions - a.sessions)[0];
    const topChannelShare = sessions30d > 0 ? (topChannel.sessions / sessions30d) * 100 : 0;
    if (topChannelShare > 60) {
      insights.push({
        title: "Channel Concentration",
        insight: `${topChannel.channel} drives ${fmtPct(topChannelShare)} of all sessions. Over-reliance on a single channel increases risk.`,
        action: "Diversify traffic sources across organic, paid, social, and email channels.",
        severity: "warning",
      });
    }
  }

  if (bounceRate <= 50 && avgSessionDuration >= 120) {
    insights.push({
      title: "Strong Engagement",
      insight: `Bounce rate at ${fmtPct(bounceRate)} and avg session ${fmtDuration(avgSessionDuration / 60)}. Users are engaged with content.`,
      severity: "success",
    });
  }

  if (pagesPerSession >= 3) {
    insights.push({
      title: "Good Page Depth",
      insight: `Users view ${pagesPerSession.toFixed(1)} pages per session on average. Strong content navigation.`,
      severity: "success",
    });
  } else if (pagesPerSession < 1.5 && sessions30d > 0) {
    insights.push({
      title: "Low Page Depth",
      insight: `Only ${pagesPerSession.toFixed(1)} pages per session. Users may not be finding what they need.`,
      action: "Improve internal linking and content discoverability.",
      severity: "warning",
    });
  }

  // ── Daily Trend ──
  const maxDailySessions = Math.max(...(dailyTrend?.map((d) => d.sessions) ?? [0]), 1);

  // ── Traffic By Channel ──
  const totalChannelSessions = trafficByChannel.reduce((sum, c) => sum + c.sessions, 0);
  const maxChannelSessions = Math.max(...trafficByChannel.map((c) => c.sessions), 1);

  // ── Top Pages Columns ──
  const pageColumns: DataTableColumn<GATopPage>[] = [
    {
      key: "path",
      header: "Page",
      render: (r) => (
        <span className="font-medium text-foreground max-w-[300px] truncate block" title={r.path}>
          {r.path}
        </span>
      ),
    },
    {
      key: "pageviews",
      header: "Pageviews",
      align: "right",
      render: (r) => <span className="font-medium tabular-nums">{fmtN(r.pageviews)}</span>,
    },
    {
      key: "avgDuration",
      header: "Avg Duration",
      align: "right",
      render: (r) => (
        <span className="tabular-nums text-muted-foreground">{fmtDuration(r.avgDuration / 60)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertBanner key={i} severity={a.severity} title={a.title} description={a.description} />
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Sessions"
          value={fmtN(sessions30d)}
          change={pctChange(sessions30d, sessionsPrev30d)}
          changeType={sessions30d >= sessionsPrev30d ? "positive" : "negative"}
          subtitle="Last 30 days"
          icon={BarChart3}
        />
        <StatCard
          label="Users"
          value={fmtN(users30d)}
          change={pctChange(users30d, usersPrev30d)}
          changeType={users30d >= usersPrev30d ? "positive" : "negative"}
          subtitle="Last 30 days"
          icon={Users}
        />
        <StatCard
          label="Pageviews"
          value={fmtN(pageviews30d)}
          change={pctChange(pageviews30d, pageviewsPrev30d)}
          changeType={pageviews30d >= pageviewsPrev30d ? "positive" : "negative"}
          subtitle="Last 30 days"
          icon={Eye}
        />
        <StatCard
          label="Bounce Rate"
          value={fmtPct(bounceRate)}
          changeType={bounceRate > 60 ? "negative" : "positive"}
          icon={TrendingDown}
          iconColor={bounceRate > 60 ? "text-red-500" : "text-primary"}
        />
        <StatCard
          label="Avg Session"
          value={fmtDuration(avgSessionDuration / 60)}
          icon={Clock}
        />
        <StatCard
          label="Pages / Session"
          value={pagesPerSession.toFixed(1)}
          icon={Activity}
        />
      </div>

      {/* Daily Session Trend */}
      {dailyTrend && dailyTrend.length > 0 && (
        <SectionCard title="Daily Session Trend" subtitle="Sessions over the last 30 days">
          <div className="flex items-end gap-[2px]" style={{ height: 140 }}>
            {dailyTrend.map((d) => {
              const h = Math.max((d.sessions / maxDailySessions) * 120, 2);
              const dateLabel = new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
                  <div
                    className="w-full rounded-t bg-primary/80 transition-all hover:bg-primary"
                    style={{ height: `${h}px`, minWidth: "3px" }}
                  />
                  {/* Tooltip on hover */}
                  <div className="pointer-events-none absolute -top-8 hidden whitespace-nowrap rounded bg-foreground/90 px-2 py-1 text-[10px] text-background group-hover:block">
                    {dateLabel}: {fmtN(d.sessions)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            {dailyTrend.length > 0 && (
              <>
                <span>{new Date(dailyTrend[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span>{new Date(dailyTrend[dailyTrend.length - 1].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* Traffic by Channel + Engagement */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Traffic by Channel */}
        {trafficByChannel.length > 0 && (
          <SectionCard title="Traffic by Channel" subtitle="Session distribution by acquisition channel">
            <div className="space-y-2">
              {[...trafficByChannel]
                .sort((a, b) => b.sessions - a.sessions)
                .map((ch) => {
                  const share = totalChannelSessions > 0
                    ? (ch.sessions / totalChannelSessions) * 100
                    : 0;
                  const widthPct = Math.max((ch.sessions / maxChannelSessions) * 100, 8);
                  return (
                    <div key={ch.channel} className="flex items-center gap-3">
                      <span className="w-28 text-right text-sm text-muted-foreground truncate" title={ch.channel}>
                        {ch.channel}
                      </span>
                      <div className="flex-1">
                        <div className="relative h-7 overflow-hidden rounded-md">
                          <div
                            className="flex h-full items-center rounded-md px-2 transition-all duration-500"
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: channelColor(ch.channel),
                              minWidth: "50px",
                            }}
                          >
                            <span className="text-[10px] font-bold text-white drop-shadow">
                              {fmtN(ch.sessions)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </SectionCard>
        )}

        {/* Engagement Overview */}
        <SectionCard title="Engagement Overview" subtitle="Key engagement quality metrics">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <RingStat
              value={Math.round(100 - bounceRate)}
              max={100}
              label="Engagement"
              color={bounceRate <= 50 ? "#22c55e" : bounceRate <= 70 ? "#eab308" : "#ef4444"}
              size={100}
            />
            <RingStat
              value={Math.min(Math.round(pagesPerSession * 20), 100)}
              max={100}
              label="Page Depth"
              color={pagesPerSession >= 3 ? "#22c55e" : pagesPerSession >= 1.5 ? "#818cf8" : "#ef4444"}
              size={100}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-[10px] text-muted-foreground">Bounce Rate</p>
              <p className={`text-lg font-bold tabular-nums ${bounceRate <= 50 ? "text-emerald-500" : bounceRate <= 70 ? "text-yellow-500" : "text-red-500"}`}>
                {fmtPct(bounceRate)}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-[10px] text-muted-foreground">Avg Duration</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {fmtDuration(avgSessionDuration / 60)}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-2">
              <p className="text-[10px] text-muted-foreground">Pages/Session</p>
              <p className="text-lg font-bold tabular-nums text-foreground">
                {pagesPerSession.toFixed(1)}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Top Pages Table */}
      {topPages && topPages.length > 0 && (
        <SectionCard title="Top Pages" subtitle={`${topPages.length} most viewed pages`}>
          <DataTable columns={pageColumns} rows={topPages} emptyMessage="No page data available" />
        </SectionCard>
      )}

      {/* Channel Detail Table */}
      {trafficByChannel.length > 0 && (
        <SectionCard title="Channel Breakdown" subtitle="Detailed metrics by traffic channel">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Channel</th>
                  <th className="pb-2 text-right font-medium">Sessions</th>
                  <th className="pb-2 text-right font-medium">Users</th>
                  <th className="pb-2 text-right font-medium">Pageviews</th>
                  <th className="pb-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {[...trafficByChannel]
                  .sort((a, b) => b.sessions - a.sessions)
                  .map((ch, i) => {
                    const share = totalChannelSessions > 0
                      ? (ch.sessions / totalChannelSessions) * 100
                      : 0;
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0 transition-colors hover:bg-secondary/20">
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: channelColor(ch.channel) }}
                            />
                            <span className="font-medium text-foreground">{ch.channel}</span>
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{fmtN(ch.sessions)}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">{fmtN(ch.users)}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">{fmtN(ch.pageviews)}</td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${share}%`, backgroundColor: channelColor(ch.channel) }}
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
        </SectionCard>
      )}

      {/* Insights & Recommendations */}
      {insights.length > 0 && (
        <SectionCard title="Insights & Recommendations">
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <InsightCard key={i} title={ins.title} insight={ins.insight} action={ins.action} severity={ins.severity} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

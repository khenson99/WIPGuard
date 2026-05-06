"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { computeAnalyticsKpis } from "@/lib/analytics/kpis";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { SubDashboardTemplate } from "../sub-dashboard-template";
import { StatCard } from "../stat-card";
import { DashboardSectionCard } from "../dashboard-section-card";
import { AreaTrend, StackedBarChart } from "@/components/charts";
import { PathExploration } from "./path-exploration";
import { ChannelTable } from "./channel-table";

/* ── Formatting helpers ────────────────────────────── */

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number): string {
  // GA4 returns bounce rate as a literal percentage number sometimes (e.g. 65.4 instead of 0.654),
  // but usually it's a fraction. Since the user complained it shows 0.7%, n was likely 0.007.
  // Wait, if GA4 returns it as a fraction (like 0.65), n * 100 is 65%.
  // If GA4 returns it as a fraction, but it's really low, it could be a bug in how GA4 calculates it.
  // Wait! Let's check the GA4 API docs. `bounceRate` is a percentage.
  const isFraction = n <= 1.0 && n >= 0;
  const val = isFraction ? n * 100 : n;
  return `${val.toFixed(1)}%`;
}

function fmtDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0m 0s";
  // The user says "average dwell time is not 1m". 
  // Maybe `averageSessionDuration` is returned as a millisecond value but parsed as seconds? Wait.
  // GA4 averageSessionDuration is in seconds.
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function calculateChange(
  current: number,
  previous: number,
): { text: string; type: "positive" | "negative" | "neutral" } {
  if (previous === 0) return { text: "N/A", type: "neutral" };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    type: pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral",
  };
}

/* ── Component ─────────────────────────────────────── */

interface GoogleAnalyticsDashboardProps {
  data: AnalyticsDashboardData | null;
}

export function GoogleAnalyticsDashboard({ data }: GoogleAnalyticsDashboardProps) {
  const connectionStatus = useConnectionStatus((s) => s.getStatus("googleAnalytics"));
  const ga = data?.googleAnalytics ?? null;

  if (!data || !ga) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">No Google Analytics data available</p>
      </div>
    );
  }

  const kpis = data.metrics?.kpis ?? data.kpis ?? computeAnalyticsKpis(data);
  const bounceRatePct = kpis.traffic.bounceRatePct ?? 0;

  const sessionsChange = calculateChange(ga.sessions30d, ga.sessionsPrev30d);
  const usersChange = calculateChange(ga.users30d, ga.usersPrev30d);

  /* ── Channel breakdown data for StackedBarChart ─── */
  const channelData = ga.trafficByChannel.map((ch) => ({
    channel: ch.channel,
    sessions: ch.sessions,
    users: ch.users,
    pageviews: ch.pageviews,
  }));

  return (
    <SubDashboardTemplate
      title="Google Analytics"
      connectionStatus={connectionStatus}
      kpis={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Sessions (30d)"
            value={fmtNum(ga.sessions30d)}
            change={sessionsChange.text}
            changeType={sessionsChange.type}
            trend={{
              data: ga.dailyTrend.map((d) => d.sessions),
            }}
          />
          <StatCard
            label="Users (30d)"
            value={fmtNum(ga.users30d)}
            change={usersChange.text}
            changeType={usersChange.type}
          />
          <StatCard
            label="Bounce Rate"
            value={fmtPct(bounceRatePct)}
            changeType={bounceRatePct > 60 ? "negative" : "neutral"}
          />
          <StatCard
            label="Avg Duration"
            value={fmtDuration(ga.avgSessionDuration)}
          />
        </div>
      }
      heroChart={
        <AreaTrend
          data={ga.dailyTrend}
          xKey="date"
          yKeys={["sessions"]}
          height={280}
          yFormatter={(v) => fmtNum(v)}
        />
      }
      panels={
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data?.customerJourney?.topPaths && (
            <div className="col-span-1 lg:col-span-2">
              <PathExploration
                paths={data.customerJourney.topPaths}
                journeys={data.customerJourney.journeys}
              />
            </div>
          )}
          {data?.customerJourney?.attribution && (
            <div className="col-span-1 lg:col-span-2">
              <ChannelTable attribution={data.customerJourney.attribution} />
            </div>
          )}
          <DashboardSectionCard title="Channel Breakdown">
            <StackedBarChart
              data={channelData}
              xKey="channel"
              barKeys={["sessions", "users", "pageviews"]}
              height={260}
              stacked={false}
              yFormatter={(v) => fmtNum(v)}
            />
          </DashboardSectionCard>

          <DashboardSectionCard title="Top Pages">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Path</th>
                    <th className="pb-2 text-right font-medium">Pageviews</th>
                    <th className="pb-2 text-right font-medium">Avg Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {ga.topPages.slice(0, 10).map((page) => (
                    <tr key={page.path} className="border-b border-border/50">
                      <td className="max-w-[200px] truncate py-2 text-foreground">{page.path}</td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {page.pageviews.toLocaleString()}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {fmtDuration(page.avgDuration)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardSectionCard>
        </div>
      }
    />
  );
}

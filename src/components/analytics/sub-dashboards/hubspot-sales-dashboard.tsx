"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { SubDashboardTemplate } from "../sub-dashboard-template";
import { StatCard } from "../stat-card";
import { DashboardSectionCard } from "../dashboard-section-card";
import { HorizontalFunnel, DonutChart, CHART_PALETTE } from "@/components/charts";

/* ── Formatting helpers ────────────────────────────── */

function fmt$(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/* ── Funnel stage colors ───────────────────────────── */

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
};

/* ── Component ─────────────────────────────────────── */

interface HubspotSalesDashboardProps {
  data: AnalyticsDashboardData | null;
}

export function HubspotSalesDashboard({ data }: HubspotSalesDashboardProps) {
  const connectionStatus = useConnectionStatus((s) => s.getStatus("hubspot"));
  const hubspot = data?.hubspot ?? null;

  if (!hubspot) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">No HubSpot data available</p>
      </div>
    );
  }

  const { funnel, deals } = hubspot;

  /* ── Funnel stages for HorizontalFunnel ─── */
  const funnelStages = funnel.stages.map((stage) => ({
    label: stage.label,
    value: stage.count,
    color: STAGE_COLORS[stage.label] ?? CHART_PALETTE[0],
  }));

  /* ── Source attribution donut ─── */
  const sourceSegments = funnel.dealsBySource.map((src, i) => ({
    name: src.source || "Unknown",
    value: src.count,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
  }));
  const totalSourceDeals = funnel.dealsBySource.reduce((sum, s) => sum + s.count, 0);

  /* ── Top deals ─── */
  const topDeals = (deals ?? []).slice(0, 10);
  const repRows = hubspot.repScoreboard ?? [];

  return (
    <SubDashboardTemplate
      title="HubSpot Sales"
      connectionStatus={connectionStatus}
      kpis={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Deals"
            value={funnel.totalDeals.toLocaleString()}
            subtitle={`${funnel.closedWon} won / ${funnel.closedLost} lost`}
          />
          <StatCard
            label="Win Rate"
            value={fmtPct(funnel.winRate)}
            changeType={funnel.winRate > 20 ? "positive" : "neutral"}
            subtitle={`Effective: ${fmtPct(funnel.effectiveWinRate)}`}
          />
          <StatCard
            label="No-Show Rate"
            value={fmtPct(funnel.noShowRate)}
            changeType={funnel.noShowRate > 30 ? "negative" : "neutral"}
            subtitle={`${funnel.noShows} no-shows of ${funnel.demoScheduled} demos`}
          />
          <StatCard
            label="Avg Deal Size"
            value={fmt$(funnel.avgDealSize)}
          />
        </div>
      }
      heroChart={
        <HorizontalFunnel
          stages={funnelStages}
          height={Math.max(280, funnelStages.length * 36)}
          valueFormatter={(v) => v.toLocaleString()}
        />
      }
      panels={
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DashboardSectionCard
            title="How to read this dashboard"
            subtitle="All values are activity-based within the selected global time range."
            className="lg:col-span-2"
          >
            <div className="text-xs text-muted-foreground">
              <ul className="list-disc space-y-1 pl-4">
                <li><span className="text-foreground">Funnel</span> counts stage entries (not current pipeline snapshot).</li>
                <li><span className="text-foreground">Win / no-show rates</span> are computed from outcomes in-range.</li>
                <li><span className="text-foreground">Scoreboard</span> groups deals by HubSpot owner for in-range activity.</li>
              </ul>
            </div>
          </DashboardSectionCard>

          <DashboardSectionCard title="Source Attribution">
            {sourceSegments.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No source data</p>
            ) : (
              <div className="flex items-center justify-center gap-6">
                <DonutChart
                  segments={sourceSegments}
                  size={180}
                  centerValue={totalSourceDeals.toLocaleString()}
                  centerLabel="Deals"
                />
                <div className="space-y-2">
                  {sourceSegments.map((seg) => (
                    <div key={seg.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-muted-foreground">{seg.name}</span>
                      <span className="font-medium tabular-nums text-foreground">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DashboardSectionCard>

          <DashboardSectionCard title="Top Deals">
            {topDeals.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No deal data available</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Deal</th>
                      <th className="pb-2 font-medium">Stage</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                      <th className="pb-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDeals.map((deal) => (
                      <tr key={deal.dealId} className="border-b border-border/50">
                        <td className="max-w-[140px] truncate py-2 text-foreground">{deal.dealName}</td>
                        <td className="py-2 text-muted-foreground">{deal.stageLabel}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{fmt$(deal.amount)}</td>
                        <td className="py-2 text-muted-foreground">{deal.source || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardSectionCard>

          {repRows.length > 0 && (
            <DashboardSectionCard
              title="Sales Rep Scoreboard"
              subtitle="Activity in the selected time range"
              className="lg:col-span-2"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Rep</th>
                      <th className="pb-2 text-right font-medium">Deals</th>
                      <th className="pb-2 text-right font-medium">Pipeline</th>
                      <th className="pb-2 text-right font-medium">Avg Deal</th>
                      <th className="pb-2 text-right font-medium">Demos</th>
                      <th className="pb-2 text-right font-medium">No-shows</th>
                      <th className="pb-2 text-right font-medium">No-show %</th>
                      <th className="pb-2 text-right font-medium">Won</th>
                      <th className="pb-2 text-right font-medium">Won $</th>
                      <th className="pb-2 text-right font-medium">Win %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repRows.map((row) => (
                      <tr key={row.ownerId ?? row.ownerName} className="border-b border-border/50">
                        <td className="max-w-[180px] truncate py-2 text-foreground">{row.ownerName}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{row.totalDeals}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{fmt$(row.totalPipeline)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{fmt$(row.avgDealSize)}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{row.demos}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{row.noShows}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{fmtPct(row.noShowRate)}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{row.wonCount}</td>
                        <td className="py-2 text-right tabular-nums text-foreground">{fmt$(row.wonRevenue)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{fmtPct(row.winRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardSectionCard>
          )}
        </div>
      }
    />
  );
}

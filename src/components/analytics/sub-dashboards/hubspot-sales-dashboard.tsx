"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { SubDashboardTemplate } from "../sub-dashboard-template";
import { StatCard } from "../stat-card";
import { DashboardSectionCard } from "../dashboard-section-card";
import { HorizontalFunnel, DonutChart, CHART_PALETTE } from "@/components/charts";
import { VisualFunnel } from "../visual-funnel";

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

  /* ── Rep Scoreboard ─── */
  const repRows = [...(funnel.dealsByRep || [])].sort((a, b) => b.value - a.value);

  /* ── Source attribution table ─── */
  const sourceRows = [...(funnel.dealsBySource || [])]
    .sort((a, b) => b.value - a.value)
    .map((src) => {
      const winPct = src.count > 0 ? ((src.closedWon || 0) / src.count) * 100 : 0;
      const churnPct = src.count > 0 ? ((src.churned || 0) / src.count) * 100 : 0;
      return {
        ...src,
        winPct,
        churnPct,
      };
    });

  /* ── Top deals ─── */
  const topDeals = (deals ?? []).slice(0, 10);

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
        <div className="w-full">
          <VisualFunnel stages={funnel.stages.map(s => ({ id: s.stageId, label: s.label, count: s.count, value: s.value }))} />
        </div>
      }
      panels={
        <div className="flex flex-col gap-6">
          <DashboardSectionCard title="Performance by Source" subtitle="Analyze conversion and retention by lead origin">
            {sourceRows.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No source data</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 text-right font-medium">Deals</th>
                      <th className="pb-2 text-right font-medium">Pipeline Value</th>
                      <th className="pb-2 text-right font-medium">% Closed Won</th>
                      <th className="pb-2 text-right font-medium">Follow-Up Needed</th>
                      <th className="pb-2 text-right font-medium">% Churned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceRows.map((src) => (
                      <tr key={src.source} className="border-b border-border/50">
                        <td className="py-2.5 font-medium text-foreground">{src.source || "Unknown"}</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{src.count.toLocaleString()}</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{fmt$(src.value)}</td>
                        <td className="py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                          {fmtPct(src.winPct)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">
                          {src.followUpNeeded?.toLocaleString() || 0}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">
                          {fmtPct(src.churnPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardSectionCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DashboardSectionCard title="Sales Rep Scoreboard" subtitle="Pipeline and win metrics by team member">
              {repRows.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No rep data available</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Rep Name</th>
                        <th className="pb-2 text-right font-medium">Total Deals</th>
                        <th className="pb-2 text-right font-medium">Total Pipeline</th>
                        <th className="pb-2 text-right font-medium">Won Count</th>
                        <th className="pb-2 text-right font-medium">Won Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repRows.map((rep) => (
                        <tr key={rep.repName} className="border-b border-border/50">
                          <td className="py-2.5 text-foreground">{rep.repName}</td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{rep.count.toLocaleString()}</td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{fmt$(rep.value)}</td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{rep.closedWon.toLocaleString()}</td>
                          <td className="py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                            {fmt$(rep.closedWonValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                          <td className="max-w-[140px] truncate py-2.5 text-foreground">{deal.dealName}</td>
                          <td className="py-2.5 text-muted-foreground">{deal.stageLabel}</td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{fmt$(deal.amount)}</td>
                          <td className="py-2.5 text-muted-foreground">{deal.source || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DashboardSectionCard>
          </div>
        </div>
      }
    />
  );
}

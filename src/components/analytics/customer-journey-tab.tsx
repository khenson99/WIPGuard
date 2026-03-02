"use client";

import {
  Route, Users, Clock, Hash, ArrowRight,
  TrendingDown, AlertTriangle, CheckCircle,
} from "lucide-react";
import type { AnalyticsDashboardData, TouchpointChannel } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
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
  "paid-search": "Paid Search",
  "paid-social": "Paid Social",
  "organic-search": "Organic Search",
  referral: "Referral",
  direct: "Direct",
  email: "Email",
  partner: "Partner",
  outbound: "Outbound",
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
  "paid-search": "#34a853",
  "paid-social": "#1877f2",
  "organic-search": "#fbbc04",
  referral: "#ea4335",
  direct: "#9aa0a6",
  email: "#f59e0b",
  partner: "#8b5cf6",
  outbound: "#10b981",
};

export function CustomerJourneyTab({ data }: { data: AnalyticsDashboardData | null }) {
  const journey = data?.customerJourney;
  if (!journey || journey.journeys.length === 0) return <EmptyState />;

  const topChannel = journey.touchpointSummary[0];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Journeys"
          value={journey.journeys.length.toLocaleString()}
          icon={Route}
        />
        <StatCard
          label="Avg Touchpoints"
          value={journey.avgTouchpoints.toFixed(1)}
          subtitle="per customer journey"
          icon={Hash}
        />
        <StatCard
          label="Median Days to Close"
          value={`${journey.medianDaysToClose}`}
          subtitle="from first touch to resolution"
          icon={Clock}
        />
        <StatCard
          label="Top Channel"
          value={topChannel ? CHANNEL_LABELS[topChannel.channel] : "—"}
          subtitle={topChannel ? `${topChannel.totalTouchpoints} touchpoints` : undefined}
          icon={Users}
        />
      </div>

      {/* Journey Paths + Attribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Paths */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Most Common Paths</h3>
          <p className="mb-5 text-xs text-muted-foreground">Top customer journey sequences by frequency</p>
          <div className="space-y-3">
            {journey.topPaths.slice(0, 6).map((path, i) => {
              const maxCount = journey.topPaths[0]?.count ?? 1;
              const widthPct = Math.max((path.count / maxCount) * 100, 12);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {path.sequence.map((ch, j) => (
                      <span key={j} className="flex items-center gap-1">
                        {j > 0 && <ArrowRight className="h-2.5 w-2.5" />}
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
                          style={{ backgroundColor: CHANNEL_COLORS[ch] || "#6b7280" }}
                        >
                          {CHANNEL_LABELS[ch]}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="relative h-5 overflow-hidden rounded-md bg-secondary/40">
                        <div
                          className="flex h-full items-center rounded-md px-2 transition-all duration-500"
                          style={{ width: `${widthPct}%`, backgroundColor: "#4379f0" }}
                        >
                          <span className="text-[10px] font-bold text-white drop-shadow">
                            {path.count}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="w-16 text-right text-[10px] tabular-nums text-muted-foreground">
                      {path.avgDaysToClose}d avg
                    </span>
                  </div>
                </div>
              );
            })}
            {journey.topPaths.length === 0 && (
              <p className="text-xs text-muted-foreground">No journey paths yet.</p>
            )}
          </div>
        </div>

        {/* Touchpoint Summary */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Touchpoint Summary</h3>
          <p className="mb-5 text-xs text-muted-foreground">Channel contribution across all journeys</p>
          <div className="space-y-2">
            {journey.touchpointSummary.map((summary) => {
              const maxTP = journey.touchpointSummary[0]?.totalTouchpoints ?? 1;
              const widthPct = Math.max((summary.totalTouchpoints / maxTP) * 100, 8);
              return (
                <div key={summary.channel} className="flex items-center gap-3">
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {CHANNEL_LABELS[summary.channel]}
                  </span>
                  <div className="flex-1">
                    <div className="relative h-6 overflow-hidden rounded-md">
                      <div
                        className="flex h-full items-center rounded-md px-2 transition-all duration-500"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: CHANNEL_COLORS[summary.channel] || "#6b7280",
                          minWidth: "40px",
                        }}
                      >
                        <span className="text-[10px] font-bold text-white drop-shadow">
                          {summary.totalTouchpoints}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="w-12 text-right text-[10px] tabular-nums text-muted-foreground">
                    {summary.avgPerJourney}/j
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Channel Attribution Table */}
      {journey.attribution.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Channel Attribution</h3>
          <p className="mb-4 text-xs text-muted-foreground">How each channel contributes to acquisition and conversion</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Channel</th>
                  <th className="pb-2 text-right font-medium">First Touch</th>
                  <th className="pb-2 text-right font-medium">Assisted</th>
                  <th className="pb-2 text-right font-medium">Last Touch</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="pb-2 text-right font-medium">Avg Deal</th>
                </tr>
              </thead>
              <tbody>
                {journey.attribution.map((attr) => (
                  <tr key={attr.channel} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CHANNEL_COLORS[attr.channel] || "#6b7280" }}
                        />
                        <span className="font-medium text-foreground">
                          {CHANNEL_LABELS[attr.channel]}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{attr.firstTouchDeals}</td>
                    <td className="py-2.5 text-right tabular-nums">{attr.assistedDeals}</td>
                    <td className="py-2.5 text-right tabular-nums">{attr.lastTouchDeals}</td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{fmt$(attr.totalRevenue)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {attr.avgDealValue > 0 ? fmt$(attr.avgDealValue) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Journey Breakdown by Stage */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Journeys by Current Stage</h3>
        <div className="space-y-2">
          {(() => {
            const byStage = new Map<string, { count: number; totalValue: number }>();
            for (const j of journey.journeys) {
              const entry = byStage.get(j.currentStage) ?? { count: 0, totalValue: 0 };
              entry.count += 1;
              entry.totalValue += j.value;
              byStage.set(j.currentStage, entry);
            }
            const sorted = Array.from(byStage.entries()).sort((a, b) => b[1].count - a[1].count);
            const maxCount = sorted[0]?.[1].count ?? 1;
            return sorted.map(([stage, stats]) => (
              <div key={stage} className="flex items-center gap-3">
                <span className="w-36 text-right text-xs text-muted-foreground">{stage}</span>
                <div className="flex-1">
                  <div className="relative h-6 overflow-hidden rounded-md">
                    <div
                      className="flex h-full items-center rounded-md bg-primary/80 px-2 transition-all duration-500"
                      style={{ width: `${Math.max((stats.count / maxCount) * 100, 8)}%`, minWidth: "40px" }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">{stats.count}</span>
                    </div>
                  </div>
                </div>
                <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                  {fmt$(stats.totalValue)}
                </span>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Route className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No customer journey data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot and other integrations to map journeys</p>
      </div>
    </div>
  );
}

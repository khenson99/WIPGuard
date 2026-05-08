"use client";

import { useMemo } from "react";
import type { ChannelAttribution } from "@/lib/analytics/types";
import { DashboardSectionCard } from "../dashboard-section-card";

interface ChannelTableProps {
  attribution: ChannelAttribution[];
}

export function ChannelTable({ attribution }: ChannelTableProps) {
  const chartData = useMemo(() => {
    return attribution.map((attr) => {
      let displayName = attr.channel as string;
      if (attr.channel === "google-ads") displayName = "Google Ads";
      if (attr.channel === "meta-ads") displayName = "Meta Ads";
      if (attr.channel === "reddit-ads") displayName = "Reddit Ads";
      if (attr.channel === "google-analytics") displayName = "Organic Traffic";
      
      return {
        id: attr.channel,
        name: displayName,
        traffic: attr.traffic ?? null,
        cost: attr.cost ?? null,
        kanbanCards: attr.kanbanCards,
        freeTrials: attr.freeTrials,
        demos: attr.demos,
        deals: attr.firstTouchDeals + attr.assistedDeals + attr.lastTouchDeals,
        revenue: attr.totalRevenue,
        roi: attr.roi ?? null,
      };
    }).sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0));
  }, [attribution]);

  if (!chartData || chartData.length === 0) {
    return (
      <DashboardSectionCard title="Source & ROI">
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          No channel attribution data available.
        </div>
      </DashboardSectionCard>
    );
  }

  return (
    <DashboardSectionCard title="Source & ROI">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th className="pb-2">Channel</th>
              <th className="pb-2 text-right">Traffic</th>
              <th className="pb-2 text-right">Cost</th>
              <th className="pb-2 text-right">Lead Magnet / Trials / Demos</th>
              <th className="pb-2 text-right">Deals</th>
              <th className="pb-2 text-right">Revenue</th>
              <th className="pb-2 text-right">ROI</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((row) => (
              <tr key={row.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                <td className="py-3 font-medium text-foreground">{row.name}</td>
                <td className="py-3 text-right tabular-nums text-foreground">
                  {row.traffic !== null ? row.traffic.toLocaleString() : "-"}
                </td>
                <td className="py-3 text-right tabular-nums text-muted-foreground">
                  {row.cost !== null ? `$${row.cost.toLocaleString()}` : "-"}
                </td>
                <td className="py-3 text-right tabular-nums text-muted-foreground">
                  {row.kanbanCards} / {row.freeTrials} / {row.demos}
                </td>
                <td className="py-3 text-right tabular-nums text-muted-foreground">
                  {row.deals}
                </td>
                <td className="py-3 text-right font-medium tabular-nums text-foreground">
                  ${row.revenue.toLocaleString()}
                </td>
                <td className="py-3 text-right font-medium tabular-nums">
                  {row.roi !== null ? (
                    <span className={row.roi >= 0 ? "text-emerald-500" : "text-rose-500"}>
                      {row.roi > 0 ? "+" : ""}{row.roi.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardSectionCard>
  );
}

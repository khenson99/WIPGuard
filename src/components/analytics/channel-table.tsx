"use client";

import React from "react";

interface ChannelTotals {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  costPerConversion: number;
}

export default function ChannelTable({ byPlatform }: { byPlatform: Record<string, ChannelTotals> }) {
  const platforms = Object.entries(byPlatform);
  
  if (platforms.length === 0) {
    return <div className="text-muted-foreground text-center py-8">No channel data available.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 text-muted-foreground font-medium">Channel</th>
            <th className="py-2 text-muted-foreground font-medium text-right">Spend</th>
            <th className="py-2 text-muted-foreground font-medium text-right">Impressions</th>
            <th className="py-2 text-muted-foreground font-medium text-right">Clicks</th>
            <th className="py-2 text-muted-foreground font-medium text-right">Conversions</th>
            <th className="py-2 text-muted-foreground font-medium text-right">CPC</th>
            <th className="py-2 text-muted-foreground font-medium text-right">Cost / Conv.</th>
          </tr>
        </thead>
        <tbody>
          {platforms.map(([platform, metrics]) => {
            const cpc = metrics.clicks > 0 ? metrics.cost / metrics.clicks : 0;
            return (
              <tr key={platform} className="border-b border-border/50">
                <td className="py-2 text-foreground capitalize font-medium">{platform}</td>
                <td className="py-2 text-foreground text-right font-semibold">${metrics.cost.toFixed(2)}</td>
                <td className="py-2 text-muted-foreground text-right">{metrics.impressions.toLocaleString()}</td>
                <td className="py-2 text-muted-foreground text-right">{metrics.clicks.toLocaleString()}</td>
                <td className="py-2 text-muted-foreground text-right">{metrics.conversions.toFixed(1)}</td>
                <td className="py-2 text-muted-foreground text-right">${cpc.toFixed(2)}</td>
                <td className="py-2 text-muted-foreground text-right">${metrics.costPerConversion.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

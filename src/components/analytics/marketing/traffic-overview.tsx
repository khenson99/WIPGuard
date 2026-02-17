"use client";

import { Globe, Eye } from "lucide-react";
import { fmtNumber, fmtDuration } from "@/lib/analytics/format";
import { BarDisplay } from "../bar-display";
import type { GAData } from "@/lib/analytics/types";

const CHANNEL_COLORS: Record<string, string> = {
  direct: "#3b82f6",
  organic: "#10b981",
  referral: "#f59e0b",
  paid: "#ef4444",
  social: "#8b5cf6",
  email: "#06b6d4",
};

interface TrafficOverviewProps {
  ga: GAData | null;
}

export function TrafficOverview({ ga }: TrafficOverviewProps) {
  const configured = Boolean(ga);
  const hasSignal = Boolean(
    ga && (ga.sessions30d > 0 || ga.users30d > 0 || ga.pageviews30d > 0 || ga.trafficByChannel.length > 0 || ga.topPages.length > 0),
  );

  const barItems = (ga?.trafficByChannel ?? []).map((item) => ({
    label: item.channel || "Unknown",
    value: item.sessions || 0,
    color: CHANNEL_COLORS[item.channel?.toLowerCase()] || "#6b7280",
  }));

  const topPages = ga?.topPages ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Traffic by Channel */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Globe className="h-4 w-4 text-primary" />
          Traffic by Channel
        </h3>
        {!configured ? (
          <EmptySlot text="Google Analytics not connected" />
        ) : barItems.length > 0 ? (
          <BarDisplay
            items={barItems}
            formatValue={(v) => fmtNumber(v)}
            maxValue={Math.max(...barItems.map((i) => i.value), 1)}
            gradient
          />
        ) : (
          <EmptySlot text="No traffic data in selected range" />
        )}
      </div>

      {/* Top Pages */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye className="h-4 w-4 text-primary" />
          Top Pages
        </h3>
        {!configured ? (
          <EmptySlot text="Google Analytics not connected" />
        ) : topPages.length > 0 ? (
          <div className="space-y-2">
            {topPages.slice(0, 5).map((page, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {page.path || "Unknown"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {fmtNumber(page.pageviews)} views &middot; {fmtDuration(page.avgDuration)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptySlot text="No page data in selected range" />
        )}
      </div>
    </div>
  );
}

function EmptySlot({ text }: { text: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

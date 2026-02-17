"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/analytics/format";
import type { AdCampaign } from "@/lib/analytics/types";

interface AdMetric {
  label: string;
  value: string;
  /** Show in the "primary" stat grid (bg tile) vs secondary inline row */
  primary?: boolean;
}

interface AdPlatformCardProps {
  name: string;
  icon: LucideIcon;
  configured: boolean;
  hasSignal: boolean;
  /** Pre-built metric rows — the caller decides which fields exist per platform */
  metrics: AdMetric[];
  campaigns: AdCampaign[];
  defaultExpanded?: boolean;
}

export function AdPlatformCard({
  name,
  icon: Icon,
  configured,
  hasSignal,
  metrics,
  campaigns,
  defaultExpanded = false,
}: AdPlatformCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const primaryMetrics = metrics.filter((m) => m.primary);
  const secondaryMetrics = metrics.filter((m) => !m.primary);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header / Toggle */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-5 py-3.5 transition-colors hover:bg-secondary/30"
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{name}</h3>
          {configured && hasSignal && (
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
          {configured && !hasSignal && (
            <span className="text-[10px] text-muted-foreground">No data</span>
          )}
          {!configured && (
            <span className="text-[10px] text-muted-foreground">Not connected</span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expandable Body */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {!configured ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {name} is not connected. Configure it in Settings.
            </p>
          ) : !hasSignal ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No {name} data in the selected range.
            </p>
          ) : (
            <>
              {/* Primary Stat Tiles */}
              {primaryMetrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  {primaryMetrics.map((m) => (
                    <div key={m.label} className="rounded-lg bg-secondary/40 px-3 py-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {m.label}
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Secondary Inline Metrics */}
              {secondaryMetrics.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
                  {secondaryMetrics.map((m) => (
                    <div key={m.label} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">{m.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Top Campaigns */}
              {campaigns.length > 0 && (
                <div>
                  <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Top Campaigns
                  </p>
                  <div className="space-y-0">
                    {campaigns.slice(0, 5).map((campaign, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between border-b border-border/40 py-2.5 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {campaign.name}
                        </span>
                        <div className="ml-3 flex items-center gap-4 text-right">
                          <span className="text-xs font-semibold tabular-nums text-foreground">
                            {fmtCurrency(campaign.spend)}
                          </span>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {fmtNumber(campaign.clicks)} clicks
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Metric builder helpers ── */

export function buildGoogleAdsMetrics(data: {
  totalSpend30d: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}): AdMetric[] {
  return [
    { label: "Spend", value: fmtCurrency(data.totalSpend30d), primary: true },
    { label: "Impressions", value: fmtNumber(data.totalImpressions), primary: true },
    { label: "Clicks", value: fmtNumber(data.totalClicks), primary: true },
    { label: "Conversions", value: fmtNumber(data.totalConversions), primary: true },
    { label: "CTR", value: fmtPercent(data.ctr) },
    { label: "CPC", value: fmtCurrency(data.cpc) },
    { label: "CPA", value: fmtCurrency(data.cpa) },
    { label: "ROAS", value: `${data.roas?.toFixed(2)}x` },
  ];
}

export function buildMetaAdsMetrics(data: {
  totalSpend30d: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  ctr: number;
  cpc: number;
  cpa: number;
}): AdMetric[] {
  return [
    { label: "Spend", value: fmtCurrency(data.totalSpend30d), primary: true },
    { label: "Impressions", value: fmtNumber(data.totalImpressions), primary: true },
    { label: "Clicks", value: fmtNumber(data.totalClicks), primary: true },
    { label: "Conversions", value: fmtNumber(data.totalConversions), primary: true },
    { label: "CTR", value: fmtPercent(data.ctr) },
    { label: "CPC", value: fmtCurrency(data.cpc) },
    { label: "CPA", value: fmtCurrency(data.cpa) },
  ];
}

export function buildRedditAdsMetrics(data: {
  totalSpend30d: number;
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
  cpc: number;
}): AdMetric[] {
  return [
    { label: "Spend", value: fmtCurrency(data.totalSpend30d), primary: true },
    { label: "Impressions", value: fmtNumber(data.totalImpressions), primary: true },
    { label: "Clicks", value: fmtNumber(data.totalClicks), primary: true },
    { label: "CTR", value: fmtPercent(data.ctr) },
    { label: "CPC", value: fmtCurrency(data.cpc) },
  ];
}

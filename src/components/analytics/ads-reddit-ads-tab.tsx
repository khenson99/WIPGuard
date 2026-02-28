"use client";

import {
  DollarSign, Eye, MousePointerClick,
  TrendingUp, BarChart3,
} from "lucide-react";
import type { AnalyticsDashboardData, AdCampaign } from "@/lib/analytics/types";
import { computeAnalyticsKpis } from "@/lib/analytics/kpis";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmt$, fmtN, fmtPct,
  AlertBanner, DataTable, InsightCard,
  SectionCard, type DataTableColumn,
} from "./dashboard-primitives";

interface AdsRedditAdsTabProps {
  data: AnalyticsDashboardData | null;
}

function fmtCurrency(n: number): string {
  if (n >= 1_000) return fmt$(n);
  return `$${n.toFixed(2)}`;
}

export function AdsRedditAdsTab({ data }: AdsRedditAdsTabProps) {
  const reddit = data?.redditAds;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "redditAds")
      .map((entry) => entry.message),
    ...(data?.freshness?.redditAds?.lastError ? [data.freshness.redditAds.lastError] : []),
  ];

  if (!reddit) {
    return (
      <FinanceDataEmptyState
        title="Reddit Ads data is unavailable"
        message="We could not load Reddit Ads campaign and performance analytics for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const { totalSpend30d, totalImpressions, totalClicks, ctr, cpc, campaigns } = reddit;
  const kpis = data?.kpis ?? computeAnalyticsKpis(data);

  if (totalSpend30d === 0 && campaigns.length === 0) {
    return (
      <FinanceDataEmptyState
        title="No Reddit Ads activity found"
        message="Reddit Ads is connected, but no spend or campaign data is available for this period."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  // ── Derived metrics ──
  const cpm = totalImpressions > 0 ? (totalSpend30d / totalImpressions) * 1000 : 0;
  const totalCampaignConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (ctr < 0.5 && totalImpressions > 1000) {
    alerts.push({
      severity: "warning",
      title: `Low CTR at ${fmtPct(ctr)}`,
      description: "Click-through rate is below 0.5%. Reddit users respond to native, community-relevant content — refresh ad copy to match subreddit context.",
    });
  }
  if (cpc > 5 && totalClicks > 10) {
    alerts.push({
      severity: "warning",
      title: `High CPC at ${fmtCurrency(cpc)}`,
      description: "Cost per click is elevated. Consider broadening targeting or testing promoted posts vs. display ads.",
    });
  }
  const zeroCampaigns = campaigns.filter((c) => c.clicks === 0 && c.impressions > 100);
  if (zeroCampaigns.length > 0) {
    alerts.push({
      severity: "info",
      title: `${zeroCampaigns.length} campaign${zeroCampaigns.length > 1 ? "s" : ""} with zero clicks`,
      description: `${zeroCampaigns.map((c) => c.name).join(", ")} — receiving impressions but no engagement.`,
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (ctr >= 1.5) {
    insights.push({
      title: "Strong Engagement",
      insight: `CTR of ${fmtPct(ctr)} is well above Reddit Ads average (~0.4%). Your ads resonate with the target subreddit audiences.`,
      severity: "success",
    });
  }
  if (cpc <= 1.5 && totalClicks > 0) {
    insights.push({
      title: "Cost-Efficient Clicks",
      insight: `CPC of ${fmtCurrency(cpc)} is competitive for Reddit Ads. Maintaining good value for traffic acquisition.`,
      severity: "success",
    });
  }
  if (campaigns.length > 0) {
    const topByClicks = [...campaigns].sort((a, b) => b.clicks - a.clicks)[0];
    if (topByClicks.clicks > 0) {
      const clickShare = totalClicks > 0
        ? (topByClicks.clicks / totalClicks) * 100
        : 0;
      insights.push({
        title: "Top Performing Campaign",
        insight: `"${topByClicks.name}" drives ${fmtN(topByClicks.clicks)} clicks (${fmtPct(clickShare)} of total). CPC: ${fmtCurrency(topByClicks.cpc)}.`,
        severity: "success",
      });
    }
  }
  if (campaigns.length >= 3) {
    const worst = [...campaigns].sort((a, b) => {
      const effA = a.clicks > 0 ? a.spend / a.clicks : Infinity;
      const effB = b.clicks > 0 ? b.spend / b.clicks : Infinity;
      return effB - effA;
    })[0];
    if (worst.spend > 0 && worst.clicks === 0) {
      insights.push({
        title: "Budget Drain",
        insight: `"${worst.name}" spent ${fmtCurrency(worst.spend)} with zero clicks.`,
        action: "Pause this campaign and reallocate budget.",
        severity: "warning",
      });
    }
  }
  if (cpm > 15) {
    insights.push({
      title: "High CPM",
      insight: `CPM of ${fmtCurrency(cpm)} is above typical Reddit rates. Consider adjusting bid strategy or targeting broader audiences.`,
      severity: "info",
    });
  }

  // ── Campaign table ──
  const campaignColumns: DataTableColumn<AdCampaign>[] = [
    { key: "name", header: "Campaign", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: "spend", header: "Spend", align: "right", render: (r) => <span className="tabular-nums">{fmtCurrency(r.spend)}</span> },
    { key: "impressions", header: "Impressions", align: "right", render: (r) => <span className="tabular-nums">{fmtN(r.impressions)}</span> },
    { key: "clicks", header: "Clicks", align: "right", render: (r) => <span className="tabular-nums">{fmtN(r.clicks)}</span> },
    { key: "ctr", header: "CTR", align: "right", render: (r) => (
      <span className={`tabular-nums ${r.ctr >= 1.0 ? "text-emerald-500" : r.ctr >= 0.5 ? "text-foreground" : "text-red-500"}`}>
        {fmtPct(r.ctr)}
      </span>
    )},
    { key: "cpc", header: "CPC", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{fmtCurrency(r.cpc)}</span> },
  ];

  // ── Spend distribution ──
  const maxSpend = Math.max(...campaigns.map((c) => c.spend), 1);
  const totalCampaignSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);

  const CAMPAIGN_COLORS = [
    "#ff4500", "#fc5a29", "#818cf8", "#22c55e", "#f472b6",
    "#eab308", "#2dd4bf", "#c084fc", "#22d3ee", "#6b7280",
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

      {/* KPI Grid — 5 top-level metrics (Reddit has no conversions/cpa/roas at top) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Total Spend"
          value={fmt$(totalSpend30d)}
          subtitle="Last 30 days"
          icon={DollarSign}
        />
        <StatCard
          label="Impressions"
          value={fmtN(totalImpressions)}
          icon={Eye}
        />
        <StatCard
          label="Clicks"
          value={fmtN(totalClicks)}
          icon={MousePointerClick}
        />
        <StatCard
          label="CTR"
          value={fmtPct(ctr)}
          changeType={ctr >= 1.0 ? "positive" : ctr >= 0.5 ? undefined : "negative"}
          icon={TrendingUp}
        />
        <StatCard
          label="CPC"
          value={fmtCurrency(cpc)}
          icon={DollarSign}
        />
        <StatCard
          label="CPM"
          value={cpm > 0 ? fmtCurrency(cpm) : "—"}
          subtitle="Cost per 1k impressions"
          icon={BarChart3}
        />
      </div>

      {/* Campaign Performance Table */}
      {campaigns.length > 0 && (
        <SectionCard title="Campaign Performance" subtitle={`${campaigns.length} active campaign${campaigns.length !== 1 ? "s" : ""}`}>
          <DataTable
            columns={campaignColumns}
            rows={[...campaigns].sort((a, b) => b.spend - a.spend)}
            emptyMessage="No campaign data available"
          />
        </SectionCard>
      )}

      {/* Spend Distribution + Engagement */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Spend Distribution */}
        <SectionCard title="Spend Distribution" subtitle="Budget allocation by campaign">
          <div className="space-y-2">
            {[...campaigns]
              .sort((a, b) => b.spend - a.spend)
              .map((campaign, i) => {
                const share = totalCampaignSpend > 0
                  ? (campaign.spend / totalCampaignSpend) * 100
                  : 0;
                return (
                  <div key={campaign.name} className="flex items-center gap-3">
                    <span className="w-32 truncate text-right text-sm text-muted-foreground" title={campaign.name}>
                      {campaign.name}
                    </span>
                    <div className="flex-1">
                      <div className="relative h-7 overflow-hidden rounded-md">
                        <div
                          className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                          style={{
                            width: `${Math.max((campaign.spend / maxSpend) * 100, 8)}%`,
                            backgroundColor: CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length],
                            minWidth: "50px",
                          }}
                        >
                          <span className="text-[10px] font-bold text-white drop-shadow">
                            {fmtCurrency(campaign.spend)}
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

        {/* Engagement Metrics */}
        <SectionCard title="Engagement Metrics" subtitle="Click and impression efficiency">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-6">
              <RingStat
                value={kpis.ads.reddit.ctrScore ?? 0}
                max={100}
                label="CTR Score"
                color={ctr >= 1.0 ? "#22c55e" : ctr >= 0.5 ? "#eab308" : "#ef4444"}
                size={100}
              />
              <RingStat
                value={kpis.ads.reddit.cpcScore ?? 0}
                max={100}
                label="CPC Score"
                color={cpc <= 2 ? "#22c55e" : cpc <= 5 ? "#eab308" : "#ef4444"}
                size={100}
              />
            </div>
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Click-Through Rate</span>
                <span className={`text-lg font-bold tabular-nums ${ctr >= 1.0 ? "text-emerald-500" : ctr < 0.5 ? "text-red-500" : "text-foreground"}`}>
                  {fmtPct(ctr)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Cost per Click</span>
                <span className="text-lg font-bold tabular-nums text-foreground">{fmtCurrency(cpc)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">CPM (Cost per 1k)</span>
                <span className="text-lg font-bold tabular-nums text-foreground">{cpm > 0 ? fmtCurrency(cpm) : "—"}</span>
              </div>
              {totalCampaignConversions > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <span className="text-sm text-foreground">Campaign Conversions</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{totalCampaignConversions}</span>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Traffic Funnel */}
      {totalImpressions > 0 && (
        <SectionCard title="Traffic Funnel" subtitle="Impressions → Clicks">
          <div className="space-y-3">
            {[
              { label: "Impressions", value: totalImpressions, color: "#ff4500" },
              { label: "Clicks", value: totalClicks, color: "#818cf8" },
            ].map((step, i, arr) => {
              const maxVal = arr[0].value;
              const widthPct = Math.max((step.value / maxVal) * 100, 6);
              const prevValue = i > 0 ? arr[i - 1].value : null;
              const convRate = prevValue && prevValue > 0 ? (step.value / prevValue) * 100 : null;
              return (
                <div key={step.label}>
                  <div className="flex items-center gap-3">
                    <span className="w-24 text-right text-sm text-muted-foreground">{step.label}</span>
                    <div className="flex-1">
                      <div className="relative h-8 overflow-hidden rounded-md">
                        <div
                          className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: step.color,
                            minWidth: "60px",
                          }}
                        >
                          <span className="text-xs font-bold text-white drop-shadow">
                            {fmtN(step.value)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {convRate !== null && (
                      <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                        {fmtPct(convRate)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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

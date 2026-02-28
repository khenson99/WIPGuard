"use client";

import {
  DollarSign, Eye, MousePointerClick, Target,
  TrendingUp, AlertTriangle,
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

interface AdsMetaAdsTabProps {
  data: AnalyticsDashboardData | null;
}

function fmtCurrency(n: number): string {
  if (n >= 1_000) return fmt$(n);
  return `$${n.toFixed(2)}`;
}

export function AdsMetaAdsTab({ data }: AdsMetaAdsTabProps) {
  const meta = data?.metaAds;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "metaAds")
      .map((entry) => entry.message),
    ...(data?.freshness?.metaAds?.lastError ? [data.freshness.metaAds.lastError] : []),
  ];

  if (!meta) {
    return (
      <FinanceDataEmptyState
        title="Meta Ads data is unavailable"
        message="We could not load Meta Ads campaign and performance analytics for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const {
    totalSpend30d, totalImpressions, totalClicks, totalConversions,
    ctr, cpc, cpa, campaigns,
  } = meta;

  const kpis = data?.kpis ?? computeAnalyticsKpis(data);

  if (totalSpend30d === 0 && campaigns.length === 0) {
    return (
      <FinanceDataEmptyState
        title="No Meta Ads activity found"
        message="Meta Ads is connected, but no spend or campaign data is available for this period."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (cpa > 0 && totalConversions > 0 && cpa > 100) {
    alerts.push({
      severity: "critical",
      title: `High CPA at ${fmtCurrency(cpa)}`,
      description: "Cost per acquisition exceeds $100. Review audience targeting, ad creative, and landing pages to reduce acquisition costs.",
    });
  } else if (cpa > 50 && totalConversions > 0) {
    alerts.push({
      severity: "warning",
      title: `Elevated CPA at ${fmtCurrency(cpa)}`,
      description: "Cost per acquisition is above $50. Consider A/B testing creatives and tightening audience segments.",
    });
  }
  if (ctr < 0.8 && totalImpressions > 1000) {
    alerts.push({
      severity: "warning",
      title: `Low CTR at ${fmtPct(ctr)}`,
      description: "Click-through rate is below 0.8%. Meta Ads typically need compelling visuals — refresh creative and test new formats (Reels, Stories).",
    });
  }
  const zeroCampaigns = campaigns.filter((c) => c.clicks === 0 && c.impressions > 100);
  if (zeroCampaigns.length > 0) {
    alerts.push({
      severity: "info",
      title: `${zeroCampaigns.length} campaign${zeroCampaigns.length > 1 ? "s" : ""} with zero clicks`,
      description: `${zeroCampaigns.map((c) => c.name).join(", ")} — getting impressions but no engagement. Review ad relevance score.`,
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (ctr >= 2.0) {
    insights.push({
      title: "Strong Engagement",
      insight: `CTR of ${fmtPct(ctr)} is well above Meta platform average. Ad creative and targeting are resonating well.`,
      severity: "success",
    });
  }
  if (totalConversions > 0 && cpa <= 25) {
    insights.push({
      title: "Efficient Acquisition",
      insight: `CPA of ${fmtCurrency(cpa)} is within a healthy range. Meta Ads are acquiring customers cost-effectively.`,
      severity: "success",
    });
  }
  if (campaigns.length > 0) {
    const topCampaign = [...campaigns].sort((a, b) => b.conversions - a.conversions)[0];
    if (topCampaign.conversions > 0) {
      const topShare = totalConversions > 0
        ? (topCampaign.conversions / totalConversions) * 100
        : 0;
      insights.push({
        title: "Top Converting Campaign",
        insight: `"${topCampaign.name}" drives ${topCampaign.conversions} conversions (${fmtPct(topShare)} of total).`,
        severity: topShare > 70 ? "info" : "success",
        action: topShare > 70 ? "Heavy reliance on a single campaign — diversify to reduce risk." : undefined,
      });
    }
  }
  if (campaigns.length >= 3) {
    const worst = [...campaigns].sort((a, b) => a.clicks - b.clicks)[0];
    if (worst.spend > totalSpend30d * 0.1 && worst.clicks === 0) {
      insights.push({
        title: "Budget Drain",
        insight: `"${worst.name}" consumed ${fmtCurrency(worst.spend)} with zero clicks.`,
        action: "Pause this campaign and reallocate budget to higher-performing ads.",
        severity: "warning",
      });
    }
  }
  if (totalImpressions > 0 && totalClicks / totalImpressions < 0.005 && totalImpressions > 10000) {
    insights.push({
      title: "Creative Fatigue Possible",
      insight: "Very low engagement rate across high impressions may indicate audience ad fatigue.",
      action: "Refresh creative assets, try video/carousel formats, or rotate audience segments.",
      severity: "info",
    });
  }

  // ── Campaign table ──
  const campaignColumns: DataTableColumn<AdCampaign>[] = [
    { key: "name", header: "Campaign", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: "spend", header: "Spend", align: "right", render: (r) => <span className="tabular-nums">{fmtCurrency(r.spend)}</span> },
    { key: "impressions", header: "Impressions", align: "right", render: (r) => <span className="tabular-nums">{fmtN(r.impressions)}</span> },
    { key: "clicks", header: "Clicks", align: "right", render: (r) => <span className="tabular-nums">{fmtN(r.clicks)}</span> },
    { key: "conversions", header: "Conv.", align: "right", render: (r) => <span className="tabular-nums font-medium">{r.conversions}</span> },
    { key: "ctr", header: "CTR", align: "right", render: (r) => (
      <span className={`tabular-nums ${r.ctr >= 1.5 ? "text-emerald-500" : r.ctr >= 0.8 ? "text-foreground" : "text-red-500"}`}>
        {fmtPct(r.ctr)}
      </span>
    )},
    { key: "cpc", header: "CPC", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{fmtCurrency(r.cpc)}</span> },
  ];

  // ── Spend distribution ──
  const maxSpend = Math.max(...campaigns.map((c) => c.spend), 1);
  const totalCampaignSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);

  const CAMPAIGN_COLORS = [
    "#1877f2", "#fc5a29", "#22c55e", "#f472b6", "#818cf8",
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

      {/* KPI Grid — 7 cards (no ROAS for Meta) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          label="Conversions"
          value={totalConversions.toLocaleString()}
          icon={Target}
        />
        <StatCard
          label="CTR"
          value={fmtPct(ctr)}
          changeType={ctr >= 1.5 ? "positive" : ctr >= 0.8 ? undefined : "negative"}
          icon={TrendingUp}
        />
        <StatCard
          label="CPC"
          value={fmtCurrency(cpc)}
          icon={DollarSign}
        />
        <StatCard
          label="CPA"
          value={totalConversions > 0 ? fmtCurrency(cpa) : "—"}
          icon={AlertTriangle}
          iconColor={cpa > 50 ? "text-red-500" : "text-primary"}
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

      {/* Spend Distribution + Efficiency */}
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

        {/* Efficiency Analysis */}
        <SectionCard title="Efficiency Analysis" subtitle="Cost metrics and performance scoring">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-6">
              {totalConversions > 0 && (
                <RingStat
                  value={kpis.ads.meta.cpaScore ?? 0}
                  max={100}
                  label="CPA Score"
                  color={cpa <= 25 ? "#22c55e" : cpa <= 50 ? "#eab308" : "#ef4444"}
                  size={100}
                />
              )}
              <RingStat
                value={kpis.ads.meta.engagementScore ?? 0}
                max={100}
                label="Engagement"
                color={ctr >= 1.5 ? "#22c55e" : ctr >= 0.8 ? "#eab308" : "#ef4444"}
                size={100}
              />
            </div>
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Cost per Click</span>
                <span className="text-lg font-bold tabular-nums text-foreground">{fmtCurrency(cpc)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Cost per Acquisition</span>
                <span className={`text-lg font-bold tabular-nums ${cpa > 50 ? "text-red-500" : "text-foreground"}`}>
                  {totalConversions > 0 ? fmtCurrency(cpa) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Click-Through Rate</span>
                <span className={`text-lg font-bold tabular-nums ${ctr >= 1.5 ? "text-emerald-500" : ctr < 0.8 ? "text-red-500" : "text-foreground"}`}>
                  {fmtPct(ctr)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Cost per 1k Impressions</span>
                <span className="text-lg font-bold tabular-nums text-foreground">
                  {totalImpressions > 0 ? fmtCurrency((totalSpend30d / totalImpressions) * 1000) : "—"}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Conversion Funnel */}
      {totalImpressions > 0 && (
        <SectionCard title="Conversion Funnel" subtitle="Impressions → Clicks → Conversions">
          <div className="space-y-3">
            {[
              { label: "Impressions", value: totalImpressions, color: "#1877f2" },
              { label: "Clicks", value: totalClicks, color: "#818cf8" },
              { label: "Conversions", value: totalConversions, color: "#22c55e" },
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

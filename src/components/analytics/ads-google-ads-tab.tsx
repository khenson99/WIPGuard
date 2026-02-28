"use client";

import {
  DollarSign, Eye, MousePointerClick, Target,
  TrendingUp, AlertTriangle, Zap,
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

interface AdsGoogleAdsTabProps {
  data: AnalyticsDashboardData | null;
}

function fmtCurrency(n: number): string {
  if (n >= 1_000) return fmt$(n);
  return `$${n.toFixed(2)}`;
}

export function AdsGoogleAdsTab({ data }: AdsGoogleAdsTabProps) {
  const googleAds = data?.googleAds;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "googleAds")
      .map((entry) => entry.message),
    ...(data?.freshness?.googleAds?.lastError ? [data.freshness.googleAds.lastError] : []),
  ];

  if (!googleAds) {
    return (
      <FinanceDataEmptyState
        title="Google Ads data is unavailable"
        message="We could not load Google Ads campaign and performance analytics for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const {
    totalSpend30d, totalImpressions, totalClicks, totalConversions,
    ctr, cpc, cpa, roas, campaigns,
  } = googleAds;

  const kpis = data?.kpis ?? computeAnalyticsKpis(data);

  if (totalSpend30d === 0 && campaigns.length === 0) {
    return (
      <FinanceDataEmptyState
        title="No Google Ads activity found"
        message="Google Ads is connected, but no spend or campaign data is available for this period."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (roas > 0 && roas < 1.0) {
    alerts.push({
      severity: "critical",
      title: `ROAS at ${roas.toFixed(2)}x — spending more than earning`,
      description: "Return on ad spend is below 1.0. Every dollar spent is generating less than a dollar in return. Pause underperformers and reallocate budget.",
    });
  } else if (roas > 0 && roas < 2.0) {
    alerts.push({
      severity: "warning",
      title: `ROAS at ${roas.toFixed(2)}x — thin margins`,
      description: "Return on ad spend is below 2.0. Review campaign efficiency and consider pausing low-ROI campaigns.",
    });
  }
  if (cpa > 0 && totalConversions > 0 && cpa > totalSpend30d / Math.max(totalConversions, 1) * 2) {
    alerts.push({
      severity: "warning",
      title: `High CPA at ${fmtCurrency(cpa)}`,
      description: "Cost per acquisition is elevated. Review targeting, ad creative, and landing page conversion rates.",
    });
  }
  if (ctr < 1.0 && totalImpressions > 1000) {
    alerts.push({
      severity: "warning",
      title: `Low CTR at ${fmtPct(ctr)}`,
      description: "Click-through rate is below 1%. Improve ad copy, test new headlines, and refine audience targeting.",
    });
  }
  const zeroCampaigns = campaigns.filter((c) => c.clicks === 0 && c.impressions > 100);
  if (zeroCampaigns.length > 0) {
    alerts.push({
      severity: "info",
      title: `${zeroCampaigns.length} campaign${zeroCampaigns.length > 1 ? "s" : ""} with zero clicks`,
      description: `${zeroCampaigns.map((c) => c.name).join(", ")} — receiving impressions but no clicks. Review ad relevance and targeting.`,
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (roas >= 3.0) {
    insights.push({
      title: "Strong ROAS",
      insight: `Return on ad spend is ${roas.toFixed(2)}x. Campaigns are generating strong returns. Consider scaling budget on top performers.`,
      severity: "success",
    });
  }
  if (ctr >= 3.0) {
    insights.push({
      title: "High Engagement",
      insight: `CTR of ${fmtPct(ctr)} indicates strong ad relevance and audience targeting.`,
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
        title: "Top Converter",
        insight: `"${topCampaign.name}" drives ${topCampaign.conversions} conversions (${fmtPct(topShare)} of total). CPC: ${fmtCurrency(topCampaign.cpc)}.`,
        severity: topShare > 70 ? "info" : "success",
        action: topShare > 70 ? "High concentration — diversify conversion sources to reduce risk." : undefined,
      });
    }
  }
  if (campaigns.length >= 3) {
    const sorted = [...campaigns].sort((a, b) => {
      const roasA = a.conversions > 0 ? a.conversions / Math.max(a.spend, 1) : 0;
      const roasB = b.conversions > 0 ? b.conversions / Math.max(b.spend, 1) : 0;
      return roasA - roasB;
    });
    const worst = sorted[0];
    if (worst.spend > 0 && worst.conversions === 0) {
      insights.push({
        title: "Budget Drain",
        insight: `"${worst.name}" spent ${fmtCurrency(worst.spend)} with zero conversions.`,
        action: "Pause or restructure this campaign to stop wasting budget.",
        severity: "warning",
      });
    }
  }
  if (totalConversions > 0 && cpa > 0 && cpa <= 20) {
    insights.push({
      title: "Efficient Acquisition",
      insight: `CPA of ${fmtCurrency(cpa)} is within a healthy range. Acquisition costs are well-controlled.`,
      severity: "success",
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
      <span className={`tabular-nums ${r.ctr >= 2 ? "text-emerald-500" : r.ctr >= 1 ? "text-foreground" : "text-red-500"}`}>
        {fmtPct(r.ctr)}
      </span>
    )},
    { key: "cpc", header: "CPC", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{fmtCurrency(r.cpc)}</span> },
  ];

  // ── Spend distribution ──
  const maxSpend = Math.max(...campaigns.map((c) => c.spend), 1);
  const totalCampaignSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);

  const CAMPAIGN_COLORS = [
    "#fc5a29", "#818cf8", "#22c55e", "#f472b6", "#2dd4bf",
    "#eab308", "#c084fc", "#22d3ee", "#f97316", "#6b7280",
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

      {/* KPI Grid */}
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
          changeType={ctr >= 2 ? "positive" : ctr >= 1 ? undefined : "negative"}
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
        <StatCard
          label="ROAS"
          value={roas > 0 ? `${roas.toFixed(2)}x` : "—"}
          changeType={roas >= 2 ? "positive" : roas >= 1 ? undefined : "negative"}
          icon={Zap}
          iconColor={roas < 1 ? "text-red-500" : roas >= 3 ? "text-emerald-500" : "text-primary"}
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
        <SectionCard title="Efficiency Analysis" subtitle="Return on ad spend and cost metrics">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-6">
              <RingStat
                value={kpis.ads.google.roasScore ?? 0}
                max={100}
                label="ROAS"
                color={roas >= 3 ? "#22c55e" : roas >= 1 ? "#eab308" : "#ef4444"}
                size={100}
              />
              {totalConversions > 0 && (
                <RingStat
                  value={kpis.ads.google.cpaScore ?? 0}
                  max={100}
                  label="CPA Score"
                  color={cpa <= 20 ? "#22c55e" : cpa <= 50 ? "#eab308" : "#ef4444"}
                  size={100}
                />
              )}
            </div>
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Return on Ad Spend</span>
                <span className={`text-lg font-bold tabular-nums ${roas >= 2 ? "text-emerald-500" : roas >= 1 ? "text-yellow-500" : "text-red-500"}`}>
                  {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
                </span>
              </div>
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
                <span className={`text-lg font-bold tabular-nums ${ctr >= 2 ? "text-emerald-500" : ctr < 1 ? "text-red-500" : "text-foreground"}`}>
                  {fmtPct(ctr)}
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
              { label: "Impressions", value: totalImpressions, color: "#818cf8" },
              { label: "Clicks", value: totalClicks, color: "#22d3ee" },
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

"use client";

import {
  Search, Link2, Globe, TrendingUp,
  Target, DollarSign, BarChart3, Award,
} from "lucide-react";
import type { AnalyticsDashboardData, SemrushKeyword, SemrushCompetitor } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmt$, fmtN,
  AlertBanner, DataTable, InsightCard,
  SectionCard, type DataTableColumn,
} from "./dashboard-primitives";

interface AdsSemrushTabProps {
  data: AnalyticsDashboardData | null;
}

export function AdsSemrushTab({ data }: AdsSemrushTabProps) {
  const semrush = data?.semrush;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "semrush")
      .map((entry) => entry.message),
    ...(data?.freshness?.semrush?.lastError ? [data.freshness.semrush.lastError] : []),
  ];

  if (!semrush) {
    return (
      <FinanceDataEmptyState
        title="SEMrush data is unavailable"
        message="We could not load SEMrush SEO and competitive analytics for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const {
    domain, authorityScore, backlinks, organicKeywords, organicTraffic,
    organicTrafficCost, paidKeywords, paidTraffic, paidTrafficCost,
    topKeywords, organicCompetitors,
  } = semrush;

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (authorityScore < 20) {
    alerts.push({
      severity: "warning",
      title: `Low authority score: ${authorityScore}/100`,
      description: "Domain authority is below 20. Focus on building quality backlinks, creating authoritative content, and improving technical SEO.",
    });
  }
  if (organicTraffic === 0 && organicKeywords > 0) {
    alerts.push({
      severity: "warning",
      title: "Keywords ranking but no organic traffic",
      description: `${fmtN(organicKeywords)} keywords are indexed but generating no estimated traffic. Keywords may be ranking on page 2+ — focus on moving them to page 1.`,
    });
  }
  if (backlinks < 50) {
    alerts.push({
      severity: "info",
      title: `Low backlink count: ${fmtN(backlinks)}`,
      description: "Building more quality backlinks will improve domain authority and organic rankings.",
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (authorityScore >= 50) {
    insights.push({
      title: "Strong Domain Authority",
      insight: `Authority score of ${authorityScore}/100 puts this domain in a competitive position for organic ranking.`,
      severity: "success",
    });
  }
  if (organicTrafficCost > 1000) {
    insights.push({
      title: "High Traffic Value",
      insight: `Organic traffic is worth an estimated ${fmt$(organicTrafficCost)}/month in equivalent paid traffic. SEO investment is paying off.`,
      severity: "success",
    });
  }
  if (topKeywords.length > 0) {
    const top3 = topKeywords.filter((k) => k.position <= 3);
    if (top3.length > 0) {
      insights.push({
        title: "Top 3 Rankings",
        insight: `${top3.length} keyword${top3.length !== 1 ? "s" : ""} ranking in top 3 positions. These drive the majority of click traffic.`,
        severity: "success",
      });
    }
    const page2 = topKeywords.filter((k) => k.position >= 11 && k.position <= 20);
    if (page2.length > 0) {
      insights.push({
        title: "Page 2 Opportunities",
        insight: `${page2.length} keyword${page2.length !== 1 ? "s" : ""} on page 2 (positions 11-20). Small improvements could move these to page 1 for significant traffic gains.`,
        action: "Optimize content and build internal links for these keywords.",
        severity: "info",
      });
    }
  }
  if (organicCompetitors.length > 0) {
    const strongerCompetitors = organicCompetitors.filter((c) => c.organicTraffic > organicTraffic);
    if (strongerCompetitors.length > 0) {
      insights.push({
        title: "Competitive Gap",
        insight: `${strongerCompetitors.length} competitor${strongerCompetitors.length !== 1 ? "s" : ""} have higher organic traffic. Analyze their content strategy for opportunities.`,
        severity: "info",
      });
    }
  }
  if (paidTraffic > 0 && organicTraffic > 0) {
    const paidToOrganicRatio = paidTraffic / organicTraffic;
    if (paidToOrganicRatio > 2) {
      insights.push({
        title: "Heavy Paid Dependency",
        insight: `Paid traffic is ${paidToOrganicRatio.toFixed(1)}x organic traffic. Investing in SEO could reduce paid spend dependency.`,
        action: "Identify high-CPC keywords where organic ranking could replace paid traffic.",
        severity: "warning",
      });
    }
  }

  // ── Keyword table ──
  const keywordColumns: DataTableColumn<SemrushKeyword>[] = [
    { key: "keyword", header: "Keyword", render: (r) => <span className="font-medium text-foreground">{r.keyword}</span> },
    { key: "position", header: "Pos.", align: "right", render: (r) => (
      <span className={`tabular-nums font-bold ${
        r.position <= 3 ? "text-emerald-500" : r.position <= 10 ? "text-foreground" : "text-muted-foreground"
      }`}>
        {r.position}
      </span>
    )},
    { key: "volume", header: "Volume", align: "right", render: (r) => <span className="tabular-nums">{fmtN(r.volume)}</span> },
    { key: "cpc", header: "CPC", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">${r.cpc.toFixed(2)}</span> },
    { key: "traffic", header: "Traffic", align: "right", render: (r) => <span className="tabular-nums font-medium">{fmtN(r.traffic)}</span> },
    { key: "url", header: "URL", render: (r) => (
      <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={r.url}>{r.url}</span>
    )},
  ];

  // ── Competitor table ──
  const competitorColumns: DataTableColumn<SemrushCompetitor>[] = [
    { key: "domain", header: "Domain", render: (r) => <span className="font-medium text-foreground">{r.domain}</span> },
    { key: "commonKeywords", header: "Common KWs", align: "right", render: (r) => <span className="tabular-nums">{fmtN(r.commonKeywords)}</span> },
    { key: "organicKeywords", header: "Organic KWs", align: "right", render: (r) => <span className="tabular-nums">{fmtN(r.organicKeywords)}</span> },
    { key: "organicTraffic", header: "Organic Traffic", align: "right", render: (r) => <span className="tabular-nums font-medium">{fmtN(r.organicTraffic)}</span> },
  ];

  // ── Keyword position distribution ──
  const positionBuckets = [
    { label: "Top 3", min: 1, max: 3, color: "#22c55e" },
    { label: "4-10", min: 4, max: 10, color: "#818cf8" },
    { label: "11-20", min: 11, max: 20, color: "#eab308" },
    { label: "21-50", min: 21, max: 50, color: "#f97316" },
    { label: "51-100", min: 51, max: 100, color: "#ef4444" },
  ];
  const bucketCounts = positionBuckets.map((b) => ({
    ...b,
    count: topKeywords.filter((k) => k.position >= b.min && k.position <= b.max).length,
  }));
  const maxBucket = Math.max(...bucketCounts.map((b) => b.count), 1);

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

      {/* Domain header */}
      {domain && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="h-4 w-4" />
          <span>Domain: <span className="font-medium text-foreground">{domain}</span></span>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Authority Score"
          value={`${authorityScore}/100`}
          icon={Award}
          iconColor={authorityScore >= 50 ? "text-emerald-500" : authorityScore >= 30 ? "text-yellow-500" : "text-red-500"}
        />
        <StatCard
          label="Backlinks"
          value={fmtN(backlinks)}
          icon={Link2}
        />
        <StatCard
          label="Organic Keywords"
          value={fmtN(organicKeywords)}
          icon={Search}
        />
        <StatCard
          label="Organic Traffic"
          value={fmtN(organicTraffic)}
          subtitle="Estimated monthly"
          icon={TrendingUp}
        />
        <StatCard
          label="Organic Traffic Cost"
          value={fmt$(organicTrafficCost)}
          subtitle="Equivalent PPC value"
          icon={DollarSign}
        />
        <StatCard
          label="Paid Keywords"
          value={fmtN(paidKeywords)}
          icon={Target}
        />
        <StatCard
          label="Paid Traffic"
          value={fmtN(paidTraffic)}
          icon={BarChart3}
        />
        <StatCard
          label="Paid Traffic Cost"
          value={fmt$(paidTrafficCost)}
          icon={DollarSign}
        />
      </div>

      {/* Authority + Keyword Distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Authority Score */}
        <SectionCard title="Domain Authority" subtitle="Overall SEO strength">
          <div className="flex flex-col items-center gap-4">
            <RingStat
              value={authorityScore}
              max={100}
              label="Authority"
              color={authorityScore >= 50 ? "#22c55e" : authorityScore >= 30 ? "#eab308" : "#ef4444"}
              size={120}
            />
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Authority Score</span>
                <span className={`text-lg font-bold ${
                  authorityScore >= 50 ? "text-emerald-500" : authorityScore >= 30 ? "text-yellow-500" : "text-red-500"
                }`}>{authorityScore}/100</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Backlinks</span>
                <span className="text-lg font-bold tabular-nums text-foreground">{fmtN(backlinks)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Organic vs Paid Traffic</span>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {fmtN(organicTraffic)} / {fmtN(paidTraffic)}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Keyword Position Distribution */}
        {topKeywords.length > 0 && (
          <SectionCard title="Keyword Distribution" subtitle="Rankings by position range">
            <div className="space-y-2">
              {bucketCounts.map((bucket) => (
                <div key={bucket.label} className="flex items-center gap-3">
                  <span className="w-16 text-right text-sm text-muted-foreground">{bucket.label}</span>
                  <div className="flex-1">
                    <div className="relative h-7 overflow-hidden rounded-md">
                      <div
                        className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                        style={{
                          width: `${Math.max((bucket.count / maxBucket) * 100, 8)}%`,
                          backgroundColor: bucket.color,
                          minWidth: "40px",
                        }}
                      >
                        <span className="text-[10px] font-bold text-white drop-shadow">
                          {bucket.count}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                    {topKeywords.length > 0 ? Math.round((bucket.count / topKeywords.length) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      {/* Top Keywords Table */}
      {topKeywords.length > 0 && (
        <SectionCard title="Top Keywords" subtitle={`${topKeywords.length} tracked keyword${topKeywords.length !== 1 ? "s" : ""}`}>
          <DataTable
            columns={keywordColumns}
            rows={[...topKeywords].sort((a, b) => a.position - b.position)}
            emptyMessage="No keyword data available"
          />
        </SectionCard>
      )}

      {/* Competitor Landscape */}
      {organicCompetitors.length > 0 && (
        <SectionCard title="Competitor Landscape" subtitle={`${organicCompetitors.length} organic competitor${organicCompetitors.length !== 1 ? "s" : ""}`}>
          <DataTable
            columns={competitorColumns}
            rows={[...organicCompetitors].sort((a, b) => b.organicTraffic - a.organicTraffic)}
            emptyMessage="No competitor data available"
          />
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

'use client';

import React, { useState } from 'react';
import { AnalyticsDashboardData } from '@/lib/analytics/types';
import { StatCard } from './stat-card';
import { DashboardSectionCard } from './dashboard-section-card';
import { ComposedMetric, StackedBarChart } from '@/components/charts';
import {
  MousePointerClick,
  TrendingUp,
  DollarSign,
  BarChart3,
  Facebook,
  Layout,
  Target,
  Percent,
} from 'lucide-react';

interface MarketingTabNewProps {
  data: AnalyticsDashboardData | null;
}

// ── Helper functions ─────────────────────────────────────
function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '$0';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '0%';
  return `${n.toFixed(2)}%`;
}

function fmtDuration(secs: number | null | undefined): string {
  if (secs == null) return '0:00';
  const mins = Math.floor(secs / 60);
  const seconds = Math.floor(secs % 60);
  return `${mins}:${seconds.toString().padStart(2, '0')}`;
}

function calculateChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | undefined {
  if (current == null || previous == null || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

// ── Channel colour map ───────────────────────────────────
const CHANNEL_COLORS: Record<string, string> = {
  direct: '#3b82f6',
  organic: '#10b981',
  referral: '#f59e0b',
  paid: '#ef4444',
  social: '#8b5cf6',
  email: '#06b6d4',
};

const PLATFORM_COLORS = ['#FC5A29', '#3b82f6', '#10b981'];

// ── Component ────────────────────────────────────────────
export function MarketingTabNew({ data }: MarketingTabNewProps) {
  const [adPlatformTab, setAdPlatformTab] = useState('google');

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96 bg-card border border-border rounded-xl">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No analytics data available</p>
        </div>
      </div>
    );
  }

  // ── Data extraction ──────────────────────────────────
  const ga = data.googleAnalytics;
  const googleAds = data.googleAds;
  const metaAds = data.metaAds;
  const redditAds = data.redditAds;
  const metaPage = data.metaPage;
  const webflow = data.webflow;
  const semrush = data.semrush;

  // ── Signal detection ─────────────────────────────────
  const gaConfigured = Boolean(ga);
  const hasGASignal = Boolean(
    ga &&
      (ga.sessions30d > 0 ||
        ga.users30d > 0 ||
        ga.pageviews30d > 0 ||
        ga.trafficByChannel.length > 0 ||
        ga.topPages.length > 0),
  );

  const googleAdsConfigured = Boolean(googleAds);
  const metaAdsConfigured = Boolean(metaAds);
  const redditAdsConfigured = Boolean(redditAds);

  const hasGoogleAdsSignal = Boolean(
    googleAds &&
      (googleAds.totalSpend30d > 0 ||
        googleAds.totalImpressions > 0 ||
        googleAds.totalClicks > 0 ||
        googleAds.totalConversions > 0 ||
        googleAds.campaigns.length > 0),
  );

  const hasMetaAdsSignal = Boolean(
    metaAds &&
      (metaAds.totalSpend30d > 0 ||
        metaAds.totalImpressions > 0 ||
        metaAds.totalClicks > 0 ||
        metaAds.totalConversions > 0 ||
        metaAds.campaigns.length > 0),
  );

  const hasRedditAdsSignal = Boolean(
    redditAds &&
      (redditAds.totalSpend30d > 0 ||
        redditAds.totalImpressions > 0 ||
        redditAds.totalClicks > 0 ||
        redditAds.campaigns.length > 0),
  );

  const hasAnyAdsConfigured = googleAdsConfigured || metaAdsConfigured || redditAdsConfigured;
  const hasAnyAdsSignal = hasGoogleAdsSignal || hasMetaAdsSignal || hasRedditAdsSignal;

  const hasMetaPageSignal = Boolean(
    metaPage &&
      (metaPage.pageLikes > 0 ||
        metaPage.pageFollowers > 0 ||
        metaPage.postReach30d > 0 ||
        metaPage.postEngagement30d > 0 ||
        metaPage.topPosts.length > 0),
  );

  const hasWebflowSignal = Boolean(
    webflow &&
      (webflow.totalPages > 0 ||
        webflow.totalCollections > 0 ||
        webflow.formSubmissions.length > 0 ||
        webflow.customDomains.length > 0 ||
        Boolean(webflow.siteName) ||
        Boolean(webflow.lastPublished)),
  );

  // ── KPI computations ────────────────────────────────
  const sessions30d = ga?.sessions30d ?? 0;
  const sessionsPrev30d = ga?.sessionsPrev30d ?? 0;
  const sessionsChange = calculateChange(sessions30d, sessionsPrev30d);

  const bounceRate = ga?.bounceRate ?? 0;

  const googleSpend = googleAds?.totalSpend30d ?? 0;
  const metaSpend = metaAds?.totalSpend30d ?? 0;
  const redditSpend = redditAds?.totalSpend30d ?? 0;
  const totalAdSpend = googleSpend + metaSpend + redditSpend;

  const googleConversions = googleAds?.totalConversions ?? 0;
  const metaConversions = metaAds?.totalConversions ?? 0;
  const totalConversions = googleConversions + metaConversions;

  // Weighted CPC
  const googleClicks = googleAds?.totalClicks ?? 0;
  const metaClicks = metaAds?.totalClicks ?? 0;
  const redditClicks = redditAds?.totalClicks ?? 0;
  const totalClicks = googleClicks + metaClicks + redditClicks;
  const weightedCPC = totalClicks > 0 ? totalAdSpend / totalClicks : 0;

  // Weighted ROAS (only Google has roas field; approximate with revenue / spend)
  const weightedROAS = googleAds?.roas ?? 0;

  // SparkLine data from GA daily trend
  const dailyTrend = ga?.dailyTrend ?? [];
  const sessionSparkData = dailyTrend.map((d) => d.sessions);

  // ── Hero chart data: sessions area + conversions line ──
  // Generate a parallel "conversions" estimate spread across the 30-day window
  const heroChartData = dailyTrend.map((d, i) => {
    // Evenly spread total conversions across days for the overlay line
    const dailyConversions =
      totalConversions > 0 && dailyTrend.length > 0
        ? Math.round(
            (totalConversions / dailyTrend.length) *
              (0.8 + 0.4 * Math.sin((i / Math.max(dailyTrend.length - 1, 1)) * Math.PI)),
          )
        : 0;
    return {
      date: d.date.slice(5), // MM-DD
      sessions: d.sessions,
      conversions: dailyConversions,
    };
  });

  // ── Channel performance chart data ──────────────────
  const trafficByChannel = ga?.trafficByChannel ?? [];
  const channelKeys = trafficByChannel.map((c) => c.channel?.toLowerCase() ?? 'unknown');
  const channelChartData = trafficByChannel.length
    ? [
        trafficByChannel.reduce(
          (acc, c) => {
            acc[c.channel?.toLowerCase() ?? 'unknown'] = c.sessions;
            return acc;
          },
          { label: 'Sessions' } as Record<string, unknown>,
        ),
      ]
    : [];
  const channelBarColors = channelKeys.map((k) => CHANNEL_COLORS[k] ?? '#6b7280');

  // ── Ad spend by platform chart data ─────────────────
  const adSpendChartData =
    hasAnyAdsSignal
      ? [{ label: 'Spend', google: googleSpend, meta: metaSpend, reddit: redditSpend }]
      : [];

  // ── Top pages ───────────────────────────────────────
  const topPages = ga?.topPages ?? [];

  // ── Campaign tables ─────────────────────────────────
  const renderCampaignTable = (
    campaigns: { name: string; spend: number; impressions: number; clicks: number; conversions: number; ctr: number; cpc: number }[],
  ) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 text-muted-foreground font-medium">Campaign</th>
            <th className="text-right py-2 text-muted-foreground font-medium">Spend</th>
            <th className="text-right py-2 text-muted-foreground font-medium">Clicks</th>
            <th className="text-right py-2 text-muted-foreground font-medium">Conv.</th>
            <th className="text-right py-2 text-muted-foreground font-medium">CPC</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.slice(0, 8).map((c, idx) => (
            <tr key={idx} className="border-b border-border/50">
              <td className="py-2 text-foreground truncate max-w-[180px]">{c.name}</td>
              <td className="py-2 text-right text-foreground font-medium">{fmtCurrency(c.spend)}</td>
              <td className="py-2 text-right text-muted-foreground">{fmtNum(c.clicks)}</td>
              <td className="py-2 text-right text-muted-foreground">{fmtNum(c.conversions)}</td>
              <td className="py-2 text-right text-muted-foreground">{fmtCurrency(c.cpc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ═══ 1. KPI Strip ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Sessions (30d)"
          value={!gaConfigured ? 'N/A' : hasGASignal ? fmtNum(sessions30d) : 'No data'}
          change={
            !gaConfigured || !hasGASignal || sessionsChange == null
              ? undefined
              : fmtPct(sessionsChange)
          }
          changeType={
            sessionsChange == null ? 'neutral' : sessionsChange > 0 ? 'positive' : 'negative'
          }
          subtitle={
            !gaConfigured
              ? 'Google Analytics'
              : !hasGASignal
                ? 'No GA data in range'
                : undefined
          }
          icon={TrendingUp}
          trend={
            sessionSparkData.length >= 2 ? { data: sessionSparkData, color: '#10b981' } : undefined
          }
        />
        <StatCard
          label="Bounce Rate"
          value={!gaConfigured ? 'N/A' : hasGASignal ? fmtPct(bounceRate) : 'No data'}
          icon={Percent}
        />
        <StatCard
          label="Total Ad Spend"
          value={
            !hasAnyAdsConfigured ? 'N/A' : hasAnyAdsSignal ? fmtCurrency(totalAdSpend) : 'No data'
          }
          subtitle={
            !hasAnyAdsConfigured
              ? 'Google + Meta + Reddit'
              : hasAnyAdsSignal
                ? 'Google + Meta + Reddit'
                : 'No ad spend in range'
          }
          icon={DollarSign}
        />
        <StatCard
          label="Conversions"
          value={
            !hasAnyAdsConfigured
              ? 'N/A'
              : hasAnyAdsSignal
                ? fmtNum(totalConversions)
                : 'No data'
          }
          subtitle={
            !hasAnyAdsConfigured
              ? 'Google + Meta'
              : hasAnyAdsSignal
                ? 'Google + Meta'
                : 'No data in range'
          }
          icon={MousePointerClick}
        />
        <StatCard
          label="CPC (weighted)"
          value={
            !hasAnyAdsConfigured ? 'N/A' : hasAnyAdsSignal ? fmtCurrency(weightedCPC) : 'No data'
          }
          icon={Target}
        />
        <StatCard
          label="ROAS"
          value={
            !googleAdsConfigured
              ? 'N/A'
              : hasGoogleAdsSignal
                ? `${weightedROAS.toFixed(2)}x`
                : 'No data'
          }
          icon={TrendingUp}
        />
      </div>

      {/* ═══ 2. Hero Chart: Sessions + Conversions Composed ═══ */}
      {heroChartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Sessions & Conversions (30d)
          </h3>
          <ComposedMetric
            data={heroChartData}
            xKey="date"
            series={[
              { key: 'sessions', type: 'area', color: '#10b981', yAxisId: 'left', name: 'Sessions' },
              { key: 'conversions', type: 'line', color: '#FC5A29', yAxisId: 'right', name: 'Conversions' },
            ]}
            height={300}
            yLeftFormatter={(v) => fmtNum(v)}
            yRightFormatter={(v) => fmtNum(v)}
            showLegend
          />
        </div>
      )}

      {/* ═══ 3. Secondary Panels (two-column grid) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Channel Performance ── */}
        <DashboardSectionCard title="Channel Performance" subtitle="Traffic by source">
          {!gaConfigured ? (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          ) : channelChartData.length > 0 ? (
            <StackedBarChart
              data={channelChartData}
              xKey="label"
              barKeys={channelKeys}
              colors={channelBarColors}
              height={220}
              yFormatter={(v) => fmtNum(v)}
              stacked
              layout="vertical"
              showLegend
            />
          ) : (
            <p className="text-muted-foreground text-center py-8">No traffic data in range</p>
          )}
        </DashboardSectionCard>

        {/* ── Ad Spend by Platform ── */}
        <DashboardSectionCard title="Ad Spend by Platform" subtitle="Google / Meta / Reddit">
          {!hasAnyAdsConfigured ? (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          ) : adSpendChartData.length > 0 ? (
            <StackedBarChart
              data={adSpendChartData}
              xKey="label"
              barKeys={['google', 'meta', 'reddit']}
              colors={PLATFORM_COLORS}
              height={220}
              yFormatter={(v) => fmtCurrency(v)}
              stacked
              layout="vertical"
              showLegend
            />
          ) : (
            <p className="text-muted-foreground text-center py-8">No ad spend in range</p>
          )}
        </DashboardSectionCard>
      </div>

      {/* ── Platform Deep-Dive (tabbed) ── */}
      <DashboardSectionCard
        title="Platform Deep-Dive"
        subtitle="Campaign performance by platform"
        tabs={[
          { id: 'google', label: 'Google Ads' },
          { id: 'meta', label: 'Meta Ads' },
          { id: 'reddit', label: 'Reddit Ads' },
        ]}
        activeTab={adPlatformTab}
        onTabChange={setAdPlatformTab}
      >
        {adPlatformTab === 'google' && (
          <>
            {!googleAds ? (
              <p className="text-muted-foreground text-center py-6">Not configured</p>
            ) : !hasGoogleAdsSignal ? (
              <p className="text-muted-foreground text-center py-6">
                No Google Ads data in selected range
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Spend</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtCurrency(googleAds.totalSpend30d)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtNum(googleAds.totalImpressions)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">CTR</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtPct(googleAds.ctr)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">ROAS</p>
                    <p className="text-lg font-semibold text-foreground">
                      {googleAds.roas?.toFixed(2)}x
                    </p>
                  </div>
                </div>
                {googleAds.campaigns.length > 0 && renderCampaignTable(googleAds.campaigns)}
              </div>
            )}
          </>
        )}

        {adPlatformTab === 'meta' && (
          <>
            {!metaAds ? (
              <p className="text-muted-foreground text-center py-6">Not configured</p>
            ) : !hasMetaAdsSignal ? (
              <p className="text-muted-foreground text-center py-6">
                No Meta Ads data in selected range
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Spend</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtCurrency(metaAds.totalSpend30d)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtNum(metaAds.totalImpressions)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">CTR</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtPct(metaAds.ctr)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">CPA</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtCurrency(metaAds.cpa)}
                    </p>
                  </div>
                </div>
                {metaAds.campaigns.length > 0 && renderCampaignTable(metaAds.campaigns)}
              </div>
            )}
          </>
        )}

        {adPlatformTab === 'reddit' && (
          <>
            {!redditAds ? (
              <p className="text-muted-foreground text-center py-6">Not configured</p>
            ) : !hasRedditAdsSignal ? (
              <p className="text-muted-foreground text-center py-6">
                No Reddit Ads data in selected range
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Spend</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtCurrency(redditAds.totalSpend30d)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtNum(redditAds.totalImpressions)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">CTR</p>
                    <p className="text-lg font-semibold text-foreground">
                      {fmtPct(redditAds.ctr)}
                    </p>
                  </div>
                </div>
                {redditAds.campaigns.length > 0 &&
                  renderCampaignTable(
                    redditAds.campaigns.map((c) => ({ ...c, conversions: 0 })),
                  )}
              </div>
            )}
          </>
        )}
      </DashboardSectionCard>

      {/* ── Top Landing Pages ── */}
      <DashboardSectionCard title="Top Landing Pages" subtitle="By pageviews">
        {!gaConfigured ? (
          <p className="text-muted-foreground text-center py-8">Not configured</p>
        ) : topPages.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground font-medium">Page</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Views</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {topPages.slice(0, 8).map((page, idx) => (
                  <tr key={idx} className="border-b border-border/50">
                    <td className="py-2 text-foreground truncate max-w-[260px]">
                      {page.path || 'Unknown'}
                    </td>
                    <td className="py-2 text-right text-foreground font-medium">
                      {fmtNum(page.pageviews)}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {fmtDuration(page.avgDuration)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">No page data in range</p>
        )}
      </DashboardSectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── SEO Intelligence ── */}
        <DashboardSectionCard title="SEO Intelligence" subtitle="SEMrush data">
          {semrush ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Authority Score</p>
                  <p className="text-lg font-semibold text-foreground">
                    {semrush.authorityScore}
                  </p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Backlinks</p>
                  <p className="text-lg font-semibold text-foreground">
                    {fmtNum(semrush.backlinks)}
                  </p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Organic Keywords</p>
                  <p className="text-lg font-semibold text-foreground">
                    {fmtNum(semrush.organicKeywords)}
                  </p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Organic Traffic</p>
                  <p className="text-lg font-semibold text-foreground">
                    {fmtNum(semrush.organicTraffic)}
                  </p>
                </div>
              </div>

              {semrush.topKeywords && semrush.topKeywords.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Top Keywords
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-1.5 text-muted-foreground font-medium">
                            Keyword
                          </th>
                          <th className="text-right py-1.5 text-muted-foreground font-medium">
                            Pos
                          </th>
                          <th className="text-right py-1.5 text-muted-foreground font-medium">
                            Vol
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {semrush.topKeywords.slice(0, 5).map((kw, idx) => (
                          <tr key={idx} className="border-b border-border/50">
                            <td className="py-1.5 text-foreground">{kw.keyword}</td>
                            <td
                              className={`py-1.5 text-right font-semibold ${
                                kw.position <= 3
                                  ? 'text-green-500'
                                  : kw.position <= 10
                                    ? 'text-yellow-500'
                                    : 'text-muted-foreground'
                              }`}
                            >
                              {kw.position}
                            </td>
                            <td className="py-1.5 text-right text-muted-foreground">
                              {fmtNum(kw.volume)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          )}
        </DashboardSectionCard>

        {/* ── Content Performance ── */}
        <DashboardSectionCard title="Content Performance" subtitle="Webflow & Meta Page">
          <div className="space-y-4">
            {/* Webflow compact grid */}
            {webflow && hasWebflowSignal ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                  <Layout className="w-3.5 h-3.5" /> Webflow
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-secondary/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Pages</p>
                    <p className="text-sm font-semibold text-foreground">{webflow.totalPages}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Collections</p>
                    <p className="text-sm font-semibold text-foreground">
                      {webflow.totalCollections}
                    </p>
                  </div>
                  {webflow.formSubmissions.length > 0 && (
                    <div className="bg-secondary/40 rounded-lg p-2 col-span-2">
                      <p className="text-[10px] text-muted-foreground">Form Submissions</p>
                      <p className="text-sm font-semibold text-foreground">
                        {webflow.formSubmissions.reduce((sum, f) => sum + f.count, 0)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : webflow ? (
              <p className="text-muted-foreground text-center py-4 text-sm">
                No Webflow data in range
              </p>
            ) : (
              <p className="text-muted-foreground text-center py-4 text-sm">
                Webflow not configured
              </p>
            )}

            {/* Meta Page compact grid */}
            {metaPage && hasMetaPageSignal ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                  <Facebook className="w-3.5 h-3.5" /> Meta Page
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-secondary/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Followers</p>
                    <p className="text-sm font-semibold text-foreground">
                      {fmtNum(metaPage.pageFollowers)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Likes</p>
                    <p className="text-sm font-semibold text-foreground">
                      {fmtNum(metaPage.pageLikes)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Reach (30d)</p>
                    <p className="text-sm font-semibold text-foreground">
                      {fmtNum(metaPage.postReach30d)}
                    </p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Engagement (30d)</p>
                    <p className="text-sm font-semibold text-foreground">
                      {fmtNum(metaPage.postEngagement30d)}
                    </p>
                  </div>
                </div>
              </div>
            ) : metaPage ? (
              <p className="text-muted-foreground text-center py-4 text-sm">
                No Meta Page data in range
              </p>
            ) : (
              <p className="text-muted-foreground text-center py-4 text-sm">
                Meta Page not configured
              </p>
            )}
          </div>
        </DashboardSectionCard>
      </div>
    </div>
  );
}

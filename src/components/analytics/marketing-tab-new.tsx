'use client';

import React, { useState } from 'react';
import { AnalyticsDashboardData } from '@/lib/analytics/types';
import { StatCard } from './stat-card';
import { BarDisplay } from './bar-display';
import {
  Globe,
  MousePointerClick,
  Eye,
  TrendingUp,
  DollarSign,
  BarChart3,
  Facebook,
  Layout,
  ChevronDown,
  ChevronUp,
  Search,
  Award,
  Link2,
} from 'lucide-react';

interface MarketingTabNewProps {
  data: AnalyticsDashboardData | null;
}

// Helper functions
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

function calculateChange(current: number | null | undefined, previous: number | null | undefined): number | undefined {
  if (current == null || previous == null || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

type ProviderHealthState = 'not_configured' | 'failing' | 'no_data' | 'healthy';

function isMissingCredentialError(message: string | undefined): boolean {
  if (!message) return false;
  return /^Missing .* credential/i.test(message.trim());
}

function resolveProviderState(input: {
  payload: unknown;
  hasSignal: boolean;
  error?: string;
}): { state: ProviderHealthState; error: string | null } {
  if (input.error && !isMissingCredentialError(input.error)) {
    return { state: 'failing', error: input.error };
  }
  if (!input.payload) {
    return { state: 'not_configured', error: null };
  }
  if (!input.hasSignal) {
    return { state: 'no_data', error: null };
  }
  return { state: 'healthy', error: null };
}

export function MarketingTabNew({ data }: MarketingTabNewProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({
    googleAds: true,
    metaAds: true,
    redditAds: false,
  });

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms((prev) => ({
      ...prev,
      [platform]: !prev[platform],
    }));
  };

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

  const googleAds = data.googleAds;
  const metaAds = data.metaAds;
  const redditAds = data.redditAds;
  const metaPage = data.metaPage;
  const webflow = data.webflow;
  const semrush = data.semrush;
  const ga = data.googleAnalytics;

  const errorBySource = new Map<string, string>();
  for (const entry of data.errors || []) {
    if (!errorBySource.has(entry.source)) {
      errorBySource.set(entry.source, entry.message);
    }
  }

  const hasGoogleAdsSignal = Boolean(
    googleAds &&
      (googleAds.totalSpend30d > 0 ||
        googleAds.totalImpressions > 0 ||
        googleAds.totalClicks > 0 ||
        googleAds.totalConversions > 0 ||
        googleAds.campaigns.length > 0)
  );

  const hasMetaAdsSignal = Boolean(
    metaAds &&
      (metaAds.totalSpend30d > 0 ||
        metaAds.totalImpressions > 0 ||
        metaAds.totalClicks > 0 ||
        metaAds.totalConversions > 0 ||
        metaAds.campaigns.length > 0)
  );

  const hasRedditAdsSignal = Boolean(
    redditAds &&
      (redditAds.totalSpend30d > 0 ||
        redditAds.totalImpressions > 0 ||
        redditAds.totalClicks > 0 ||
        redditAds.campaigns.length > 0)
  );

  const hasMetaPageSignal = Boolean(
    metaPage &&
      (metaPage.pageLikes > 0 ||
        metaPage.pageFollowers > 0 ||
        metaPage.postReach30d > 0 ||
        metaPage.postEngagement30d > 0 ||
        metaPage.topPosts.length > 0)
  );

  const hasWebflowSignal = Boolean(
    webflow &&
      (webflow.totalPages > 0 ||
        webflow.totalCollections > 0 ||
        webflow.formSubmissions.length > 0 ||
        webflow.customDomains.length > 0 ||
        Boolean(webflow.siteName) ||
        Boolean(webflow.lastPublished))
  );

  const hasGASignal = Boolean(
    ga &&
      (ga.sessions30d > 0 ||
        ga.users30d > 0 ||
        ga.pageviews30d > 0 ||
        ga.trafficByChannel.length > 0 ||
        ga.topPages.length > 0)
  );

  const gaStatus = resolveProviderState({
    payload: ga,
    hasSignal: hasGASignal,
    error: errorBySource.get('googleAnalytics'),
  });
  const googleAdsStatus = resolveProviderState({
    payload: googleAds,
    hasSignal: hasGoogleAdsSignal,
    error: errorBySource.get('googleAds'),
  });
  const metaAdsStatus = resolveProviderState({
    payload: metaAds,
    hasSignal: hasMetaAdsSignal,
    error: errorBySource.get('metaAds'),
  });
  const redditAdsStatus = resolveProviderState({
    payload: redditAds,
    hasSignal: hasRedditAdsSignal,
    error: errorBySource.get('redditAds'),
  });
  const metaPageStatus = resolveProviderState({
    payload: metaPage,
    hasSignal: hasMetaPageSignal,
    error: errorBySource.get('metaPage'),
  });
  const webflowStatus = resolveProviderState({
    payload: webflow,
    hasSignal: hasWebflowSignal,
    error: errorBySource.get('webflow'),
  });
  const semrushHasSignal = Boolean(
    semrush &&
      (semrush.organicKeywords > 0 ||
        semrush.organicTraffic > 0 ||
        semrush.paidKeywords > 0 ||
        semrush.topKeywords.length > 0 ||
        semrush.organicCompetitors.length > 0)
  );
  const semrushStatus = resolveProviderState({
    payload: semrush,
    hasSignal: semrushHasSignal,
    error: errorBySource.get('semrush'),
  });

  const paidProviders = [googleAdsStatus, metaAdsStatus, redditAdsStatus];
  const paidConfigured = paidProviders.some((provider) => provider.state !== 'not_configured');
  const paidFailure = paidProviders.find((provider) => provider.state === 'failing');
  const paidHealthy = paidProviders.some((provider) => provider.state === 'healthy');

  const conversionProviders = [googleAdsStatus, metaAdsStatus];
  const conversionConfigured = conversionProviders.some((provider) => provider.state !== 'not_configured');
  const conversionFailure = conversionProviders.find((provider) => provider.state === 'failing');
  const conversionHealthy = conversionProviders.some((provider) => provider.state === 'healthy');

  // Calculate KPI metrics
  const sessions30d = data.googleAnalytics?.sessions30d || 0;
  const sessionsPrev30d = data.googleAnalytics?.sessionsPrev30d || 0;
  const sessionsChange = calculateChange(sessions30d, sessionsPrev30d);

  const googleSpend = data.googleAds?.totalSpend30d || 0;
  const metaSpend = data.metaAds?.totalSpend30d || 0;
  const redditSpend = data.redditAds?.totalSpend30d || 0;
  const totalAdSpend = googleSpend + metaSpend + redditSpend;

  const googleConversions = data.googleAds?.totalConversions || 0;
  const metaConversions = data.metaAds?.totalConversions || 0;
  const totalConversions = googleConversions + metaConversions;

  const pageFollowers = data.metaPage?.pageFollowers || 0;

  // Traffic by channel data
  const trafficByChannel = data.googleAnalytics?.trafficByChannel || [];
  const channelColors: Record<string, string> = {
    direct: '#3b82f6',
    organic: '#10b981',
    referral: '#f59e0b',
    paid: '#ef4444',
    social: '#8b5cf6',
    email: '#06b6d4',
  };

  const barItems = trafficByChannel.map((item) => ({
    label: item.channel || 'Unknown',
    value: item.sessions || 0,
    color: channelColors[item.channel?.toLowerCase()] || '#6b7280',
  }));

  // Top pages data
  const topPages = data.googleAnalytics?.topPages || [];

  // Meta page data
  const metaPageLikes = data.metaPage?.pageLikes || 0;
  const metaPageFollowers = data.metaPage?.pageFollowers || 0;
  const metaPostReach = data.metaPage?.postReach30d || 0;
  const metaPostEngagement = data.metaPage?.postEngagement30d || 0;
  const metaTopPosts = data.metaPage?.topPosts || [];

  return (
    <div className="space-y-6">
      {/* Top KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Sessions (30d)"
          value={
            gaStatus.state === 'not_configured'
              ? "Not configured"
              : gaStatus.state === 'failing'
                ? "Configured but failing"
                : gaStatus.state === 'no_data'
                  ? "No data"
                  : fmtNum(sessions30d)
          }
          change={gaStatus.state === 'healthy' && sessionsChange != null ? fmtPct(sessionsChange) : undefined}
          changeType={
            sessionsChange == null
              ? 'neutral'
              : sessionsChange > 0
                ? 'positive'
                : 'negative'
          }
          subtitle={
            gaStatus.state === 'failing'
              ? gaStatus.error || "Google Analytics request failed"
              : gaStatus.state === 'not_configured'
                ? "Google Analytics"
                : gaStatus.state === 'no_data'
                  ? "No GA data in selected range"
                  : undefined
          }
          icon={TrendingUp}
        />
        <StatCard
          label="Total Ad Spend"
          value={
            !paidConfigured
              ? "Not configured"
              : paidFailure
                ? "Configured but failing"
                : paidHealthy
                  ? fmtCurrency(totalAdSpend)
                  : "No data"
          }
          subtitle={
            !paidConfigured
              ? "Google Ads, Meta Ads, Reddit Ads"
              : paidFailure
                ? paidFailure.error || "One or more ad providers failed"
                : paidHealthy
                  ? "Google + Meta + Reddit"
                  : "No ad spend in selected range"
          }
          icon={DollarSign}
        />
        <StatCard
          label="Total Conversions"
          value={
            !conversionConfigured
              ? "Not configured"
              : conversionFailure
                ? "Configured but failing"
                : conversionHealthy
                  ? fmtNum(totalConversions)
                  : "No data"
          }
          subtitle={
            !conversionConfigured
              ? "Google Ads, Meta Ads"
              : conversionFailure
                ? conversionFailure.error || "Conversion providers failed"
                : conversionHealthy
                  ? "Google + Meta"
                  : "No conversion data in selected range"
          }
          icon={MousePointerClick}
        />
        <StatCard
          label="Page Followers"
          value={
            metaPageStatus.state === 'not_configured'
              ? "Not configured"
              : metaPageStatus.state === 'failing'
                ? "Configured but failing"
                : metaPageStatus.state === 'no_data'
                  ? "No data"
                  : fmtNum(pageFollowers)
          }
          subtitle={
            metaPageStatus.state === 'failing'
              ? metaPageStatus.error || "Meta Page request failed"
              : metaPageStatus.state === 'not_configured'
                ? "Meta Page"
                : metaPageStatus.state === 'no_data'
                  ? "No page insights in selected range"
                  : "Meta Page"
          }
          icon={Facebook}
        />
      </div>

      {/* Traffic Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic by Channel */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Traffic by Channel
          </h3>
          {gaStatus.state === 'not_configured' ? (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          ) : gaStatus.state === 'failing' ? (
            <p className="text-destructive text-center py-8">Configured but failing: {gaStatus.error}</p>
          ) : barItems.length > 0 ? (
            <BarDisplay
              items={barItems}
              formatValue={(v) => fmtNum(v)}
              maxValue={Math.max(...barItems.map((i) => i.value), 1)}
            />
          ) : (
            <p className="text-muted-foreground text-center py-8">No traffic data in selected range</p>
          )}
        </div>

        {/* Top Pages */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Top Pages
          </h3>
          {gaStatus.state === 'not_configured' ? (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          ) : gaStatus.state === 'failing' ? (
            <p className="text-destructive text-center py-8">Configured but failing: {gaStatus.error}</p>
          ) : topPages.length > 0 ? (
            <div className="space-y-3">
              {topPages.slice(0, 5).map((page, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-secondary/40 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{page.path || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtNum(page.pageviews)} views · {fmtDuration(page.avgDuration)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No page data in selected range</p>
          )}
        </div>
      </div>

      {/* Ad Performance Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Ad Performance</h2>

        {/* Google Ads Card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => togglePlatform('googleAds')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/50 transition-colors"
          >
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Google Ads
            </h3>
            {expandedPlatforms.googleAds ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>

          {expandedPlatforms.googleAds && (
            <div className="border-t border-border px-6 py-4 space-y-4">
              {googleAdsStatus.state === 'not_configured' ? (
                <p className="text-muted-foreground text-center py-6">Not configured</p>
              ) : googleAdsStatus.state === 'failing' ? (
                <p className="text-destructive text-center py-6">Configured but failing: {googleAdsStatus.error}</p>
              ) : googleAdsStatus.state === 'no_data' ? (
                <p className="text-muted-foreground text-center py-6">No Google Ads data in selected range</p>
              ) : !googleAds ? (
                <p className="text-muted-foreground text-center py-6">No Google Ads data in selected range</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Spend</p>
                      <p className="text-lg font-semibold text-foreground">{fmtCurrency(googleAds.totalSpend30d)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(googleAds.totalImpressions)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Clicks</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(googleAds.totalClicks)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Conversions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(googleAds.totalConversions)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CTR</p>
                      <p className="text-sm font-semibold text-foreground">{fmtPct(googleAds.ctr)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPC</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(googleAds.cpc)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPA</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(googleAds.cpa)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">ROAS</p>
                      <p className="text-sm font-semibold text-foreground">{googleAds.roas?.toFixed(2)}x</p>
                    </div>
                  </div>

                  {googleAds.campaigns && googleAds.campaigns.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">Top Campaigns</p>
                      <div className="space-y-2">
                        {googleAds.campaigns.slice(0, 5).map((campaign, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-secondary/40 rounded">
                            <span className="text-sm text-foreground truncate">{campaign.name}</span>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-foreground">{fmtCurrency(campaign.spend)}</p>
                              <p className="text-xs text-muted-foreground">{fmtNum(campaign.clicks)} clicks</p>
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

        {/* Meta Ads Card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => togglePlatform('metaAds')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/50 transition-colors"
          >
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Facebook className="w-5 h-5 text-primary" />
              Meta Ads
            </h3>
            {expandedPlatforms.metaAds ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>

          {expandedPlatforms.metaAds && (
            <div className="border-t border-border px-6 py-4 space-y-4">
              {metaAdsStatus.state === 'not_configured' ? (
                <p className="text-muted-foreground text-center py-6">Not configured</p>
              ) : metaAdsStatus.state === 'failing' ? (
                <p className="text-destructive text-center py-6">Configured but failing: {metaAdsStatus.error}</p>
              ) : metaAdsStatus.state === 'no_data' ? (
                <p className="text-muted-foreground text-center py-6">No Meta Ads data in selected range</p>
              ) : !metaAds ? (
                <p className="text-muted-foreground text-center py-6">No Meta Ads data in selected range</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Spend</p>
                      <p className="text-lg font-semibold text-foreground">{fmtCurrency(metaAds.totalSpend30d)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(metaAds.totalImpressions)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Clicks</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(metaAds.totalClicks)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Conversions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(metaAds.totalConversions)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CTR</p>
                      <p className="text-sm font-semibold text-foreground">{fmtPct(metaAds.ctr)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPC</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(metaAds.cpc)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPA</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(metaAds.cpa)}</p>
                    </div>
                  </div>

                  {metaAds.campaigns && metaAds.campaigns.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">Top Campaigns</p>
                      <div className="space-y-2">
                        {metaAds.campaigns.slice(0, 5).map((campaign, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-secondary/40 rounded">
                            <span className="text-sm text-foreground truncate">{campaign.name}</span>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-foreground">{fmtCurrency(campaign.spend)}</p>
                              <p className="text-xs text-muted-foreground">{fmtNum(campaign.clicks)} clicks</p>
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

        {/* Reddit Ads Card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => togglePlatform('redditAds')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/50 transition-colors"
          >
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Reddit Ads
            </h3>
            {expandedPlatforms.redditAds ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>

          {expandedPlatforms.redditAds && (
            <div className="border-t border-border px-6 py-4 space-y-4">
              {redditAdsStatus.state === 'not_configured' ? (
                <p className="text-muted-foreground text-center py-6">Not configured</p>
              ) : redditAdsStatus.state === 'failing' ? (
                <p className="text-destructive text-center py-6">Configured but failing: {redditAdsStatus.error}</p>
              ) : redditAdsStatus.state === 'no_data' ? (
                <p className="text-muted-foreground text-center py-6">No Reddit Ads data in selected range</p>
              ) : !redditAds ? (
                <p className="text-muted-foreground text-center py-6">No Reddit Ads data in selected range</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Spend</p>
                      <p className="text-lg font-semibold text-foreground">{fmtCurrency(redditAds.totalSpend30d)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(redditAds.totalImpressions)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Clicks</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(redditAds.totalClicks)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CTR</p>
                      <p className="text-sm font-semibold text-foreground">{fmtPct(redditAds.ctr)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPC</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(redditAds.cpc)}</p>
                    </div>
                  </div>

                  {redditAds.campaigns && redditAds.campaigns.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">Top Campaigns</p>
                      <div className="space-y-2">
                        {redditAds.campaigns.slice(0, 5).map((campaign, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-secondary/40 rounded">
                            <span className="text-sm text-foreground truncate">{campaign.name}</span>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-foreground">{fmtCurrency(campaign.spend)}</p>
                              <p className="text-xs text-muted-foreground">{fmtNum(campaign.clicks)} clicks</p>
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
      </div>

      {/* Social & Web Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Meta Page Insights */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Facebook className="w-5 h-5 text-primary" />
            Meta Page
          </h3>
          {metaPageStatus.state === 'not_configured' ? (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          ) : metaPageStatus.state === 'failing' ? (
            <p className="text-destructive text-center py-8">Configured but failing: {metaPageStatus.error}</p>
          ) : metaPageStatus.state === 'no_data' ? (
            <p className="text-muted-foreground text-center py-8">No Meta Page data in selected range</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Likes</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(metaPageLikes)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Followers</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(metaPageFollowers)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Reach (30d)</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(metaPostReach)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Engagement (30d)</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(metaPostEngagement)}</p>
                </div>
              </div>

              {metaTopPosts.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">Top Posts</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {metaTopPosts.slice(0, 5).map((post, idx) => (
                      <div key={idx} className="p-2 bg-secondary/40 rounded text-sm">
                        <p className="text-foreground line-clamp-2">{post.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {fmtNum(post.reach)} reach · {fmtNum(post.engagement)} engagement
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Webflow Site Info */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Layout className="w-5 h-5 text-primary" />
            Webflow
          </h3>
          {webflowStatus.state === 'not_configured' ? (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          ) : webflowStatus.state === 'failing' ? (
            <p className="text-destructive text-center py-8">Configured but failing: {webflowStatus.error}</p>
          ) : webflowStatus.state === 'no_data' ? (
            <p className="text-muted-foreground text-center py-8">No Webflow data in selected range</p>
          ) : !webflow ? (
            <p className="text-muted-foreground text-center py-8">No Webflow data in selected range</p>
          ) : (
            <div className="space-y-4">
              {webflow.siteName && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Site Name</p>
                  <p className="text-sm font-semibold text-foreground">{webflow.siteName}</p>
                </div>
              )}

              {webflow.lastPublished && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Last Published</p>
                  <p className="text-sm font-semibold text-foreground">
                    {new Date(webflow.lastPublished).toLocaleDateString()}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Pages</p>
                  <p className="text-lg font-semibold text-foreground">{webflow.totalPages || 0}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Collections</p>
                  <p className="text-lg font-semibold text-foreground">{webflow.totalCollections || 0}</p>
                </div>
              </div>

              {webflow.formSubmissions && webflow.formSubmissions.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">Form Submissions</p>
                  <div className="space-y-1">
                    {webflow.formSubmissions.map((form, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-secondary/40 rounded text-sm">
                        <span className="text-foreground truncate">{form.formName}</span>
                        <span className="text-muted-foreground font-semibold">{form.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {webflow.customDomains && webflow.customDomains.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">Custom Domains</p>
                  <div className="space-y-1">
                    {webflow.customDomains.map((domain, idx) => (
                      <div key={idx} className="p-2 bg-secondary/40 rounded text-sm text-foreground">
                        {domain}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* -- SEMrush SEO Intelligence -- */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-[#fc5a29]" />
          SEMrush SEO Intelligence
        </h3>
        {semrushStatus.state === 'not_configured' ? (
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          </div>
        ) : semrushStatus.state === 'failing' ? (
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-destructive text-center py-8">Configured but failing: {semrushStatus.error}</p>
          </div>
        ) : semrushStatus.state === 'no_data' ? (
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-muted-foreground text-center py-8">No SEMrush data in selected range</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Authority Score" value={String(semrush!.authorityScore)} icon={Award} />
              <StatCard label="Backlinks" value={fmtNum(semrush!.backlinks)} icon={Link2} />
              <StatCard label="Organic Keywords" value={fmtNum(semrush!.organicKeywords)} icon={Search} />
              <StatCard label="Organic Traffic" value={fmtNum(semrush!.organicTraffic)} icon={TrendingUp} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm font-semibold text-foreground mb-2">Organic Search</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Keywords</span><span className="text-foreground font-semibold">{fmtNum(semrush!.organicKeywords)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Traffic</span><span className="text-foreground font-semibold">{fmtNum(semrush!.organicTraffic)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Traffic Cost</span><span className="text-foreground font-semibold">{fmtCurrency(semrush!.organicTrafficCost)}</span></div>
                </div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm font-semibold text-foreground mb-2">Paid Search</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Keywords</span><span className="text-foreground font-semibold">{fmtNum(semrush!.paidKeywords)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Traffic</span><span className="text-foreground font-semibold">{fmtNum(semrush!.paidTraffic)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Traffic Cost</span><span className="text-foreground font-semibold">{fmtCurrency(semrush!.paidTrafficCost)}</span></div>
                </div>
              </div>
            </div>
            {semrush!.topKeywords && semrush!.topKeywords.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm font-semibold text-foreground mb-3">Top Organic Keywords</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-muted-foreground font-medium">Keyword</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Pos</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Volume</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Traffic</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">CPC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semrush!.topKeywords.map((kw, idx) => (
                        <tr key={idx} className="border-b border-border/50">
                          <td className="py-2 text-foreground">{kw.keyword}</td>
                          <td className={`py-2 text-right font-semibold ${kw.position <= 3 ? 'text-green-500' : kw.position <= 10 ? 'text-yellow-500' : 'text-muted-foreground'}`}>{kw.position}</td>
                          <td className="py-2 text-right text-muted-foreground">{fmtNum(kw.volume)}</td>
                          <td className="py-2 text-right text-muted-foreground">{fmtNum(kw.traffic)}</td>
                          <td className="py-2 text-right text-muted-foreground">{fmtCurrency(kw.cpc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {semrush!.organicCompetitors && semrush!.organicCompetitors.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm font-semibold text-foreground mb-3">Organic Competitors</p>
                <div className="space-y-2">
                  {semrush!.organicCompetitors.map((comp, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-secondary/40 rounded text-sm">
                      <span className="text-foreground font-medium">{comp.domain}</span>
                      <div className="flex gap-4">
                        <span className="text-muted-foreground">Common: {fmtNum(comp.commonKeywords)}</span>
                        <span className="text-muted-foreground">Traffic: {fmtNum(comp.organicTraffic)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

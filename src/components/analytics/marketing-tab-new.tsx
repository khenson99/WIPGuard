'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { AnalyticsDashboardData } from '@/lib/analytics/types';
import { StatCard } from './stat-card';
import { BarDisplay } from './bar-display';
import ChannelTable from './channel-table';
import { AiInsightsPanel } from './ai-insights-panel';
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
  Instagram,
  ArrowRight,
  TrendingDown,
  Minus,
} from 'lucide-react';

interface MarketingTabNewProps {
  data: AnalyticsDashboardData | null;
  variant?: 'website-traffic' | 'social-media';
}

/**
 * Single click-through KPI tile that highlights how the Free Kanban Generator
 * whitepaper landing page is performing on bounce rate vs. the site average.
 *
 * Sits at the top of the website-traffic overview so the operator catches
 * engagement issues on the highest-volume marketing asset before drilling
 * into channel-by-channel detail.
 */
function KanbanBounceSpotlight({
  comparison,
}: {
  comparison: NonNullable<AnalyticsDashboardData['googleAnalytics']>['kanbanBounceComparison'];
}) {
  if (!comparison) return null;
  const {
    kanbanBounceRate,
    siteBounceRate,
    deltaVsSitePts,
    periodDeltaPts,
    verdict,
    matchedPaths,
    kanbanSessions,
  } = comparison;

  const fmtPctFrac = (frac: number) => `${(frac * 100).toFixed(1)}%`;
  const fmtPts = (pts: number) =>
    `${pts >= 0 ? '+' : ''}${pts.toFixed(1)}pt${Math.abs(pts) === 1 ? '' : 's'}`;

  const Icon = verdict === 'better' ? TrendingDown : verdict === 'worse' ? TrendingUp : Minus;
  const accentClass =
    verdict === 'better'
      ? 'border-emerald-500/40 bg-emerald-500/5'
      : verdict === 'worse'
        ? 'border-red-500/40 bg-red-500/5'
        : 'border-border bg-card';
  const iconClass =
    verdict === 'better'
      ? 'text-emerald-500'
      : verdict === 'worse'
        ? 'text-red-500'
        : 'text-muted-foreground';
  const headline =
    verdict === 'better'
      ? 'Kanban whitepaper outperforming site'
      : verdict === 'worse'
        ? 'Kanban whitepaper bouncing harder than site'
        : 'Kanban whitepaper on par with site';
  const matchedSummary =
    matchedPaths.length === 1
      ? matchedPaths[0]
      : `${matchedPaths.length} Kanban paths`;

  return (
    <Link
      href="/analytics/ads-coda-kanban"
      className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-secondary/30 ${accentClass}`}
      data-testid="kanban-bounce-spotlight"
    >
      <div className={`rounded-lg bg-background/60 p-2 ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{headline}</p>
        <p className="text-xs text-muted-foreground">
          {matchedSummary} • {kanbanSessions.toLocaleString()} sessions
        </p>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Bounce
          </p>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {fmtPctFrac(kanbanBounceRate)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            vs Site ({fmtPctFrac(siteBounceRate)})
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              deltaVsSitePts < 0
                ? 'text-emerald-500'
                : deltaVsSitePts > 0
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }`}
          >
            {fmtPts(deltaVsSitePts)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            vs Prior 30d
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              typeof periodDeltaPts !== 'number'
                ? 'text-muted-foreground'
                : periodDeltaPts < 0
                  ? 'text-emerald-500'
                  : periodDeltaPts > 0
                    ? 'text-red-500'
                    : 'text-muted-foreground'
            }`}
          >
            {typeof periodDeltaPts === 'number' ? fmtPts(periodDeltaPts) : '—'}
          </p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
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
  connected?: boolean;
  error?: string;
}): { state: ProviderHealthState; error: string | null } {
  if (input.payload && input.hasSignal) {
    return { state: 'healthy', error: null };
  }
  if (input.error && !isMissingCredentialError(input.error)) {
    return { state: 'failing', error: input.error };
  }
  if (input.payload || input.connected) {
    return { state: 'no_data', error: null };
  }
  return { state: 'not_configured', error: null };
}

export function MarketingTabNew({ data, variant = 'website-traffic' }: MarketingTabNewProps) {
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
  const instagram = data.instagram;
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
        metaPage.traffic > 0 ||
        metaPage.clicks > 0 ||
        metaPage.returningVisitors > 0 ||
        metaPage.bounceRate > 0 ||
        metaPage.topPosts.length > 0)
  );

  const hasInstagramSignal = Boolean(
    instagram &&
      (instagram.followers > 0 ||
        instagram.reach30d > 0 ||
        instagram.engagement30d > 0 ||
        instagram.traffic > 0 ||
        instagram.clicks > 0 ||
        instagram.returningVisitors > 0 ||
        instagram.bounceRate > 0 ||
        instagram.topPosts.length > 0)
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
    connected: data.freshness.googleAnalytics?.status === 'CONNECTED',
    error: errorBySource.get('googleAnalytics'),
  });
  const googleAdsStatus = resolveProviderState({
    payload: googleAds,
    hasSignal: hasGoogleAdsSignal,
    connected: data.freshness.googleAds?.status === 'CONNECTED',
    error: errorBySource.get('googleAds'),
  });
  const metaAdsStatus = resolveProviderState({
    payload: metaAds,
    hasSignal: hasMetaAdsSignal,
    connected: data.freshness.metaAds?.status === 'CONNECTED',
    error: errorBySource.get('metaAds'),
  });
  const redditAdsStatus = resolveProviderState({
    payload: redditAds,
    hasSignal: hasRedditAdsSignal,
    connected: data.freshness.redditAds?.status === 'CONNECTED',
    error: errorBySource.get('redditAds'),
  });
  const metaPageStatus = resolveProviderState({
    payload: metaPage,
    hasSignal: hasMetaPageSignal,
    connected: data.freshness.metaPage?.status === 'CONNECTED',
    error: errorBySource.get('metaPage'),
  });
  const instagramStatus = resolveProviderState({
    payload: instagram,
    hasSignal: hasInstagramSignal,
    connected: data.freshness.instagram?.status === 'CONNECTED',
    error: errorBySource.get('instagram'),
  });
  const webflowStatus = resolveProviderState({
    payload: webflow,
    hasSignal: hasWebflowSignal,
    connected: data.freshness.webflow?.status === 'CONNECTED',
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
    connected: data.freshness.semrush?.status === 'CONNECTED',
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
  const redditConversions = data.redditAds?.totalConversions || 0;
  const totalConversions = googleConversions + metaConversions + redditConversions;

  const pageFollowers =
    data.metaPage?.pageFollowers && data.metaPage.pageFollowers > 0
      ? data.metaPage.pageFollowers
      : data.metaPage?.pageLikes || 0;

  // Compute byPlatform data
  const byPlatform: Record<string, { impressions: number; clicks: number; cost: number; conversions: number; ctr: number; costPerConversion: number }> = {};
  if (hasGoogleAdsSignal && googleAds) {
    byPlatform["google"] = {
      impressions: googleAds.totalImpressions || 0,
      clicks: googleAds.totalClicks || 0,
      cost: googleAds.totalSpend30d || 0,
      conversions: googleAds.totalConversions || 0,
      ctr: googleAds.ctr || 0,
      costPerConversion: googleAds.cpa || 0,
    };
  }
  if (hasMetaAdsSignal && metaAds) {
    byPlatform["meta"] = {
      impressions: metaAds.totalImpressions || 0,
      clicks: metaAds.totalClicks || 0,
      cost: metaAds.totalSpend30d || 0,
      conversions: metaAds.totalConversions || 0,
      ctr: metaAds.ctr || 0,
      costPerConversion: metaAds.cpa || 0,
    };
  }
  if (hasRedditAdsSignal && redditAds) {
    byPlatform["reddit"] = {
      impressions: redditAds.totalImpressions || 0,
      clicks: redditAds.totalClicks || 0,
      cost: redditAds.totalSpend30d || 0,
      conversions: redditAds.totalConversions || 0,
      ctr: redditAds.ctr || 0,
      costPerConversion: redditAds.cpa || 0,
    };
  }

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
  const metaPageFollowers =
    data.metaPage?.pageFollowers && data.metaPage.pageFollowers > 0
      ? data.metaPage.pageFollowers
      : data.metaPage?.pageLikes || 0;
  const metaPostReach = data.metaPage?.postReach30d || 0;
  const metaPostEngagement = data.metaPage?.postEngagement30d || 0;
  const metaTraffic = data.metaPage?.traffic || 0;
  const metaBounceRate = data.metaPage?.bounceRate || 0;
  const metaClicks = data.metaPage?.clicks || 0;
  const metaReturningVisitors = data.metaPage?.returningVisitors || 0;
  const metaTopPosts = data.metaPage?.topPosts || [];

  // Instagram data
  const igFollowers = data.instagram?.followers || 0;
  const igReach = data.instagram?.reach30d || 0;
  const igEngagement = data.instagram?.engagement30d || 0;
  const igTraffic = data.instagram?.traffic || 0;
  const igBounceRate = data.instagram?.bounceRate || 0;
  const igClicks = data.instagram?.clicks || 0;
  const igReturningVisitors = data.instagram?.returningVisitors || 0;
  const igTopPosts = data.instagram?.topPosts || [];
  const igTopVideos = data.instagram?.topVideos || [];
  const igVideosToImprove = data.instagram?.videosToImprove || [];
  const igMediaTypeBreakdown = data.instagram?.mediaTypeBreakdown;
  const igCreativeAnalysis = data.instagram?.creativeAnalysis;
  const igOpportunities = data.instagram?.opportunities || [];
  const igExperimentPlan = data.instagram?.experimentPlan || [];
  const igTestBacklog = data.instagram?.testBacklog || [];
  const igAttributeCorrelations = data.instagram?.attributeCorrelations || [];
  const igWinningPatterns = data.instagram?.winningPatterns || [];
  const igLosingPatterns = data.instagram?.losingPatterns || [];
  const isWebsiteTraffic = variant === 'website-traffic';
  const companionRoute = isWebsiteTraffic ? '/analytics/social-media' : '/analytics/website-traffic';
  const companionLabel = isWebsiteTraffic ? 'Social Media, Ads & Conferences' : 'Website Conversion';
  const insightFilter = isWebsiteTraffic ? 'website-traffic' : 'social-media';
  const gaUsers30d = data.googleAnalytics?.users30d || 0;
  const webflowSubmissions = data.webflow?.totalFormSubmissions ?? 0;
  const semrushOrganicTraffic = data.semrush?.organicTraffic ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {isWebsiteTraffic ? 'Website Conversion' : 'Social Media, Ads & Conferences'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isWebsiteTraffic
              ? 'Traffic quality, content performance, and onsite conversion health.'
              : 'Paid, organic, and event-driven top-of-funnel performance across campaigns, pages, and Instagram content.'}
          </p>
        </div>
        <Link
          href={companionRoute}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-secondary/50"
        >
          Open {companionLabel}
        </Link>
      </div>

      <AiInsightsPanel bundle={data.aiInsights || null} defaultFilter={insightFilter} />

      {/* Kanban Generator bounce-rate spotlight (website-traffic only).
          Single click-through tile so the operator immediately sees whether
          the whitepaper landing page is over- or under-performing site avg,
          then can drill into /analytics/ads-coda-kanban for the full breakdown. */}
      {isWebsiteTraffic && data.googleAnalytics?.kanbanBounceComparison ? (
        <KanbanBounceSpotlight comparison={data.googleAnalytics.kanbanBounceComparison} />
      ) : null}

      {/* Top KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isWebsiteTraffic ? (
          <>
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
              label="Users (30d)"
              value={gaStatus.state === 'healthy' ? fmtNum(gaUsers30d) : gaStatus.state === 'no_data' ? "No data" : "Not configured"}
              subtitle="Google Analytics"
              icon={Globe}
            />
            <StatCard
              label="Organic Traffic"
              value={semrushStatus.state === 'healthy' ? fmtNum(semrushOrganicTraffic) : semrushStatus.state === 'no_data' ? "No data" : "Not configured"}
              subtitle={semrushStatus.state === 'failing' ? semrushStatus.error || "SEMrush request failed" : "SEMrush"}
              icon={Search}
            />
            <StatCard
              label="Form Submissions"
              value={webflowStatus.state === 'healthy' ? fmtNum(webflowSubmissions) : webflowStatus.state === 'no_data' ? "No data" : "Not configured"}
              subtitle={webflowStatus.state === 'failing' ? webflowStatus.error || "Webflow request failed" : "Webflow"}
              icon={Layout}
            />
          </>
        ) : (
          <>
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
                      ? "Configured, but no Meta Page signals were returned in this range"
                      : "Meta Page connected"
              }
              icon={Facebook}
            />
            <StatCard
              label="Instagram Followers"
              value={instagramStatus.state === 'healthy' ? fmtNum(igFollowers) : instagramStatus.state === 'no_data' ? "No data" : "Not configured"}
              subtitle={instagramStatus.state === 'failing' ? instagramStatus.error || "Instagram request failed" : "Instagram"}
              icon={Instagram}
            />
          </>
        )}
      </div>

      {/* Website Traffic Section */}
      {isWebsiteTraffic ? (
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
      ) : null}

      {/* Social Media comparison */}
      {!isWebsiteTraffic && paidConfigured && paidHealthy ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Channel Comparison</h3>
          <ChannelTable byPlatform={byPlatform} />
        </div>
      ) : null}

      {/* Ad Performance Section */}
      {!isWebsiteTraffic ? (
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
      ) : null}

      {/* Social Section */}
      {!isWebsiteTraffic ? (
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
            <p className="text-muted-foreground text-center py-8">Meta Page is connected, but no page-level signals were returned in this range.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Visits</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(metaTraffic)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Clicks</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(metaClicks)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Bounce Rate</p>
                  <p className="text-lg font-semibold text-foreground">{fmtPct(metaBounceRate)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Returning</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(metaReturningVisitors)}</p>
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

        {/* Instagram Page Insights */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Instagram className="w-5 h-5 text-pink-500" />
            Instagram
          </h3>
          {instagramStatus.state === 'not_configured' ? (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          ) : instagramStatus.state === 'failing' ? (
            <p className="text-destructive text-center py-8">Configured but failing: {instagramStatus.error}</p>
          ) : instagramStatus.state === 'no_data' ? (
            <p className="text-muted-foreground text-center py-8">Instagram is connected, but no audience or traffic signals were returned in this range.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Followers</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(igFollowers)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Reach (30d)</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(igReach)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Engagement (30d)</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(igEngagement)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Visits</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(igTraffic)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Clicks</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(igClicks)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Bounce Rate</p>
                  <p className="text-lg font-semibold text-foreground">{fmtPct(igBounceRate)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Returning</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(igReturningVisitors)}</p>
                </div>
              </div>

              {igMediaTypeBreakdown && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Reels</p>
                    <p className="text-lg font-semibold text-foreground">{fmtNum(igMediaTypeBreakdown.reel)}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Videos</p>
                    <p className="text-lg font-semibold text-foreground">{fmtNum(igMediaTypeBreakdown.video)}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Images</p>
                    <p className="text-lg font-semibold text-foreground">{fmtNum(igMediaTypeBreakdown.image)}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Carousels</p>
                    <p className="text-lg font-semibold text-foreground">{fmtNum(igMediaTypeBreakdown.carousel)}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Other</p>
                    <p className="text-lg font-semibold text-foreground">{fmtNum(igMediaTypeBreakdown.other)}</p>
                  </div>
                </div>
              )}

              {igTopVideos.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">Top Videos</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Ranked by normalized performance across engagement rate, engagement velocity, and raw engagement in the selected window.
                  </p>
                  {igExperimentPlan.length > 0 ? (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-foreground mb-2">Experiment Plan</p>
                      <div className="space-y-2">
                        {igExperimentPlan.map((item) => (
                          <div
                            key={item.key}
                            className="p-2 bg-secondary/40 rounded text-xs text-muted-foreground"
                          >
                            <p className="text-foreground font-medium">
                              {item.title}
                              {` · ${item.confidence} confidence`}
                              {item.sampled ? " · sampled" : ""}
                            </p>
                            <p className="mt-1">
                              {item.brief} {`Expected impact ~${item.estimatedImpactPct.toFixed(0)}% across ${item.supportingVideos} top video${item.supportingVideos === 1 ? "" : "s"}.`}
                            </p>
                            {item.exampleVideos.length > 0 ? (
                              <p className="mt-1">
                                Examples: {item.exampleVideos.join(" · ")}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {igOpportunities.length > 0 ? (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-foreground mb-2">Underused Opportunities</p>
                      <div className="space-y-2">
                        {igOpportunities.map((item) => (
                          <div
                            key={item.key}
                            className="p-2 bg-secondary/40 rounded text-xs text-muted-foreground"
                          >
                            {item.label}
                            {` is only showing up in ${item.adoptionPct.toFixed(0)}% of eligible posts`}
                            {` (~${item.estimatedImpactPct.toFixed(0)}% upside, ${item.confidence} confidence`}
                            {item.sampled ? ", sampled" : ""}
                            )
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {igTestBacklog.length > 0 ? (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-foreground mb-2">Recommended Tests</p>
                      <div className="space-y-2">
                        {igTestBacklog.map((idea) => (
                          <div
                            key={`${idea.action}-${idea.key}`}
                            className="p-2 bg-secondary/40 rounded text-xs text-muted-foreground"
                          >
                            {idea.action === "add" ? "Add" : "Reduce"} {idea.label.toLowerCase()}
                            {` across ${idea.supportingVideos} top video${idea.supportingVideos === 1 ? "" : "s"}`}
                            {` (~${idea.estimatedImpactPct.toFixed(0)}% impact, ${idea.confidence} confidence`}
                            {idea.sampled ? ", sampled" : ""}
                            )
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {igCreativeAnalysis?.totalVideoCandidates ? (
                    <p className="text-xs text-muted-foreground mb-3">
                      AI creative analysis coverage: {fmtNum(igCreativeAnalysis.analyzedVideos)} of{" "}
                      {fmtNum(igCreativeAnalysis.totalVideoCandidates)} eligible videos
                      {igCreativeAnalysis.sampled ? " analyzed in this pass." : "."}
                    </p>
                  ) : null}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {igTopVideos.slice(0, 5).map((post, idx) => (
                      <div key={idx} className="p-2 bg-secondary/40 rounded text-sm">
                        <p className="text-foreground line-clamp-2">{post.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {post.isReel ? "Reel" : post.mediaType} · Score {post.performanceScore.toFixed(2)}x baseline ·{" "}
                          {fmtNum(post.engagement)} engagement
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {fmtPct(post.engagementRate)} engagement rate · {post.engagementVelocity.toFixed(1)}/day ·{" "}
                          {post.ageInDays.toFixed(1)} days old
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {post.hasQuestionHook ? "Question hook" : "Statement hook"}
                          {post.hasCallToAction ? " · CTA" : ""}
                          {post.hashtagCount > 0 ? ` · ${post.hashtagCount} hashtags` : ""}
                        </p>
                        {post.performanceDrivers?.length ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Why this is likely working:{" "}
                            {post.performanceDrivers
                              .map((driver) => {
                                const sampledSuffix = driver.sampled ? ", sampled" : "";
                                return `${driver.label} (+${driver.liftPct.toFixed(0)}%, ${driver.confidence} confidence${sampledSuffix})`;
                              })
                              .join(" · ")}
                          </p>
                        ) : null}
                        {post.nextTests?.length ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            What to test next:{" "}
                            {post.nextTests
                              .map((idea) => {
                                const actionLabel = idea.action === "add" ? "Add" : "Reduce";
                                const sampledSuffix = idea.sampled ? ", sampled" : "";
                                return `${actionLabel} ${idea.label.toLowerCase()} (~${idea.estimatedImpactPct.toFixed(
                                  0
                                )}% impact, ${idea.confidence} confidence${sampledSuffix})`;
                              })
                              .join(" · ")}
                          </p>
                        ) : null}
                        {post.creativeSummary ? (
                          <p className="text-xs text-muted-foreground mt-1">{post.creativeSummary}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {igVideosToImprove.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">Videos To Improve</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {igVideosToImprove.map((post, idx) => (
                      <div key={`${post.id}-${idx}`} className="p-2 bg-secondary/40 rounded text-sm">
                        <p className="text-foreground line-clamp-2">{post.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {post.isReel ? "Reel" : post.mediaType} · Score {post.performanceScore.toFixed(2)}x baseline ·{" "}
                          {fmtNum(post.engagement)} engagement
                        </p>
                        {post.nextTests?.length ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Best next tests:{" "}
                            {post.nextTests
                              .map((idea) => {
                                const actionLabel = idea.action === "add" ? "Add" : "Reduce";
                                const sampledSuffix = idea.sampled ? ", sampled" : "";
                                return `${actionLabel} ${idea.label.toLowerCase()} (~${idea.estimatedImpactPct.toFixed(
                                  0
                                )}% impact, ${idea.confidence} confidence${sampledSuffix})`;
                              })
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {igAttributeCorrelations.length > 0 && (
                <div>
                  {igWinningPatterns.length > 0 ? (
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-foreground mb-3">Winning Patterns</p>
                      <div className="space-y-2">
                        {igWinningPatterns.map((item, idx) => (
                          <div key={`${item.title}-${idx}`} className="p-3 bg-secondary/40 rounded">
                            <p className="text-sm font-medium text-foreground">
                              {item.title}
                              {item.source === "ai_visual" ? " · AI visual" : ""}
                              {item.sampled ? " · sampled" : ""}
                              {` · ${item.confidence} confidence`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {igLosingPatterns.length > 0 ? (
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-foreground mb-3">Underperforming Patterns</p>
                      <div className="space-y-2">
                        {igLosingPatterns.map((item, idx) => (
                          <div key={`${item.title}-${idx}`} className="p-3 bg-secondary/40 rounded">
                            <p className="text-sm font-medium text-foreground">
                              {item.title}
                              {item.source === "ai_visual" ? " · AI visual" : ""}
                              {item.sampled ? " · sampled" : ""}
                              {` · ${item.confidence} confidence`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="text-sm font-semibold text-foreground mb-3">What’s Correlating With Performance</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Correlations use the same normalized Instagram performance score rather than raw lifetime engagement alone.
                  </p>
                  {data.instagram?.creativeAnalysis?.sampled ? (
                    <p className="text-xs text-muted-foreground mb-3">
                      AI visual signals are based on a top-video sample, not the full Instagram post set.
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {igAttributeCorrelations.slice(0, 5).map((item) => (
                      <div key={item.key} className="p-3 bg-secondary/40 rounded">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {item.label}
                              {item.source === "ai_visual" ? " · AI visual" : ""}
                              {item.sampled ? " · sampled" : ""}
                              {` · ${item.confidence} confidence`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">{item.interpretation}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-semibold ${item.correlation >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              r={item.correlation.toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.liftPct >= 0 ? "+" : ""}
                              {item.liftPct.toFixed(0)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.sampleSize}/{item.comparisonSampleSize} posts · {item.coveragePct.toFixed(0)}% coverage
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {igTopPosts.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">Top Posts</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {igTopPosts.slice(0, 5).map((post, idx) => (
                      <div key={idx} className="p-2 bg-secondary/40 rounded text-sm">
                        <p className="text-foreground line-clamp-2">{post.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {post.isReel ? "Reel" : post.mediaType} · {fmtNum(post.engagement)} engagement
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
      ) : null}

      {/* Website Section */}
      {isWebsiteTraffic ? (
      <div className="grid grid-cols-1 gap-6">
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

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Published Pages</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(webflow.publishedPages ?? webflow.totalPages)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">SEO Health</p>
                  <p className="text-lg font-semibold text-foreground">{(webflow.seoAudit?.seoScore ?? 0)}%</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">CMS Items</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(webflow.totalCmsItems ?? 0)}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Form Submissions</p>
                  <p className="text-lg font-semibold text-foreground">{fmtNum(webflow.totalFormSubmissions ?? 0)}</p>
                </div>
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
      ) : null}

      {/* -- SEMrush SEO Intelligence -- */}
      {isWebsiteTraffic ? (
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
      ) : null}
    </div>
  );
}

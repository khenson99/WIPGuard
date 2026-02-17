"use client";

import {
  TrendingUp,
  DollarSign,
  MousePointerClick,
  Facebook,
  BarChart3,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { fmtCurrency, fmtNumber, fmtPercent, pctChange, changeDirection } from "@/lib/analytics/format";
import { StatCard } from "./stat-card";
import { TrafficOverview } from "./marketing/traffic-overview";
import {
  AdPlatformCard,
  buildGoogleAdsMetrics,
  buildMetaAdsMetrics,
  buildRedditAdsMetrics,
} from "./marketing/ad-platform-card";
import { SocialWebSection } from "./marketing/social-web-section";
import { SEOIntelligence } from "./marketing/seo-intelligence";

interface MarketingTabNewProps {
  data: AnalyticsDashboardData | null;
}

export function MarketingTabNew({ data }: MarketingTabNewProps) {
  if (!data) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-border bg-card">
        <div className="text-center">
          <BarChart3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No analytics data available</p>
        </div>
      </div>
    );
  }

  const { googleAds, metaAds, redditAds, metaPage, webflow, googleAnalytics: ga, semrush } = data;

  /* ── Signal detection ── */
  const hasGoogleAdsSignal = Boolean(
    googleAds && (googleAds.totalSpend30d > 0 || googleAds.totalImpressions > 0 || googleAds.totalClicks > 0 || googleAds.totalConversions > 0 || googleAds.campaigns.length > 0),
  );
  const hasMetaAdsSignal = Boolean(
    metaAds && (metaAds.totalSpend30d > 0 || metaAds.totalImpressions > 0 || metaAds.totalClicks > 0 || metaAds.totalConversions > 0 || metaAds.campaigns.length > 0),
  );
  const hasRedditAdsSignal = Boolean(
    redditAds && (redditAds.totalSpend30d > 0 || redditAds.totalImpressions > 0 || redditAds.totalClicks > 0 || redditAds.campaigns.length > 0),
  );
  const hasGASignal = Boolean(
    ga && (ga.sessions30d > 0 || ga.users30d > 0 || ga.pageviews30d > 0 || ga.trafficByChannel.length > 0 || ga.topPages.length > 0),
  );
  const hasMetaPageSignal = Boolean(
    metaPage && (metaPage.pageLikes > 0 || metaPage.pageFollowers > 0 || metaPage.postReach30d > 0 || metaPage.postEngagement30d > 0 || metaPage.topPosts.length > 0),
  );

  const hasAnyAdsConfigured = Boolean(googleAds) || Boolean(metaAds) || Boolean(redditAds);
  const hasAnyAdsSignal = hasGoogleAdsSignal || hasMetaAdsSignal || hasRedditAdsSignal;

  /* ── Aggregate KPIs ── */
  const sessions30d = ga?.sessions30d ?? 0;
  const sessionsPrev = ga?.sessionsPrev30d ?? 0;
  const sessionsDir = changeDirection(sessions30d, sessionsPrev);
  const sessionsChangeLabel = pctChange(sessions30d, sessionsPrev);
  const totalAdSpend = (googleAds?.totalSpend30d ?? 0) + (metaAds?.totalSpend30d ?? 0) + (redditAds?.totalSpend30d ?? 0);
  const totalConversions = (googleAds?.totalConversions ?? 0) + (metaAds?.totalConversions ?? 0);
  const pageFollowers = metaPage?.pageFollowers ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Top KPI Row ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="animate-analytics-in animate-delay-0"><StatCard
          label="Sessions (30d)"
          value={!ga ? "Not configured" : hasGASignal ? fmtNumber(sessions30d) : "No data"}
          change={!ga || !hasGASignal || sessionsDir === "neutral" ? undefined : sessionsChangeLabel}
          changeType={sessionsDir}
          subtitle={!ga ? "Google Analytics" : !hasGASignal ? "No GA data in range" : undefined}
          icon={TrendingUp}
        /></div>
        <div className="animate-analytics-in animate-delay-1"><StatCard
          label="Total Ad Spend"
          value={!hasAnyAdsConfigured ? "Not configured" : hasAnyAdsSignal ? fmtCurrency(totalAdSpend) : "No data"}
          subtitle={!hasAnyAdsConfigured ? "Google + Meta + Reddit" : hasAnyAdsSignal ? "Google + Meta + Reddit" : "No ad spend in range"}
          icon={DollarSign}
        /></div>
        <div className="animate-analytics-in animate-delay-2"><StatCard
          label="Total Conversions"
          value={!hasAnyAdsConfigured ? "Not configured" : hasAnyAdsSignal ? fmtNumber(totalConversions) : "No data"}
          subtitle={!hasAnyAdsConfigured ? "Google + Meta" : hasAnyAdsSignal ? "Google + Meta" : "No conversion data"}
          icon={MousePointerClick}
        /></div>
        <div className="animate-analytics-in animate-delay-3"><StatCard
          label="Page Followers"
          value={!metaPage ? "Not configured" : hasMetaPageSignal ? fmtNumber(pageFollowers) : "No data"}
          subtitle={!metaPage ? "Meta Page" : hasMetaPageSignal ? "Meta Page" : "No page insights"}
          icon={Facebook}
        /></div>
      </div>

      {/* ── Traffic by Channel + Top Pages ── */}
      <TrafficOverview ga={ga ?? null} />

      {/* ── Ad Performance ── */}
      <div className="animate-analytics-slide-up space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Ad Performance
        </h2>
        <AdPlatformCard
          name="Google Ads"
          icon={BarChart3}
          configured={Boolean(googleAds)}
          hasSignal={hasGoogleAdsSignal}
          metrics={googleAds ? buildGoogleAdsMetrics(googleAds) : []}
          campaigns={googleAds?.campaigns ?? []}
          defaultExpanded
        />
        <AdPlatformCard
          name="Meta Ads"
          icon={Facebook}
          configured={Boolean(metaAds)}
          hasSignal={hasMetaAdsSignal}
          metrics={metaAds ? buildMetaAdsMetrics(metaAds) : []}
          campaigns={metaAds?.campaigns ?? []}
          defaultExpanded
        />
        <AdPlatformCard
          name="Reddit Ads"
          icon={BarChart3}
          configured={Boolean(redditAds)}
          hasSignal={hasRedditAdsSignal}
          metrics={redditAds ? buildRedditAdsMetrics(redditAds) : []}
          campaigns={redditAds?.campaigns ?? []}
        />
      </div>

      {/* ── Social & Web ── */}
      <SocialWebSection metaPage={metaPage ?? null} webflow={webflow ?? null} />

      {/* ── SEO Intelligence ── */}
      <SEOIntelligence semrush={semrush ?? null} />
    </div>
  );
}

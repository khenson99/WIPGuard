'use client';

import React, { useState } from 'react';
import { AnalyticsDashboardData } from '@/lib/analytics/types';
import StatCard from './stat-card';
import BarDisplay from './bar-display';
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
          value={fmtNum(sessions30d)}
          change={sessionsChange}
          changeType={sessionsChange && sessionsChange > 0 ? 'increase' : 'decrease'}
          icon={TrendingUp}
        />
        <StatCard
          label="Total Ad Spend"
          value={fmtCurrency(totalAdSpend)}
          subtitle="Google + Meta + Reddit"
          icon={DollarSign}
        />
        <StatCard
          label="Total Conversions"
          value={fmtNum(totalConversions)}
          subtitle="Google + Meta"
          icon={MousePointerClick}
        />
        <StatCard
          label="Page Followers"
          value={fmtNum(pageFollowers)}
          subtitle="Meta Page"
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
          {barItems.length > 0 ? (
            <BarDisplay
              items={barItems}
              formatValue={(v) => fmtNum(v)}
              maxValue={Math.max(...barItems.map((i) => i.value), 1)}
            />
          ) : (
            <p className="text-muted-foreground text-center py-8">No traffic data available</p>
          )}
        </div>

        {/* Top Pages */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Top Pages
          </h3>
          {topPages.length > 0 ? (
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
            <p className="text-muted-foreground text-center py-8">No page data available</p>
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
              {data.googleAds ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Spend</p>
                      <p className="text-lg font-semibold text-foreground">{fmtCurrency(data.googleAds.totalSpend30d)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(data.googleAds.totalImpressions)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Clicks</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(data.googleAds.totalClicks)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Conversions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(data.googleAds.totalConversions)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CTR</p>
                      <p className="text-sm font-semibold text-foreground">{fmtPct(data.googleAds.ctr)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPC</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(data.googleAds.cpc)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPA</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(data.googleAds.cpa)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">ROAS</p>
                      <p className="text-sm font-semibold text-foreground">{data.googleAds.roas?.toFixed(2)}x</p>
                    </div>
                  </div>

                  {data.googleAds.campaigns && data.googleAds.campaigns.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">Top Campaigns</p>
                      <div className="space-y-2">
                        {data.googleAds.campaigns.slice(0, 5).map((campaign, idx) => (
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
              ) : (
                <p className="text-muted-foreground text-center py-6">Not configured</p>
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
              {data.metaAds ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Spend</p>
                      <p className="text-lg font-semibold text-foreground">{fmtCurrency(data.metaAds.totalSpend30d)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(data.metaAds.totalImpressions)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Clicks</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(data.metaAds.totalClicks)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Conversions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(data.metaAds.totalConversions)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CTR</p>
                      <p className="text-sm font-semibold text-foreground">{fmtPct(data.metaAds.ctr)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPC</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(data.metaAds.cpc)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPA</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(data.metaAds.cpa)}</p>
                    </div>
                  </div>

                  {data.metaAds.campaigns && data.metaAds.campaigns.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">Top Campaigns</p>
                      <div className="space-y-2">
                        {data.metaAds.campaigns.slice(0, 5).map((campaign, idx) => (
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
              ) : (
                <p className="text-muted-foreground text-center py-6">Not configured</p>
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
              {data.redditAds ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Spend</p>
                      <p className="text-lg font-semibold text-foreground">{fmtCurrency(data.redditAds.totalSpend30d)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Impressions</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(data.redditAds.totalImpressions)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Clicks</p>
                      <p className="text-lg font-semibold text-foreground">{fmtNum(data.redditAds.totalClicks)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CTR</p>
                      <p className="text-sm font-semibold text-foreground">{fmtPct(data.redditAds.ctr)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">CPC</p>
                      <p className="text-sm font-semibold text-foreground">{fmtCurrency(data.redditAds.cpc)}</p>
                    </div>
                  </div>

                  {data.redditAds.campaigns && data.redditAds.campaigns.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">Top Campaigns</p>
                      <div className="space-y-2">
                        {data.redditAds.campaigns.slice(0, 5).map((campaign, idx) => (
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
              ) : (
                <p className="text-muted-foreground text-center py-6">Not configured</p>
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
          {data.metaPage ? (
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
          ) : (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          )}
        </div>

        {/* Webflow Site Info */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Layout className="w-5 h-5 text-primary" />
            Webflow
          </h3>
          {data.webflow ? (
            <div className="space-y-4">
              {data.webflow.siteName && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Site Name</p>
                  <p className="text-sm font-semibold text-foreground">{data.webflow.siteName}</p>
                </div>
              )}

              {data.webflow.lastPublished && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Last Published</p>
                  <p className="text-sm font-semibold text-foreground">
                    {new Date(data.webflow.lastPublished).toLocaleDateString()}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Pages</p>
                  <p className="text-lg font-semibold text-foreground">{data.webflow.totalPages || 0}</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Collections</p>
                  <p className="text-lg font-semibold text-foreground">{data.webflow.totalCollections || 0}</p>
                </div>
              </div>

              {data.webflow.formSubmissions && data.webflow.formSubmissions.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">Form Submissions</p>
                  <div className="space-y-1">
                    {data.webflow.formSubmissions.map((form, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-secondary/40 rounded text-sm">
                        <span className="text-foreground truncate">{form.formName}</span>
                        <span className="text-muted-foreground font-semibold">{form.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.webflow.customDomains && data.webflow.customDomains.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">Custom Domains</p>
                  <div className="space-y-1">
                    {data.webflow.customDomains.map((domain, idx) => (
                      <div key={idx} className="p-2 bg-secondary/40 rounded text-sm text-foreground">
                        {domain}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">Not configured</p>
          )}
        </div>
      </div>
    </div>
  );
}

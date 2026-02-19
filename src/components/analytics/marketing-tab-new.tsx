'use client';

import React from 'react';
import { AnalyticsDashboardData } from '@/lib/analytics/types';

interface MarketingTabNewProps {
  data: AnalyticsDashboardData | null;
}

/* ------------------------------------------------------------------ */
/*  Formatters                                                         */
/* ------------------------------------------------------------------ */

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '$0';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '0%';
  return `${n.toFixed(2)}%`;
}

function fmtDuration(secs: number | null | undefined): string {
  if (secs == null) return '0m 00s';
  const mins = Math.floor(secs / 60);
  const seconds = Math.floor(secs % 60);
  return `${mins}m ${seconds.toString().padStart(2, '0')}s`;
}

function calculateChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | undefined {
  if (current == null || previous == null || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

/* ------------------------------------------------------------------ */
/*  Tiny reusable pieces                                               */
/* ------------------------------------------------------------------ */

/** Colored trend badge (↑ / ↓) */
function TrendBadge({ value }: { value: number | undefined }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span
      className={`mt-1.5 inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-[11px] font-semibold ${
        up
          ? 'bg-emerald-500/12 text-emerald-400'
          : 'bg-red-500/12 text-red-400'
      }`}
    >
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/** KPI card matching the example dashboard style */
function KpiCard({
  label,
  value,
  sub,
  change,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  change?: number;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-bold tabular-nums"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
      )}
      <TrendBadge value={change} />
    </div>
  );
}

/** Integration status dot */
function IntDot({ status }: { status: 'connected' | 'partial' | 'error' | 'pending' }) {
  const cls: Record<string, string> = {
    connected: 'bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.500)]',
    partial: 'bg-amber-500 shadow-[0_0_6px_theme(colors.amber.500)]',
    error: 'bg-red-500',
    pending: 'bg-zinc-500',
  };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls[status]}`} />;
}

/** Integration mini-card */
function IntCard({
  name,
  status,
  detail,
}: {
  name: string;
  status: 'connected' | 'partial' | 'error' | 'pending';
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3">
      <IntDot status={status} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/** Section heading with emoji icon */
function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground">
      <span className="text-lg">{icon}</span>
      {children}
    </h3>
  );
}

/** Channel row card (used in Traffic Acquisition) */
function ChannelRow({
  channel,
  sessions,
  engagementRate,
  avgTime,
  color,
  maxSessions,
}: {
  channel: string;
  sessions: number;
  engagementRate?: number;
  avgTime?: number;
  color: string;
  maxSessions: number;
}) {
  const pct = maxSessions > 0 ? (sessions / maxSessions) * 100 : 0;
  return (
    <div className="group rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{channel}</span>
        <span className="tabular-nums text-sm font-bold text-foreground">
          {fmtNum(sessions)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-1.5 flex gap-4 text-[11px] text-muted-foreground">
        {engagementRate != null && (
          <span>
            Eng.{' '}
            <span
              className={
                engagementRate >= 45
                  ? 'font-semibold text-emerald-400'
                  : engagementRate < 28
                    ? 'font-semibold text-red-400'
                    : ''
              }
            >
              {engagementRate.toFixed(1)}%
            </span>
          </span>
        )}
        {avgTime != null && <span>Avg {fmtDuration(avgTime)}</span>}
      </div>
    </div>
  );
}

/** Campaign table row */
function CampaignTable({
  title,
  campaigns,
  showConversions,
}: {
  title: string;
  campaigns: Array<{
    name: string;
    spend: number;
    impressions?: number;
    clicks: number;
    conversions?: number;
    ctr?: number;
    cpc?: number;
  }>;
  showConversions?: boolean;
}) {
  if (!campaigns || campaigns.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="mb-3 text-sm font-bold text-foreground">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Campaign
              </th>
              <th className="pb-2 px-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Spend
              </th>
              <th className="pb-2 px-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Clicks
              </th>
              {showConversions && (
                <th className="pb-2 px-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Conv.
                </th>
              )}
              <th className="pb-2 pl-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                CTR
              </th>
            </tr>
          </thead>
          <tbody>
            {campaigns.slice(0, 8).map((c, i) => (
              <tr
                key={i}
                className="border-b border-border/50 transition-colors hover:bg-primary/[0.04]"
              >
                <td className="py-2 pr-4 font-medium text-foreground">
                  <span className="line-clamp-1">{c.name}</span>
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-foreground">
                  {fmtCurrency(c.spend)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                  {fmtNum(c.clicks)}
                </td>
                {showConversions && (
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                    {fmtNum(c.conversions)}
                  </td>
                )}
                <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                  {c.ctr != null ? fmtPct(c.ctr) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Palette (matches example dashboard CSS vars)                       */
/* ------------------------------------------------------------------ */

const COLOR = {
  green: '#22c55e',
  red: '#ef4444',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  purple: '#a855f7',
  pink: '#ec4899',
  accent: '#818cf8',
  orange: '#f97316',
  yellow: '#eab308',
} as const;

const CHANNEL_COLORS: Record<string, string> = {
  direct: COLOR.blue,
  organic: COLOR.green,
  'organic search': COLOR.green,
  referral: COLOR.yellow,
  paid: COLOR.red,
  'paid search': COLOR.red,
  'paid social': COLOR.pink,
  social: COLOR.purple,
  'organic social': COLOR.purple,
  email: COLOR.cyan,
  reddit: COLOR.orange,
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function MarketingTabNew({ data }: MarketingTabNewProps) {
  if (!data) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-border bg-card">
        <div className="text-center">
          <p className="text-3xl mb-3">📊</p>
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
  const ga = data.googleAnalytics;
  const semrush = data.semrush;

  /* --- Signal detection (unchanged logic) --- */
  const hasGASignal = Boolean(
    ga && (ga.sessions30d > 0 || ga.users30d > 0 || ga.pageviews30d > 0 || ga.trafficByChannel.length > 0 || ga.topPages.length > 0),
  );
  const hasGoogleAdsSignal = Boolean(
    googleAds && (googleAds.totalSpend30d > 0 || googleAds.totalImpressions > 0 || googleAds.totalClicks > 0 || googleAds.totalConversions > 0 || googleAds.campaigns.length > 0),
  );
  const hasMetaAdsSignal = Boolean(
    metaAds && (metaAds.totalSpend30d > 0 || metaAds.totalImpressions > 0 || metaAds.totalClicks > 0 || metaAds.totalConversions > 0 || metaAds.campaigns.length > 0),
  );
  const hasRedditAdsSignal = Boolean(
    redditAds && (redditAds.totalSpend30d > 0 || redditAds.totalImpressions > 0 || redditAds.totalClicks > 0 || redditAds.campaigns.length > 0),
  );
  const hasMetaPageSignal = Boolean(
    metaPage && (metaPage.pageLikes > 0 || metaPage.pageFollowers > 0 || metaPage.postReach30d > 0 || metaPage.postEngagement30d > 0 || metaPage.topPosts.length > 0),
  );
  const hasWebflowSignal = Boolean(
    webflow && (webflow.totalPages > 0 || webflow.totalCollections > 0 || webflow.formSubmissions.length > 0 || webflow.customDomains.length > 0 || Boolean(webflow.siteName) || Boolean(webflow.lastPublished)),
  );

  /* --- Computed metrics --- */
  const sessions30d = ga?.sessions30d || 0;
  const sessionsPrev30d = ga?.sessionsPrev30d || 0;
  const sessionsChange = calculateChange(sessions30d, sessionsPrev30d);

  const googleSpend = googleAds?.totalSpend30d || 0;
  const metaSpend = metaAds?.totalSpend30d || 0;
  const redditSpend = redditAds?.totalSpend30d || 0;
  const totalAdSpend = googleSpend + metaSpend + redditSpend;

  const googleConversions = googleAds?.totalConversions || 0;
  const metaConversions = metaAds?.totalConversions || 0;
  const totalConversions = googleConversions + metaConversions;

  const trafficByChannel = ga?.trafficByChannel || [];
  const topPages = ga?.topPages || [];
  const maxChannelSessions = Math.max(...trafficByChannel.map((c) => c.sessions || 0), 1);

  /* --- Integration statuses --- */
  const integrations: Array<{ name: string; status: 'connected' | 'partial' | 'error' | 'pending'; detail: string }> = [
    {
      name: 'Google Analytics',
      status: ga ? (hasGASignal ? 'connected' : 'partial') : 'pending',
      detail: ga ? (hasGASignal ? `${fmtNum(sessions30d)} sessions (30d)` : 'No data in range') : 'Not configured',
    },
    {
      name: 'Google Ads',
      status: googleAds ? (hasGoogleAdsSignal ? 'connected' : 'partial') : 'pending',
      detail: googleAds ? (hasGoogleAdsSignal ? `${fmtCurrency(googleSpend)} spend · ${fmtNum(googleAds.totalClicks)} clicks` : 'No data in range') : 'Not configured',
    },
    {
      name: 'Meta Ads',
      status: metaAds ? (hasMetaAdsSignal ? 'connected' : 'partial') : 'pending',
      detail: metaAds ? (hasMetaAdsSignal ? `${fmtCurrency(metaSpend)} spend · ${fmtNum(metaAds.totalClicks)} clicks` : 'No data in range') : 'Not configured',
    },
    {
      name: 'Meta Page',
      status: metaPage ? (hasMetaPageSignal ? 'connected' : 'partial') : 'pending',
      detail: metaPage ? (hasMetaPageSignal ? `${fmtNum(metaPage.pageFollowers)} followers` : 'No data in range') : 'Not configured',
    },
    {
      name: 'Reddit Ads',
      status: redditAds ? (hasRedditAdsSignal ? 'connected' : 'partial') : 'pending',
      detail: redditAds ? (hasRedditAdsSignal ? `${fmtCurrency(redditSpend)} spend` : 'GA4 attribution only') : 'Not configured',
    },
    {
      name: 'Webflow',
      status: webflow ? (hasWebflowSignal ? 'connected' : 'partial') : 'pending',
      detail: webflow ? (hasWebflowSignal ? `${webflow.siteName || 'Site'} · ${webflow.totalPages || 0} pages` : 'No data in range') : 'Not configured',
    },
    {
      name: 'SEMrush',
      status: semrush ? 'connected' : 'pending',
      detail: semrush ? `Authority ${semrush.authorityScore} · ${fmtNum(semrush.organicKeywords)} keywords` : 'Not configured',
    },
  ];

  const connectedCount = integrations.filter((i) => i.status === 'connected').length;

  return (
    <div className="space-y-8">

      {/* ── Data Sources ────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle icon="🔗">Data Sources</SectionTitle>
          <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-[11px] font-semibold text-emerald-400">
            ● {connectedCount} Connected
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {integrations.map((int) => (
            <IntCard key={int.name} {...int} />
          ))}
        </div>
      </section>

      {/* ── Top-Line KPIs ───────────────────────────────────── */}
      <section>
        <SectionTitle icon="📈">Key Performance Indicators</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard
            label="Sessions (30d)"
            value={hasGASignal ? fmtNum(sessions30d) : ga ? 'No data' : '—'}
            sub={ga ? (hasGASignal ? 'Google Analytics' : 'No data in range') : 'Not configured'}
            change={sessionsChange}
            valueColor={hasGASignal ? COLOR.blue : undefined}
          />
          <KpiCard
            label="Total Ad Spend"
            value={totalAdSpend > 0 ? fmtCurrency(totalAdSpend) : googleAds || metaAds || redditAds ? 'No data' : '—'}
            sub={
              totalAdSpend > 0
                ? [googleSpend > 0 && 'Google', metaSpend > 0 && 'Meta', redditSpend > 0 && 'Reddit'].filter(Boolean).join(' + ')
                : 'Not configured'
            }
            valueColor={totalAdSpend > 0 ? COLOR.red : undefined}
          />
          <KpiCard
            label="Total Conversions"
            value={totalConversions > 0 ? fmtNum(totalConversions) : googleAds || metaAds ? 'No data' : '—'}
            sub={totalConversions > 0 ? 'Google + Meta' : 'Not configured'}
            valueColor={totalConversions > 0 ? COLOR.green : undefined}
          />
          <KpiCard
            label="Page Followers"
            value={hasMetaPageSignal ? fmtNum(metaPage!.pageFollowers) : metaPage ? 'No data' : '—'}
            sub={hasMetaPageSignal ? 'Meta Page' : 'Not configured'}
            valueColor={hasMetaPageSignal ? COLOR.purple : undefined}
          />
          <KpiCard
            label="Authority Score"
            value={semrush ? String(semrush.authorityScore) : '—'}
            sub={semrush ? `${fmtNum(semrush.organicKeywords)} organic keywords` : 'SEMrush not configured'}
            valueColor={semrush ? COLOR.accent : undefined}
          />
        </div>
      </section>

      {/* ── Website Traffic ─────────────────────────────────── */}
      {ga && (
        <section>
          <SectionTitle icon="🌐">Website Traffic — Channel Breakdown</SectionTitle>
          {hasGASignal ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              {/* Channel cards (3 cols) */}
              <div className="space-y-2.5 lg:col-span-3">
                {trafficByChannel.length > 0 ? (
                  trafficByChannel.map((ch, i) => (
                    <ChannelRow
                      key={i}
                      channel={ch.channel || 'Unknown'}
                      sessions={ch.sessions || 0}
                      engagementRate={(ch as unknown as Record<string, unknown>).engagementRate as number | undefined}
                      avgTime={(ch as unknown as Record<string, unknown>).avgSessionDuration as number | undefined}
                      color={CHANNEL_COLORS[ch.channel?.toLowerCase()] || '#6b7280'}
                      maxSessions={maxChannelSessions}
                    />
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No channel data in selected range
                  </p>
                )}
              </div>

              {/* Top Pages (2 cols) */}
              <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
                <p className="mb-3 text-sm font-bold text-foreground">Top Pages</p>
                {topPages.length > 0 ? (
                  <div className="space-y-2">
                    {topPages.slice(0, 8).map((page, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-primary/30"
                      >
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {page.path || '/'}
                        </p>
                        <div className="mt-0.5 flex gap-3 text-[11px] text-muted-foreground">
                          <span>{fmtNum(page.pageviews)} views</span>
                          <span>{fmtDuration(page.avgDuration)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No page data
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No Google Analytics data in selected range
            </div>
          )}
        </section>
      )}

      {/* ── Paid Advertising ────────────────────────────────── */}
      {(googleAds || metaAds || redditAds) && (
        <section>
          <SectionTitle icon="💰">Paid Advertising</SectionTitle>

          {/* Platform KPI row */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {googleAds && hasGoogleAdsSignal && (
              <>
                <KpiCard
                  label="Google Ads Spend"
                  value={fmtCurrency(googleAds.totalSpend30d)}
                  sub={`${fmtNum(googleAds.totalImpressions)} impressions`}
                  valueColor={COLOR.blue}
                />
                <KpiCard
                  label="Google Ads ROAS"
                  value={googleAds.roas != null ? `${googleAds.roas.toFixed(2)}x` : '—'}
                  sub={`CPA ${fmtCurrency(googleAds.cpa)} · CPC ${fmtCurrency(googleAds.cpc)}`}
                  valueColor={
                    googleAds.roas != null && googleAds.roas >= 2
                      ? COLOR.green
                      : googleAds.roas != null && googleAds.roas < 1
                        ? COLOR.red
                        : undefined
                  }
                />
              </>
            )}
            {metaAds && hasMetaAdsSignal && (
              <>
                <KpiCard
                  label="Meta Ads Spend"
                  value={fmtCurrency(metaAds.totalSpend30d)}
                  sub={`${fmtNum(metaAds.totalImpressions)} impressions`}
                  valueColor={COLOR.pink}
                />
                <KpiCard
                  label="Meta Ads CTR"
                  value={fmtPct(metaAds.ctr)}
                  sub={`CPA ${fmtCurrency(metaAds.cpa)} · CPC ${fmtCurrency(metaAds.cpc)}`}
                />
              </>
            )}
            {redditAds && hasRedditAdsSignal && (
              <KpiCard
                label="Reddit Ads Spend"
                value={fmtCurrency(redditAds.totalSpend30d)}
                sub={`${fmtNum(redditAds.totalImpressions)} impressions · CTR ${fmtPct(redditAds.ctr)}`}
                valueColor={COLOR.orange}
              />
            )}
          </div>

          {/* Campaign tables */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {googleAds && hasGoogleAdsSignal && (
              <CampaignTable
                title="Google Ads — Top Campaigns"
                campaigns={googleAds.campaigns}
                showConversions
              />
            )}
            {metaAds && hasMetaAdsSignal && (
              <CampaignTable
                title="Meta Ads — Top Campaigns"
                campaigns={metaAds.campaigns}
                showConversions
              />
            )}
            {redditAds && hasRedditAdsSignal && (
              <CampaignTable
                title="Reddit Ads — Top Campaigns"
                campaigns={redditAds.campaigns}
              />
            )}
          </div>

          {/* No ads configured message */}
          {!hasGoogleAdsSignal && !hasMetaAdsSignal && !hasRedditAdsSignal && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No paid advertising data in selected range
            </div>
          )}
        </section>
      )}

      {/* ── Social & Organic ────────────────────────────────── */}
      {(metaPage || webflow) && (
        <section>
          <SectionTitle icon="📱">Social & Web Presence</SectionTitle>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Meta Page */}
            {metaPage && (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="mb-4 text-sm font-bold text-foreground">Meta Page</p>
                {hasMetaPageSignal ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <KpiCard label="Page Likes" value={fmtNum(metaPage.pageLikes)} valueColor={COLOR.pink} />
                      <KpiCard label="Followers" value={fmtNum(metaPage.pageFollowers)} valueColor={COLOR.purple} />
                      <KpiCard label="Reach (30d)" value={fmtNum(metaPage.postReach30d)} valueColor={COLOR.cyan} />
                      <KpiCard label="Engagement (30d)" value={fmtNum(metaPage.postEngagement30d)} valueColor={COLOR.green} />
                    </div>
                    {metaPage.topPosts && metaPage.topPosts.length > 0 && (
                      <div>
                        <p className="mb-2 text-[13px] font-semibold text-foreground">Top Posts</p>
                        <div className="max-h-52 space-y-2 overflow-y-auto">
                          {metaPage.topPosts.slice(0, 5).map((post, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border border-border/60 p-2.5 transition-colors hover:border-primary/30"
                            >
                              <p className="line-clamp-2 text-[13px] text-foreground">
                                {post.message}
                              </p>
                              <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                                <span>{fmtNum(post.reach)} reach</span>
                                <span>{fmtNum(post.engagement)} engagement</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No Meta Page data in selected range
                  </p>
                )}
              </div>
            )}

            {/* Webflow */}
            {webflow && (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="mb-4 text-sm font-bold text-foreground">Webflow</p>
                {hasWebflowSignal ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <KpiCard
                        label="Site"
                        value={webflow.siteName || '—'}
                        sub={webflow.lastPublished ? `Published ${new Date(webflow.lastPublished).toLocaleDateString()}` : undefined}
                      />
                      <KpiCard label="Pages" value={String(webflow.totalPages || 0)} sub={`${webflow.totalCollections || 0} collections`} />
                    </div>

                    {webflow.formSubmissions && webflow.formSubmissions.length > 0 && (
                      <div>
                        <p className="mb-2 text-[13px] font-semibold text-foreground">
                          Form Submissions
                        </p>
                        <div className="space-y-1.5">
                          {webflow.formSubmissions.map((form, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                            >
                              <span className="truncate text-[13px] text-foreground">{form.formName}</span>
                              <span className="text-sm font-bold tabular-nums text-foreground">{form.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {webflow.customDomains && webflow.customDomains.length > 0 && (
                      <div>
                        <p className="mb-2 text-[13px] font-semibold text-foreground">Domains</p>
                        <div className="flex flex-wrap gap-2">
                          {webflow.customDomains.map((domain, idx) => (
                            <span
                              key={idx}
                              className="rounded-md border border-border bg-secondary/40 px-3 py-1 text-[12px] font-medium text-foreground"
                            >
                              {domain}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No Webflow data in selected range
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── SEMrush SEO Intelligence ────────────────────────── */}
      {semrush && (
        <section>
          <SectionTitle icon="🔍">SEMrush SEO Intelligence</SectionTitle>

          {/* SEO KPI row */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Authority Score" value={String(semrush.authorityScore)} valueColor={COLOR.accent} />
            <KpiCard label="Backlinks" value={fmtNum(semrush.backlinks)} valueColor={COLOR.blue} />
            <KpiCard label="Organic Keywords" value={fmtNum(semrush.organicKeywords)} valueColor={COLOR.green} />
            <KpiCard label="Organic Traffic" value={fmtNum(semrush.organicTraffic)} sub={`Value ${fmtCurrency(semrush.organicTrafficCost)}`} valueColor={COLOR.cyan} />
          </div>

          {/* Organic vs Paid comparison */}
          <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="mb-3 text-sm font-bold text-foreground">Organic Search</p>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Keywords</span>
                  <span className="font-semibold text-foreground">{fmtNum(semrush.organicKeywords)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Traffic</span>
                  <span className="font-semibold text-foreground">{fmtNum(semrush.organicTraffic)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Traffic Cost</span>
                  <span className="font-semibold text-foreground">{fmtCurrency(semrush.organicTrafficCost)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="mb-3 text-sm font-bold text-foreground">Paid Search</p>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Keywords</span>
                  <span className="font-semibold text-foreground">{fmtNum(semrush.paidKeywords)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Traffic</span>
                  <span className="font-semibold text-foreground">{fmtNum(semrush.paidTraffic)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Traffic Cost</span>
                  <span className="font-semibold text-foreground">{fmtCurrency(semrush.paidTrafficCost)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Keywords Table */}
          {semrush.topKeywords && semrush.topKeywords.length > 0 && (
            <div className="mb-5 rounded-xl border border-border bg-card p-5">
              <p className="mb-3 text-sm font-bold text-foreground">Top Organic Keywords</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Keyword</th>
                      <th className="pb-2 px-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pos</th>
                      <th className="pb-2 px-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Volume</th>
                      <th className="pb-2 px-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Traffic</th>
                      <th className="pb-2 pl-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {semrush.topKeywords.map((kw, idx) => (
                      <tr key={idx} className="border-b border-border/50 transition-colors hover:bg-primary/[0.04]">
                        <td className="py-2 pr-4 font-medium text-foreground">{kw.keyword}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          <span
                            className={`inline-flex h-6 w-8 items-center justify-center rounded text-xs font-bold ${
                              kw.position <= 3
                                ? 'bg-emerald-500/12 text-emerald-400'
                                : kw.position <= 10
                                  ? 'bg-amber-500/12 text-amber-400'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {kw.position}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtNum(kw.volume)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtNum(kw.traffic)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{fmtCurrency(kw.cpc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Organic Competitors */}
          {semrush.organicCompetitors && semrush.organicCompetitors.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="mb-3 text-sm font-bold text-foreground">Organic Competitors</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Domain</th>
                      <th className="pb-2 px-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Common KWs</th>
                      <th className="pb-2 pl-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Organic Traffic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {semrush.organicCompetitors.map((comp, idx) => (
                      <tr key={idx} className="border-b border-border/50 transition-colors hover:bg-primary/[0.04]">
                        <td className="py-2 pr-4 font-medium text-foreground">{comp.domain}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtNum(comp.commonKeywords)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{fmtNum(comp.organicTraffic)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

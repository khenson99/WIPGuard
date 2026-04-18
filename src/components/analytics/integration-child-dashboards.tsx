"use client";

import type { ReactNode } from "react";
import type {
  AnalyticsDashboardData,
  CodaKanbanData,
  IntegrationTelemetryData,
} from "@/lib/analytics/types";
import { ExecutiveAiBrief } from "@/components/analytics/executive-ai-brief";
import { FinanceMonthlyHistoryTab } from "@/components/analytics/finance-monthly-history-tab";
import { FinanceStripeTab } from "@/components/analytics/finance-stripe-tab";
import { FinanceHubSpotTab } from "@/components/analytics/finance-hubspot-tab";
import { SalesFunnelTab } from "@/components/analytics/sales-funnel-tab";

export interface IntegrationChildDashboardProps {
  data: AnalyticsDashboardData | null;
}

function fmtInt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

function fmtCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function fmtRatio(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 1 ? `${value.toFixed(1)}%` : `${(value * 100).toFixed(1)}%`;
}

function providerErrors(data: AnalyticsDashboardData | null, sources: string[]): string[] {
  if (!data) return [];
  return (data.errors ?? [])
    .filter((entry) => sources.includes(entry.source))
    .map((entry) => entry.message);
}

function DashboardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function EmptyProviderState({
  title,
  description,
  reasons,
}: {
  title: string;
  description: string;
  reasons?: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      {reasons && reasons.length > 0 ? (
        <p className="mt-2 text-xs text-red-500">{reasons[0]}</p>
      ) : null}
    </div>
  );
}

function MetricGrid({
  metrics,
}: {
  metrics: Array<{ label: string; value: string; subtitle?: string }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{metric.label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{metric.value}</p>
          {metric.subtitle ? <p className="mt-1 text-[11px] text-muted-foreground">{metric.subtitle}</p> : null}
        </div>
      ))}
    </div>
  );
}

function CampaignTable({
  title,
  campaigns,
}: {
  title: string;
  campaigns: Array<{ name: string; spend: number; clicks: number; conversions: number }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {campaigns.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No campaign rows available in this range.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {campaigns.slice(0, 8).map((campaign) => (
            <div
              key={campaign.name}
              className="flex items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2"
            >
              <div>
                <p className="text-sm text-foreground">{campaign.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtInt(campaign.clicks)} clicks · {fmtInt(campaign.conversions)} conv
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground">{fmtCurrency(campaign.spend)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TelemetryDashboard({
  title,
  subtitle,
  telemetry,
  reasons,
}: {
  title: string;
  subtitle: string;
  telemetry: IntegrationTelemetryData | null;
  reasons: string[];
}) {
  if (!telemetry) {
    return <EmptyProviderState title={`${title} data is unavailable`} description={subtitle} reasons={reasons} />;
  }

  return (
    <DashboardShell title={title} subtitle={subtitle}>
      <MetricGrid
        metrics={[
          { label: "Total Rules", value: fmtInt(telemetry.totalRules) },
          { label: "Enabled Rules", value: fmtInt(telemetry.enabledRules) },
          { label: "Errored Rules", value: fmtInt(telemetry.erroredRules) },
          { label: "Events in Range", value: fmtInt(telemetry.eventsInRange) },
          { label: "Receipts", value: fmtInt(telemetry.receiptsInRange) },
          { label: "Tasks Created", value: fmtInt(telemetry.tasksCreatedInRange) },
          { label: "Failures", value: fmtInt(telemetry.failuresInRange) },
          { label: "Failure Ratio", value: fmtPct((telemetry.failuresInRange / Math.max(1, telemetry.eventsInRange)) * 100) },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Top Failure Reasons</h3>
          {telemetry.topFailureReasons.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No failures detected for this range.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {telemetry.topFailureReasons.slice(0, 5).map((reason) => (
                <div key={reason.reason} className="rounded-md border border-border/70 bg-background px-3 py-2">
                  <p className="text-xs text-foreground">{reason.reason}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtInt(reason.count)} occurrences</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">7-Day Ops Trend</h3>
          {telemetry.trend.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No trend data available.</p>
          ) : (
            <div className="mt-3 grid grid-cols-7 gap-2">
              {telemetry.trend.slice(-7).map((point) => {
                const total = point.receipts + point.createdTasks;
                const maxTotal = Math.max(1, ...telemetry.trend.map((t) => t.receipts + t.createdTasks));
                const height = Math.max(8, Math.round((total / maxTotal) * 100));
                return (
                  <div key={point.date} className="flex flex-col items-center gap-1">
                    <div className="flex h-20 w-full items-end">
                      <div className="w-full rounded-sm bg-primary/75" style={{ height: `${height}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{point.date.slice(5)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

function CodaBoardPanel({
  title,
  subtitle,
  coda,
  reasons,
  showCreatorIntelligence = false,
}: {
  title: string;
  subtitle: string;
  coda: CodaKanbanData | null;
  reasons: string[];
  showCreatorIntelligence?: boolean;
}) {
  if (!coda) {
    return <EmptyProviderState title={`${title} data is unavailable`} description={subtitle} reasons={reasons} />;
  }

  const window30 = coda.creatorWindows?.find((window) => window.windowDays === 30);
  const window60 = coda.creatorWindows?.find((window) => window.windowDays === 60);
  const window90 = coda.creatorWindows?.find((window) => window.windowDays === 90);
  const cardsCreated90d = coda.trends?.cardsCreated90d ?? [];
  const newCreators30d = coda.trends?.newCreators30d ?? [];
  const recentCardsCreated = cardsCreated90d.slice(-14);
  const recentNewCreators = newCreators30d.slice(-14);
  const maxCreated = Math.max(1, ...recentCardsCreated.map((point) => point.count));
  const maxNew = Math.max(1, ...recentNewCreators.map((point) => point.count));
  const topCreators30d = window30?.byCreator.slice(0, 8) ?? [];
  const topLeads = coda.engagedLeadCandidates?.slice(0, 12) ?? [];
  const diagnostics = coda.diagnostics;

  return (
    <DashboardShell title={title} subtitle={subtitle}>
      <MetricGrid
        metrics={[
          { label: "Total Cards", value: fmtInt(coda.totalCards) },
          { label: "Unique Statuses", value: fmtInt(coda.cardsByStatus.length) },
          { label: "Recent Cards", value: fmtInt(coda.recentCards.length) },
          {
            label: "Top Status",
            value: coda.cardsByStatus.length ? coda.cardsByStatus[0].status : "—",
            subtitle: coda.cardsByStatus.length ? `${fmtInt(coda.cardsByStatus[0].count)} cards` : undefined,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Cards by Status</h3>
          <div className="mt-2 space-y-2">
            {coda.cardsByStatus.slice(0, 8).map((status) => (
              <div key={status.status} className="flex items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2">
                <p className="text-sm text-foreground">{status.status}</p>
                <p className="text-sm font-semibold text-foreground">{fmtInt(status.count)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Recent Cards</h3>
          {coda.recentCards.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No recent card activity.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {coda.recentCards.slice(0, 6).map((card) => (
                <div key={card.id} className="rounded-md border border-border/70 bg-background px-3 py-2">
                  <p className="text-sm text-foreground">{card.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {card.status}
                    {card.assignee ? ` · ${card.assignee}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreatorIntelligence ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Cards Created (30d)</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{fmtInt(window30?.totalCards)}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmtInt(window30?.uniqueCreators)} creators · trend {fmtPct(window30?.trendDeltaPct ?? null)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Cards Created (60d)</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{fmtInt(window60?.totalCards)}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmtInt(window60?.uniqueCreators)} creators · trend {fmtPct(window60?.trendDeltaPct ?? null)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Cards Created (90d)</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{fmtInt(window90?.totalCards)}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmtInt(window90?.uniqueCreators)} creators · trend {fmtPct(window90?.trendDeltaPct ?? null)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">New Creator Feed</h3>
              {(coda.newCreatorFeed?.length ?? 0) === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No first-time creators observed yet.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {coda.newCreatorFeed?.slice(0, 10).map((creator) => (
                    <div
                      key={`${creator.creator}-${creator.email ?? "unknown"}-${creator.firstSeenAt ?? "none"}`}
                      className="rounded-md border border-border/70 bg-background px-3 py-2"
                    >
                      <p className="text-sm text-foreground">{creator.creator}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {creator.email ?? "unknown"} · first seen{" "}
                        {creator.firstSeenAt ? new Date(creator.firstSeenAt).toLocaleDateString() : "n/a"} ·{" "}
                        {fmtInt(creator.cardsCreated)} cards
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">Top Creators (30d)</h3>
              {topCreators30d.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No creator activity in this window.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {topCreators30d.map((creator) => (
                    <div
                      key={`${creator.creator}-${creator.email ?? "unknown"}`}
                      className="rounded-md border border-border/70 bg-background px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-foreground">{creator.creator}</p>
                        <p className="text-sm font-semibold text-foreground">{fmtInt(creator.cardCount)}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {creator.email ?? "unknown"} · {fmtInt(creator.activeDays)} active days
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">Cards Created per Day (90d)</h3>
              {recentCardsCreated.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No daily card trend yet.</p>
              ) : (
                <div className="mt-3 flex h-24 items-end gap-1">
                  {recentCardsCreated.map((point) => {
                    const height = Math.max(6, Math.round((point.count / maxCreated) * 100));
                    return (
                      <div key={point.date} className="group relative flex-1">
                        <div className="w-full rounded-sm bg-primary/70" style={{ height: `${height}%` }} />
                        <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-secondary px-1 text-[10px] text-foreground opacity-0 group-hover:opacity-100">
                          {point.date.slice(5)} · {point.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">New Creators per Day (30d)</h3>
              {recentNewCreators.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No new-creator trend yet.</p>
              ) : (
                <div className="mt-3 flex h-24 items-end gap-1">
                  {recentNewCreators.map((point) => {
                    const height = Math.max(6, Math.round((point.count / maxNew) * 100));
                    return (
                      <div key={point.date} className="group relative flex-1">
                        <div className="w-full rounded-sm bg-emerald-500/70" style={{ height: `${height}%` }} />
                        <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-secondary px-1 text-[10px] text-foreground opacity-0 group-hover:opacity-100">
                          {point.date.slice(5)} · {point.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Engaged Leads Missing from Funnel</h3>
            {topLeads.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No engaged-lead candidates right now.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2">Creator</th>
                      <th className="pb-2">Email</th>
                      <th className="pb-2">30d Cards</th>
                      <th className="pb-2">Active Days</th>
                      <th className="pb-2">Score</th>
                      <th className="pb-2">Funnel</th>
                      <th className="pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLeads.map((lead) => (
                      <tr key={lead.email} className="border-t border-border/60">
                        <td className="py-2 text-foreground">{lead.creator}</td>
                        <td className="py-2 text-muted-foreground">{lead.email}</td>
                        <td className="py-2 text-foreground">{fmtInt(lead.cards30d)}</td>
                        <td className="py-2 text-foreground">{fmtInt(lead.activeDays30d)}</td>
                        <td className="py-2 text-foreground">{lead.engagementScore.toFixed(1)}</td>
                        <td className="py-2 text-muted-foreground">{lead.funnelStatus}</td>
                        <td className="py-2">
                          <a
                            href={lead.hubspotSearchUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Search in HubSpot
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Creator Intelligence Diagnostics</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Mode: {diagnostics?.creatorResolutionMode ?? "auto_detect"} · Unknown creator ratio:{" "}
              {fmtPct(diagnostics?.unknownCreatorRatio ?? null)} · Unknown cards:{" "}
              {fmtInt(diagnostics?.unknownCardCount)} · HubSpot match errors:{" "}
              {fmtInt(diagnostics?.hubspotMatchingErrors)}
            </p>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}

export function AdsGoogleAnalyticsDashboard({ data }: IntegrationChildDashboardProps) {
  const ga = data?.googleAnalytics;
  const reasons = providerErrors(data, ["googleAnalytics"]);
  if (!ga) {
    return <EmptyProviderState title="Google Analytics data is unavailable" description="Connect Google Analytics to see traffic quality and engagement trends." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Google Analytics" subtitle="Traffic quality, channel mix, and top content performance.">
      <MetricGrid
        metrics={[
          { label: "Sessions (30d)", value: fmtInt(ga.sessions30d), subtitle: `Prev ${fmtInt(ga.sessionsPrev30d)}` },
          { label: "Users (30d)", value: fmtInt(ga.users30d), subtitle: `Prev ${fmtInt(ga.usersPrev30d)}` },
          { label: "Pageviews", value: fmtInt(ga.pageviews30d), subtitle: `Prev ${fmtInt(ga.pageviewsPrev30d)}` },
          { label: "Bounce Rate", value: fmtPct(ga.bounceRate * 100) },
          { label: "Avg Session", value: `${Math.floor(ga.avgSessionDuration / 60)}m ${Math.round(ga.avgSessionDuration % 60)}s` },
          { label: "Top Channels", value: fmtInt(ga.trafficByChannel.length) },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Traffic by Channel</h3>
          <div className="mt-2 space-y-2">
            {ga.trafficByChannel.slice(0, 8).map((channel) => (
              <div key={channel.channel} className="flex items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2">
                <p className="text-sm text-foreground">{channel.channel}</p>
                <p className="text-[11px] text-muted-foreground">{fmtInt(channel.sessions)} sessions</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Top Pages</h3>
          <div className="mt-2 space-y-2">
            {ga.topPages.slice(0, 8).map((page) => (
              <div key={page.path} className="rounded-md border border-border/70 bg-background px-3 py-2">
                <p className="truncate text-sm text-foreground">{page.path}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtInt(page.pageviews)} views · {Math.round(page.avgDuration)}s avg
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export function AdsGoogleAdsDashboard({ data }: IntegrationChildDashboardProps) {
  const googleAds = data?.googleAds;
  const reasons = providerErrors(data, ["googleAds"]);
  if (!googleAds) {
    return <EmptyProviderState title="Google Ads data is unavailable" description="Connect Google Ads to inspect paid acquisition efficiency." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Google Ads" subtitle="Spend efficiency, conversion quality, and campaign-level performance.">
      <MetricGrid
        metrics={[
          { label: "Ad Spend", value: fmtCurrency(googleAds.totalSpend30d) },
          { label: "Impressions", value: fmtInt(googleAds.totalImpressions) },
          { label: "Clicks", value: fmtInt(googleAds.totalClicks) },
          { label: "Conversions", value: fmtInt(googleAds.totalConversions) },
          { label: "CTR", value: fmtPct(googleAds.ctr) },
          { label: "CPC", value: fmtCurrency(googleAds.cpc) },
          { label: "CPA", value: fmtCurrency(googleAds.cpa) },
          { label: "ROAS", value: googleAds.roas.toFixed(2) },
        ]}
      />
      <CampaignTable title="Top Campaigns" campaigns={googleAds.campaigns} />
    </DashboardShell>
  );
}

export function AdsMetaAdsDashboard({ data }: IntegrationChildDashboardProps) {
  const metaAds = data?.metaAds;
  const reasons = providerErrors(data, ["metaAds", "metaPage", "instagram"]);
  if (!metaAds) {
    return <EmptyProviderState title="Meta Ads data is unavailable" description="Connect Meta to inspect paid social campaign efficiency." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Meta Ads" subtitle="Campaign spend, click quality, and paid social conversion throughput.">
      <MetricGrid
        metrics={[
          { label: "Ad Spend", value: fmtCurrency(metaAds.totalSpend30d) },
          { label: "Impressions", value: fmtInt(metaAds.totalImpressions) },
          { label: "Clicks", value: fmtInt(metaAds.totalClicks) },
          { label: "Conversions", value: fmtInt(metaAds.totalConversions) },
          { label: "CTR", value: fmtPct(metaAds.ctr) },
          { label: "CPC", value: fmtCurrency(metaAds.cpc) },
          { label: "CPA", value: fmtCurrency(metaAds.cpa) },
          { label: "Campaigns", value: fmtInt(metaAds.campaigns.length) },
        ]}
      />
      <CampaignTable title="Top Campaigns" campaigns={metaAds.campaigns} />
    </DashboardShell>
  );
}

export function AdsRedditAdsDashboard({ data }: IntegrationChildDashboardProps) {
  const redditAds = data?.redditAds;
  const reasons = providerErrors(data, ["redditAds", "redditOps"]);
  if (!redditAds) {
    return <EmptyProviderState title="Reddit Ads data is unavailable" description="Connect Reddit Ads to see campaign reach and click efficiency." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Reddit Ads" subtitle="Community campaign reach and spend efficiency by campaign.">
      <MetricGrid
        metrics={[
          { label: "Ad Spend", value: fmtCurrency(redditAds.totalSpend30d) },
          { label: "Impressions", value: fmtInt(redditAds.totalImpressions) },
          { label: "Clicks", value: fmtInt(redditAds.totalClicks) },
          { label: "CTR", value: fmtPct(redditAds.ctr) },
          { label: "CPC", value: fmtCurrency(redditAds.cpc) },
          { label: "Campaigns", value: fmtInt(redditAds.campaigns.length) },
        ]}
      />
      <CampaignTable
        title="Top Campaigns"
        campaigns={redditAds.campaigns.map((campaign) => ({
          ...campaign,
          conversions: campaign.conversions ?? 0,
        }))}
      />
    </DashboardShell>
  );
}

export function AdsWebflowDashboard({ data }: IntegrationChildDashboardProps) {
  const webflow = data?.webflow;
  const reasons = providerErrors(data, ["webflow"]);
  if (!webflow) {
    return <EmptyProviderState title="Webflow data is unavailable" description="Connect Webflow to inspect site and form-conversion metrics." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Webflow" subtitle="Site publishing health, form volume, and CMS footprint.">
      <MetricGrid
        metrics={[
          { label: "Site", value: webflow.siteName || "—" },
          { label: "Pages", value: fmtInt(webflow.totalPages) },
          { label: "Collections", value: fmtInt(webflow.totalCollections) },
          { label: "Custom Domains", value: fmtInt(webflow.customDomains.length) },
          { label: "Form Types", value: fmtInt(webflow.formSubmissions.length) },
          { label: "Last Published", value: webflow.lastPublished ? new Date(webflow.lastPublished).toLocaleDateString() : "—" },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Form Submissions</h3>
          <div className="mt-2 space-y-2">
            {webflow.formSubmissions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No form submissions found for this range.</p>
            ) : (
              webflow.formSubmissions.slice(0, 8).map((form) => (
                <div key={form.formName} className="flex items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2">
                  <p className="text-sm text-foreground">{form.formName}</p>
                  <p className="text-sm font-semibold text-foreground">{fmtInt(form.count)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Custom Domains</h3>
          <div className="mt-2 space-y-2">
            {webflow.customDomains.length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom domains configured.</p>
            ) : (
              webflow.customDomains.map((domain) => (
                <div key={domain} className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-foreground">
                  {domain}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export function AdsSemrushDashboard({ data }: IntegrationChildDashboardProps) {
  const semrush = data?.semrush;
  const reasons = providerErrors(data, ["semrush"]);
  if (!semrush) {
    return <EmptyProviderState title="SEMrush data is unavailable" description="Connect SEMrush to inspect SEO and competitor trends." reasons={reasons} />;
  }

  return (
    <DashboardShell title="SEMrush" subtitle="SEO authority, keyword footprint, and competitor movement.">
      <MetricGrid
        metrics={[
          { label: "Domain", value: semrush.domain || "—" },
          { label: "Authority Score", value: fmtInt(semrush.authorityScore) },
          { label: "Backlinks", value: fmtInt(semrush.backlinks) },
          { label: "Organic Keywords", value: fmtInt(semrush.organicKeywords) },
          { label: "Organic Traffic", value: fmtInt(semrush.organicTraffic) },
          { label: "Paid Keywords", value: fmtInt(semrush.paidKeywords) },
          { label: "Paid Traffic", value: fmtInt(semrush.paidTraffic) },
          { label: "Traffic Cost", value: fmtCurrency(semrush.organicTrafficCost + semrush.paidTrafficCost) },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Top Keywords</h3>
          <div className="mt-2 space-y-2">
            {semrush.topKeywords.slice(0, 8).map((keyword) => (
              <div key={keyword.keyword} className="rounded-md border border-border/70 bg-background px-3 py-2">
                <p className="text-sm text-foreground">{keyword.keyword}</p>
                <p className="text-[11px] text-muted-foreground">
                  Pos {keyword.position} · Vol {fmtInt(keyword.volume)} · Traffic {fmtInt(keyword.traffic)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Top Competitors</h3>
          <div className="mt-2 space-y-2">
            {semrush.organicCompetitors.slice(0, 8).map((competitor) => (
              <div key={competitor.domain} className="rounded-md border border-border/70 bg-background px-3 py-2">
                <p className="text-sm text-foreground">{competitor.domain}</p>
                <p className="text-[11px] text-muted-foreground">
                  Common {fmtInt(competitor.commonKeywords)} · Organic {fmtInt(competitor.organicTraffic)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export function AdsCodaKanbanDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <CodaBoardPanel
      title="Coda Kanban"
      subtitle="Kanban workflow depth and card status distribution for growth execution."
      coda={data?.coda ?? null}
      reasons={providerErrors(data, ["coda", "codaOps"])}
      showCreatorIntelligence
    />
  );
}

export function FinanceMercuryDashboard({ data }: IntegrationChildDashboardProps) {
  const mercury = data?.mercury;
  const reasons = providerErrors(data, ["mercury"]);
  if (!mercury) {
    return <EmptyProviderState title="Mercury data is unavailable" description="Connect Mercury to inspect cash position and runway." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Mercury" subtitle="Cash position, burn profile, and account-level liquidity.">
      <MetricGrid
        metrics={[
          { label: "Total Balance", value: fmtCurrency(mercury.cashFlow.totalBalance) },
          { label: "Inflows (30d)", value: fmtCurrency(mercury.cashFlow.inflows30d) },
          { label: "Outflows (30d)", value: fmtCurrency(mercury.cashFlow.outflows30d) },
          { label: "Net Cash Flow", value: fmtCurrency(mercury.cashFlow.netCashFlow) },
          { label: "Runway", value: `${mercury.cashFlow.runway.toFixed(1)} mo` },
          { label: "Burn Rate", value: fmtCurrency(mercury.cashFlow.burnRate) },
        ]}
      />

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Accounts</h3>
        <div className="mt-2 space-y-2">
          {mercury.accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No account rows available.</p>
          ) : (
            mercury.accounts.map((account) => (
              <div key={account.accountId} className="flex items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2">
                <div>
                  <p className="text-sm text-foreground">{account.accountName}</p>
                  <p className="text-[11px] text-muted-foreground">{account.type}</p>
                </div>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(account.balance)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

export function FinanceStripeDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <DashboardShell title="Stripe" subtitle="Recurring revenue, subscription quality, and payment reliability.">
      <FinanceStripeTab data={data} />
    </DashboardShell>
  );
}

export function FinanceHubSpotDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <DashboardShell title="HubSpot Revenue Lifecycle" subtitle="Deal-stage progression through trial, subscription, and churn.">
      <FinanceHubSpotTab data={data} />
    </DashboardShell>
  );
}

export function FinanceMonthlyHistoryDashboard() {
  return (
    <DashboardShell title="Monthly History" subtitle="Month-over-month P&L trends, cash movement, and operating snapshots.">
      <FinanceMonthlyHistoryTab />
    </DashboardShell>
  );
}

export function FinanceAiBriefDashboard() {
  return (
    <DashboardShell title="AI Executive Brief" subtitle="AI-generated summary of recent financial trends, risks, and recommended actions.">
      <ExecutiveAiBrief />
    </DashboardShell>
  );
}

export function SalesHubSpotDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <DashboardShell title="HubSpot Pipeline" subtitle="Stage conversion, bottlenecks, and source quality for sales execution.">
      <SalesFunnelTab data={data} />
    </DashboardShell>
  );
}

export function SalesStripeDashboard({ data }: IntegrationChildDashboardProps) {
  const stripe = data?.stripe;
  const reasons = providerErrors(data, ["stripe"]);
  if (!stripe) {
    return <EmptyProviderState title="Stripe sales data is unavailable" description="Connect Stripe to monitor subscription-led sales outcomes." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Stripe Sales Lens" subtitle="Commercial outcomes from subscription motion and payment behavior.">
      <MetricGrid
        metrics={[
          { label: "MRR", value: fmtCurrency(stripe.revenue.mrr), subtitle: `${stripe.revenue.mrrChange.toFixed(1)}% MoM` },
          { label: "Active Subs", value: fmtInt(stripe.subscriptions.active) },
          { label: "Trialing", value: fmtInt(stripe.subscriptions.trialing) },
          { label: "Past Due", value: fmtInt(stripe.subscriptions.pastDue) },
          { label: "Churn Rate", value: fmtRatio(stripe.subscriptions.churnRate) },
          { label: "Canceled", value: fmtInt(stripe.subscriptions.canceled) },
          { label: "Payment Success", value: fmtRatio(stripe.payments.successRate) },
          { label: "Failed Payments", value: fmtInt(stripe.payments.failed) },
        ]}
      />

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Recent Churn Events</h3>
        {stripe.subscriptions.recentChurnEvents.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No recent churn events in this range.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {stripe.subscriptions.recentChurnEvents.slice(0, 8).map((event) => (
              <div key={`${event.customer}-${event.canceledAt}`} className="rounded-md border border-border/70 bg-background px-3 py-2">
                <p className="text-sm text-foreground">{event.customer}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(event.canceledAt).toLocaleDateString()} · {fmtCurrency(event.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

export function SalesGoogleWorkspaceDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <TelemetryDashboard
      title="Google Workspace"
      subtitle="Sales workflow automation health across Gmail/Calendar/Drive processing rules."
      telemetry={data?.googleWorkspace ?? null}
      reasons={providerErrors(data, ["googleWorkspace"])}
    />
  );
}

export function SalesSlackDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <TelemetryDashboard
      title="Slack"
      subtitle="Sales execution automations and failure diagnostics from Slack workflows."
      telemetry={data?.slack ?? null}
      reasons={providerErrors(data, ["slack"])}
    />
  );
}

export function SalesPerformanceDashboard({ data }: IntegrationChildDashboardProps) {
  if (!data) {
    return (
      <EmptyProviderState
        title="Sales performance data is unavailable"
        description="Sales performance metrics are unavailable for this range."
        reasons={providerErrors(data, ["lifecycleFunnel", "funnelJourney"])}
      />
    );
  }

  return (
    <DashboardShell
      title="Sales Performance"
      subtitle="Pipeline conversion and velocity metrics used to understand sales motion health."
    >
      <SalesFunnelTab data={data} />
    </DashboardShell>
  );
}
export function CustomerSuccessPylonDashboard({ data }: IntegrationChildDashboardProps) {
  const pylon = data?.pylon;
  const reasons = providerErrors(data, ["pylon"]);
  if (!pylon) {
    return <EmptyProviderState title="Pylon data is unavailable" description="Connect Pylon to inspect support load and response quality." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Pylon" subtitle="Support urgency, queue depth, and customer response quality.">
      <MetricGrid
        metrics={[
          { label: "Open Conversations", value: fmtInt(pylon.openConversations) },
          { label: "Urgent", value: fmtInt(pylon.urgentConversations) },
          { label: "Waiting on Team", value: fmtInt(pylon.waitingOnTeam) },
          { label: "Resolved", value: fmtInt(pylon.resolvedInRange) },
          { label: "Avg First Response", value: pylon.avgFirstResponseMinutes === null ? "—" : `${Math.round(pylon.avgFirstResponseMinutes)} min` },
          { label: "CSAT", value: pylon.csat === null ? "—" : pylon.csat.toFixed(2) },
        ]}
      />
    </DashboardShell>
  );
}

export function CustomerSuccessCodaDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <CodaBoardPanel
      title="Coda"
      subtitle="Customer success execution board health and card movement signals."
      coda={data?.coda ?? null}
      reasons={providerErrors(data, ["coda", "codaOps"])}
    />
  );
}

export function CustomerSuccessProductDashboard({ data }: IntegrationChildDashboardProps) {
  const product = data?.product;
  const reasons = providerErrors(data, ["product"]);
  if (!product) {
    return <EmptyProviderState title="Product data is unavailable" description="Product execution metrics are unavailable for this range." reasons={reasons} />;
  }

  return (
    <DashboardShell title="Product" subtitle="Execution throughput and backlog health for customer-success commitments.">
      <MetricGrid
        metrics={[
          { label: "Active Contributors", value: fmtInt(product.activeContributors) },
          { label: "Created Tasks", value: fmtInt(product.createdTasksInRange) },
          { label: "Completed Tasks", value: fmtInt(product.completedTasksInRange) },
          { label: "Overdue Open", value: fmtInt(product.overdueOpenTasks) },
          { label: "Backlog Growth", value: fmtInt(product.backlogGrowth) },
          { label: "Throughput", value: fmtRatio(product.throughputRate) },
        ]}
      />
    </DashboardShell>
  );
}

export function CustomerSuccessGoogleWorkspaceDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <TelemetryDashboard
      title="Google Workspace"
      subtitle="Customer-success workflow automation health from Workspace triggers and processors."
      telemetry={data?.googleWorkspace ?? null}
      reasons={providerErrors(data, ["googleWorkspace"])}
    />
  );
}

export function CustomerSuccessSlackDashboard({ data }: IntegrationChildDashboardProps) {
  return (
    <TelemetryDashboard
      title="Slack"
      subtitle="Customer-success automation throughput and failure diagnostics in Slack."
      telemetry={data?.slack ?? null}
      reasons={providerErrors(data, ["slack"])}
    />
  );
}

export const INTEGRATION_CHILD_DASHBOARD_REGISTRY: Record<string, (props: IntegrationChildDashboardProps) => ReactNode> = {
  "ads-google-analytics": AdsGoogleAnalyticsDashboard,
  "ads-google-ads": AdsGoogleAdsDashboard,
  "ads-meta-ads": AdsMetaAdsDashboard,
  "ads-reddit-ads": AdsRedditAdsDashboard,
  "ads-webflow": AdsWebflowDashboard,
  "ads-semrush": AdsSemrushDashboard,
  "ads-coda-kanban": AdsCodaKanbanDashboard,
  "finance-mercury": FinanceMercuryDashboard,
  "finance-stripe": FinanceStripeDashboard,
  "finance-hubspot": FinanceHubSpotDashboard,
  "finance-monthly-history": FinanceMonthlyHistoryDashboard,
  "finance-ai-brief": FinanceAiBriefDashboard,
  "sales-hubspot": SalesHubSpotDashboard,
  "sales-stripe": SalesStripeDashboard,
  "sales-performance": SalesPerformanceDashboard,
  "sales-google-workspace": SalesGoogleWorkspaceDashboard,
  "sales-slack": SalesSlackDashboard,
  "cs-pylon": CustomerSuccessPylonDashboard,
  "cs-coda": CustomerSuccessCodaDashboard,
  "cs-product": CustomerSuccessProductDashboard,
  "cs-google-workspace": CustomerSuccessGoogleWorkspaceDashboard,
  "cs-slack": CustomerSuccessSlackDashboard,
};

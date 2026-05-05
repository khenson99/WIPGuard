"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  Users,
  Megaphone,
  HeadphonesIcon,
  RefreshCw,
  ArrowRight,
  Settings,
  Activity,
} from "lucide-react";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-error-banner";
import { DashboardStaleBanner } from "@/components/dashboard/dashboard-stale-banner";
import { useDashboardResource } from "@/components/dashboard/use-dashboard-resource";
import { AreaTrend } from "@/components/charts/area-trend";
import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { SparkLine } from "@/components/charts/spark-line";
import { getChartColor } from "@/components/charts/chart-theme";
import { fmt$, fmtN, fmtPct, ChangeIndicator, SectionCard } from "@/components/analytics/dashboard-primitives";
import type { ExecutiveOverviewPayload } from "@/lib/dashboard/executive-overview-types";
import { isExecutiveOverviewPayload } from "@/lib/dashboard/executive-overview-types";

const CACHE_KEY = "dashboard:overview:v1";

/* ── KPI card ────────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  icon,
  change,
  sparkData,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  change?: { current: number; previous: number; invert?: boolean };
  sparkData?: number[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <div className="flex items-center gap-2">
          {sparkData && sparkData.length >= 2 && (
            <SparkLine data={sparkData} width={56} height={24} />
          )}
          {change && (
            <ChangeIndicator
              current={change.current}
              previous={change.previous}
              invertColors={change.invert}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Disconnected placeholder ────────────────────────────── */

function DisconnectedSection({ domain, settingsHref }: { domain: string; settingsHref?: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-secondary/20 text-center">
      <Settings className="mb-3 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-muted-foreground">Connect {domain}</p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Set up your integration to see {domain.toLowerCase()} metrics here.
      </p>
      {settingsHref && (
        <Link
          href={settingsHref}
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/60"
        >
          Integration settings <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

/* ── Section link footer ─────────────────────────────────── */

function SectionFooter({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

/* ── Status badge ────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  connected: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  partial: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  degraded: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  missing: "bg-secondary text-muted-foreground border-border",
};

function StatusBadge({
  label,
  status,
  href,
}: {
  label: string;
  status: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-80 ${STATUS_STYLES[status] ?? STATUS_STYLES.missing}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "connected"
            ? "bg-emerald-500"
            : status === "partial"
              ? "bg-amber-500"
              : status === "degraded"
                ? "bg-red-500"
                : "bg-muted-foreground/40"
        }`}
      />
      {label}
    </Link>
  );
}

/* ── Finance section ─────────────────────────────────────── */

function FinanceSection({ data }: { data: ExecutiveOverviewPayload["finance"] }) {
  if (!data.connected) {
    return (
      <SectionCard title="Finance" subtitle="Revenue, cash, and runway">
        <DisconnectedSection domain="Stripe / Mercury" settingsHref="/settings/integrations" />
      </SectionCard>
    );
  }

  const trendData = data.revenueTrend.map((t) => ({
    month: t.month,
    revenue: t.revenue,
  }));

  return (
    <SectionCard title="Finance" subtitle="Revenue, cash, and runway">
      <div className="space-y-5">
        {/* KPIs row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">MRR</p>
            <p className="text-lg font-bold tabular-nums">{fmt$(data.mrr)}</p>
            <ChangeIndicator current={data.mrr} previous={data.mrr - data.mrrChange} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Subscriptions</p>
            <p className="text-lg font-bold tabular-nums">{fmtN(data.activeSubscriptions)}</p>
            <p className="text-xs text-muted-foreground">{fmtPct(data.churnRate)} churn</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cash Balance</p>
            <p className="text-lg font-bold tabular-nums">{fmt$(data.totalBalance)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Runway</p>
            <p className="text-lg font-bold tabular-nums">
              {data.runway > 0 ? `${Math.round(data.runway)}mo` : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.burnRate > 0 ? `${fmt$(data.burnRate)}/mo burn` : ""}
            </p>
          </div>
        </div>

        {/* Revenue trend chart */}
        {trendData.length >= 2 && (
          <AreaTrend
            data={trendData}
            xKey="month"
            yKeys={["revenue"]}
            height={180}
            yFormatter={(v) => fmt$(v)}
          />
        )}

        <SectionFooter href="/analytics/finance" label="View full finance dashboard" />
      </div>
    </SectionCard>
  );
}

/* ── Traffic section ─────────────────────────────────────── */

function TrafficSection({ data }: { data: ExecutiveOverviewPayload["traffic"] }) {
  if (!data.connected) {
    return (
      <SectionCard title="Traffic & Marketing" subtitle="Web sessions and channels">
        <DisconnectedSection domain="Google Analytics" settingsHref="/settings/integrations" />
      </SectionCard>
    );
  }

  const trendData = data.dailyTrend.map((t) => ({
    date: t.date,
    sessions: t.sessions,
  }));

  return (
    <SectionCard title="Traffic & Marketing" subtitle="Web sessions and channels">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Sessions (30d)</p>
            <p className="text-lg font-bold tabular-nums">{fmtN(data.sessions30d)}</p>
            <ChangeIndicator current={data.sessions30d} previous={data.sessionsPrev30d} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Users (30d)</p>
            <p className="text-lg font-bold tabular-nums">{fmtN(data.users30d)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Bounce Rate</p>
            <p className="text-lg font-bold tabular-nums">{fmtPct(data.bounceRate)}</p>
          </div>
        </div>

        {/* Daily sessions chart */}
        {trendData.length >= 2 && (
          <AreaTrend
            data={trendData}
            xKey="date"
            yKeys={["sessions"]}
            height={180}
            yFormatter={(v) => fmtN(v)}
            xFormatter={(d) => {
              const parts = d.split("-");
              return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
            }}
          />
        )}

        {/* Top channels */}
        {data.topChannels.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Top Channels</p>
            <div className="space-y-1.5">
              {data.topChannels.map((ch) => (
                <div key={ch.channel} className="flex items-center justify-between text-sm">
                  <span className="truncate text-foreground">{ch.channel}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtN(ch.sessions)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <SectionFooter href="/analytics/website-traffic" label="View full traffic dashboard" />
      </div>
    </SectionCard>
  );
}

/* ── Sales section ───────────────────────────────────────── */

function SalesSection({ data }: { data: ExecutiveOverviewPayload["sales"] }) {
  if (!data.connected) {
    return (
      <SectionCard title="Sales Pipeline" subtitle="Deal flow and conversion">
        <DisconnectedSection domain="HubSpot" settingsHref="/settings/integrations" />
      </SectionCard>
    );
  }

  const funnelStages = data.stages.slice(0, 8).map((stage, i) => ({
    label: stage.label,
    value: stage.count,
    color: getChartColor(i),
  }));

  return (
    <SectionCard title="Sales Pipeline" subtitle="Deal flow and conversion">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Pipeline Value</p>
            <p className="text-lg font-bold tabular-nums">{fmt$(data.pipelineValue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Deals</p>
            <p className="text-lg font-bold tabular-nums">{fmtN(data.totalDeals)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-lg font-bold tabular-nums">{fmtPct(data.winRate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Deal Size</p>
            <p className="text-lg font-bold tabular-nums">{fmt$(data.avgDealSize)}</p>
          </div>
        </div>

        {/* Pipeline funnel */}
        {funnelStages.length > 0 && (
          <HorizontalFunnel
            stages={funnelStages}
            height={Math.min(280, funnelStages.length * 40 + 40)}
            valueFormatter={(v) => fmtN(v)}
          />
        )}

        <SectionFooter href="/analytics/sales-pipeline" label="View full sales dashboard" />
      </div>
    </SectionCard>
  );
}

/* ── Customer Success section ────────────────────────────── */

function CustomerSuccessSection({ data }: { data: ExecutiveOverviewPayload["customerSuccess"] }) {
  if (!data.connected) {
    return (
      <SectionCard title="Customer Success" subtitle="Support and product adoption">
        <DisconnectedSection domain="Pylon" settingsHref="/settings/integrations" />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Customer Success" subtitle="Support and product adoption">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Open Conversations</p>
            <p className="text-lg font-bold tabular-nums">{fmtN(data.openConversations)}</p>
            {data.urgentConversations > 0 && (
              <p className="text-xs font-medium text-red-500">{data.urgentConversations} urgent</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Response Time</p>
            <p className="text-lg font-bold tabular-nums">
              {data.avgFirstResponseMinutes !== null
                ? data.avgFirstResponseMinutes < 60
                  ? `${Math.round(data.avgFirstResponseMinutes)}m`
                  : `${(data.avgFirstResponseMinutes / 60).toFixed(1)}h`
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">CSAT</p>
            <p className="text-lg font-bold tabular-nums">
              {data.csat !== null ? fmtPct(data.csat) : "N/A"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Resolved (Range)</p>
            <p className="text-xl font-bold tabular-nums">{fmtN(data.resolvedInRange)}</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Tasks Completed</p>
            <p className="text-xl font-bold tabular-nums">{fmtN(data.completedTasks)}</p>
            {data.throughputRate !== null && (
              <p className="text-xs text-muted-foreground">{fmtPct(data.throughputRate)} throughput</p>
            )}
          </div>
        </div>

        <SectionFooter href="/analytics/customer-success" label="View full CS dashboard" />
      </div>
    </SectionCard>
  );
}

/* ── Main component ──────────────────────────────────────── */

export function ExecutiveOverviewDashboard() {
  const resource = useDashboardResource<ExecutiveOverviewPayload>({
    cacheKey: CACHE_KEY,
    deps: [],
    load: async ({ signal, refresh }) => {
      const response = await fetch("/api/dashboard/overview", {
        signal,
        cache: refresh ? "no-store" : "default",
      });

      if (!response.ok) {
        throw new Error(`Dashboard request failed (${response.status})`);
      }

      const payload = (await response.json()) as unknown;
      if (!isExecutiveOverviewPayload(payload)) {
        throw new Error("Dashboard response payload is invalid");
      }
      return payload;
    },
    getLastUpdatedAt: (payload) => payload.meta?.servedAt ?? payload.generatedAt,
    mapError: (error) => {
      if (error instanceof Error && error.message.trim().length > 0) return error.message;
      return "Could not load executive overview.";
    },
  });

  const data = resource.data;

  const revenueTrendSpark = useMemo(() => {
    if (!data?.finance.revenueTrend) return [];
    return data.finance.revenueTrend.map((t) => t.revenue);
  }, [data]);

  const sessionsTrendSpark = useMemo(() => {
    if (!data?.traffic.dailyTrend) return [];
    // Last 14 days for a clean sparkline
    return data.traffic.dailyTrend.slice(-14).map((t) => t.sessions);
  }, [data]);

  /* ── Loading state ──────────────────────────────────── */

  if (resource.loading && !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <DashboardLoadingState />
      </div>
    );
  }

  /* ── Error-only state (no cached data) ──────────────── */

  if (!data && resource.error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <DashboardErrorBanner
          message={resource.error}
          onRetry={resource.refresh}
          settingsHref="/settings/integrations"
        />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          {resource.lastUpdatedAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Updated {new Date(resource.lastUpdatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={resource.refresh}
          disabled={resource.refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-secondary/60 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${resource.refreshing ? "animate-spin" : ""}`} />
          {resource.refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Stale banner */}
      {resource.stale && (
        <DashboardStaleBanner
          lastUpdatedAt={resource.lastUpdatedAt}
          onRefresh={resource.refresh}
          refreshing={resource.refreshing}
        />
      )}

      {/* Error banner (with stale cached data) */}
      {resource.error && !resource.stale && (
        <DashboardErrorBanner message={resource.error} onRetry={resource.refresh} />
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="MRR"
          value={data.finance.connected ? fmt$(data.finance.mrr) : "--"}
          icon={<DollarSign className="h-4 w-4" />}
          change={
            data.finance.connected
              ? { current: data.finance.mrr, previous: data.finance.mrr - data.finance.mrrChange }
              : undefined
          }
          sparkData={revenueTrendSpark.length >= 2 ? revenueTrendSpark : undefined}
        />
        <KpiCard
          label="Revenue (30d)"
          value={data.finance.connected ? fmt$(data.finance.totalRevenue30d) : "--"}
          icon={<TrendingUp className="h-4 w-4" />}
          change={
            data.finance.connected
              ? { current: data.finance.totalRevenue30d, previous: data.finance.totalRevenuePrev30d }
              : undefined
          }
        />
        <KpiCard
          label="Sessions (30d)"
          value={data.traffic.connected ? fmtN(data.traffic.sessions30d) : "--"}
          icon={<BarChart3 className="h-4 w-4" />}
          change={
            data.traffic.connected
              ? { current: data.traffic.sessions30d, previous: data.traffic.sessionsPrev30d }
              : undefined
          }
          sparkData={sessionsTrendSpark.length >= 2 ? sessionsTrendSpark : undefined}
        />
        <KpiCard
          label="Pipeline"
          value={data.sales.connected ? fmt$(data.sales.pipelineValue) : "--"}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Open Support"
          value={data.customerSuccess.connected ? fmtN(data.customerSuccess.openConversations) : "--"}
          icon={<HeadphonesIcon className="h-4 w-4" />}
        />
        <KpiCard
          label="Ad Spend (30d)"
          value={data.adSpend.connected ? fmt$(data.adSpend.totalSpend30d) : "--"}
          icon={<Megaphone className="h-4 w-4" />}
        />
      </div>

      {/* Two-column domain sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FinanceSection data={data.finance} />
        <TrafficSection data={data.traffic} />
        <SalesSection data={data.sales} />
        <CustomerSuccessSection data={data.customerSuccess} />
      </div>

      {/* Ad Spend summary (single row) */}
      {data.adSpend.connected && (
        <SectionCard title="Ad Spend Overview" subtitle="Blended metrics across all ad platforms">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-xs text-muted-foreground">Total Spend</p>
              <p className="text-lg font-bold tabular-nums">{fmt$(data.adSpend.totalSpend30d)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Impressions</p>
              <p className="text-lg font-bold tabular-nums">{fmtN(data.adSpend.totalImpressions)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Clicks</p>
              <p className="text-lg font-bold tabular-nums">{fmtN(data.adSpend.totalClicks)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conversions</p>
              <p className="text-lg font-bold tabular-nums">{fmtN(data.adSpend.totalConversions)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Blended CTR</p>
              <p className="text-lg font-bold tabular-nums">{fmtPct(data.adSpend.blendedCtr)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Blended CPA</p>
              <p className="text-lg font-bold tabular-nums">{fmt$(data.adSpend.blendedCpa)}</p>
            </div>
          </div>
          <SectionFooter href="/analytics/social-media" label="View full social media performance" />
        </SectionCard>
      )}

      {/* Integration health strip */}
      {data.sections.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Integration Health</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.sections.map((section) => (
              <StatusBadge
                key={section.id}
                label={section.label}
                status={section.status}
                href={section.href}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

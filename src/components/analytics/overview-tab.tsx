"use client";

import { memo, useMemo } from "react";
import {
  DollarSign, Users, TrendingUp, Wallet,
  ArrowUpRight, ArrowDownRight, Activity, CreditCard,
  Globe, Megaphone,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { BarDisplay, RingStat } from "./bar-display";

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+∞%" : "—";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

export function OverviewTab({ data }: { data: AnalyticsDashboardData | null }) {
  if (!data) return <EmptyState />;

  const { hubspot, stripe, mercury, googleAnalytics, googleAds, metaAds } = data;
  const funnel = hubspot?.funnel;
  const ga = googleAnalytics;
  const financeSummary = data.metrics?.finance.summary ?? null;

  // Compute total ad spend across platforms
  const totalAdSpend =
    (googleAds?.totalSpend30d || 0) + (metaAds?.totalSpend30d || 0);
  const hasAdData = !!(googleAds || metaAds);

  return (
    <div className="space-y-6">
      {/* Top KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Monthly Recurring Revenue"
          value={financeSummary ? fmt$(financeSummary.mrr) : "—"}
          change={financeSummary ? `${financeSummary.revenueGrowth >= 0 ? "+" : ""}${financeSummary.revenueGrowth.toFixed(1)}% vs prev 30d` : undefined}
          changeType={financeSummary && financeSummary.revenueGrowth >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        />
        <StatCard
          label="Website Sessions (30d)"
          value={ga ? fmtN(ga.sessions30d) : "—"}
          change={ga ? pctChange(ga.sessions30d, ga.sessionsPrev30d) : undefined}
          changeType={ga && ga.sessions30d >= ga.sessionsPrev30d ? "positive" : "negative"}
          icon={Globe}
        />
        <StatCard
          label="Pipeline Deals"
          value={funnel ? funnel.totalDeals.toLocaleString() : "—"}
          subtitle={funnel ? `${funnel.closedWon} won · ${funnel.closedLost} lost` : undefined}
          icon={Users}
        />
        <StatCard
          label="Cash Balance"
          value={financeSummary ? fmt$(financeSummary.cashBalance) : "—"}
          change={financeSummary ? `${financeSummary.runwayMonths.toFixed(1)} months runway` : undefined}
          subtitle={
            financeSummary && financeSummary.bankCash !== null && financeSummary.treasuryCash !== null
              ? `${fmt$(financeSummary.bankCash)} bank · ${fmt$(financeSummary.treasuryCash)} Treasury`
              : undefined
          }
          changeType={
            financeSummary && financeSummary.runwayMonths > 6
              ? "positive"
              : financeSummary && financeSummary.runwayMonths > 3
                ? "neutral"
                : "negative"
          }
          icon={Wallet}
        />
      </div>

      {/* Ad Spend + Subscriptions Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active Subscriptions"
          value={financeSummary ? financeSummary.activeSubscriptions.toLocaleString() : "—"}
          subtitle={
            financeSummary
              ? `${financeSummary.pastDueSubscriptions} past due · ${financeSummary.trialingSubscriptions} trialing`
              : undefined
          }
          icon={CreditCard}
        />
        <StatCard
          label="Total Ad Spend (30d)"
          value={hasAdData ? fmt$(totalAdSpend) : "—"}
          subtitle={hasAdData ? [
            googleAds ? `Google: ${fmt$(googleAds.totalSpend30d)}` : null,
            metaAds ? `Meta: ${fmt$(metaAds.totalSpend30d)}` : null,
          ].filter(Boolean).join(" · ") : undefined}
          icon={Megaphone}
        />
        <StatCard
          label="Unique Visitors (30d)"
          value={ga ? fmtN(ga.users30d) : "—"}
          change={ga ? pctChange(ga.users30d, ga.usersPrev30d) : undefined}
          changeType={ga && ga.users30d >= ga.usersPrev30d ? "positive" : "negative"}
          icon={Users}
        />
        <StatCard
          label="Bounce Rate"
          value={ga ? fmtPct(ga.bounceRate * 100) : "—"}
          subtitle={ga ? `Avg session: ${Math.round(ga.avgSessionDuration)}s` : undefined}
          icon={Activity}
        />
      </div>

      {/* Second Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue & Cash Flow */}
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Revenue & Cash Flow</h3>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <MiniStat
              label="Revenue (30d)"
              value={financeSummary ? fmt$(financeSummary.totalRevenue30d) : "—"}
              icon={<ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />}
            />
            <MiniStat
              label="Inflows (30d)"
              value={financeSummary ? fmt$(financeSummary.inflows30d) : "—"}
              icon={<ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />}
            />
            <MiniStat
              label="Outflows (30d)"
              value={financeSummary ? fmt$(financeSummary.outflows30d) : "—"}
              icon={<ArrowDownRight className="h-3.5 w-3.5 text-red-500" />}
            />
            <MiniStat
              label="Net Cash Flow"
              value={financeSummary ? fmt$(financeSummary.netCashFlow30d) : "—"}
              icon={<Activity className="h-3.5 w-3.5 text-primary" />}
            />
          </div>

          {/* Revenue Trend Bars */}
          {stripe?.revenueTrend && stripe.revenueTrend.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs text-muted-foreground">Revenue Trend</p>
              <RevenueTrendBars trend={stripe.revenueTrend} />
            </div>
          )}
        </div>

        {/* Win Rates Ring */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Sales Performance</h3>
          {funnel ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-6">
                <RingStat
                  value={funnel.winRate}
                  max={100}
                  label="Win Rate"
                  color="var(--primary)"
                  size={100}
                />
                <RingStat
                  value={funnel.effectiveWinRate}
                  max={100}
                  label="Effective"
                  color="#4379f0"
                  size={100}
                />
              </div>
              <div className="w-full space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Deal Size</span>
                  <span className="font-medium tabular-nums">{fmt$(funnel.avgDealSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">No-Show Rate</span>
                  <span className="font-medium tabular-nums text-red-500">{fmtPct(funnel.noShowRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Success</span>
                  <span className="font-medium tabular-nums text-emerald-500">
                    {financeSummary ? fmtPct(financeSummary.paymentSuccessPct) : "—"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No HubSpot data</p>
          )}
        </div>
      </div>

      {/* Third Row: Deal Sources + Accounts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {funnel && funnel.dealsBySource.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Deals by Source</h3>
            <BarDisplay
              items={funnel.dealsBySource
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)
                .map((s, i) => ({
                  label: s.source,
                  value: s.count,
                  color: [
                    "#fc5a29", "#4379f0", "#34d399", "#fbbf24",
                    "#a78bfa", "#f472b6", "#2dd4bf", "#9aa0a6",
                  ][i % 8],
                }))}
            />
          </div>
        )}

        {mercury && mercury.accounts.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Bank Accounts</h3>
            <div className="space-y-3">
              {mercury.accounts.map((acct) => (
                <div
                  key={acct.accountId}
                  className="flex items-center justify-between rounded-lg bg-secondary/40 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{acct.accountName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{acct.type}</p>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {fmt$(acct.balance)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const RevenueTrendBars = memo(function RevenueTrendBars({
  trend,
}: {
  trend: Array<{ month: string; revenue: number }>;
}) {
  const maxRevenue = useMemo(
    () => Math.max(...trend.map((r) => r.revenue), 1),
    [trend]
  );

  return (
    <div className="flex items-end gap-2" style={{ height: 120 }}>
      {trend.map((t, i) => {
        const h = Math.max((t.revenue / maxRevenue) * 100, 4);
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {t.revenue > 0 ? fmt$(t.revenue) : ""}
            </span>
            <div
              className="w-full rounded-t bg-primary/80 transition-all duration-500"
              style={{ height: `${h}%` }}
            />
            <span className="text-[10px] text-muted-foreground">{t.month}</span>
          </div>
        );
      })}
    </div>
  );
});

const MiniStat = memo(function MiniStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
});

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <TrendingUp className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No analytics data available</p>
        <p className="text-xs text-muted-foreground">Connect your data sources to see metrics</p>
      </div>
    </div>
  );
});

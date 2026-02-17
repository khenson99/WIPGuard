"use client";

import {
  DollarSign, Users, TrendingUp, Wallet,
  ArrowUpRight, ArrowDownRight, Activity, CreditCard,
  Globe, Megaphone, Layers,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { fmtCurrency, fmtNumber, fmtPercent, pctChange, changeDirection } from "@/lib/analytics/format";
import { StatCard } from "./stat-card";
import { BarDisplay, RingStat } from "./bar-display";

export function OverviewTab({ data }: { data: AnalyticsDashboardData | null }) {
  if (!data) return <EmptyState />;

  const { hubspot, stripe, mercury, googleAnalytics, googleAds, metaAds } = data;
  const funnel = hubspot?.funnel;
  const revenue = stripe?.revenue;
  const subs = stripe?.subscriptions;
  const cash = mercury?.cashFlow;
  const ga = googleAnalytics;

  const totalAdSpend =
    (googleAds?.totalSpend30d || 0) + (metaAds?.totalSpend30d || 0);
  const hasAdData = !!(googleAds || metaAds);

  return (
    <div className="space-y-6">
      {/* ── Primary KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="animate-analytics-in animate-delay-0"><StatCard
          label="Monthly Recurring Revenue"
          value={revenue ? fmtCurrency(revenue.mrr) : "—"}
          change={revenue ? `${revenue.revenueGrowth >= 0 ? "+" : ""}${revenue.revenueGrowth.toFixed(1)}% vs prev 30d` : undefined}
          changeType={revenue ? changeDirection(revenue.revenueGrowth, 0) : "neutral"}
          icon={DollarSign}
        /></div>
        <div className="animate-analytics-in animate-delay-1"><StatCard
          label="Website Sessions (30d)"
          value={ga ? fmtNumber(ga.sessions30d) : "—"}
          change={ga ? pctChange(ga.sessions30d, ga.sessionsPrev30d) : undefined}
          changeType={ga ? changeDirection(ga.sessions30d, ga.sessionsPrev30d) : "neutral"}
          icon={Globe}
        /></div>
        <div className="animate-analytics-in animate-delay-2"><StatCard
          label="Pipeline Deals"
          value={funnel ? funnel.totalDeals.toLocaleString() : "—"}
          subtitle={funnel ? `${funnel.closedWon} won · ${funnel.closedLost} lost` : undefined}
          icon={Users}
        /></div>
        <div className="animate-analytics-in animate-delay-3"><StatCard
          label="Cash Balance"
          value={cash ? fmtCurrency(cash.totalBalance) : "—"}
          change={cash ? `${cash.runway.toFixed(1)} months runway` : undefined}
          changeType={cash && cash.runway > 6 ? "positive" : cash && cash.runway > 3 ? "neutral" : "negative"}
          icon={Wallet}
        /></div>
      </div>

      {/* ── Secondary KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active Subscriptions"
          value={subs ? subs.active.toLocaleString() : "—"}
          subtitle={subs ? `${subs.pastDue} past due · ${subs.trialing} trialing` : undefined}
          icon={CreditCard}
          size="sm"
        />
        <StatCard
          label="Total Ad Spend (30d)"
          value={hasAdData ? fmtCurrency(totalAdSpend) : "—"}
          subtitle={hasAdData ? [
            googleAds ? `Google: ${fmtCurrency(googleAds.totalSpend30d)}` : null,
            metaAds ? `Meta: ${fmtCurrency(metaAds.totalSpend30d)}` : null,
          ].filter(Boolean).join(" · ") : undefined}
          icon={Megaphone}
          size="sm"
        />
        <StatCard
          label="Unique Visitors (30d)"
          value={ga ? fmtNumber(ga.users30d) : "—"}
          change={ga ? pctChange(ga.users30d, ga.usersPrev30d) : undefined}
          changeType={ga ? changeDirection(ga.users30d, ga.usersPrev30d) : "neutral"}
          icon={Users}
          size="sm"
        />
        <StatCard
          label="Bounce Rate"
          value={ga ? fmtPercent(ga.bounceRate * 100) : "—"}
          subtitle={ga ? `Avg session: ${Math.round(ga.avgSessionDuration)}s` : undefined}
          icon={Activity}
          size="sm"
        />
      </div>

      {/* ── Revenue & Cash Flow + Sales Performance ── */}
      <div className="animate-analytics-slide-up grid gap-4 lg:grid-cols-3">
        {/* Revenue & Cash Flow */}
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Revenue & Cash Flow</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Revenue (30d)"
              value={revenue ? fmtCurrency(revenue.totalRevenue30d) : "—"}
              icon={ArrowUpRight}
              iconColor="text-emerald-500 bg-emerald-500/10"
              size="sm"
            />
            <StatCard
              label="Inflows (30d)"
              value={cash ? fmtCurrency(cash.inflows30d) : "—"}
              icon={ArrowUpRight}
              iconColor="text-emerald-500 bg-emerald-500/10"
              size="sm"
            />
            <StatCard
              label="Outflows (30d)"
              value={cash ? fmtCurrency(cash.outflows30d) : "—"}
              icon={ArrowDownRight}
              iconColor="text-red-500 bg-red-500/10"
              size="sm"
            />
            <StatCard
              label="Net Cash Flow"
              value={cash ? fmtCurrency(cash.netCashFlow) : "—"}
              changeType={cash ? changeDirection(cash.netCashFlow, 0) : "neutral"}
              change={cash && cash.netCashFlow !== 0 ? (cash.netCashFlow > 0 ? "Positive" : "Negative") : undefined}
              icon={Activity}
              size="sm"
            />
          </div>

          {/* Revenue Trend Bars */}
          {stripe?.revenueTrend && stripe.revenueTrend.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Revenue Trend</p>
              <div className="flex items-end gap-1.5" style={{ height: 140 }}>
                {stripe.revenueTrend.map((t, i) => {
                  const max = Math.max(...stripe.revenueTrend.map((r) => r.revenue), 1);
                  const h = Math.max((t.revenue / max) * 100, 4);
                  const isLast = i === stripe.revenueTrend.length - 1;
                  return (
                    <div key={i} className="group flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        {t.revenue > 0 ? fmtCurrency(t.revenue) : ""}
                      </span>
                      <div
                        className={`w-full rounded-t transition-all duration-500 ${
                          isLast ? "bg-primary" : "bg-primary/60"
                        } group-hover:bg-primary`}
                        style={{ height: `${h}%` }}
                      />
                      <span className={`text-[10px] ${isLast ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {t.month}
                      </span>
                    </div>
                  );
                })}
              </div>
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
              <div className="w-full space-y-2.5">
                <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Avg Deal Size</span>
                  <span className="text-sm font-semibold tabular-nums">{fmtCurrency(funnel.avgDealSize)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">No-Show Rate</span>
                  <span className="text-sm font-semibold tabular-nums text-red-500">{fmtPercent(funnel.noShowRate)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Payment Success</span>
                  <span className="text-sm font-semibold tabular-nums text-emerald-500">
                    {stripe ? fmtPercent(stripe.payments.successRate) : "—"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center">
              <p className="text-sm text-muted-foreground">No HubSpot data</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Deals by Source + Bank Accounts ── */}
      <div className="animate-analytics-slide-up grid gap-4 lg:grid-cols-2">
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
              gradient
            />
          </div>
        )}

        {mercury && mercury.accounts.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Bank Accounts</h3>
            <div className="space-y-2">
              {mercury.accounts.map((acct) => (
                <div
                  key={acct.accountId}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{acct.accountName}</p>
                    <p className="text-xs capitalize text-muted-foreground">{acct.type}</p>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {fmtCurrency(acct.balance)}
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

function EmptyState() {
  return (
    <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-border bg-card">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Layers className="h-6 w-6 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">No analytics data available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Connect your data sources in Settings to see cross-platform metrics.
        </p>
      </div>
    </div>
  );
}

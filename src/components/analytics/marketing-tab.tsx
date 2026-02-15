"use client";

import {
  DollarSign, CreditCard, TrendingUp, TrendingDown,
  Users, AlertTriangle, BarChart3,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { BarDisplay } from "./bar-display";

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function MarketingTab({ data }: { data: AnalyticsDashboardData | null }) {
  if (!data) return <EmptyState />;

  const { stripe, hubspot, mercury } = data;
  const revenue = stripe?.revenue;
  const subs = stripe?.subscriptions;
  const payments = stripe?.payments;
  const cash = mercury?.cashFlow;
  const funnel = hubspot?.funnel;
  const contacts = hubspot?.contacts;

  return (
    <div className="space-y-6">
      {/* Revenue KPIs */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Revenue & Subscriptions
        </h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="MRR"
            value={revenue ? fmt$(revenue.mrr) : "—"}
            change={revenue && revenue.mrrChange !== 0 ? `${revenue.mrrChange > 0 ? "+" : ""}${fmt$(revenue.mrrChange)} MoM` : undefined}
            changeType={revenue && revenue.mrrChange >= 0 ? "positive" : "negative"}
            icon={DollarSign}
          />
          <StatCard
            label="Revenue (30d)"
            value={revenue ? fmt$(revenue.totalRevenue30d) : "—"}
            change={revenue ? `${revenue.revenueGrowth >= 0 ? "+" : ""}${revenue.revenueGrowth.toFixed(1)}% growth` : undefined}
            changeType={revenue && revenue.revenueGrowth >= 0 ? "positive" : "negative"}
            icon={TrendingUp}
          />
          <StatCard
            label="Active Subscriptions"
            value={subs ? subs.active.toLocaleString() : "—"}
            subtitle={subs ? `Churn rate: ${subs.churnRate.toFixed(1)}%` : undefined}
            icon={CreditCard}
          />
          <StatCard
            label="ARPC"
            value={revenue ? fmt$(revenue.avgRevenuePerCustomer) : "—"}
            subtitle="Avg revenue per customer"
            icon={Users}
          />
        </div>
      </div>

      {/* Revenue Trend + Subscription Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue Trend Chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Revenue Trend</h3>
          {stripe?.revenueTrend && stripe.revenueTrend.length > 0 ? (
            <div className="flex items-end gap-3" style={{ height: 200 }}>
              {stripe.revenueTrend.map((t, i) => {
                const max = Math.max(...stripe.revenueTrend.map((r) => r.revenue), 1);
                const h = Math.max((t.revenue / max) * 100, 6);
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {t.revenue > 0 ? fmt$(t.revenue) : ""}
                    </span>
                    <div
                      className="w-full rounded-t bg-primary/80 transition-all duration-500 hover:bg-primary"
                      style={{ height: `${h}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground">{t.month}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No revenue trend data</p>
          )}
        </div>

        {/* Subscription Status */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Subscription Health</h3>
          {subs ? (
            <div className="space-y-5">
              <BarDisplay
                items={[
                  { label: "Active", value: subs.active, color: "#34d399" },
                  { label: "Trialing", value: subs.trialing, color: "#4379f0" },
                  { label: "Past Due", value: subs.pastDue, color: "#fbbf24" },
                  { label: "Canceled", value: subs.canceled, color: "#ef4444" },
                ]}
              />

              {/* Churn Alert */}
              {subs.churnRate > 5 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />
                  <div className="text-xs">
                    <p className="font-medium text-foreground">
                      Churn rate at {subs.churnRate.toFixed(1)}%
                    </p>
                    <p className="text-muted-foreground">
                      {subs.canceled} canceled subscriptions detected
                    </p>
                  </div>
                </div>
              )}

              {/* Payment Success */}
              {payments && (
                <div className="rounded-lg bg-secondary/40 p-3">
                  <p className="text-xs text-muted-foreground">Payment Success Rate</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${payments.successRate}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {payments.successRate.toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {payments.succeeded} succeeded · {payments.failed} failed
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No Stripe data</p>
          )}
        </div>
      </div>

      {/* Pipeline & Contacts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lead Sources */}
        {funnel && funnel.dealsBySource.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Lead Sources</h3>
            <BarDisplay
              items={funnel.dealsBySource
                .sort((a, b) => b.value - a.value)
                .slice(0, 6)
                .map((s, i) => ({
                  label: s.source,
                  value: s.value,
                  color: [
                    "#fc5a29", "#4379f0", "#34d399", "#fbbf24", "#a78bfa", "#f472b6",
                  ][i % 6],
                }))}
              formatValue={fmt$}
            />
            <p className="mt-3 text-[11px] text-muted-foreground">By total pipeline value</p>
          </div>
        )}

        {/* Cash Flow Summary */}
        {cash && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Cash Flow (30d)</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs text-muted-foreground">Inflows</span>
                  </div>
                  <p className="mt-1 text-lg font-bold tabular-nums text-emerald-500">
                    {fmt$(cash.inflows30d)}
                  </p>
                </div>
                <div className="rounded-lg bg-red-500/5 p-3">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs text-muted-foreground">Outflows</span>
                  </div>
                  <p className="mt-1 text-lg font-bold tabular-nums text-red-500">
                    {fmt$(cash.outflows30d)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Net Cash Flow</span>
                  <span className={`text-sm font-bold tabular-nums ${cash.netCashFlow >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {cash.netCashFlow >= 0 ? "+" : ""}{fmt$(cash.netCashFlow)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-sm text-muted-foreground">Burn Rate</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {fmt$(cash.burnRate)}/mo
                  </span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-sm text-muted-foreground">Runway</span>
                  <span className={`text-sm font-bold tabular-nums ${cash.runway > 6 ? "text-emerald-500" : cash.runway > 3 ? "text-yellow-500" : "text-red-500"}`}>
                    {cash.runway.toFixed(1)} months
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Churn Events */}
      {subs && subs.recentChurnEvents.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Churn Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Customer</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Canceled</th>
                </tr>
              </thead>
              <tbody>
                {subs.recentChurnEvents.map((event, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 text-foreground">{event.customer}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-red-500">
                      -{fmt$(event.amount)}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {new Date(event.canceledAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <BarChart3 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No marketing data available</p>
        <p className="text-xs text-muted-foreground">Connect Stripe and HubSpot to see marketing metrics</p>
      </div>
    </div>
  );
}

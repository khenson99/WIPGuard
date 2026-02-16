// src/components/analytics/finance-tab.tsx
"use client";

import {
  DollarSign,
  CreditCard,
  Wallet,
  TrendingDown,
  TrendingUp,
  Clock,
} from "lucide-react";
import { AnalyticsDashboardData } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { DashboardSectionCard } from "./dashboard-section-card";
import { AreaTrend, DonutChart, ComposedMetric, CHART_PALETTE } from "@/components/charts";

interface FinanceTabProps {
  data: AnalyticsDashboardData | null;
}

/* ── Formatting helpers ──────────────────────────────── */

/** Format number as currency with short notation */
function fmt$(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Format decimal 0-1 as percentage (finance: multiply by 100) */
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Calculate percentage change string */
function calculateChange(current: number, previous: number): { text: string; type: "positive" | "negative" | "neutral" } {
  if (previous === 0) return { text: "N/A", type: "neutral" };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    type: pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral",
  };
}

/* ── Component ───────────────────────────────────────── */

export function FinanceTab({ data }: FinanceTabProps) {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">No financial data available</p>
      </div>
    );
  }

  const stripe = data.stripe;
  const mercury = data.mercury;

  // ── Extract metrics with fallbacks ────────────────
  const mrr = stripe?.revenue?.mrr ?? 0;
  const mrrChange = stripe?.revenue?.mrrChange ?? 0;
  const totalRevenue30d = stripe?.revenue?.totalRevenue30d ?? 0;
  const totalRevenuePrev30d = stripe?.revenue?.totalRevenuePrev30d ?? 0;
  const activeSubs = stripe?.subscriptions?.active ?? 0;
  const pastDue = stripe?.subscriptions?.pastDue ?? 0;
  const trialing = stripe?.subscriptions?.trialing ?? 0;
  const canceled = stripe?.subscriptions?.canceled ?? 0;
  const cashBalance = mercury?.cashFlow?.totalBalance ?? 0;
  const runway = mercury?.cashFlow?.runway ?? 0;
  const netCashFlow = mercury?.cashFlow?.netCashFlow ?? 0;
  const inflows = mercury?.cashFlow?.inflows30d ?? 0;
  const outflows = mercury?.cashFlow?.outflows30d ?? 0;
  const burnRate = mercury?.cashFlow?.burnRate ?? 0;
  const successRate = stripe?.payments?.successRate ?? 0;
  const churnRate = stripe?.subscriptions?.churnRate ?? 0;
  const recentChurns = stripe?.subscriptions?.recentChurnEvents ?? [];
  const revenueTrend = stripe?.revenueTrend ?? [];

  // Build SparkLine data from revenueTrend
  const mrrSparkData = revenueTrend.map((p) => p.revenue);

  // Revenue change
  const revenueChange = calculateChange(totalRevenue30d, totalRevenuePrev30d);

  // ── Hero chart: 6-month MRR AreaTrend data ────────
  const heroData = revenueTrend.slice(-6).map((p) => ({
    month: p.month,
    revenue: p.revenue,
  }));

  // ── Cash flow waterfall data ──────────────────────
  const cashFlowData = [
    { label: "Inflows", inflows, outflows: 0 },
    { label: "Outflows", inflows: 0, outflows },
    { label: "Net", inflows: Math.max(netCashFlow, 0), outflows: Math.max(-netCashFlow, 0) },
  ];

  // ── Subscription health donut segments ────────────
  const subSegments = [
    { name: "Active", value: activeSubs, color: "#10b981" },
    { name: "Past Due", value: pastDue, color: "#f59e0b" },
    { name: "Trialing", value: trialing, color: "#3b82f6" },
    { name: "Canceled", value: canceled, color: "#ef4444" },
  ].filter((s) => s.value > 0);

  const totalSubs = activeSubs + pastDue + trialing + canceled;

  return (
    <div className="space-y-6">
      {/* ── KPI Strip ──────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="MRR"
          value={fmt$(mrr)}
          change={`${mrrChange >= 0 ? "+" : ""}${mrrChange.toFixed(1)}%`}
          changeType={mrrChange >= 0 ? "positive" : "negative"}
          icon={DollarSign}
          trend={mrrSparkData.length >= 2 ? { data: mrrSparkData, color: CHART_PALETTE[0] } : undefined}
        />

        <StatCard
          label="Active Subscriptions"
          value={activeSubs.toLocaleString()}
          subtitle={`${pastDue} past due · ${trialing} trialing`}
          icon={CreditCard}
        />

        <StatCard
          label="Cash Balance"
          value={fmt$(cashBalance)}
          icon={Wallet}
        />

        <StatCard
          label="Net Cash Flow"
          value={fmt$(netCashFlow)}
          subtitle="Last 30 days"
          changeType={netCashFlow >= 0 ? "positive" : "negative"}
          icon={netCashFlow >= 0 ? TrendingUp : TrendingDown}
        />

        <StatCard
          label="Runway"
          value={runway > 0 ? `${runway.toFixed(1)}mo` : "N/A"}
          subtitle={burnRate > 0 ? `${fmt$(burnRate)}/mo burn` : undefined}
          icon={Clock}
          changeType={runway > 12 ? "positive" : runway > 6 ? "neutral" : "negative"}
        />
      </div>

      {/* ── Hero Chart: Revenue Trend ──────────────── */}
      {heroData.length >= 2 && (
        <DashboardSectionCard title="Revenue Trend" subtitle="6-month MRR">
          <AreaTrend
            data={heroData}
            xKey="month"
            yKeys={["revenue"]}
            colors={[CHART_PALETTE[0]]}
            height={300}
            yFormatter={fmt$}
          />
        </DashboardSectionCard>
      )}

      {/* ── Secondary Panels ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Flow Waterfall */}
        <DashboardSectionCard
          title="Cash Flow"
          subtitle="30-day inflows vs outflows"
        >
          <ComposedMetric
            data={cashFlowData}
            xKey="label"
            series={[
              { key: "inflows", type: "bar", color: "#10b981", name: "Inflows" },
              { key: "outflows", type: "bar", color: "#ef4444", name: "Outflows" },
            ]}
            height={240}
            yLeftFormatter={fmt$}
            showLegend={true}
          />
          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-secondary/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Inflows</p>
              <p className="text-sm font-semibold text-emerald-500">{fmt$(inflows)}</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Outflows</p>
              <p className="text-sm font-semibold text-red-500">{fmt$(outflows)}</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Burn Rate</p>
              <p className="text-sm font-semibold text-foreground">{fmt$(burnRate)}/mo</p>
            </div>
          </div>
        </DashboardSectionCard>

        {/* Subscription Health */}
        <DashboardSectionCard title="Subscription Health">
          <div className="flex items-start gap-6">
            {/* Donut */}
            {subSegments.length > 0 && (
              <div className="flex flex-col items-center gap-2">
                <DonutChart
                  segments={subSegments}
                  size={160}
                  innerRadius={50}
                  centerValue={totalSubs.toLocaleString()}
                  centerLabel="Total"
                />
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {subSegments.map((s) => (
                    <span key={s.name} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Key stats + churn list */}
            <div className="flex-1 space-y-3">
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Payment Success</span>
                  <span className="text-sm font-semibold text-foreground">
                    {fmtPct(successRate)}
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Churn Rate</span>
                  <span className="text-sm font-semibold text-foreground">
                    {fmtPct(churnRate)}
                  </span>
                </div>
              </div>

              {/* Recent churn events */}
              {recentChurns.length > 0 && (
                <div className="pt-1">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Recent Churn
                  </h4>
                  <div className="space-y-2">
                    {recentChurns.slice(0, 4).map((event, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-foreground">{event.customer}</p>
                          <p className="text-muted-foreground">{event.canceledAt}</p>
                        </div>
                        <span className="ml-2 font-medium text-foreground">{fmt$(event.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DashboardSectionCard>
      </div>

      {/* ── Bank Accounts ─────────────────────────── */}
      <DashboardSectionCard title="Bank Accounts" subtitle="Mercury connected accounts">
        {mercury?.accounts && mercury.accounts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 text-xs font-medium text-muted-foreground">Account</th>
                  <th className="pb-2 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="pb-2 text-right text-xs font-medium text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {mercury.accounts.map((account, idx) => (
                  <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                          <Wallet className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-medium text-foreground">{account.accountName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 capitalize text-muted-foreground">{account.type}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">
                      {fmt$(account.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="pt-2.5 font-medium text-foreground" colSpan={2}>Total</td>
                  <td className="pt-2.5 text-right font-bold tabular-nums text-foreground">
                    {fmt$(cashBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No bank accounts connected
          </p>
        )}
      </DashboardSectionCard>
    </div>
  );
}

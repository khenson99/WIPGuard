"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { SubDashboardTemplate } from "../sub-dashboard-template";
import { StatCard } from "../stat-card";
import { DashboardSectionCard } from "../dashboard-section-card";
import { AreaTrend, DonutChart, CHART_PALETTE } from "@/components/charts";

/* ── Formatting helpers ────────────────────────────── */

function fmt$(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/* ── Component ─────────────────────────────────────── */

interface StripeDashboardProps {
  data: AnalyticsDashboardData | null;
}

export function StripeDashboard({ data }: StripeDashboardProps) {
  const connectionStatus = useConnectionStatus((s) => s.getStatus("stripe"));
  const stripe = data?.stripe ?? null;

  if (!stripe) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">No Stripe data available</p>
      </div>
    );
  }

  const { revenue, subscriptions, payments, revenueTrend } = stripe;

  /* ── Subscription health donut ─── */
  const subSegments = [
    { name: "Active", value: subscriptions.active, color: CHART_PALETTE[2] },
    { name: "Past Due", value: subscriptions.pastDue, color: CHART_PALETTE[4] },
    { name: "Trialing", value: subscriptions.trialing, color: CHART_PALETTE[3] },
    { name: "Canceled", value: subscriptions.canceled, color: CHART_PALETTE[5] },
  ].filter((s) => s.value > 0);

  const totalSubs = subscriptions.active + subscriptions.pastDue + subscriptions.trialing + subscriptions.canceled;

  return (
    <SubDashboardTemplate
      title="Stripe Revenue"
      connectionStatus={connectionStatus}
      kpis={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="MRR"
            value={fmt$(revenue.mrr)}
            change={revenue.mrrChange !== 0 ? fmt$(revenue.mrrChange) : undefined}
            changeType={revenue.mrrChange > 0 ? "positive" : revenue.mrrChange < 0 ? "negative" : "neutral"}
            trend={{
              data: revenueTrend.map((t) => t.revenue),
            }}
          />
          <StatCard
            label="Active Subscriptions"
            value={subscriptions.active.toLocaleString()}
            subtitle={subscriptions.pastDue > 0 ? `${subscriptions.pastDue} past due` : undefined}
          />
          <StatCard
            label="Payment Success"
            value={fmtPct(payments.successRate * 100)}
            changeType={payments.successRate >= 0.95 ? "positive" : "negative"}
            subtitle={`${payments.succeeded.toLocaleString()} succeeded / ${payments.failed.toLocaleString()} failed`}
          />
          <StatCard
            label="Revenue Growth"
            value={fmtPct(revenue.revenueGrowth)}
            changeType={revenue.revenueGrowth > 0 ? "positive" : revenue.revenueGrowth < 0 ? "negative" : "neutral"}
          />
        </div>
      }
      heroChart={
        <AreaTrend
          data={revenueTrend.map((t) => ({ month: t.month, revenue: t.revenue }))}
          xKey="month"
          yKeys={["revenue"]}
          height={280}
          yFormatter={(v) => fmt$(v)}
        />
      }
      panels={
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DashboardSectionCard title="Subscription Health">
            <div className="flex items-center justify-center gap-6">
              <DonutChart
                segments={subSegments}
                size={180}
                centerValue={totalSubs.toLocaleString()}
                centerLabel="Total"
              />
              <div className="space-y-2">
                {subSegments.map((seg) => (
                  <div key={seg.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-muted-foreground">{seg.name}</span>
                    <span className="font-medium tabular-nums text-foreground">{seg.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </DashboardSectionCard>

          <DashboardSectionCard title="Recent Churn">
            {subscriptions.recentChurnEvents.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No recent churn events</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 text-right font-medium">Canceled</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.recentChurnEvents.slice(0, 10).map((evt, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="max-w-[180px] truncate py-2 text-foreground">{evt.customer}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {new Date(evt.canceledAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-right tabular-nums text-foreground">{fmt$(evt.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardSectionCard>
        </div>
      }
    />
  );
}

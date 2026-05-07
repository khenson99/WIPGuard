"use client";

import {
  CreditCard, DollarSign, ShieldCheck, TrendingUp,
  Users, AlertTriangle, Activity,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmt$, fmtPct, pctChange, timeAgo,
  AlertBanner, DataTable, InsightCard,
  SectionCard, type DataTableColumn,
} from "./dashboard-primitives";
import { AiInsightsPanel } from "./ai-insights-panel";

interface FinanceStripeTabProps {
  data: AnalyticsDashboardData | null;
}

export function FinanceStripeTab({ data }: FinanceStripeTabProps) {
  const stripe = data?.stripe;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "stripe")
      .map((entry) => entry.message),
    ...(data?.freshness?.stripe?.lastError ? [data.freshness.stripe.lastError] : []),
  ];

  if (!stripe) {
    return (
      <FinanceDataEmptyState
        title="Stripe finance data is unavailable"
        message="We could not load Stripe subscription and payment analytics for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const { subscriptions, revenueTrend } = stripe;
  const stripeMetrics = data.metrics?.finance.stripe ?? null;

  if (!stripeMetrics) {
    return (
      <FinanceDataEmptyState
        title="Stripe finance metrics are unavailable"
        message="The canonical finance metrics layer was not included in this analytics payload."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const churnRate = stripeMetrics.churnRatePct;
  const paymentSuccessRate = stripeMetrics.paymentSuccessPct;
  const subscriptionTotal =
    stripeMetrics.activeSubscriptions +
    stripeMetrics.pastDueSubscriptions +
    stripeMetrics.trialingSubscriptions +
    stripeMetrics.canceledSubscriptions;
  const maxTrend = Math.max(...(revenueTrend?.map((t) => t.revenue) ?? [0]), 1);

  // Determine alerts
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (churnRate > 5) {
    alerts.push({
      severity: "critical",
      title: `Churn rate at ${fmtPct(churnRate)}`,
      description: `${stripeMetrics.canceledSubscriptions} subscriptions canceled. Implement retention workflows and 30/60/90-day check-ins.`,
    });
  }
  if (paymentSuccessRate < 95) {
    alerts.push({
      severity: "critical",
      title: `Payment success rate at ${fmtPct(paymentSuccessRate)}`,
      description: `${stripeMetrics.failedPayments} failed payments out of ${stripeMetrics.succeededPayments + stripeMetrics.failedPayments}. Review failed payment retry logic and card updater.`,
    });
  }
  if (stripeMetrics.pastDueSubscriptions > 0) {
    alerts.push({
      severity: "warning",
      title: `${stripeMetrics.pastDueSubscriptions} past-due subscriptions`,
      description: "Past-due subscriptions risk churning. Send dunning emails and consider extending grace periods.",
    });
  }
  if (stripeMetrics.revenueGrowth < 0) {
    alerts.push({
      severity: "warning",
      title: `Revenue declined ${fmtPct(Math.abs(stripeMetrics.revenueGrowth))} MoM`,
      description: "30-day revenue is below the previous period. Review acquisition channels and expansion revenue.",
    });
  }

  // Insights
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (stripeMetrics.avgRevenuePerCustomer > 0 && stripeMetrics.activeSubscriptions > 0) {
    const arpc = stripeMetrics.avgRevenuePerCustomer;
    insights.push({
      title: "Revenue per Customer",
      insight: `Average revenue per customer is ${fmt$(arpc)}. ${arpc < 50 ? "Consider upsell opportunities." : "Healthy ARPC."}`,
      severity: arpc < 50 ? "info" : "success",
    });
  }
  if (stripeMetrics.trialingSubscriptions > 0) {
    const trialPct =
      (stripeMetrics.trialingSubscriptions /
        (stripeMetrics.activeSubscriptions + stripeMetrics.trialingSubscriptions)) *
      100;
    insights.push({
      title: "Trial Pipeline",
      insight: `${stripeMetrics.trialingSubscriptions} trials in progress (${fmtPct(trialPct)} of active+trialing). Focus on trial-to-paid conversion.`,
      action: "Review onboarding emails and trial expiry reminders.",
      severity: trialPct > 30 ? "warning" : "info",
    });
  }
  if (churnRate <= 5 && paymentSuccessRate >= 95) {
    insights.push({
      title: "Subscription Health",
      insight: "Churn rate and payment success are within healthy ranges.",
      severity: "success",
    });
  }

  // Churn events table columns
  const churnColumns: DataTableColumn<{ customer: string; canceledAt: string; amount: number }>[] = [
    { key: "customer", header: "Customer", render: (r) => <span className="font-medium text-foreground">{r.customer}</span> },
    { key: "canceledAt", header: "Canceled", render: (r) => <span className="text-muted-foreground">{timeAgo(r.canceledAt)}</span> },
    { key: "amount", header: "MRR Lost", align: "right", render: (r) => <span className="font-medium tabular-nums text-red-500">{fmt$(r.amount)}</span> },
  ];

  return (
    <div className="space-y-6">
      <AiInsightsPanel bundle={data.aiInsights || null} defaultFilter="finance" />

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertBanner key={i} severity={a.severity} title={a.title} description={a.description} />
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="MRR"
          value={fmt$(stripeMetrics.mrr)}
          change={pctChange(stripeMetrics.mrr, stripeMetrics.mrr - stripeMetrics.mrrChange)}
          changeType={stripeMetrics.mrrChange >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        />
        <StatCard
          label="Revenue (30d)"
          value={fmt$(stripeMetrics.totalRevenue30d)}
          change={pctChange(stripeMetrics.totalRevenue30d, stripeMetrics.totalRevenuePrev30d)}
          changeType={stripeMetrics.totalRevenue30d >= stripeMetrics.totalRevenuePrev30d ? "positive" : "negative"}
          subtitle={`prev: ${fmt$(stripeMetrics.totalRevenuePrev30d)}`}
          icon={TrendingUp}
        />
        <StatCard
          label="Active Subs"
          value={stripeMetrics.activeSubscriptions.toLocaleString()}
          subtitle={`${stripeMetrics.trialingSubscriptions} trialing`}
          icon={CreditCard}
        />
        <StatCard
          label="Trialing"
          value={stripeMetrics.trialingSubscriptions.toLocaleString()}
          icon={Users}
        />
        <StatCard
          label="Past Due"
          value={stripeMetrics.pastDueSubscriptions.toLocaleString()}
          changeType={stripeMetrics.pastDueSubscriptions > 0 ? "negative" : "positive"}
          icon={AlertTriangle}
          iconColor={stripeMetrics.pastDueSubscriptions > 0 ? "text-red-500" : "text-primary"}
        />
        <StatCard
          label="Canceled"
          value={stripeMetrics.canceledSubscriptions.toLocaleString()}
          icon={ShieldCheck}
        />
        <StatCard
          label="Churn Rate"
          value={fmtPct(churnRate)}
          changeType={churnRate > 5 ? "negative" : "positive"}
          icon={Activity}
        />
        <StatCard
          label="Payment Success"
          value={fmtPct(paymentSuccessRate)}
          changeType={paymentSuccessRate >= 95 ? "positive" : "negative"}
          icon={ShieldCheck}
        />
      </div>

      {/* Revenue Trend */}
      {revenueTrend && revenueTrend.length > 0 && (
        <SectionCard title="Revenue Trend" subtitle="Monthly revenue over the last 6 months">
          <div className="flex items-end gap-2" style={{ height: 140 }}>
            {revenueTrend.map((t) => {
              const h = Math.max((t.revenue / maxTrend) * 120, 4);
              return (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-medium tabular-nums text-foreground">
                    {fmt$(t.revenue)}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary/80 transition-all"
                    style={{ height: `${h}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{t.month}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Subscription Health + Payment Reliability */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Subscription Health" subtitle="Current subscription status breakdown">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <RingStat value={stripeMetrics.activeSubscriptions} max={subscriptionTotal} label="Active" color="#22c55e" size={90} />
            <RingStat value={stripeMetrics.trialingSubscriptions} max={subscriptionTotal} label="Trialing" color="#818cf8" size={90} />
            <RingStat value={stripeMetrics.pastDueSubscriptions} max={subscriptionTotal} label="Past Due" color="#f97316" size={90} />
            <RingStat value={stripeMetrics.canceledSubscriptions} max={subscriptionTotal} label="Canceled" color="#ef4444" size={90} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            {[
              { label: "Active", value: stripeMetrics.activeSubscriptions, color: "text-emerald-500" },
              { label: "Trialing", value: stripeMetrics.trialingSubscriptions, color: "text-indigo-400" },
              { label: "Past Due", value: stripeMetrics.pastDueSubscriptions, color: "text-orange-500" },
              { label: "Canceled", value: stripeMetrics.canceledSubscriptions, color: "text-red-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-secondary/40 p-2">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Payment Reliability" subtitle="Payment success and failure breakdown">
          <div className="flex items-center justify-center gap-6">
            <RingStat
              value={paymentSuccessRate}
              max={100}
              label="Success Rate"
              color={paymentSuccessRate >= 95 ? "#22c55e" : "#ef4444"}
              size={110}
            />
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-sm text-foreground">Succeeded</span>
              <span className="text-sm font-bold tabular-nums text-emerald-500">{stripeMetrics.succeededPayments.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-sm text-foreground">Failed</span>
              <span className="text-sm font-bold tabular-nums text-red-500">{stripeMetrics.failedPayments.toLocaleString()}</span>
            </div>
            {/* Success bar */}
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${paymentSuccessRate}%` }}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Recent Churn Events */}
      {subscriptions.recentChurnEvents && subscriptions.recentChurnEvents.length > 0 && (
        <SectionCard title="Recent Churn Events" subtitle="Recently canceled subscriptions">
          <DataTable columns={churnColumns} rows={subscriptions.recentChurnEvents} emptyMessage="No recent churn events" />
        </SectionCard>
      )}

      {/* Insights & Recommendations */}
      {insights.length > 0 && (
        <SectionCard title="Insights & Recommendations">
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <InsightCard key={i} title={ins.title} insight={ins.insight} action={ins.action} severity={ins.severity} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

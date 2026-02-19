"use client";

import {
  CreditCard, Users, TrendingUp, AlertTriangle,
  DollarSign, Activity, CheckCircle2, XCircle,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmt$, fmtN, fmtPct, pctChange,
  AlertBanner, DataTable, InsightCard,
  SectionCard,
  type DataTableColumn,
} from "./dashboard-primitives";

interface SalesStripeTabProps {
  data: AnalyticsDashboardData | null;
}

export function SalesStripeTab({ data }: SalesStripeTabProps) {
  const stripe = data?.stripe;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "stripe")
      .map((entry) => entry.message),
    ...(data?.freshness?.stripe?.lastError ? [data.freshness.stripe.lastError] : []),
  ];

  if (!stripe) {
    return <FinanceDataEmptyState provider="Stripe" reasons={reasons} />;
  }

  const rev = stripe.revenue;
  const subs = stripe.subscriptions;
  const pay = stripe.payments;

  /* ── Alerts ──────────────────────────────────────── */

  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];

  if (subs.churnRate > 5) {
    alerts.push({
      severity: "critical",
      title: "Churn rate above threshold",
      description: `${subs.churnRate.toFixed(1)}% churn rate — retention efforts need immediate attention.`,
    });
  }

  if (subs.pastDue > 0) {
    alerts.push({
      severity: "warning",
      title: `${subs.pastDue} past-due subscriptions`,
      description: "Revenue at risk from failed payments. Trigger dunning workflows.",
    });
  }

  if (rev.mrrChange < 0) {
    alerts.push({
      severity: "warning",
      title: "MRR declining",
      description: `MRR dropped ${fmt$(Math.abs(rev.mrrChange))} — review expansion and retention strategy.`,
    });
  }

  /* ── Subscription lifecycle ring ─────────────────── */

  const subSegments = [
    { label: "Active", value: subs.active, color: "#22c55e" },
    { label: "Trialing", value: subs.trialing, color: "#3b82f6" },
    { label: "Past Due", value: subs.pastDue, color: "#f59e0b" },
    { label: "Canceled", value: subs.canceled, color: "#ef4444" },
  ].filter((s) => s.value > 0);
  const totalSubs = subSegments.reduce((sum, s) => sum + s.value, 0);

  /* ── Revenue trend bars ──────────────────────────── */

  const trend = stripe.revenueTrend;
  const maxTrend = Math.max(...trend.map((t) => t.revenue), 1);

  /* ── Churn events table ──────────────────────────── */

  type ChurnRow = { customer: string; canceledAt: string; amount: number };
  const churnColumns: DataTableColumn<ChurnRow>[] = [
    { key: "customer", label: "Customer" },
    { key: "canceledAt", label: "Canceled", render: (row) => new Date(row.canceledAt).toLocaleDateString() },
    { key: "amount", label: "MRR Lost", align: "right", render: (row) => fmt$(row.amount) },
  ];

  /* ── Payment reliability ring ────────────────────── */

  const paySegments = [
    { label: "Succeeded", value: pay.succeeded, color: "#22c55e" },
    { label: "Failed", value: pay.failed, color: "#ef4444" },
  ].filter((s) => s.value > 0);
  const totalPayments = pay.succeeded + pay.failed;

  /* ── Insights ────────────────────────────────────── */

  const insights: { title: string; insight: string; action: string; severity: "critical" | "warning" | "info" }[] = [];

  if (subs.trialing > 0) {
    const trialConversionOpportunity = subs.trialing;
    insights.push({
      title: "Trial Conversion Opportunity",
      insight: `${trialConversionOpportunity} active trials — potential for ${fmt$(trialConversionOpportunity * rev.avgRevenuePerCustomer)} in new MRR.`,
      action: "Engage trialing users with onboarding sequences before trial expiration.",
      severity: "info",
    });
  }

  if (subs.churnRate > 3) {
    insights.push({
      title: "Retention Risk",
      insight: `Churn at ${subs.churnRate.toFixed(1)}% with ${subs.canceled} recent cancellations.`,
      action: "Implement win-back campaigns and analyze cancellation reasons.",
      severity: subs.churnRate > 5 ? "critical" : "warning",
    });
  }

  if (pay.failed > 0) {
    insights.push({
      title: "Payment Failures",
      insight: `${pay.failed} payment failures (${fmtPct(100 - pay.successRate)} failure rate).`,
      action: "Review dunning configuration and ensure retry logic is optimized.",
      severity: pay.successRate < 95 ? "warning" : "info",
    });
  }

  if (rev.revenueGrowth > 0) {
    insights.push({
      title: "Revenue Growth",
      insight: `Revenue grew ${rev.revenueGrowth.toFixed(1)}% — ${fmt$(rev.totalRevenue30d)} in the last 30 days.`,
      action: "Momentum is positive. Focus on compounding growth through expansion revenue.",
      severity: "info",
    });
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.map((a, i) => (
        <AlertBanner key={i} severity={a.severity} title={a.title} description={a.description} />
      ))}

      {/* ── KPI Grid ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="MRR"
          value={fmt$(rev.mrr)}
          subtitle={`${rev.mrrChange >= 0 ? "+" : ""}${fmt$(rev.mrrChange)} MoM`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatCard
          title="Active Subscriptions"
          value={fmtN(subs.active)}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="Trialing"
          value={fmtN(subs.trialing)}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          title="Churn Rate"
          value={fmtPct(subs.churnRate)}
          icon={<TrendingUp className="h-4 w-4" />}
          className={subs.churnRate > 5 ? "border-red-500/30 bg-red-500/5" : undefined}
        />
        <StatCard
          title="Past Due"
          value={fmtN(subs.pastDue)}
          icon={<AlertTriangle className="h-4 w-4" />}
          className={subs.pastDue > 0 ? "border-amber-500/30 bg-amber-500/5" : undefined}
        />
        <StatCard
          title="Revenue 30d"
          value={fmt$(rev.totalRevenue30d)}
          subtitle={pctChange(rev.totalRevenue30d, rev.totalRevenuePrev30d)}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard
          title="Payment Success"
          value={fmtPct(pay.successRate)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          title="Avg Revenue/Customer"
          value={fmt$(rev.avgRevenuePerCustomer)}
          icon={<DollarSign className="h-4 w-4" />}
        />
      </div>

      {/* ── Subscription Lifecycle ─────────────────── */}
      {totalSubs > 0 && (
        <SectionCard title="Subscription Lifecycle" subtitle="Current subscription status distribution">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <RingStat segments={subSegments} total={totalSubs} label="Subscriptions" size={140} />
            <div className="space-y-2">
              {subSegments.map((seg) => (
                <div key={seg.label} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground">{seg.label}</span>
                  <span className="ml-auto font-medium">{fmtN(seg.value)}</span>
                  <span className="text-muted-foreground">
                    ({((seg.value / totalSubs) * 100).toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Revenue Trend ──────────────────────────── */}
      {trend.length > 0 && (
        <SectionCard title="Revenue Trend" subtitle="Monthly revenue over time">
          <div className="flex items-end gap-2" style={{ height: 160 }}>
            {trend.map((t) => (
              <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium">{fmt$(t.revenue)}</span>
                <div
                  className="w-full rounded-t bg-[#fc5a29]/80 transition-all"
                  style={{ height: `${(t.revenue / maxTrend) * 120}px` }}
                />
                <span className="text-[10px] text-muted-foreground">{t.month}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Payment Reliability ────────────────────── */}
      {totalPayments > 0 && (
        <SectionCard title="Payment Reliability" subtitle="Success vs failure rate">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <RingStat segments={paySegments} total={totalPayments} label="Payments" size={120} />
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">Succeeded</span>
                <span className="ml-auto font-medium">{fmtN(pay.succeeded)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-muted-foreground">Failed</span>
                <span className="ml-auto font-medium">{fmtN(pay.failed)}</span>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Recent Churn Events ────────────────────── */}
      {subs.recentChurnEvents.length > 0 && (
        <SectionCard title="Recent Churn" subtitle="Latest subscription cancellations">
          <DataTable
            columns={churnColumns}
            rows={subs.recentChurnEvents.slice(0, 15)}
            emptyMessage="No recent churn events"
          />
        </SectionCard>
      )}

      {/* ── Insights ──────────────────────────────── */}
      {insights.length > 0 && (
        <SectionCard title="Sales Revenue Insights">
          <div className="space-y-3">
            {insights.map((ins, i) => (
              <InsightCard key={i} title={ins.title} insight={ins.insight} action={ins.action} severity={ins.severity} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

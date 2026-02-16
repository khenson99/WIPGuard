"use client";

import { CreditCard, DollarSign, ShieldCheck } from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";

interface FinanceStripeTabProps {
  data: AnalyticsDashboardData | null;
}

function fmt$(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MRR" value={fmt$(stripe.revenue.mrr)} icon={DollarSign} />
        <StatCard
          label="Revenue (30d)"
          value={fmt$(stripe.revenue.totalRevenue30d)}
          change={fmtPct(stripe.revenue.revenueGrowth)}
          changeType={stripe.revenue.revenueGrowth >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        />
        <StatCard
          label="Active Subscriptions"
          value={stripe.subscriptions.active.toLocaleString()}
          subtitle={`${stripe.subscriptions.trialing} trialing · ${stripe.subscriptions.pastDue} past due`}
          icon={CreditCard}
        />
        <StatCard
          label="Churn Rate"
          value={fmtPct(stripe.subscriptions.churnRate)}
          subtitle={`${stripe.subscriptions.canceled} canceled`}
          changeType={stripe.subscriptions.churnRate > 5 ? "negative" : "positive"}
          icon={ShieldCheck}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Payment Reliability</h3>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-8">
          <RingStat
            value={stripe.payments.successRate}
            max={100}
            label="Success Rate"
            color="hsl(var(--primary))"
            size={110}
          />
          <div className="text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{stripe.payments.succeeded}</span> succeeded payments
            </p>
            <p>
              <span className="font-medium text-foreground">{stripe.payments.failed}</span> failed payments
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

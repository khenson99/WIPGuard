"use client";

import React from "react";
import {
  DollarSign,
  CreditCard,
  Wallet,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { AnalyticsDashboardData } from "@/lib/analytics/types";
import StatCard from "./stat-card";
import { RingStat } from "./bar-display";

interface FinanceTabProps {
  data: AnalyticsDashboardData | null;
}

/**
 * Format number as currency with short notation
 * @example fmt$(1234) => "$1.2K"
 * @example fmt$(1500000) => "$1.5M"
 */
function fmt$(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(1)}K`;
  }
  return `$${n.toFixed(0)}`;
}

/**
 * Format number as percentage
 * @example fmtPct(0.856) => "85.6%"
 * @example fmtPct(0.05) => "5.0%"
 */
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

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

  // Extract metrics with fallbacks
  const mrr = stripe?.revenue?.mrr ?? 0;
  const mrrChange = stripe?.revenue?.mrrChange ?? 0;
  const activeSubs = stripe?.subscriptions?.active ?? 0;
  const pastDue = stripe?.subscriptions?.pastDue ?? 0;
  const trialing = stripe?.subscriptions?.trialing ?? 0;
  const cashBalance = mercury?.cashFlow?.totalBalance ?? 0;
  const runway = mercury?.cashFlow?.runway ?? 0;
  const netCashFlow = mercury?.cashFlow?.netCashFlow ?? 0;
  const successRate = stripe?.payments?.successRate ?? 0;
  const churnRate = stripe?.subscriptions?.churnRate ?? 0;
  const recentChurns = stripe?.subscriptions?.recentChurnEvents ?? [];

  return (
    <div className="space-y-6">
      {/* Top KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR */}
        <StatCard
          label="Monthly Recurring Revenue"
          value={fmt$(mrr)}
          change={fmtPct(Math.abs(mrrChange / 100))}
          changeType={mrrChange >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        />

        {/* Active Subscriptions */}
        <StatCard
          label="Active Subscriptions"
          value={activeSubs.toLocaleString()}
          subtitle={`${pastDue} past due, ${trialing} trialing`}
          icon={CreditCard}
        />

        {/* Cash Balance */}
        <StatCard
          label="Cash Balance"
          value={fmt$(cashBalance)}
          subtitle={runway > 0 ? `${runway.toFixed(1)} months runway` : undefined}
          icon={Wallet}
        />

        {/* Net Cash Flow */}
        <StatCard
          label="Net Cash Flow (30d)"
          value={fmt$(netCashFlow)}
          changeType={netCashFlow >= 0 ? "positive" : "negative"}
          icon={TrendingDown}
        />
      </div>

      {/* Revenue Trend Chart */}
      {stripe?.revenueTrend && stripe.revenueTrend.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-foreground font-semibold mb-6">Revenue Trend</h3>
          <div className="flex items-end gap-2 h-48">
            {stripe.revenueTrend.slice(-6).map((point, idx) => {
              const maxRevenue = Math.max(
                ...stripe.revenueTrend!.map((p) => p.revenue)
              );
              const heightPercent = (point.revenue / maxRevenue) * 100;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full bg-gradient-to-t from-primary/40 to-primary rounded-t-md transition-all duration-300 hover:from-primary/60 hover:to-primary/80"
                    style={{ height: `${heightPercent}%`, minHeight: "4px" }}
                  />
                  <span className="text-xs text-muted-foreground text-center">
                    {point.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subscription Health */}
        <div className="space-y-6">
          {/* Payment Success Rate Ring */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-foreground font-semibold">Subscription Health</h3>
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className="flex items-center justify-center mb-8">
              <RingStat
                value={successRate * 100}
                max={100}
                label="Payment Success Rate"
                color="hsl(var(--primary))"
                size="md"
              />
            </div>

            {/* Churn Rate */}
            <div className="bg-secondary/40 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Churn Rate</span>
                <span className="text-foreground font-semibold">
                  {fmtPct(churnRate)}
                </span>
              </div>
            </div>

            {/* Recent Churn Events */}
            {recentChurns && recentChurns.length > 0 && (
              <div>
                <h4 className="text-muted-foreground text-xs font-semibold uppercase mb-3">
                  Recent Churn
                </h4>
                <div className="space-y-3">
                  {recentChurns.slice(0, 5).map((event, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-b-0"
                    >
                      <div className="flex-1">
                        <p className="text-sm text-foreground truncate">
                          {event.customer}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {event.canceledAt}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {fmt$(event.amount)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bank Accounts */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="text-foreground font-semibold mb-6">Bank Accounts</h3>

          {mercury?.accounts && mercury.accounts.length > 0 ? (
            <div className="space-y-4">
              {mercury.accounts.map((account, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 bg-secondary/40 rounded-lg border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {account.accountName}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {account.type}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {fmt$(account.balance)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.accountId}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No bank accounts connected
            </p>
          )}
        </div>
      </div>

      {/* Cash Flow Mini Stats */}
      {mercury?.cashFlow && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm font-medium">
                Inflows (30d)
              </span>
              <ArrowDownRight className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {fmt$(mercury.cashFlow.inflows30d)}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm font-medium">
                Outflows (30d)
              </span>
              <ArrowUpRight className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {fmt$(mercury.cashFlow.outflows30d)}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm font-medium">
                Burn Rate
              </span>
              <TrendingDown className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {fmt$(mercury.cashFlow.burnRate)}
              <span className="text-xs text-muted-foreground ml-2">/month</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import {
  DollarSign, CreditCard, Wallet, TrendingDown, Activity,
  ArrowUpRight, ArrowDownRight, Fuel,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { fmtCurrency, fmtPercent } from "@/lib/analytics/format";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";
import { FinanceDataEmptyState } from "./finance-empty-state";

interface FinanceTabProps {
  data: AnalyticsDashboardData | null;
}

export function FinanceTab({ data }: FinanceTabProps) {
  if (!data) {
    return <FinanceDataEmptyState title="No financial data available" message="Finance analytics payload is missing." />;
  }

  const stripe = data.stripe;
  const mercury = data.mercury;
  const financeErrors = data.errors
    .filter((entry) => entry.source === "stripe" || entry.source === "mercury")
    .map((entry) => `${entry.source}: ${entry.message}`);
  const freshnessErrors = [
    data.freshness.stripe?.lastError ? `stripe: ${data.freshness.stripe.lastError}` : null,
    data.freshness.mercury?.lastError ? `mercury: ${data.freshness.mercury.lastError}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  if (!stripe && !mercury) {
    return (
      <FinanceDataEmptyState
        title="Finance dashboard data is unavailable"
        message="Stripe and Mercury data could not be loaded for this range."
        reasons={[...financeErrors, ...freshnessErrors]}
      />
    );
  }

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
      {/* ── Primary KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="animate-analytics-in animate-delay-0"><StatCard
          label="Monthly Recurring Revenue"
          value={fmtCurrency(mrr)}
          change={`${mrrChange >= 0 ? "+" : ""}${fmtPercent(Math.abs(mrrChange))}`}
          changeType={mrrChange >= 0 ? "positive" : "negative"}
          icon={DollarSign}
        /></div>
        <div className="animate-analytics-in animate-delay-1"><StatCard
          label="Active Subscriptions"
          value={activeSubs.toLocaleString()}
          subtitle={`${pastDue} past due · ${trialing} trialing`}
          icon={CreditCard}
        /></div>
        <div className="animate-analytics-in animate-delay-2"><StatCard
          label="Cash Balance"
          value={fmtCurrency(cashBalance)}
          subtitle={runway > 0 ? `${runway.toFixed(1)} months runway` : undefined}
          changeType={runway > 6 ? "positive" : runway > 3 ? "neutral" : "negative"}
          icon={Wallet}
        /></div>
        <div className="animate-analytics-in animate-delay-3"><StatCard
          label="Net Cash Flow (30d)"
          value={fmtCurrency(netCashFlow)}
          changeType={netCashFlow >= 0 ? "positive" : "negative"}
          change={netCashFlow !== 0 ? (netCashFlow > 0 ? "Positive" : "Negative") : undefined}
          icon={Activity}
        /></div>
      </div>

      {/* ── Revenue Trend Chart ── */}
      {stripe?.revenueTrend && stripe.revenueTrend.length > 0 && (
        <div className="animate-analytics-slide-up rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Revenue Trend</h3>
          <div className="flex items-end gap-1.5" style={{ height: 180 }}>
            {stripe.revenueTrend.slice(-8).map((point, idx, arr) => {
              const max = Math.max(...arr.map((p) => p.revenue), 1);
              const h = Math.max((point.revenue / max) * 100, 4);
              const isLast = idx === arr.length - 1;
              return (
                <div key={idx} className="group flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {point.revenue > 0 ? fmtCurrency(point.revenue) : ""}
                  </span>
                  <div
                    className={`w-full rounded-t transition-all duration-500 ${
                      isLast ? "bg-primary" : "bg-primary/60"
                    } group-hover:bg-primary`}
                    style={{ height: `${h}%` }}
                  />
                  <span className={`text-[10px] ${isLast ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {point.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Runway Visualization ── */}
      {mercury?.cashFlow && runway > 0 && (
        <div className="animate-analytics-slide-up rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Cash Runway</h3>
            <div className="flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium tabular-nums text-foreground">
                {runway.toFixed(1)} months
              </span>
            </div>
          </div>
          <RunwayBar months={runway} />
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Burn rate: {fmtCurrency(mercury.cashFlow.burnRate)}/mo</span>
            <span>Balance: {fmtCurrency(cashBalance)}</span>
          </div>
        </div>
      )}

      {/* ── Two Column: Subscription Health + Bank Accounts ── */}
      <div className="animate-analytics-slide-up grid gap-4 lg:grid-cols-2">
        {/* Subscription Health */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Subscription Health</h3>

          <div className="flex items-center justify-center mb-5">
            <RingStat
              value={successRate}
              max={100}
              label="Payment Success"
              color="var(--primary)"
              size={110}
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">Churn Rate</span>
              <span className={`text-sm font-semibold tabular-nums ${churnRate > 5 ? "text-red-500" : churnRate > 2 ? "text-amber-500" : "text-emerald-500"}`}>
                {fmtPercent(churnRate)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">Past Due</span>
              <span className={`text-sm font-semibold tabular-nums ${pastDue > 0 ? "text-amber-500" : "text-foreground"}`}>
                {pastDue}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">Trialing</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">{trialing}</span>
            </div>
          </div>

          {/* Recent Churn Events */}
          {recentChurns.length > 0 && (
            <div className="mt-5">
              <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Recent Churn
              </p>
              <div className="space-y-0">
                {recentChurns.slice(0, 5).map((event, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between border-b border-border/40 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{event.customer}</p>
                      <p className="text-[10px] text-muted-foreground">{event.canceledAt}</p>
                    </div>
                    <span className="ml-3 text-sm font-medium tabular-nums text-red-500">
                      -{fmtCurrency(event.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bank Accounts */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Bank Accounts</h3>

          {mercury?.accounts && mercury.accounts.length > 0 ? (
            <div className="space-y-2.5">
              {mercury.accounts.map((account) => (
                <div
                  key={account.accountId}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Wallet className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{account.accountName}</p>
                      <p className="text-[10px] capitalize text-muted-foreground">{account.type}</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {fmtCurrency(account.balance)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center">
              <p className="text-sm text-muted-foreground">No bank accounts connected</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Cash Flow Breakdown ── */}
      {mercury?.cashFlow && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            label="Inflows (30d)"
            value={fmtCurrency(mercury.cashFlow.inflows30d)}
            icon={ArrowUpRight}
            iconColor="text-emerald-500 bg-emerald-500/10"
            size="sm"
          />
          <StatCard
            label="Outflows (30d)"
            value={fmtCurrency(mercury.cashFlow.outflows30d)}
            icon={ArrowDownRight}
            iconColor="text-red-500 bg-red-500/10"
            size="sm"
          />
          <StatCard
            label="Monthly Burn Rate"
            value={fmtCurrency(mercury.cashFlow.burnRate)}
            subtitle="/month"
            icon={TrendingDown}
            iconColor="text-amber-500 bg-amber-500/10"
            size="sm"
          />
        </div>
      )}
    </div>
  );
}

/* ── Runway Progress Bar ── */
function RunwayBar({ months }: { months: number }) {
  // Clamp to 24 months for visualization
  const clamped = Math.min(months, 24);
  const pct = (clamped / 24) * 100;

  // Color zones: red < 3, amber 3-6, yellow 6-12, green > 12
  let barColor = "bg-emerald-500";
  let glowColor = "shadow-emerald-500/20";
  if (months < 3) {
    barColor = "bg-red-500";
    glowColor = "shadow-red-500/20";
  } else if (months < 6) {
    barColor = "bg-amber-500";
    glowColor = "shadow-amber-500/20";
  } else if (months < 12) {
    barColor = "bg-yellow-500";
    glowColor = "shadow-yellow-500/20";
  }

  return (
    <div className="relative">
      {/* Track */}
      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary/60">
        <div
          className={`h-full rounded-full ${barColor} shadow-sm ${glowColor} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Zone markers */}
      <div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground/60">
        <span>0</span>
        <span style={{ position: "absolute", left: "12.5%" }}>3m</span>
        <span style={{ position: "absolute", left: "25%" }}>6m</span>
        <span style={{ position: "absolute", left: "50%" }}>12m</span>
        <span>24m+</span>
      </div>
      {/* Zone colors strip */}
      <div className="mt-0.5 flex h-1 w-full overflow-hidden rounded-full">
        <div className="bg-red-500/30" style={{ width: "12.5%" }} />
        <div className="bg-amber-500/30" style={{ width: "12.5%" }} />
        <div className="bg-yellow-500/30" style={{ width: "25%" }} />
        <div className="bg-emerald-500/30" style={{ width: "50%" }} />
      </div>
    </div>
  );
}

"use client";

import {
  Landmark, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, ArrowDownRight, ArrowUpRight, Wallet,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmt$, fmtN,
  AlertBanner, InsightCard, SectionCard,
} from "./dashboard-primitives";
import { AiInsightsPanel } from "./ai-insights-panel";

interface FinanceMercuryTabProps {
  data: AnalyticsDashboardData | null;
}

function fmtRunway(months: number): string {
  if (months >= 24) return `${(months / 12).toFixed(1)}yr`;
  return `${months.toFixed(1)}mo`;
}

function runwayColor(months: number): string {
  if (months >= 12) return "text-emerald-500";
  if (months >= 6) return "text-yellow-500";
  return "text-red-500";
}

function runwayBgColor(months: number): string {
  if (months >= 12) return "#22c55e";
  if (months >= 6) return "#eab308";
  return "#ef4444";
}

export function FinanceMercuryTab({ data }: FinanceMercuryTabProps) {
  const mercury = data?.mercury;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "mercury")
      .map((entry) => entry.message),
    ...(data?.freshness?.mercury?.lastError ? [data.freshness.mercury.lastError] : []),
  ];

  if (!mercury) {
    return (
      <FinanceDataEmptyState
        title="Mercury finance data is unavailable"
        message="We could not load Mercury bank account and cash flow analytics for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const { accounts, cashFlow } = mercury;

  if (accounts.length === 0 && cashFlow.totalBalance === 0) {
    return (
      <FinanceDataEmptyState
        title="No Mercury account data found"
        message="Mercury is connected, but no bank accounts or cash flow data are available."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (cashFlow.runway > 0 && cashFlow.runway < 6) {
    alerts.push({
      severity: "critical",
      title: `Runway at ${fmtRunway(cashFlow.runway)}`,
      description: "Less than 6 months of runway remaining. Urgently review burn rate, cut non-essential spend, and accelerate revenue.",
    });
  } else if (cashFlow.runway > 0 && cashFlow.runway < 12) {
    alerts.push({
      severity: "warning",
      title: `Runway at ${fmtRunway(cashFlow.runway)}`,
      description: "Less than 12 months of runway. Monitor burn rate closely and consider fundraising timeline.",
    });
  }
  if (cashFlow.netCashFlow < 0) {
    alerts.push({
      severity: "warning",
      title: `Negative cash flow: ${fmt$(Math.abs(cashFlow.netCashFlow))}`,
      description: "Outflows exceed inflows over the last 30 days. Review large expenses and ensure revenue collection is on track.",
    });
  }
  if (cashFlow.burnRate > cashFlow.inflows30d && cashFlow.inflows30d > 0) {
    alerts.push({
      severity: "warning",
      title: "Burn rate exceeds inflows",
      description: `Monthly burn of ${fmt$(cashFlow.burnRate)} exceeds ${fmt$(cashFlow.inflows30d)} in inflows. Operating at a deficit.`,
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (cashFlow.netCashFlow > 0) {
    insights.push({
      title: "Positive Cash Flow",
      insight: `Net positive cash flow of ${fmt$(cashFlow.netCashFlow)} over the last 30 days. Inflows are outpacing outflows.`,
      severity: "success",
    });
  }
  if (cashFlow.runway >= 12) {
    insights.push({
      title: "Healthy Runway",
      insight: `${fmtRunway(cashFlow.runway)} of runway at current burn rate. Comfortable buffer for operations.`,
      severity: "success",
    });
  }
  if (accounts.length > 1) {
    const maxAccount = accounts.reduce((a, b) => (a.balance > b.balance ? a : b));
    const concentration = cashFlow.totalBalance > 0
      ? (maxAccount.balance / cashFlow.totalBalance) * 100
      : 0;
    if (concentration > 80) {
      insights.push({
        title: "Balance Concentration",
        insight: `${concentration.toFixed(0)}% of total balance is in "${maxAccount.accountName}". Consider diversifying across accounts for risk management.`,
        action: "Review treasury management strategy.",
        severity: "info",
      });
    }
  }
  if (cashFlow.burnRate > 0 && cashFlow.inflows30d > 0) {
    const efficiency = (cashFlow.inflows30d / cashFlow.burnRate) * 100;
    insights.push({
      title: "Burn Efficiency",
      insight: `Inflows cover ${efficiency.toFixed(0)}% of monthly burn. ${efficiency >= 100 ? "Self-sustaining at current rates." : "Relying on reserves to cover the gap."}`,
      severity: efficiency >= 100 ? "success" : efficiency >= 70 ? "info" : "warning",
    });
  }

  // ── Cash flow ratios ──
  const maxFlow = Math.max(cashFlow.inflows30d, cashFlow.outflows30d, 1);

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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Total Balance"
          value={fmt$(cashFlow.totalBalance)}
          icon={Landmark}
        />
        <StatCard
          label="Net Cash Flow"
          value={fmt$(cashFlow.netCashFlow)}
          changeType={cashFlow.netCashFlow >= 0 ? "positive" : "negative"}
          subtitle="Last 30 days"
          icon={cashFlow.netCashFlow >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Inflows (30d)"
          value={fmt$(cashFlow.inflows30d)}
          icon={ArrowDownRight}
        />
        <StatCard
          label="Outflows (30d)"
          value={fmt$(cashFlow.outflows30d)}
          icon={ArrowUpRight}
        />
        <StatCard
          label="Burn Rate"
          value={fmt$(cashFlow.burnRate)}
          subtitle="Monthly"
          icon={AlertTriangle}
          iconColor={cashFlow.burnRate > cashFlow.inflows30d ? "text-red-500" : "text-primary"}
        />
        <StatCard
          label="Runway"
          value={cashFlow.runway > 0 ? fmtRunway(cashFlow.runway) : "∞"}
          icon={Wallet}
          iconColor={cashFlow.runway > 0 ? runwayColor(cashFlow.runway) : "text-emerald-500"}
        />
      </div>

      {/* Cash Flow Analysis */}
      <SectionCard title="Cash Flow Analysis" subtitle="30-day inflows vs outflows">
        <div className="space-y-4">
          {/* Inflows bar */}
          <div className="flex items-center gap-3">
            <span className="w-20 text-right text-sm text-muted-foreground">Inflows</span>
            <div className="flex-1">
              <div className="relative h-8 overflow-hidden rounded-md">
                <div
                  className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                  style={{
                    width: `${Math.max((cashFlow.inflows30d / maxFlow) * 100, 8)}%`,
                    backgroundColor: "#22c55e",
                    minWidth: "60px",
                  }}
                >
                  <span className="text-xs font-bold text-white drop-shadow">
                    {fmt$(cashFlow.inflows30d)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Outflows bar */}
          <div className="flex items-center gap-3">
            <span className="w-20 text-right text-sm text-muted-foreground">Outflows</span>
            <div className="flex-1">
              <div className="relative h-8 overflow-hidden rounded-md">
                <div
                  className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                  style={{
                    width: `${Math.max((cashFlow.outflows30d / maxFlow) * 100, 8)}%`,
                    backgroundColor: "#ef4444",
                    minWidth: "60px",
                  }}
                >
                  <span className="text-xs font-bold text-white drop-shadow">
                    {fmt$(cashFlow.outflows30d)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Net bar */}
          <div className="flex items-center gap-3">
            <span className="w-20 text-right text-sm font-medium text-foreground">Net</span>
            <div className="flex-1">
              <div className="relative h-8 overflow-hidden rounded-md">
                <div
                  className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                  style={{
                    width: `${Math.max((Math.abs(cashFlow.netCashFlow) / maxFlow) * 100, 8)}%`,
                    backgroundColor: cashFlow.netCashFlow >= 0 ? "#22c55e" : "#ef4444",
                    minWidth: "60px",
                  }}
                >
                  <span className="text-xs font-bold text-white drop-shadow">
                    {cashFlow.netCashFlow >= 0 ? "+" : "−"}{fmt$(Math.abs(cashFlow.netCashFlow))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Runway + Account Balances */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Runway Projection */}
        <SectionCard title="Runway Projection" subtitle="Months remaining at current burn rate">
          <div className="flex flex-col items-center gap-4">
            <RingStat
              value={Math.min(cashFlow.runway, 24)}
              max={24}
              label="Runway"
              color={runwayBgColor(cashFlow.runway)}
              size={110}
            />
            <div className="text-center">
              <p className={`text-2xl font-bold tabular-nums ${runwayColor(cashFlow.runway)}`}>
                {cashFlow.runway > 0 ? fmtRunway(cashFlow.runway) : "Sustainable"}
              </p>
              <p className="text-xs text-muted-foreground">
                at {fmt$(cashFlow.burnRate)}/month burn rate
              </p>
            </div>
            {/* Runway scale */}
            <div className="w-full">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>0 mo</span>
                <span>6 mo</span>
                <span>12 mo</span>
                <span>18 mo</span>
                <span>24+ mo</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min((cashFlow.runway / 24) * 100, 100)}%`,
                    backgroundColor: runwayBgColor(cashFlow.runway),
                  }}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Account Balances */}
        <SectionCard title="Account Balances" subtitle={`${accounts.length} Mercury account${accounts.length !== 1 ? "s" : ""}`}>
          {accounts.length > 0 ? (
            <div className="space-y-3">
              {accounts
                .sort((a, b) => b.balance - a.balance)
                .map((account) => {
                  const share = cashFlow.totalBalance > 0
                    ? (account.balance / cashFlow.totalBalance) * 100
                    : 0;
                  return (
                    <div key={account.accountId} className="rounded-lg bg-secondary/40 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{account.accountName}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{account.type}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold tabular-nums text-foreground">{fmt$(account.balance)}</p>
                          <p className="text-[10px] tabular-nums text-muted-foreground">{share.toFixed(0)}% of total</p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              {/* Total row */}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-semibold text-foreground">Total Balance</span>
                <span className="text-lg font-bold tabular-nums text-foreground">{fmt$(cashFlow.totalBalance)}</span>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No account data available</p>
          )}
        </SectionCard>
      </div>

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

"use client";

import {
  Landmark, TrendingUp, TrendingDown,
  AlertTriangle, ArrowDownRight, ArrowUpRight, Wallet,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmt$,
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

  const { accounts } = mercury;
  const mercuryMetrics = data.metrics?.finance.mercury ?? null;

  if (!mercuryMetrics) {
    return (
      <FinanceDataEmptyState
        title="Mercury finance metrics are unavailable"
        message="The canonical finance metrics layer was not included in this analytics payload."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const totalBalance = mercuryMetrics.totalBalance;
  const bankCash = mercuryMetrics.bankCash ?? accounts
    .filter((account) => account.type.toLowerCase() !== "treasury")
    .reduce((sum, account) => sum + account.balance, 0);
  const treasuryCash = mercuryMetrics.treasuryCash ?? accounts
    .filter((account) => account.type.toLowerCase() === "treasury")
    .reduce((sum, account) => sum + account.balance, 0);
  const runway = mercuryMetrics.runwayMonths;
  const netCashFlow = mercuryMetrics.netCashFlow30d;
  const inflows = mercuryMetrics.inflows30d;
  const outflows = mercuryMetrics.outflows30d;
  const burnRate = mercuryMetrics.burnRate;
  const totalBalanceSubtitle = treasuryCash > 0
    ? `${fmt$(bankCash)} bank · ${fmt$(treasuryCash)} Treasury`
    : undefined;

  if (accounts.length === 0 && totalBalance === 0) {
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
  if (runway > 0 && runway < 6) {
    alerts.push({
      severity: "critical",
      title: `Runway at ${fmtRunway(runway)}`,
      description: "Less than 6 months of runway remaining. Urgently review net burn, cut non-essential spend, and accelerate revenue.",
    });
  } else if (runway > 0 && runway < 12) {
    alerts.push({
      severity: "warning",
      title: `Runway at ${fmtRunway(runway)}`,
      description: "Less than 12 months of runway. Monitor net burn closely and consider fundraising timeline.",
    });
  }
  if (netCashFlow < 0) {
    alerts.push({
      severity: "warning",
      title: `Negative cash flow: ${fmt$(Math.abs(netCashFlow))}`,
      description: "Outflows exceed inflows over the last 30 days. Review large expenses and ensure revenue collection is on track.",
    });
  }
  if (burnRate > inflows && inflows > 0) {
    alerts.push({
      severity: "warning",
      title: "Burn rate exceeds inflows",
      description: `Monthly burn of ${fmt$(burnRate)} exceeds ${fmt$(inflows)} in inflows. Operating at a deficit.`,
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (netCashFlow > 0) {
    insights.push({
      title: "Positive Cash Flow",
      insight: `Net positive cash flow of ${fmt$(netCashFlow)} over the last 30 days. Inflows are outpacing outflows.`,
      severity: "success",
    });
  }
  if (runway >= 12) {
    insights.push({
      title: "Healthy Runway",
      insight: `${fmtRunway(runway)} of runway at current burn rate. Comfortable buffer for operations.`,
      severity: "success",
    });
  }
  if (accounts.length > 1) {
    const maxAccount = accounts.reduce((a, b) => (a.balance > b.balance ? a : b));
    const concentration = totalBalance > 0
      ? (maxAccount.balance / totalBalance) * 100
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
  if (burnRate > 0 && inflows > 0) {
    const efficiency = (inflows / burnRate) * 100;
    insights.push({
      title: "Burn Efficiency",
      insight: `Inflows cover ${efficiency.toFixed(0)}% of net burn. ${efficiency >= 100 ? "Self-sustaining at current rates." : "Relying on reserves to cover the gap."}`,
      severity: efficiency >= 100 ? "success" : efficiency >= 70 ? "info" : "warning",
    });
  }

  // ── Cash flow ratios ──
  const maxFlow = Math.max(inflows, outflows, 1);

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
          value={fmt$(totalBalance)}
          subtitle={totalBalanceSubtitle}
          icon={Landmark}
        />
        <StatCard
          label="Net Cash Flow"
          value={fmt$(netCashFlow)}
          changeType={netCashFlow >= 0 ? "positive" : "negative"}
          subtitle="Last 30 days"
          icon={netCashFlow >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Inflows (30d)"
          value={fmt$(inflows)}
          icon={ArrowDownRight}
        />
        <StatCard
          label="Outflows (30d)"
          value={fmt$(outflows)}
          icon={ArrowUpRight}
        />
        <StatCard
          label="Net Burn"
          value={fmt$(burnRate)}
          subtitle="Monthly"
          icon={AlertTriangle}
          iconColor={burnRate > inflows ? "text-red-500" : "text-primary"}
        />
        <StatCard
          label="Runway"
          value={runway > 0 ? fmtRunway(runway) : "∞"}
          icon={Wallet}
          iconColor={runway > 0 ? runwayColor(runway) : "text-emerald-500"}
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
                    width: `${Math.max((inflows / maxFlow) * 100, 8)}%`,
                    backgroundColor: "#22c55e",
                    minWidth: "60px",
                  }}
                >
                  <span className="text-xs font-bold text-white drop-shadow">
                    {fmt$(inflows)}
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
                    width: `${Math.max((outflows / maxFlow) * 100, 8)}%`,
                    backgroundColor: "#ef4444",
                    minWidth: "60px",
                  }}
                >
                  <span className="text-xs font-bold text-white drop-shadow">
                    {fmt$(outflows)}
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
                    width: `${Math.max((Math.abs(netCashFlow) / maxFlow) * 100, 8)}%`,
                    backgroundColor: netCashFlow >= 0 ? "#22c55e" : "#ef4444",
                    minWidth: "60px",
                  }}
                >
                  <span className="text-xs font-bold text-white drop-shadow">
                    {netCashFlow >= 0 ? "+" : "−"}{fmt$(Math.abs(netCashFlow))}
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
        <SectionCard title="Runway Projection" subtitle="Months remaining at the current net burn rate">
          <div className="flex flex-col items-center gap-4">
            <RingStat
              value={Math.min(runway, 24)}
              max={24}
              label="Runway"
              color={runwayBgColor(runway)}
              size={110}
            />
            <div className="text-center">
              <p className={`text-2xl font-bold tabular-nums ${runwayColor(runway)}`}>
                {runway > 0 ? fmtRunway(runway) : "Sustainable"}
              </p>
              <p className="text-xs text-muted-foreground">
                at {fmt$(burnRate)}/month net burn
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
                    width: `${Math.min((runway / 24) * 100, 100)}%`,
                    backgroundColor: runwayBgColor(runway),
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
                  const share = totalBalance > 0
                    ? (account.balance / totalBalance) * 100
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
                <div>
                  <span className="text-sm font-semibold text-foreground">Total Balance</span>
                  {totalBalanceSubtitle ? (
                    <p className="text-[11px] text-muted-foreground">{totalBalanceSubtitle}</p>
                  ) : null}
                </div>
                <span className="text-lg font-bold tabular-nums text-foreground">{fmt$(totalBalance)}</span>
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

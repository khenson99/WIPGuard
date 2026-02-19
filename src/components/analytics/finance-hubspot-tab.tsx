"use client";

import {
  Target, AlertTriangle, Users, CheckCircle,
  Clock, DollarSign, Zap, BarChart3, Activity,
} from "lucide-react";
import type { AnalyticsDashboardData, DealStage } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmt$, fmtPct, timeAgo,
  AlertBanner, DataTable, InsightCard,
  SectionCard, type DataTableColumn,
} from "./dashboard-primitives";

interface FinanceHubSpotTabProps {
  data: AnalyticsDashboardData | null;
}

const FINANCE_STAGE_ORDER = [
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Free Trial",
  "Freemium",
  "Subscription",
  "Closed Won",
  "Churn",
] as const;

const STAGE_COLORS: Record<string, string> = {
  "Budgetary Quote Sent": "#f472b6",
  "Payment Link Sent": "#2dd4bf",
  "Free Trial": "#818cf8",
  "Freemium": "#c084fc",
  "Subscription": "#22d3ee",
  "Closed Won": "#22c55e",
  "Churn": "#dc2626",
};

function orderedFinanceStages(stages: DealStage[]): DealStage[] {
  return FINANCE_STAGE_ORDER
    .map((label) => stages.find((stage) => stage.label === label))
    .filter((stage): stage is DealStage => Boolean(stage));
}

export function FinanceHubSpotTab({ data }: FinanceHubSpotTabProps) {
  const hubspot = data?.hubspot;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "hubspot" || entry.source === "hubspotOps")
      .map((entry) => entry.message),
    ...(data?.freshness?.hubspot?.lastError ? [data.freshness.hubspot.lastError] : []),
  ];

  if (!hubspot) {
    return (
      <FinanceDataEmptyState
        title="HubSpot finance lifecycle data is unavailable"
        message="We could not load HubSpot revenue-stage analytics for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const { funnel, deals } = hubspot;
  const stages = orderedFinanceStages(funnel.stages);
  const maxStageCount = Math.max(...stages.map((s) => s.count), 1);
  const totalPipelineValue = stages.reduce((sum, s) => sum + s.value, 0);

  if (stages.length === 0) {
    return (
      <FinanceDataEmptyState
        title="No finance-stage HubSpot deals found"
        message="HubSpot is connected, but no deals are currently in quote, payment, trial, subscription, closed-won, or churn stages."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (funnel.churn > 10) {
    alerts.push({
      severity: "critical",
      title: `${funnel.churn} churned customers`,
      description: "High churn count detected. Implement 30/60/90-day check-in cadence and proactive retention workflows.",
    });
  }
  if (funnel.noShowRate > 15) {
    alerts.push({
      severity: "critical",
      title: `No-show rate at ${fmtPct(funnel.noShowRate)}`,
      description: `${funnel.noShows} prospects scheduled demos but didn't show. Add SMS reminders and shorter booking windows.`,
    });
  }
  if (funnel.unlikely > 20) {
    alerts.push({
      severity: "warning",
      title: `${funnel.unlikely} deals marked "Unlikely"`,
      description: "Large number of stalled deals. Review qualification criteria and consider archiving stale opportunities.",
    });
  }
  if (funnel.winRate < 30) {
    alerts.push({
      severity: "warning",
      title: `Win rate at ${fmtPct(funnel.winRate)}`,
      description: "Below target win rate. Review demo quality, follow-up timing, and pricing objection handling.",
    });
  }

  // ── Conversion Analysis ──
  const conversions: { from: string; to: string; rate: number }[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const from = stages[i];
    const to = stages[i + 1];
    if (from.count > 0) {
      conversions.push({
        from: from.label,
        to: to.label,
        rate: (to.count / from.count) * 100,
      });
    }
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (funnel.activeSubscriptions > 0) {
    insights.push({
      title: "Active Subscriptions",
      insight: `${funnel.activeSubscriptions} active subscriptions generating recurring revenue. ${funnel.activeSubscriptions < 10 ? "Focus on conversion to grow base." : "Healthy subscriber base."}`,
      severity: funnel.activeSubscriptions < 10 ? "info" : "success",
    });
  }
  if (funnel.demoFollowUp > funnel.closedWon) {
    insights.push({
      title: "Follow-Up Bottleneck",
      insight: `${funnel.demoFollowUp} deals in follow-up vs ${funnel.closedWon} closed won. Post-demo proposal delivery may be too slow.`,
      action: "Speed up quote generation and reduce time from demo to proposal.",
      severity: "warning",
    });
  }
  const trialStage = stages.find((s) => s.label === "Free Trial");
  const subStage = stages.find((s) => s.label === "Subscription");
  if (trialStage && trialStage.count > 0 && subStage) {
    const trialConversion = subStage.count > 0 ? (subStage.count / trialStage.count) * 100 : 0;
    insights.push({
      title: "Trial-to-Subscription",
      insight: `${trialStage.count} free trials, ${subStage.count} subscriptions (${fmtPct(trialConversion)} conversion).`,
      action: trialConversion < 30 ? "Improve onboarding emails and trial expiry reminders." : undefined,
      severity: trialConversion < 30 ? "warning" : "success",
    });
  }
  if (funnel.churn <= 10 && funnel.noShowRate <= 15 && funnel.winRate >= 30) {
    insights.push({
      title: "Pipeline Health",
      insight: "Churn, no-show rate, and win rate are all within healthy ranges.",
      severity: "success",
    });
  }

  // ── Deal Table Columns ──
  type DealRow = NonNullable<typeof deals>[number];
  const dealColumns: DataTableColumn<DealRow>[] = [
    { key: "dealName", header: "Deal", render: (r) => <span className="font-medium text-foreground">{r.dealName}</span> },
    { key: "stageLabel", header: "Stage", render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[r.stageLabel] || "#6b7280" }} />
        <span className="text-muted-foreground">{r.stageLabel}</span>
      </span>
    )},
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-medium tabular-nums">{fmt$(r.amount)}</span> },
    { key: "source", header: "Source", render: (r) => <span className="text-muted-foreground">{r.source || "—"}</span> },
    { key: "updatedAt", header: "Updated", align: "right", render: (r) => <span className="text-muted-foreground">{timeAgo(r.updatedAt)}</span> },
  ];

  return (
    <div className="space-y-6">
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
          label="Total Deals"
          value={funnel.totalDeals.toLocaleString()}
          icon={Target}
        />
        <StatCard
          label="Closed Won"
          value={funnel.closedWon.toLocaleString()}
          subtitle={fmt$(stages.find((s) => s.label === "Closed Won")?.value ?? 0)}
          icon={CheckCircle}
        />
        <StatCard
          label="Active Subs"
          value={funnel.activeSubscriptions.toLocaleString()}
          icon={Users}
        />
        <StatCard
          label="Avg Deal Size"
          value={fmt$(funnel.avgDealSize)}
          icon={DollarSign}
        />
        <StatCard
          label="Win Rate"
          value={fmtPct(funnel.winRate)}
          changeType={funnel.winRate >= 50 ? "positive" : "negative"}
          subtitle={`${funnel.closedWon} won / ${funnel.closedWon + funnel.closedLost} decided`}
          icon={Zap}
        />
        <StatCard
          label="No-Show Rate"
          value={fmtPct(funnel.noShowRate)}
          changeType={funnel.noShowRate > 15 ? "negative" : "positive"}
          subtitle={`${funnel.noShows} no-shows`}
          icon={Clock}
        />
        <StatCard
          label="Churn"
          value={funnel.churn.toLocaleString()}
          changeType={funnel.churn > 10 ? "negative" : "positive"}
          icon={AlertTriangle}
          iconColor={funnel.churn > 10 ? "text-red-500" : "text-primary"}
        />
        <StatCard
          label="Pipeline Value"
          value={fmt$(totalPipelineValue)}
          icon={BarChart3}
        />
      </div>

      {/* Finance Lifecycle Funnel */}
      <SectionCard title="Finance Lifecycle Funnel" subtitle="Revenue stages from quote to subscription">
        <div className="space-y-2">
          {stages.map((stage) => {
            const widthPct = Math.max((stage.count / maxStageCount) * 100, 8);
            return (
              <div key={stage.stageId} className="flex items-center gap-3">
                <span className="w-40 text-right text-sm text-muted-foreground">
                  {stage.label}
                </span>
                <div className="flex-1">
                  <div className="relative h-8 overflow-hidden rounded-md">
                    <div
                      className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: STAGE_COLORS[stage.label] || "#6b7280",
                        minWidth: "60px",
                      }}
                    >
                      <span className="text-xs font-bold text-white drop-shadow">
                        {stage.count}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                  {fmt$(stage.value)}
                </span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Subscription Health + Conversion Analysis */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Subscription Health" subtitle="Finance stage distribution">
          <div className="flex flex-wrap items-center justify-center gap-6">
            {stages.map((stage) => (
              <RingStat
                key={stage.stageId}
                value={stage.count}
                max={Math.max(funnel.totalDeals, 1)}
                label={stage.label.length > 14 ? stage.label.slice(0, 12) + "..." : stage.label}
                color={STAGE_COLORS[stage.label] || "#6b7280"}
                size={80}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-4">
            {stages.map((s) => (
              <div key={s.stageId} className="rounded-lg bg-secondary/40 p-2">
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{s.count}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">{fmt$(s.value)}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Stage Conversion Rates" subtitle="Progression between finance lifecycle stages">
          {conversions.length > 0 ? (
            <div className="space-y-3">
              {conversions.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 text-right text-xs text-muted-foreground">{c.from}</div>
                  <div className="flex w-24 items-center justify-center">
                    <div className="flex items-center gap-1">
                      <Activity className="h-3 w-3 text-primary" />
                      <span className={`text-sm font-bold tabular-nums ${c.rate >= 50 ? "text-emerald-500" : c.rate >= 25 ? "text-yellow-500" : "text-red-500"}`}>
                        {fmtPct(c.rate)}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 text-left text-xs text-muted-foreground">{c.to}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Not enough data for conversion analysis</p>
          )}
        </SectionCard>
      </div>

      {/* Deal Details Table */}
      {deals && deals.length > 0 && (
        <SectionCard title="Deal Details" subtitle={`${deals.length} deals in finance lifecycle stages`}>
          <DataTable columns={dealColumns} rows={deals} emptyMessage="No individual deal data available" />
        </SectionCard>
      )}

      {/* Source Attribution */}
      {funnel.dealsBySource.length > 0 && (
        <SectionCard title="Revenue by Source" subtitle="Deal source attribution for finance stages">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Deals</th>
                  <th className="pb-2 text-right font-medium">Pipeline Value</th>
                  <th className="pb-2 text-right font-medium">Avg Value</th>
                  <th className="pb-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {funnel.dealsBySource
                  .sort((a, b) => b.value - a.value)
                  .map((s, i) => {
                    const share = funnel.totalDeals > 0 ? (s.count / funnel.totalDeals) * 100 : 0;
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0 transition-colors hover:bg-secondary/20">
                        <td className="py-2.5 font-medium text-foreground">{s.source}</td>
                        <td className="py-2.5 text-right tabular-nums">{s.count}</td>
                        <td className="py-2.5 text-right tabular-nums font-medium">{fmt$(s.value)}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {s.count > 0 ? fmt$(s.value / s.count) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {share.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
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

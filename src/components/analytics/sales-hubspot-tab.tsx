"use client";

import {
  Target, Users, DollarSign, BarChart3,
  Calendar, ArrowRight,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { StatCard } from "@/components/analytics/stat-card";
import { BarDisplay, RingStat } from "@/components/analytics/bar-display";
import {
  fmt$, fmtN, fmtPct,
  AlertBanner, DataTable, InsightCard,
  SectionCard,
  type DataTableColumn,
} from "./dashboard-primitives";

interface SalesHubspotTabProps {
  data: AnalyticsDashboardData | null;
}

export function SalesHubspotTab({ data }: SalesHubspotTabProps) {
  const hs = data?.hubspot;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "hubspot")
      .map((entry) => entry.message),
    ...(data?.freshness?.hubspot?.lastError ? [data.freshness.hubspot.lastError] : []),
  ];

  if (!hs) {
    return <FinanceDataEmptyState provider="HubSpot" reasons={reasons} />;
  }

  const funnel = hs.funnel;
  const deals = hs.deals ?? [];

  /* ── Alerts ──────────────────────────────────────── */

  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];

  if (funnel.noShowRate > 30) {
    alerts.push({
      severity: "warning",
      title: "High no-show rate",
      description: `${funnel.noShowRate.toFixed(0)}% of demos result in no-shows — review outreach timing and qualification.`,
    });
  }

  if (funnel.winRate < 10 && funnel.totalDeals > 5) {
    alerts.push({
      severity: "warning",
      title: "Low win rate",
      description: `Win rate at ${funnel.winRate.toFixed(1)}% — review deal qualification criteria and sales process.`,
    });
  }

  if (funnel.churn > 0) {
    alerts.push({
      severity: funnel.churn > 5 ? "critical" : "warning",
      title: `${funnel.churn} deals in churn stage`,
      description: "Active churn detected in the pipeline. Prioritize retention outreach.",
    });
  }

  /* ── Sales stages for funnel visualization ───────── */

  const salesStages = funnel.stages
    .filter((s) => !["Closed Lost", "Unlikely", "Churn"].includes(s.label))
    .sort((a, b) => {
      const order = [
        "Prospect", "Lead", "Demo Scheduled", "No-Show/Reschedule",
        "Demo Follow-Up", "Budgetary Quote Sent", "Payment Link Sent",
        "Free Trial", "Freemium", "Subscription", "Closed Won",
      ];
      return order.indexOf(a.label) - order.indexOf(b.label);
    });
  const maxStageCount = Math.max(...salesStages.map((s) => s.count), 1);

  /* ── Source attribution ──────────────────────────── */

  const sourceColumns: DataTableColumn<{ source: string; count: number; value: number }>[] = [
    { key: "source", label: "Source" },
    { key: "count", label: "Deals", align: "right", render: (row) => fmtN(row.count) },
    { key: "value", label: "Pipeline Value", align: "right", render: (row) => fmt$(row.value) },
  ];

  /* ── Deal-level table ────────────────────────────── */

  type DealRow = { dealName: string; stageLabel: string; amount: number; source: string; updatedAt: string | null };
  const dealColumns: DataTableColumn<DealRow>[] = [
    { key: "dealName", label: "Deal" },
    { key: "stageLabel", label: "Stage" },
    { key: "amount", label: "Amount", align: "right", render: (row) => fmt$(row.amount) },
    { key: "source", label: "Source" },
    { key: "updatedAt", label: "Last Updated", render: (row) => row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—" },
  ];
  const dealRows: DealRow[] = deals
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 25)
    .map((d) => ({
      dealName: d.dealName,
      stageLabel: d.stageLabel,
      amount: d.amount,
      source: d.source,
      updatedAt: d.updatedAt,
    }));

  /* ── Win/Loss ring ───────────────────────────────── */

  const outcomeSegments = [
    { label: "Won", value: funnel.closedWon, color: "#22c55e" },
    { label: "Lost", value: funnel.closedLost, color: "#ef4444" },
    { label: "Unlikely", value: funnel.unlikely, color: "#f97316" },
    { label: "Churn", value: funnel.churn, color: "#dc2626" },
  ].filter((s) => s.value > 0);
  const totalOutcomes = outcomeSegments.reduce((sum, s) => sum + s.value, 0);

  /* ── Insights ────────────────────────────────────── */

  const insights: { title: string; insight: string; action: string; severity: "critical" | "warning" | "info" }[] = [];

  if (funnel.effectiveWinRate > funnel.winRate + 5) {
    insights.push({
      title: "Effective Win Rate Higher",
      insight: `Effective win rate (${fmtPct(funnel.effectiveWinRate)}) is higher than raw win rate (${fmtPct(funnel.winRate)}) — removing unlikely deals shows better conversion.`,
      action: "Clean up unlikely deals to get a more accurate pipeline picture.",
      severity: "info",
    });
  }

  if (funnel.noShows > 3) {
    insights.push({
      title: "No-Show Problem",
      insight: `${funnel.noShows} no-shows in pipeline — potential qualification or timing issues.`,
      action: "Implement reminder sequences and tighten qualification criteria.",
      severity: "warning",
    });
  }

  if (funnel.avgDealSize > 0 && funnel.closedWon > 0) {
    insights.push({
      title: "Deal Size Benchmark",
      insight: `Average deal size is ${fmt$(funnel.avgDealSize)}.`,
      action: "Use this as a baseline for forecasting and pipeline qualification.",
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
          title="Total Deals"
          value={fmtN(funnel.totalDeals)}
          icon={<Target className="h-4 w-4" />}
        />
        <StatCard
          title="Closed Won"
          value={fmtN(funnel.closedWon)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatCard
          title="Win Rate"
          value={fmtPct(funnel.winRate)}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          title="Avg Deal Size"
          value={fmt$(funnel.avgDealSize)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatCard
          title="Active Subscriptions"
          value={fmtN(funnel.activeSubscriptions)}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="Demo Scheduled"
          value={fmtN(funnel.demoScheduled)}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatCard
          title="No-Show Rate"
          value={fmtPct(funnel.noShowRate)}
          icon={<AlertTriangle className="h-4 w-4" />}
          className={funnel.noShowRate > 25 ? "border-amber-500/30 bg-amber-500/5" : undefined}
        />
        <StatCard
          title="Effective Win Rate"
          value={fmtPct(funnel.effectiveWinRate)}
          icon={<Target className="h-4 w-4" />}
        />
      </div>

      {/* ── Sales Funnel ──────────────────────────── */}
      <SectionCard title="Sales Pipeline Funnel" subtitle="Deal progression through stages">
        <div className="space-y-2">
          {salesStages.map((stage) => (
            <div key={stage.stageId} className="flex items-center gap-3">
              <div className="w-36 truncate text-sm text-muted-foreground">{stage.label}</div>
              <div className="flex-1">
                <div className="h-6 w-full overflow-hidden rounded bg-muted/30">
                  <div
                    className="flex h-full items-center rounded bg-[#fc5a29]/80 px-2 text-xs font-medium text-white transition-all"
                    style={{ width: `${Math.max((stage.count / maxStageCount) * 100, 8)}%` }}
                  >
                    {stage.count}
                  </div>
                </div>
              </div>
              <div className="w-20 text-right text-xs text-muted-foreground">{fmt$(stage.value)}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Win/Loss Breakdown ─────────────────────── */}
      {totalOutcomes > 0 && (
        <SectionCard title="Deal Outcomes" subtitle="Won vs lost distribution">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <RingStat segments={outcomeSegments} total={totalOutcomes} label="Outcomes" size={140} />
            <div className="space-y-2">
              {outcomeSegments.map((seg) => (
                <div key={seg.label} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground">{seg.label}</span>
                  <span className="ml-auto font-medium">{fmtN(seg.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Source Attribution ─────────────────────── */}
      {funnel.dealsBySource.length > 0 && (
        <SectionCard title="Source Attribution" subtitle="Where pipeline deals originate">
          <DataTable columns={sourceColumns} rows={funnel.dealsBySource} emptyMessage="No source data available" />
        </SectionCard>
      )}

      {/* ── Deal Details ──────────────────────────── */}
      {dealRows.length > 0 && (
        <SectionCard title="Deal Details" subtitle={`Top ${dealRows.length} deals by value`}>
          <DataTable columns={dealColumns} rows={dealRows} emptyMessage="No deals found" />
        </SectionCard>
      )}

      {/* ── Insights ──────────────────────────────── */}
      {insights.length > 0 && (
        <SectionCard title="Sales Insights">
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

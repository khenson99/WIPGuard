"use client";

import {
  Users, CheckCircle2, AlertTriangle, Box,
  TrendingUp, Clock, BarChart3,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmtN, fmtPct,
  AlertBanner, InsightCard,
  SectionCard,
} from "./dashboard-primitives";

interface CsCodaTabProps {
  data: AnalyticsDashboardData | null;
}

export function CsCodaTab({ data }: CsCodaTabProps) {
  const product = data?.product;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "product")
      .map((entry) => entry.message),
    ...(data?.freshness?.product?.lastError ? [data.freshness.product.lastError] : []),
  ];

  if (!product) {
    return <FinanceDataEmptyState provider="Coda" reasons={reasons} />;
  }

  /* ── Derived metrics ─────────────────────────────── */

  const created = product.mergedPullRequestsInRange;
  const completed = product.completedLinearIssuesInRange;
  const overdue = product.cycleTimeRiskSignals;
  const deliveryBalance = product.deliveryBalance;
  const throughput = product.deliveryRate;
  const contributors = product.activeContributors;

  const completionRate = created > 0 ? (completed / created) * 100 : 0;
  const overdueRatio = created > 0 ? (overdue / created) * 100 : 0;

  /* ── Alerts ──────────────────────────────────────── */

  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];

  if (overdue > 10) {
    alerts.push({
      severity: "critical",
      title: "High cycle-time risk",
      description: `${overdue} Linear cycle-time risk signals are active. Review priorities and blockers.`,
    });
  } else if (overdue > 5) {
    alerts.push({
      severity: "warning",
      title: "Cycle-time risk growing",
      description: `${overdue} cycle-time risk signals detected. Review long-cycle issues.`,
    });
  }

  if (deliveryBalance > 20) {
    alerts.push({
      severity: "warning",
      title: "Delivery balance widening",
      description: `Delivery balance is ${deliveryBalance.toFixed(0)} signals, with merged PRs outpacing completed Linear issues.`,
    });
  }

  if (throughput !== null && throughput < 50) {
    alerts.push({
      severity: "warning",
      title: "Low delivery rate",
      description: `Delivery rate is ${throughput.toFixed(0)}%, with provider signals showing drag.`,
    });
  }

  if (contributors === 0) {
    alerts.push({
      severity: "info",
      title: "No active contributors",
      description: "No contributor activity detected in this period.",
    });
  }

  /* ── Insights ────────────────────────────────────── */

  const insights: { title: string; insight: string; action: string; severity: "critical" | "warning" | "info" }[] = [];

  if (overdue > 5) {
    insights.push({
      title: "Cycle-time Risk",
      insight: `${overdue} Linear cycle-time risk signals are active, signaling scope or capacity issues.`,
      action: "Review long-cycle issues and owner load.",
      severity: overdue > 10 ? "critical" : "warning",
    });
  }

  if (deliveryBalance > 20) {
    insights.push({
      title: "Delivery Balance Widening",
      insight: `Delivery balance is ${deliveryBalance.toFixed(0)} signals — merged PRs exceed completed Linear issues.`,
      action: "Review delivery sequencing against customer-impacting commitments.",
      severity: "warning",
    });
  }

  if (completionRate >= 80) {
    insights.push({
      title: "Strong Velocity",
      insight: `${completionRate.toFixed(0)}% of compared delivery signals completed this period.`,
      action: "Team is performing well. Consider taking on stretch goals.",
      severity: "info",
    });
  } else if (completionRate < 50 && created > 0) {
    insights.push({
      title: "Low Completion Rate",
      insight: `Only ${completionRate.toFixed(0)}% of compared delivery signals completed.`,
      action: "Investigate blockers — may need process improvements or scope reduction.",
      severity: "warning",
    });
  }

  if (throughput !== null && throughput > 90) {
    insights.push({
      title: "Excellent Delivery Rate",
      insight: `Team delivery rate at ${throughput.toFixed(0)}% — provider signals are moving efficiently.`,
      action: "Sustainable pace achieved. Continue current workflow.",
      severity: "info",
    });
  }

  /* ── Velocity bar helper ─────────────────────────── */

  const maxVelocity = Math.max(created, completed, 1);

  /* ── Ring data for delivery health ─────────────────── */

  const totalItems = completed + overdue + Math.max(0, created - completed - overdue);
  const ringSegments = [
    { label: "Completed", value: completed, color: "#22c55e" },
    { label: "Cycle-time risk", value: overdue, color: "#ef4444" },
    { label: "Delivery gap", value: Math.max(0, created - completed - overdue), color: "#f59e0b" },
  ].filter((s) => s.value > 0);

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.map((a, i) => (
        <AlertBanner key={i} severity={a.severity} title={a.title} description={a.description} />
      ))}

      {/* ── KPI Grid ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          title="Active Contributors"
          value={fmtN(contributors)}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="Merged PRs"
          value={fmtN(created)}
          icon={<Box className="h-4 w-4" />}
        />
        <StatCard
          title="Completed Linear Issues"
          value={fmtN(completed)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          title="Cycle-time Risk"
          value={fmtN(overdue)}
          icon={<Clock className="h-4 w-4" />}
          className={overdue > 5 ? "border-red-500/30 bg-red-500/5" : undefined}
        />
        <StatCard
          title="Delivery Balance"
          value={`${deliveryBalance >= 0 ? "+" : ""}${deliveryBalance.toFixed(0)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          className={deliveryBalance > 20 ? "border-amber-500/30 bg-amber-500/5" : undefined}
        />
        <StatCard
          title="Delivery Rate"
          value={throughput !== null ? fmtPct(throughput) : "—"}
          icon={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      {/* ── Velocity Comparison ────────────────────── */}
      <SectionCard title="Delivery Velocity" subtitle="Merged PRs compared with completed Linear issues">
        <div className="space-y-4">
          {/* Created bar */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Merged PRs</span>
              <span className="font-medium">{fmtN(created)}</span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded bg-muted/40">
              <div
                className="h-full rounded bg-blue-500 transition-all"
                style={{ width: `${(created / maxVelocity) * 100}%` }}
              />
            </div>
          </div>
          {/* Completed bar */}
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Completed Linear issues</span>
              <span className="font-medium">{fmtN(completed)}</span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded bg-muted/40">
              <div
                className="h-full rounded bg-green-500 transition-all"
                style={{ width: `${(completed / maxVelocity) * 100}%` }}
              />
            </div>
          </div>
          {/* Completion rate */}
          <div className="pt-2 text-center">
            <span className="text-sm text-muted-foreground">Completion Rate: </span>
            <span className={`font-semibold ${completionRate >= 70 ? "text-green-500" : completionRate >= 50 ? "text-amber-500" : "text-red-500"}`}>
              {completionRate.toFixed(1)}%
            </span>
          </div>
        </div>
      </SectionCard>

      {/* ── Delivery Health ─────────────────────────── */}
      {totalItems > 0 && (
        <SectionCard title="Delivery Health" subtitle="Provider-derived development signal distribution">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <RingStat
              segments={ringSegments}
              total={totalItems}
              label="Total"
              size={140}
            />
            <div className="space-y-2">
              {ringSegments.map((seg) => (
                <div key={seg.label} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground">{seg.label}</span>
                  <span className="ml-auto font-medium">{fmtN(seg.value)}</span>
                  <span className="text-muted-foreground">
                    ({((seg.value / totalItems) * 100).toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
          {overdue > 0 && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">
                  {overdueRatio.toFixed(0)}% of compared delivery signals carry cycle-time risk
                </span>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Delivery Rate Details ─────────────────────── */}
      {throughput !== null && (
        <SectionCard title="Delivery Rate Analysis" subtitle="How efficiently provider signals move through the system">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-4 w-full max-w-md overflow-hidden rounded-full bg-muted/40">
              <div
                className={`h-full rounded-full transition-all ${
                  throughput >= 80
                    ? "bg-green-500"
                    : throughput >= 50
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${Math.min(throughput, 100)}%` }}
              />
            </div>
            <div className="flex w-full max-w-md justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {throughput >= 80
                ? "Healthy — provider signals are moving efficiently"
                : throughput >= 50
                  ? "Moderate — some work is accumulating"
                  : "Low — significant delivery drag"}
            </p>
          </div>
        </SectionCard>
      )}

      {/* ── Insights ──────────────────────────────── */}
      {insights.length > 0 && (
        <SectionCard title="Insights & Recommendations">
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

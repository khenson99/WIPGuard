"use client";

import {
  Users, CheckCircle2, AlertTriangle, Box,
  TrendingUp, Gauge,
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
import { AiInsightsPanel } from "./ai-insights-panel";

interface CsProductTabProps {
  data: AnalyticsDashboardData | null;
}

export function CsProductTab({ data }: CsProductTabProps) {
  const product = data?.product;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "product")
      .map((entry) => entry.message),
    ...(data?.freshness?.product?.lastError ? [data.freshness.product.lastError] : []),
  ];

  if (!product) {
    return <FinanceDataEmptyState provider="Product" reasons={reasons} />;
  }

  /* ── Derived metrics ─────────────────────────────── */

  const created = product.mergedPullRequestsInRange;
  const completed = product.completedLinearIssuesInRange;
  const overdue = product.cycleTimeRiskSignals;
  const deliveryBalance = product.deliveryBalance;
  const throughput = product.deliveryRate;
  const contributors = product.activeContributors;

  const adoptionScore =
    contributors > 0
      ? Math.min(100, Math.round((contributors / 10) * 25 + (completed > 0 ? 25 : 0) + (throughput !== null && throughput > 50 ? 25 : 0) + (overdue < 5 ? 25 : 0)))
      : 0;

  const completionRate = created > 0 ? (completed / created) * 100 : 0;

  /* ── Alerts ──────────────────────────────────────── */

  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];

  if (contributors === 0) {
    alerts.push({
      severity: "critical",
      title: "No product adoption activity",
      description: "Zero active contributors this period. Product workflows may be stalled.",
    });
  }

  if (overdue > 10) {
    alerts.push({
      severity: "critical",
      title: "Cycle-time risk elevated",
      description: `${overdue} Linear cycle-time risk signals are active, with delivery timelines at risk.`,
    });
  }

  if (deliveryBalance > 30) {
    alerts.push({
      severity: "warning",
      title: "Delivery balance widened",
      description: `Delivery balance is ${deliveryBalance.toFixed(0)} signals — merged PRs are outpacing completed Linear issues.`,
    });
  }

  /* ── Insights ────────────────────────────────────── */

  const insights: { title: string; insight: string; action: string; severity: "critical" | "warning" | "info" }[] = [];

  if (contributors >= 5) {
    insights.push({
      title: "Healthy Adoption",
      insight: `${contributors} active contributors engaged with product workflows.`,
      action: "Continue onboarding and feature rollout to sustain engagement.",
      severity: "info",
    });
  } else if (contributors > 0 && contributors < 3) {
    insights.push({
      title: "Limited Adoption",
      insight: `Only ${contributors} contributor(s) active — product usage is concentrated.`,
      action: "Expand onboarding and identify barriers to broader team adoption.",
      severity: "warning",
    });
  }

  if (throughput !== null && throughput < 40) {
    insights.push({
      title: "Delivery Bottleneck",
      insight: `Delivery rate at ${throughput.toFixed(0)}%, with provider signals showing drag.`,
      action: "Review blocking dependencies and reallocate capacity to unblock delivery.",
      severity: "warning",
    });
  }

  if (completed > 0 && completionRate > 75) {
    insights.push({
      title: "Strong Delivery",
      insight: `${completionRate.toFixed(0)}% of compared delivery signals completed this period.`,
      action: "Team is delivering effectively. Consider increasing ambition for next cycle.",
      severity: "info",
    });
  }

  if (overdue > 5) {
    insights.push({
      title: "Cycle-time Risk",
      insight: `${overdue} Linear cycle-time risk signals are active, which may indicate estimation or capacity issues.`,
      action: "Review long-cycle issues and adjust estimates for future work.",
      severity: overdue > 10 ? "critical" : "warning",
    });
  }

  /* ── Adoption score color ────────────────────────── */

  const scoreColor =
    adoptionScore >= 75 ? "text-green-500" : adoptionScore >= 50 ? "text-amber-500" : "text-red-500";
  const scoreBg =
    adoptionScore >= 75 ? "bg-green-500" : adoptionScore >= 50 ? "bg-amber-500" : "bg-red-500";

  /* ── Ring segments ───────────────────────────────── */

  const ringSegments = [
    { label: "Completed", value: completed, color: "#22c55e" },
    { label: "Cycle-time risk", value: overdue, color: "#ef4444" },
    { label: "Delivery gap", value: Math.max(0, created - completed - overdue), color: "#3b82f6" },
  ].filter((s) => s.value > 0);
  const totalForRing = ringSegments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      <AiInsightsPanel bundle={data.aiInsights || null} defaultFilter="customer-success" />

      {/* Alerts */}
      {alerts.map((a, i) => (
        <AlertBanner key={i} severity={a.severity} title={a.title} description={a.description} />
      ))}

      {/* ── Adoption Score Hero ────────────────────── */}
      <SectionCard title="Product Adoption Score" subtitle="Composite health indicator based on contributors, delivery rate, and cycle-time risk">
        <div className="flex flex-col items-center gap-3">
          <div className={`text-5xl font-bold ${scoreColor}`}>{adoptionScore}</div>
          <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-muted/40">
            <div className={`h-full rounded-full ${scoreBg} transition-all`} style={{ width: `${adoptionScore}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {adoptionScore >= 75
              ? "Strong adoption — product workflows actively used"
              : adoptionScore >= 50
                ? "Moderate adoption — room for improvement"
                : "Low adoption — intervention needed"}
          </p>
        </div>
      </SectionCard>

      {/* ── KPI Grid ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          title="Active Contributors"
          value={fmtN(contributors)}
          icon={<Users className="h-4 w-4" />}
          className={contributors === 0 ? "border-red-500/30 bg-red-500/5" : undefined}
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
          icon={<AlertTriangle className="h-4 w-4" />}
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
          icon={<Gauge className="h-4 w-4" />}
        />
      </div>

      {/* ── Delivery Pipeline ─────────────────────── */}
      {totalForRing > 0 && (
        <SectionCard title="Delivery Signals" subtitle="Provider-derived development health breakdown">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <RingStat
              segments={ringSegments}
              total={totalForRing}
              label="Signals"
              size={140}
            />
            <div className="space-y-2">
              {ringSegments.map((seg) => (
                <div key={seg.label} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground">{seg.label}</span>
                  <span className="ml-auto font-medium">{fmtN(seg.value)}</span>
                  <span className="text-muted-foreground">
                    ({((seg.value / totalForRing) * 100).toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Capacity & Velocity ────────────────────── */}
      <SectionCard title="Delivery Balance" subtitle="Merged PRs compared with completed Linear issues">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Merged PRs this period</span>
            <span className="font-medium">{fmtN(created)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Completed Linear issues this period</span>
            <span className="font-medium">{fmtN(completed)}</span>
          </div>
          <div className="border-t border-border pt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Net change</span>
            <span className={`font-semibold ${created - completed > 0 ? "text-red-400" : "text-green-400"}`}>
              {created - completed > 0 ? "+" : ""}{fmtN(created - completed)} signals
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Completion rate</span>
            <span className={`font-semibold ${completionRate >= 70 ? "text-green-500" : completionRate >= 50 ? "text-amber-500" : "text-red-500"}`}>
              {completionRate.toFixed(1)}%
            </span>
          </div>
        </div>
      </SectionCard>

      {/* ── Insights ──────────────────────────────── */}
      {insights.length > 0 && (
        <SectionCard title="Product Insights">
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

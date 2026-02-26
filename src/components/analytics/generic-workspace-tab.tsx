"use client";

import {
  Settings, AlertTriangle, Activity, CheckCircle2,
  XCircle, Zap, BarChart3,
} from "lucide-react";
import type { AnalyticsDashboardData, IntegrationTelemetryData } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmtN,
  AlertBanner, DataTable, InsightCard,
  SectionCard,
  type DataTableColumn,
} from "./dashboard-primitives";

interface GenericWorkspaceTabProps {
  data: AnalyticsDashboardData | null;
}

export function GenericWorkspaceTab({ data }: GenericWorkspaceTabProps) {
  const ws = data?.googleWorkspace;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "googleWorkspace")
      .map((entry) => entry.message),
    ...(data?.freshness?.googleWorkspace?.lastError ? [data.freshness.googleWorkspace.lastError] : []),
  ];

  if (!ws) {
    return <FinanceDataEmptyState provider="Google Workspace" reasons={reasons} />;
  }

  return <TelemetryDashboard telemetry={ws} label="Google Workspace" />;
}

/* ── Shared telemetry dashboard (also used by slack) ── */

export function TelemetryDashboard({
  telemetry,
  label,
}: {
  telemetry: IntegrationTelemetryData;
  label: string;
}) {
  const {
    totalRules, enabledRules, erroredRules,
    receiptsInRange, tasksCreatedInRange, eventsInRange, failuresInRange,
    trend, topFailureReasons,
  } = telemetry;

  const disabledRules = totalRules - enabledRules;
  const errorRate = eventsInRange > 0 ? (failuresInRange / eventsInRange) * 100 : 0;

  /* ── Alerts ──────────────────────────────────────── */

  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];

  if (erroredRules > 0) {
    alerts.push({
      severity: erroredRules > 3 ? "critical" : "warning",
      title: `${erroredRules} rule(s) in error state`,
      description: `${erroredRules} of ${totalRules} automation rules are erroring. Review and fix to restore functionality.`,
    });
  }

  if (errorRate > 10) {
    alerts.push({
      severity: "warning",
      title: "High failure rate",
      description: `${errorRate.toFixed(1)}% of events resulted in failures this period.`,
    });
  }

  if (enabledRules === 0 && totalRules > 0) {
    alerts.push({
      severity: "info",
      title: "All rules disabled",
      description: `${totalRules} rules configured but none are enabled.`,
    });
  }

  /* ── Rule health ring ────────────────────────────── */

  const ruleSegments = [
    { label: "Active", value: enabledRules - erroredRules, color: "#22c55e" },
    { label: "Errored", value: erroredRules, color: "#ef4444" },
    { label: "Disabled", value: disabledRules, color: "#6b7280" },
  ].filter((s) => s.value > 0);

  /* ── Activity trend ──────────────────────────────── */

  const maxReceipts = Math.max(...trend.map((t) => t.receipts), 1);

  /* ── Failure reasons table ───────────────────────── */

  type FailureRow = { reason: string; count: number };
  const failureColumns: DataTableColumn<FailureRow>[] = [
    { key: "reason", label: "Failure Reason" },
    { key: "count", label: "Occurrences", align: "right", render: (row) => fmtN(row.count) },
  ];

  /* ── Insights ────────────────────────────────────── */

  const insights: { title: string; insight: string; action: string; severity: "critical" | "warning" | "info" }[] = [];

  if (erroredRules > 0) {
    insights.push({
      title: "Fix Errored Rules",
      insight: `${erroredRules} rules are in error state, potentially blocking automations.`,
      action: "Review error logs and fix or disable broken rules to clear the error backlog.",
      severity: erroredRules > 3 ? "critical" : "warning",
    });
  }

  if (tasksCreatedInRange > 0 && receiptsInRange > 0) {
    const conversionRate = (tasksCreatedInRange / receiptsInRange) * 100;
    insights.push({
      title: "Automation Conversion",
      insight: `${conversionRate.toFixed(0)}% of receipts generated tasks (${tasksCreatedInRange} of ${receiptsInRange}).`,
      action: conversionRate < 20
        ? "Low conversion — review rule conditions and ensure proper event mapping."
        : "Healthy automation throughput.",
      severity: conversionRate < 20 ? "warning" : "info",
    });
  }

  if (failuresInRange === 0 && eventsInRange > 0) {
    insights.push({
      title: "Zero Failures",
      insight: `All ${eventsInRange} events processed successfully this period.`,
      action: "Integration is running cleanly — no action needed.",
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
          title="Total Rules"
          value={fmtN(totalRules)}
          icon={<Settings className="h-4 w-4" />}
        />
        <StatCard
          title="Active Rules"
          value={fmtN(enabledRules)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          title="Errored Rules"
          value={fmtN(erroredRules)}
          icon={<XCircle className="h-4 w-4" />}
          className={erroredRules > 0 ? "border-red-500/30 bg-red-500/5" : undefined}
        />
        <StatCard
          title="Events Processed"
          value={fmtN(eventsInRange)}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          title="Receipts"
          value={fmtN(receiptsInRange)}
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          title="Tasks Created"
          value={fmtN(tasksCreatedInRange)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          title="Failures"
          value={fmtN(failuresInRange)}
          icon={<AlertTriangle className="h-4 w-4" />}
          className={failuresInRange > 0 ? "border-amber-500/30 bg-amber-500/5" : undefined}
        />
        <StatCard
          title="Error Rate"
          value={`${errorRate.toFixed(1)}%`}
          icon={<BarChart3 className="h-4 w-4" />}
          className={errorRate > 10 ? "border-red-500/30 bg-red-500/5" : undefined}
        />
      </div>

      {/* ── Rule Health ────────────────────────────── */}
      {totalRules > 0 && (
        <SectionCard title="Rule Health" subtitle="Automation rule status breakdown">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <RingStat segments={ruleSegments} total={totalRules} label="Rules" size={130} />
            <div className="space-y-2">
              {ruleSegments.map((seg) => (
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

      {/* ── Activity Trend ─────────────────────────── */}
      {trend.length > 0 && (
        <SectionCard title="Activity Trend" subtitle="Daily receipts and task creation">
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {trend.map((t, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-t bg-[#fc5a29]/70 transition-all"
                  style={{ height: `${(t.receipts / maxReceipts) * 100}px` }}
                />
                <span className="text-[8px] text-muted-foreground">{t.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#fc5a29]/70" /> Receipts
            </span>
          </div>
        </SectionCard>
      )}

      {/* ── Top Failure Reasons ────────────────────── */}
      {topFailureReasons.length > 0 && (
        <SectionCard title="Top Failure Reasons" subtitle="Most common error causes">
          <DataTable
            columns={failureColumns}
            rows={topFailureReasons.slice(0, 10)}
            emptyMessage="No failures recorded"
          />
        </SectionCard>
      )}

      {/* ── Insights ──────────────────────────────── */}
      {insights.length > 0 && (
        <SectionCard title={`${label} Insights`}>
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

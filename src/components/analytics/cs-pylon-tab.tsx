"use client";

import {
  MessageSquare, AlertTriangle, Clock, CheckCircle2,
  Star, Users,
} from "lucide-react";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { computeAnalyticsKpis } from "@/lib/analytics/kpis";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import {
  fmtN, fmtDuration,
  AlertBanner, InsightCard,
  SectionCard,
} from "./dashboard-primitives";
import { AiInsightsPanel } from "./ai-insights-panel";

interface CsPylonTabProps {
  data: AnalyticsDashboardData | null;
}

export function CsPylonTab({ data }: CsPylonTabProps) {
  const pylon = data?.pylon;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "pylon")
      .map((entry) => entry.message),
    ...(data?.freshness?.pylon?.lastError ? [data.freshness.pylon.lastError] : []),
  ];

  if (!pylon) {
    return (
      <FinanceDataEmptyState
        title="Pylon data is unavailable"
        message="We could not load Pylon support conversation data for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const {
    openConversations, urgentConversations, waitingOnTeam,
    resolvedInRange, avgFirstResponseMinutes, csat,
  } = pylon;

  const kpis = data?.kpis ?? computeAnalyticsKpis(data);
  const csatPct = kpis.support.csatPct;

  const totalActive = openConversations + urgentConversations + waitingOnTeam;

  if (totalActive === 0 && resolvedInRange === 0 && csat === null) {
    return (
      <FinanceDataEmptyState
        title="No Pylon activity found"
        message="Pylon is connected, but no conversation data is available for this period."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  // ── Derived metrics ──
  const resolutionRate = totalActive + resolvedInRange > 0
    ? (resolvedInRange / (totalActive + resolvedInRange)) * 100
    : 0;
  const urgentShare = totalActive > 0 ? (urgentConversations / totalActive) * 100 : 0;
  const waitingShare = totalActive > 0 ? (waitingOnTeam / totalActive) * 100 : 0;
  const firstResponseMinutes = avgFirstResponseMinutes ?? 0;

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (urgentConversations > 0) {
    alerts.push({
      severity: urgentConversations >= 5 ? "critical" : "warning",
      title: `${urgentConversations} urgent conversation${urgentConversations !== 1 ? "s" : ""} need attention`,
      description: "Urgent conversations are waiting for resolution. Prioritize these to maintain customer satisfaction.",
    });
  }
  if (waitingOnTeam > 3) {
    alerts.push({
      severity: waitingOnTeam >= 10 ? "critical" : "warning",
      title: `${waitingOnTeam} conversations waiting on your team`,
      description: "Customers are waiting for responses. Assign team members to reduce queue backlog.",
    });
  }
  if (firstResponseMinutes > 60) {
    alerts.push({
      severity: firstResponseMinutes > 240 ? "critical" : "warning",
      title: `Avg first response time: ${fmtDuration(firstResponseMinutes)}`,
      description: "First response time exceeds 1 hour. Faster initial responses improve customer satisfaction and resolution rates.",
    });
  }
  if (csat !== null && csat < 3.5) {
    alerts.push({
      severity: csat < 2.5 ? "critical" : "warning",
      title: `Low CSAT score: ${csat.toFixed(1)}/5`,
      description: "Customer satisfaction is below target. Review recent conversations for patterns in dissatisfaction.",
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (csat !== null && csat >= 4.5) {
    insights.push({
      title: "Excellent Customer Satisfaction",
      insight: `CSAT score of ${csat.toFixed(1)}/5 indicates exceptional support quality. Keep up the great work.`,
      severity: "success",
    });
  } else if (csat !== null && csat >= 4.0) {
    insights.push({
      title: "Good Customer Satisfaction",
      insight: `CSAT score of ${csat.toFixed(1)}/5 is solid. Look for opportunities to push toward 4.5+.`,
      severity: "success",
    });
  }
  if (firstResponseMinutes > 0 && firstResponseMinutes <= 15) {
    insights.push({
      title: "Fast First Response",
      insight: `Average first response time of ${fmtDuration(firstResponseMinutes)} is excellent. Quick responses drive higher satisfaction.`,
      severity: "success",
    });
  }
  if (resolutionRate >= 80) {
    insights.push({
      title: "High Resolution Rate",
      insight: `${resolutionRate.toFixed(0)}% of conversations resolved in this period — the team is keeping pace with incoming volume.`,
      severity: "success",
    });
  } else if (resolutionRate < 50 && totalActive + resolvedInRange > 5) {
    insights.push({
      title: "Low Resolution Rate",
      insight: `Only ${resolutionRate.toFixed(0)}% of conversations are resolved. Backlog may be growing.`,
      action: "Review queue priorities and consider adding support capacity.",
      severity: "warning",
    });
  }
  if (urgentShare > 30 && totalActive > 3) {
    insights.push({
      title: "High Urgency Ratio",
      insight: `${urgentShare.toFixed(0)}% of active conversations are marked urgent. This may indicate systemic product issues.`,
      action: "Analyze urgent conversation topics for common root causes.",
      severity: "info",
    });
  }
  if (waitingOnTeam > 0 && openConversations === 0 && urgentConversations === 0) {
    insights.push({
      title: "All Conversations Waiting on Team",
      insight: `${waitingOnTeam} conversation${waitingOnTeam !== 1 ? "s" : ""} are waiting for team response with no new open or urgent items.`,
      action: "Clear the waiting queue to maintain fast response times.",
      severity: "info",
    });
  }

  // ── Queue breakdown data ──
  const queueItems = [
    { label: "Open", count: openConversations, color: "#818cf8" },
    { label: "Urgent", count: urgentConversations, color: "#ef4444" },
    { label: "Waiting on Team", count: waitingOnTeam, color: "#f97316" },
    { label: "Resolved", count: resolvedInRange, color: "#22c55e" },
  ];
  const maxQueueCount = Math.max(...queueItems.map((q) => q.count), 1);

  return (
    <div className="space-y-6">
      <AiInsightsPanel bundle={data.aiInsights || null} defaultFilter="customer-success" />

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
          label="Open Conversations"
          value={openConversations.toString()}
          icon={MessageSquare}
        />
        <StatCard
          label="Urgent"
          value={urgentConversations.toString()}
          icon={AlertTriangle}
          iconColor={urgentConversations > 0 ? "text-red-500" : "text-primary"}
        />
        <StatCard
          label="Waiting on Team"
          value={waitingOnTeam.toString()}
          icon={Users}
          iconColor={waitingOnTeam > 3 ? "text-orange-500" : "text-primary"}
        />
        <StatCard
          label="Resolved"
          value={resolvedInRange.toString()}
          subtitle="In this period"
          icon={CheckCircle2}
          iconColor="text-emerald-500"
        />
        <StatCard
          label="Avg First Response"
          value={avgFirstResponseMinutes !== null ? fmtDuration(avgFirstResponseMinutes) : "—"}
          icon={Clock}
          iconColor={firstResponseMinutes > 60 ? "text-yellow-500" : "text-primary"}
        />
        <StatCard
          label="CSAT Score"
          value={csat !== null ? `${csat.toFixed(1)}/5` : "—"}
          icon={Star}
          iconColor={csat !== null && csat >= 4.0 ? "text-emerald-500" : csat !== null && csat < 3.5 ? "text-red-500" : "text-primary"}
        />
      </div>

      {/* Queue Health + Response Performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Queue Health */}
        <SectionCard title="Queue Health" subtitle="Conversation status breakdown">
          <div className="space-y-2">
            {queueItems.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="w-32 truncate text-right text-sm text-muted-foreground">
                  {item.label}
                </span>
                <div className="flex-1">
                  <div className="relative h-7 overflow-hidden rounded-md">
                    <div
                      className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                      style={{
                        width: `${Math.max((item.count / maxQueueCount) * 100, 8)}%`,
                        backgroundColor: item.color,
                        minWidth: "40px",
                      }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">
                        {item.count}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                  {totalActive + resolvedInRange > 0
                    ? `${((item.count / (totalActive + resolvedInRange)) * 100).toFixed(0)}%`
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Response & Resolution Performance */}
        <SectionCard title="Performance Metrics" subtitle="Response time and satisfaction">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-6">
              {csat !== null && (
                <RingStat
                  value={csatPct ?? 0}
                  max={100}
                  label="CSAT"
                  color={csat >= 4.0 ? "#22c55e" : csat >= 3.0 ? "#eab308" : "#ef4444"}
                  size={100}
                />
              )}
              <RingStat
                value={resolutionRate}
                max={100}
                label="Resolved"
                color={resolutionRate >= 70 ? "#22c55e" : resolutionRate >= 40 ? "#eab308" : "#ef4444"}
                size={100}
              />
            </div>
            <div className="w-full space-y-2">
              {csat !== null && (
                <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <span className="text-sm text-foreground">CSAT Score</span>
                  <span className={`text-lg font-bold tabular-nums ${
                    csat >= 4.0 ? "text-emerald-500" : csat < 3.5 ? "text-red-500" : "text-foreground"
                  }`}>
                    {csat.toFixed(1)}/5
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Resolution Rate</span>
                <span className={`text-lg font-bold tabular-nums ${
                  resolutionRate >= 70 ? "text-emerald-500" : resolutionRate < 40 ? "text-red-500" : "text-foreground"
                }`}>
                  {resolutionRate.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Avg First Response</span>
                <span className={`text-lg font-bold tabular-nums ${
                  firstResponseMinutes > 60 ? "text-yellow-500" : "text-foreground"
                }`}>
                  {avgFirstResponseMinutes !== null ? fmtDuration(avgFirstResponseMinutes) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Active Queue</span>
                <span className="text-lg font-bold tabular-nums text-foreground">{totalActive}</span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Support Funnel */}
      {totalActive + resolvedInRange > 0 && (
        <SectionCard title="Support Funnel" subtitle="Active → Resolved flow">
          <div className="space-y-3">
            {[
              { label: "Total Active", value: totalActive, color: "#818cf8" },
              { label: "Urgent", value: urgentConversations, color: "#ef4444" },
              { label: "Resolved", value: resolvedInRange, color: "#22c55e" },
            ].map((step, i, arr) => {
              const maxVal = Math.max(...arr.map((s) => s.value), 1);
              const widthPct = Math.max((step.value / maxVal) * 100, 6);
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <span className="w-24 text-right text-sm text-muted-foreground">{step.label}</span>
                  <div className="flex-1">
                    <div className="relative h-8 overflow-hidden rounded-md">
                      <div
                        className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: step.color,
                          minWidth: "50px",
                        }}
                      >
                        <span className="text-xs font-bold text-white drop-shadow">
                          {fmtN(step.value)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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

"use client";

import {
  Calendar, UserCheck, UserX, Clock, TrendingUp,
  AlertTriangle, TrendingDown, ArrowRight, CheckCircle,
} from "lucide-react";
import type { AnalyticsDashboardData, DemoOutcome } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";
import { RingStat } from "./bar-display";

const OUTCOME_COLORS: Record<DemoOutcome, string> = {
  completed: "#22c55e",
  "no-show": "#ef4444",
  rescheduled: "#fbbf24",
  pending: "#6b7280",
  unknown: "#d1d5db",
};

const OUTCOME_LABELS: Record<DemoOutcome, string> = {
  completed: "Completed",
  "no-show": "No-Show",
  rescheduled: "Rescheduled",
  pending: "Pending",
  unknown: "Unknown",
};

export function DemoAnalyticsTab({ data }: { data: AnalyticsDashboardData | null }) {
  const demo = data?.demoAnalytics;
  if (!demo || (demo.totalScheduled === 0 && demo.upcomingCount === 0)) return <EmptyState />;

  const completionRate = demo.totalScheduled > 0
    ? Math.round((demo.totalCompleted / demo.totalScheduled) * 1000) / 10
    : 0;

  const demoToCloseRate = demo.conversionFunnel.length > 0
    ? demo.conversionFunnel[demo.conversionFunnel.length - 1].conversionFromPrevious
    : null;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Demos Scheduled"
          value={demo.totalScheduled.toLocaleString()}
          icon={Calendar}
        />
        <StatCard
          label="Completed"
          value={demo.totalCompleted.toLocaleString()}
          subtitle={`${completionRate}% completion rate`}
          changeType={completionRate > 70 ? "positive" : "negative"}
          icon={UserCheck}
        />
        <StatCard
          label="No-Show Rate"
          value={`${demo.noShowRate}%`}
          subtitle={`${demo.totalNoShows} no-shows`}
          changeType={demo.noShowRate > 15 ? "negative" : "positive"}
          icon={UserX}
        />
        <StatCard
          label="Avg Lead Time"
          value={`${demo.avgLeadTimeDays}d`}
          subtitle="demo to next stage"
          icon={Clock}
        />
        <StatCard
          label="Demo → Close"
          value={demoToCloseRate != null ? `${demoToCloseRate}%` : "—"}
          subtitle="full funnel conversion"
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Upcoming Demos"
          value={demo.upcomingCount.toLocaleString()}
          subtitle={`${demo.meetingBackedUpcomingCount} calendar-backed`}
          icon={Calendar}
        />
        <StatCard
          label="Analyzed Demos"
          value={demo.analyzedDemoCount.toLocaleString()}
          subtitle="transcript-backed scorecards"
          icon={CheckCircle}
        />
        <StatCard
          label="Avg Demo Quality"
          value={demo.avgDemoQualityScore ? `${demo.avgDemoQualityScore}` : "—"}
          subtitle="historical analyzed demos"
          icon={TrendingUp}
        />
        <StatCard
          label="Transcript Coverage"
          value={`${demo.transcriptCoveragePct}%`}
          subtitle={`${demo.unscheduledDemoCount} unscheduled fallbacks`}
          icon={Clock}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Upcoming Demos</h3>
          <p className="mb-4 text-xs text-muted-foreground">Meeting-backed first, with unscheduled HubSpot fallbacks</p>
          <div className="space-y-3">
            {demo.upcomingDemos.slice(0, 6).map((record) => (
              <div key={`${record.dealId}:${record.meetingId ?? "upcoming"}`} className="rounded-lg bg-secondary/30 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{record.dealName}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.meetingTitle ?? "No calendar event linked"}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {record.isUnscheduledFallback ? "Unscheduled" : new Date(record.scheduledAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <Pill label={record.isUnscheduledFallback ? "HubSpot fallback" : "Calendar-linked"} />
                  <Pill label={`Transcript: ${record.transcriptStatus}`} />
                  <Pill label={`Analysis: ${record.analysisStatus}`} />
                </div>
              </div>
            ))}
            {demo.upcomingDemos.length === 0 && (
              <p className="text-sm text-muted-foreground">No upcoming demos found.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Common Coaching Themes</h3>
          <p className="mb-4 text-xs text-muted-foreground">Most frequent strengths and gaps from analyzed demos</p>
          <div className="grid gap-4 md:grid-cols-2">
            <ThemeList
              title="Strengths"
              items={demo.topStrengthThemes}
              emptyLabel="No recurring strengths yet"
            />
            <ThemeList
              title="Gaps"
              items={demo.topGapThemes}
              emptyLabel="No recurring gaps yet"
              negative
            />
          </div>
        </div>
      </div>

      {/* Conversion Funnel + Outcome Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Demo Conversion Funnel</h3>
          <p className="mb-5 text-xs text-muted-foreground">From scheduling through close</p>
          <div className="space-y-2">
            {demo.conversionFunnel.map((step, i) => {
              const maxCount = demo.conversionFunnel[0]?.count ?? 1;
              const widthPct = Math.max((step.count / maxCount) * 100, 8);
              const colors = ["#4379f0", "#22c55e", "#a78bfa", "#f472b6"];
              return (
                <div key={step.label}>
                  <div className="flex items-center gap-3">
                    <span className="w-32 text-right text-xs text-muted-foreground">
                      {step.label}
                    </span>
                    <div className="flex-1">
                      <div className="relative h-8 overflow-hidden rounded-md">
                        <div
                          className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: colors[i] || "#6b7280",
                            minWidth: "50px",
                          }}
                        >
                          <span className="text-xs font-bold text-white drop-shadow">
                            {step.count}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                      {step.conversionFromPrevious != null ? `${step.conversionFromPrevious}%` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Outcome Breakdown */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Demo Outcomes</h3>
          <div className="mb-4 flex justify-center gap-4">
            <RingStat value={completionRate} max={100} label="Completed" color="#22c55e" size={90} />
            <RingStat value={demo.noShowRate} max={100} label="No-Show" color="#ef4444" size={90} />
          </div>
          <div className="space-y-2">
            {demo.byOutcome.map((outcome) => (
              <div key={outcome.outcome} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: OUTCOME_COLORS[outcome.outcome] }}
                  />
                  <span className="text-sm text-foreground">{OUTCOME_LABELS[outcome.outcome]}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {outcome.count}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {outcome.pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Source Breakdown + Bottleneck Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Source Breakdown */}
        {demo.bySource.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Demos by Source</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Source</th>
                    <th className="pb-2 text-right font-medium">Scheduled</th>
                    <th className="pb-2 text-right font-medium">Completed</th>
                    <th className="pb-2 text-right font-medium">No-Shows</th>
                    <th className="pb-2 text-right font-medium">Conv. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {demo.bySource.map((src) => (
                    <tr key={src.source} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 font-medium text-foreground">{src.source}</td>
                      <td className="py-2.5 text-right tabular-nums">{src.scheduled}</td>
                      <td className="py-2.5 text-right tabular-nums text-emerald-500">{src.completed}</td>
                      <td className="py-2.5 text-right tabular-nums text-red-500">{src.noShows}</td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${src.conversionRate}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {src.conversionRate}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bottleneck Alerts */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Demo Alerts</h3>
          <div className="space-y-3">
            {demo.noShowRate > 15 && (
              <BottleneckAlert
                severity="critical"
                title={`${demo.noShowRate}% No-Show Rate`}
                description={`${demo.totalNoShows} prospects scheduled but didn't attend. Implement SMS reminders and shorter booking windows.`}
              />
            )}
            {demo.avgLeadTimeDays > 7 && (
              <BottleneckAlert
                severity="warning"
                title={`${demo.avgLeadTimeDays}d Avg Lead Time`}
                description="Slow post-demo progression. Set 24-hour SLA for follow-up delivery and automate proposal creation."
              />
            )}
            {completionRate < 60 && (
              <BottleneckAlert
                severity="warning"
                title={`${completionRate}% Completion Rate`}
                description="Low demo completion. Review scheduling friction, add calendar confirmation emails, and offer flexible time slots."
              />
            )}
            {demo.noShowRate <= 15 && demo.avgLeadTimeDays <= 7 && completionRate >= 60 && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 px-3 py-2.5">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-emerald-500">Demo performance looks healthy!</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Weekly Trend */}
      {demo.weeklyTrend.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Weekly Demo Trend</h3>
          <p className="mb-4 text-xs text-muted-foreground">Demos scheduled, completed, and no-shows by week</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Week</th>
                  <th className="pb-2 text-right font-medium">Scheduled</th>
                  <th className="pb-2 text-right font-medium">Completed</th>
                  <th className="pb-2 text-right font-medium">No-Shows</th>
                  <th className="pb-2 text-right font-medium">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {demo.weeklyTrend.slice(-8).map((week) => {
                  const attendance = week.scheduled > 0
                    ? Math.round((week.completed / week.scheduled) * 100)
                    : 0;
                  return (
                    <tr key={week.week} className="border-b border-border/50 last:border-0">
                      <td className="py-2 text-xs text-muted-foreground">{week.week}</td>
                      <td className="py-2 text-right tabular-nums">{week.scheduled}</td>
                      <td className="py-2 text-right tabular-nums text-emerald-500">{week.completed}</td>
                      <td className="py-2 text-right tabular-nums text-red-500">{week.noShows}</td>
                      <td className="py-2 text-right">
                        <span className={`text-xs font-medium tabular-nums ${attendance >= 70 ? "text-emerald-500" : "text-red-500"}`}>
                          {attendance}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Demos */}
      {demo.demos.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Recent Demos</h3>
          <p className="mb-4 text-xs text-muted-foreground">Latest scheduled demos and recommended next steps</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Deal</th>
                  <th className="pb-2 text-left font-medium">Scheduled</th>
                  <th className="pb-2 text-left font-medium">Outcome</th>
                  <th className="pb-2 text-left font-medium">Follow-Up</th>
                  <th className="pb-2 text-left font-medium">Suggested Action</th>
                </tr>
              </thead>
              <tbody>
                {demo.demos
                  .slice()
                  .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
                  .slice(0, 5)
                  .map((demoRecord) => {
                    const scheduledDateDate = new Date(demoRecord.scheduledAt);
                    const formattedDate = scheduledDateDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "numeric" });
                    
                    let suggestedAction = "None";
                    let actionColor = "text-muted-foreground";

                    if (demoRecord.outcome === "completed" && !demoRecord.followUpSent) {
                      suggestedAction = "Send Demo Follow-up & Deck";
                      actionColor = "text-blue-500 font-medium";
                    } else if (demoRecord.outcome === "no-show") {
                      suggestedAction = "Send Reschedule Link via Email/SMS";
                      actionColor = "text-yellow-500 font-medium";
                    } else if (demoRecord.outcome === "pending") {
                      suggestedAction = "Send 24hr Reminder";
                      actionColor = "text-emerald-500 font-medium";
                    } else if (demoRecord.outcome === "unknown") {
                      suggestedAction = "Verify Attendance in CRM";
                      actionColor = "text-red-500 font-medium";
                    }

                    return (
                      <tr key={demoRecord.dealId} className="border-b border-border/50 last:border-0">
                        <td className="py-2.5 font-medium text-foreground">{demoRecord.dealName}</td>
                        <td className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formattedDate}</td>
                        <td className="py-2.5">
                          <span 
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                            style={{ backgroundColor: OUTCOME_COLORS[demoRecord.outcome] }}
                          >
                            {OUTCOME_LABELS[demoRecord.outcome]}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {demoRecord.followUpSent ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
                              <CheckCircle className="h-3 w-3" /> Sent
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pending</span>
                          )}
                        </td>
                        <td className={`py-2.5 text-xs ${actionColor}`}>
                          {suggestedAction}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function BottleneckAlert({
  severity,
  title,
  description,
}: {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
}) {
  const config = {
    critical: {
      border: "border-red-500/20",
      bg: "bg-red-500/5",
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />,
      titleColor: "text-red-500",
    },
    warning: {
      border: "border-yellow-500/20",
      bg: "bg-yellow-500/5",
      icon: <TrendingDown className="mt-0.5 h-4 w-4 text-yellow-500" />,
      titleColor: "text-yellow-500",
    },
    info: {
      border: "border-blue-500/20",
      bg: "bg-blue-500/5",
      icon: <ArrowRight className="mt-0.5 h-4 w-4 text-blue-500" />,
      titleColor: "text-blue-500",
    },
  }[severity];

  return (
    <div className={`flex items-start gap-2 rounded-lg border ${config.border} ${config.bg} px-3 py-2.5`}>
      {config.icon}
      <div className="text-xs">
        <p className={`font-semibold ${config.titleColor}`}>{title}</p>
        <p className="mt-0.5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <Calendar className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No demo analytics data available</p>
        <p className="text-xs text-muted-foreground">Connect HubSpot to track demo scheduling and outcomes</p>
      </div>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}

function ThemeList({
  title,
  items,
  emptyLabel,
  negative = false,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
  emptyLabel: string;
  negative?: boolean;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2">
              <span className={`text-sm ${negative ? "text-red-500" : "text-foreground"}`}>{item.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import {
  LayoutGrid, CheckCircle2, Clock, AlertCircle,
  User, Calendar,
} from "lucide-react";
import type { AnalyticsDashboardData, CodaCard, CodaRecentSubmitter } from "@/lib/analytics/types";
import { FinanceDataEmptyState } from "@/components/analytics/finance-empty-state";
import { RingStat } from "@/components/analytics/bar-display";
import { StatCard } from "@/components/analytics/stat-card";
import { AreaTrend } from "@/components/charts";
import {
  fmt$, fmtN, timeAgo,
  AlertBanner, DataTable, InsightCard,
  SectionCard, type DataTableColumn,
} from "./dashboard-primitives";

interface AdsCodaKanbanTabProps {
  data: AnalyticsDashboardData | null;
}

export function AdsCodaKanbanTab({ data }: AdsCodaKanbanTabProps) {
  const coda = data?.coda ?? data?.codaKanban;
  const reasons = [
    ...(data?.errors ?? [])
      .filter((entry) => entry.source === "coda" || entry.source === "codaKanban")
      .map((entry) => entry.message),
    ...(data?.freshness?.coda?.lastError ? [data.freshness.coda.lastError] : []),
    ...(data?.freshness?.codaKanban?.lastError ? [data.freshness.codaKanban.lastError] : []),
  ];

  if (!coda) {
    return (
      <FinanceDataEmptyState
        title="Coda Kanban data is unavailable"
        message="We could not load Coda Kanban board data for this range."
        reasons={reasons}
        reconnectHref="/settings?tab=integrations"
      />
    );
  }

  const { totalCards, cardsByStatus, recentCards } = coda;
  const downloaders = coda.rangeSummary?.submissions ?? 0;
  const downloads = coda.rangeSummary?.cardsCreated ?? totalCards;
  const unknownEmailCards = coda.rangeSummary?.unknownEmailCards ?? 0;
  const downloadsPerDownloader = downloaders > 0 ? (downloads / downloaders).toFixed(2) : "—";

  const downloadsPrev = coda.rangeSummary?.downloadsPrev ?? null;
  const downloadersPrev = coda.rangeSummary?.downloadersPrev ?? null;
  const downloadsDeltaPct = coda.rangeSummary?.downloadsDeltaPct ?? null;
  const downloadersDeltaPct = coda.rangeSummary?.downloadersDeltaPct ?? null;

  const downloadsChange =
    typeof downloadsDeltaPct === "number" ? `${downloadsDeltaPct >= 0 ? "+" : ""}${downloadsDeltaPct}% vs prev` : "— vs prev";
  const downloadersChange =
    typeof downloadersDeltaPct === "number" ? `${downloadersDeltaPct >= 0 ? "+" : ""}${downloadersDeltaPct}% vs prev` : "— vs prev";

  const downloadsChangeType =
    typeof downloadsDeltaPct === "number" ? (downloadsDeltaPct > 0 ? "positive" : downloadsDeltaPct < 0 ? "negative" : "neutral") : "neutral";
  const downloadersChangeType =
    typeof downloadersDeltaPct === "number" ? (downloadersDeltaPct > 0 ? "positive" : downloadersDeltaPct < 0 ? "negative" : "neutral") : "neutral";

  // ── Derived metrics ──
  const doneStatuses = ["done", "complete", "completed", "shipped", "closed"];
  const inProgressStatuses = ["in progress", "in-progress", "doing", "active", "wip"];
  const blockedStatuses = ["blocked", "on hold", "stuck", "waiting"];

  const statusLookup = (statuses: string[], list: { status: string; count: number }[]) =>
    list.filter((s) => statuses.some((t) => s.status.toLowerCase().includes(t))).reduce((sum, s) => sum + s.count, 0);

  const completedCount = statusLookup(doneStatuses, cardsByStatus);
  const inProgressCount = statusLookup(inProgressStatuses, cardsByStatus);
  const blockedCount = statusLookup(blockedStatuses, cardsByStatus);
  const otherCount = totalCards - completedCount - inProgressCount - blockedCount;
  const completionRate = totalCards > 0 ? (completedCount / totalCards) * 100 : 0;

  // ── Alerts ──
  const alerts: { severity: "critical" | "warning" | "info"; title: string; description: string }[] = [];
  if (blockedCount > 0) {
    alerts.push({
      severity: blockedCount >= 3 ? "critical" : "warning",
      title: `${blockedCount} download${blockedCount !== 1 ? "s" : ""} blocked`,
      description: "Blocked downloads stall progress. Review blockers and assign owners to unblock them.",
    });
  }
  if (completionRate < 20 && totalCards > 5) {
    alerts.push({
      severity: "warning",
      title: `Low completion rate: ${completionRate.toFixed(0)}%`,
      description: "Less than 20% of downloads are completed. Review processing and ownership.",
    });
  }

  // ── Insights ──
  const insights: { title: string; insight: string; action?: string; severity: "critical" | "warning" | "info" | "success" }[] = [];
  if (completionRate >= 70) {
    insights.push({
      title: "Strong Completion Rate",
      insight: `${completionRate.toFixed(0)}% of downloads are completed. Processing looks healthy.`,
      severity: "success",
    });
  }
  if (inProgressCount > 0 && inProgressCount <= 5) {
    insights.push({
      title: "Focused WIP",
      insight: `${inProgressCount} download${inProgressCount !== 1 ? "s" : ""} in progress — a manageable work-in-progress limit.`,
      severity: "success",
    });
  } else if (inProgressCount > 10) {
    insights.push({
      title: "High WIP Count",
      insight: `${inProgressCount} downloads in progress simultaneously. Consider reducing WIP to improve throughput and focus.`,
      action: "Prioritize and move lower-priority items back to backlog.",
      severity: "warning",
    });
  }
  if (cardsByStatus.length > 0) {
    const topStatus = [...cardsByStatus].sort((a, b) => b.count - a.count)[0];
    if (topStatus.count > totalCards * 0.5 && !doneStatuses.some((d) => topStatus.status.toLowerCase().includes(d))) {
      insights.push({
        title: "Status Bottleneck",
        insight: `"${topStatus.status}" holds ${topStatus.count} downloads (${((topStatus.count / totalCards) * 100).toFixed(0)}% of total). This may indicate a processing bottleneck.`,
        severity: "info",
      });
    }
  }
  if (recentCards.length > 0) {
    const withAssignees = recentCards.filter((c) => c.assignee);
    if (withAssignees.length < recentCards.length * 0.5) {
      insights.push({
        title: "Unassigned Downloads",
        insight: `${recentCards.length - withAssignees.length} of ${recentCards.length} recent downloads have no assignee.`,
        action: "Assign owners to ensure accountability and progress tracking.",
        severity: "info",
      });
    }
  }

  // ── Status distribution ──
  const maxStatusCount = Math.max(...cardsByStatus.map((s) => s.count), 1);
  const STATUS_COLORS: Record<string, string> = {
    done: "#22c55e", complete: "#22c55e", completed: "#22c55e", shipped: "#22c55e", closed: "#22c55e",
    "in progress": "#818cf8", "in-progress": "#818cf8", doing: "#818cf8", active: "#818cf8", wip: "#818cf8",
    blocked: "#ef4444", "on hold": "#f97316", stuck: "#ef4444", waiting: "#eab308",
    backlog: "#6b7280", todo: "#a3a3a3", "to do": "#a3a3a3",
  };
  const DEFAULT_COLORS = ["#fc5a29", "#818cf8", "#22c55e", "#eab308", "#f472b6", "#2dd4bf", "#c084fc", "#6b7280"];

  function getStatusColor(status: string, index: number): string {
    const lower = status.toLowerCase();
    for (const [key, color] of Object.entries(STATUS_COLORS)) {
      if (lower.includes(key)) return color;
    }
    return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  }

  // ── Recent submitters table ──
  const recentSubmitters = coda.recentSubmitters ?? [];
  const submitterColumns: DataTableColumn<CodaRecentSubmitter>[] = [
    { key: "email", header: "Email", render: (r) => <span className="font-medium text-foreground">{r.email}</span> },
    {
      key: "creator",
      header: "Name",
      render: (r) => <span className="text-xs text-muted-foreground">{r.hubspotContact?.name ?? r.creator ?? "—"}</span>,
    },
    {
      key: "hubspotContact",
      header: "Position",
      render: (r) => <span className="text-xs text-muted-foreground">{r.hubspotContact?.jobTitle ?? "—"}</span>,
    },
    {
      key: "hubspotStatus",
      header: "Company",
      render: (r) => <span className="text-xs text-muted-foreground">{r.hubspotContact?.company ?? "—"}</span>,
    },
    {
      key: "lastSubmittedAt",
      header: "Last submitted",
      align: "right",
      render: (r) => (
        <span
          className="text-xs text-muted-foreground"
          title={r.lastSubmittedAt ? new Date(r.lastSubmittedAt).toLocaleString() : ""}
        >
          {r.lastSubmittedAt ? timeAgo(r.lastSubmittedAt) : "—"}
        </span>
      ),
    },
    {
      key: "cardsCreated",
      header: "Downloads",
      align: "right",
      render: (r) => <span className="text-xs tabular-nums text-foreground">{fmtN(r.cardsCreated)}</span>,
    },
    {
      key: "stripeStatus",
      header: "Stripe",
      render: (r) => {
        const stripe = r.stripe ?? null;
        if (!stripe?.matched || !stripe.customerId || !stripe.customerUrl) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <a
            href={stripe.customerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-primary hover:underline"
            title={stripe.customerId}
          >
            {stripe.customerId}
          </a>
        );
      },
    },
    {
      key: "stripeSub",
      header: "Sub",
      render: (r) => <span className="text-xs text-muted-foreground">{r.stripe?.subscriptionStatus ?? "—"}</span>,
    },
    {
      key: "stripeMrr",
      header: "MRR",
      align: "right",
      render: (r) => (
        <span className="text-xs tabular-nums text-foreground">
          {typeof r.stripe?.mrr === "number" ? fmt$(r.stripe.mrr) : "—"}
        </span>
      ),
    },
    {
      key: "stripePaid12mo",
      header: "Paid (12mo)",
      align: "right",
      render: (r) => (
        <span className="text-xs tabular-nums text-foreground">
          {typeof r.stripe?.paid12mo === "number" ? fmt$(r.stripe.paid12mo) : "—"}
        </span>
      ),
    },
    {
      key: "stripeLastPay",
      header: "Last pay",
      align: "right",
      render: (r) => (
        <span className="text-xs text-muted-foreground" title={r.stripe?.lastPaymentAt ? new Date(r.stripe.lastPaymentAt).toLocaleString() : ""}>
          {r.stripe?.lastPaymentAt ? timeAgo(r.stripe.lastPaymentAt) : "—"}
        </span>
      ),
    },
    {
      key: "hubspotSearchUrl",
      header: "HubSpot",
      align: "right",
      render: (r) => (
        <a
          href={r.hubspotContact?.recordUrl ?? r.hubspotSearchUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-primary hover:underline"
        >
          {r.hubspotContact ? "Open record" : "Search"}
        </a>
      ),
    },
  ];

  // ── Recent cards table ──
  const cardColumns: DataTableColumn<CodaCard>[] = [
    { key: "name", header: "Download", render: (r) => <span className="max-w-[250px] truncate font-medium text-foreground">{r.name}</span> },
    { key: "status", header: "Status", render: (r) => (
      <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-xs font-medium text-foreground">{r.status}</span>
    )},
    ...(recentCards.some((c) => c.priority) ? [{
      key: "priority" as keyof CodaCard,
      header: "Priority",
      render: (r: CodaCard) => <span className="text-xs text-muted-foreground">{r.priority ?? "—"}</span>,
    }] : []),
    ...(recentCards.some((c) => c.assignee) ? [{
      key: "assignee" as keyof CodaCard,
      header: "Assignee",
      render: (r: CodaCard) => <span className="text-xs text-muted-foreground">{r.assignee ?? "—"}</span>,
    }] : []),
    ...(recentCards.some((c) => c.updatedAt) ? [{
      key: "updatedAt" as keyof CodaCard,
      header: "Updated",
      align: "right" as const,
      render: (r: CodaCard) => <span className="text-xs text-muted-foreground">{r.updatedAt ? timeAgo(r.updatedAt) : "—"}</span>,
    }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Range Summary */}
      <SectionCard
        title="Range Summary"
        subtitle={
          coda.rangeSummary
            ? `${coda.rangeSummary.from} → ${coda.rangeSummary.to}`
            : "Selected date range"
        }
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Downloaders"
            value={fmtN(downloaders)}
            change={downloadersChange}
            changeType={downloadersChangeType}
            subtitle={typeof downloadersPrev === "number" ? `Prev: ${fmtN(downloadersPrev)}` : undefined}
            icon={User}
          />
          <StatCard
            label="Whitepapers downloaded"
            value={fmtN(downloads)}
            change={downloadsChange}
            changeType={downloadsChangeType}
            subtitle={typeof downloadsPrev === "number" ? `Prev: ${fmtN(downloadsPrev)}` : undefined}
            icon={LayoutGrid}
          />
          <StatCard label="Downloads / Downloader" value={downloadsPerDownloader} icon={Calendar} />
          <StatCard label="Unknown-email downloads" value={fmtN(unknownEmailCards)} icon={AlertCircle} />
        </div>
      </SectionCard>

      {/* Trend */}
      {coda.trends?.downloadsDaily?.length ? (
        <SectionCard title="Trend" subtitle="Daily downloads and downloaders">
          <AreaTrend
            data={(() => {
              const downloadsDaily = coda.trends?.downloadsDaily ?? [];
              const downloadersDaily = coda.trends?.downloadersDaily ?? [];
              const byDate = new Map<string, { date: string; downloads: number; downloaders: number }>();
              for (const entry of downloadsDaily) {
                byDate.set(entry.date, { date: entry.date, downloads: entry.count, downloaders: 0 });
              }
              for (const entry of downloadersDaily) {
                const existing = byDate.get(entry.date) ?? { date: entry.date, downloads: 0, downloaders: 0 };
                existing.downloaders = entry.count;
                byDate.set(entry.date, existing);
              }
              return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
            })()}
            xKey="date"
            yKeys={["downloads", "downloaders"]}
            colors={["#fc5a29", "#818cf8"]}
            height={260}
          />
        </SectionCard>
      ) : null}

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
          label="Total Downloads"
          value={totalCards.toString()}
          icon={LayoutGrid}
        />
        <StatCard
          label="Completed"
          value={completedCount.toString()}
          icon={CheckCircle2}
          iconColor="text-emerald-500"
        />
        <StatCard
          label="In Progress"
          value={inProgressCount.toString()}
          icon={Clock}
          iconColor="text-indigo-500"
        />
        <StatCard
          label="Blocked"
          value={blockedCount.toString()}
          icon={AlertCircle}
          iconColor={blockedCount > 0 ? "text-red-500" : "text-primary"}
        />
      </div>

      {/* Recent Submitters */}
      <SectionCard
        title="Downloader Emails"
        subtitle={`${recentSubmitters.length} unique email${recentSubmitters.length !== 1 ? "s" : ""} in range`}
      >
        <DataTable columns={submitterColumns} rows={recentSubmitters} emptyMessage="No downloaders in this range" />
      </SectionCard>

      {totalCards === 0 && cardsByStatus.length === 0 && (
        <SectionCard title="No downloads in this range" subtitle="Coda is connected, but no downloads were recorded in the selected period.">
          <p className="text-xs text-muted-foreground">
            Try widening the date range, or verify the Coda doc/table selection in Integrations.
          </p>
        </SectionCard>
      )}

      {/* Status Distribution + Completion */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Status Distribution */}
        {cardsByStatus.length > 0 && (
          <SectionCard title="Status Distribution" subtitle={`${cardsByStatus.length} status${cardsByStatus.length !== 1 ? "es" : ""}`}>
            <div className="space-y-2">
              {[...cardsByStatus]
                .sort((a, b) => b.count - a.count)
                .map((status, i) => {
                  const share = totalCards > 0 ? (status.count / totalCards) * 100 : 0;
                  return (
                    <div key={status.status} className="flex items-center gap-3">
                      <span className="w-28 truncate text-right text-sm text-muted-foreground" title={status.status}>
                        {status.status}
                      </span>
                      <div className="flex-1">
                        <div className="relative h-7 overflow-hidden rounded-md">
                          <div
                            className="flex h-full items-center rounded-md px-3 transition-all duration-500"
                            style={{
                              width: `${Math.max((status.count / maxStatusCount) * 100, 8)}%`,
                              backgroundColor: getStatusColor(status.status, i),
                              minWidth: "40px",
                            }}
                          >
                            <span className="text-[10px] font-bold text-white drop-shadow">
                              {status.count}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </SectionCard>
        )}

        {/* Completion Health */}
        <SectionCard title="Board Health" subtitle="Completion and progress metrics">
          <div className="flex flex-col items-center gap-4">
            <RingStat
              value={completionRate}
              max={100}
              label="Completion"
              color={completionRate >= 70 ? "#22c55e" : completionRate >= 40 ? "#eab308" : "#ef4444"}
              size={120}
            />
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Completion Rate</span>
                <span className={`text-lg font-bold tabular-nums ${
                  completionRate >= 70 ? "text-emerald-500" : completionRate >= 40 ? "text-yellow-500" : "text-red-500"
                }`}>{completionRate.toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">In Progress</span>
                <span className="text-lg font-bold tabular-nums text-indigo-500">{inProgressCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm text-foreground">Blocked</span>
                <span className={`text-lg font-bold tabular-nums ${blockedCount > 0 ? "text-red-500" : "text-foreground"}`}>{blockedCount}</span>
              </div>
              {otherCount > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                  <span className="text-sm text-foreground">Other / Backlog</span>
                  <span className="text-lg font-bold tabular-nums text-muted-foreground">{otherCount}</span>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Recent Cards Table */}
      {recentCards.length > 0 && (
        <SectionCard title="Recent Downloads" subtitle={`${recentCards.length} most recent download${recentCards.length !== 1 ? "s" : ""}`}>
          <DataTable
            columns={cardColumns}
            rows={recentCards}
            emptyMessage="No recent downloads"
          />
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

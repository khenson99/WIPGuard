"use client";

import { Kanban, CheckSquare, Clock, User } from "lucide-react";
import type { AnalyticsDashboardData, CodaCard } from "@/lib/analytics/types";
import { StatCard } from "./stat-card";

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  p1: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  p2: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  p3: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  p4: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const key = priority.toLowerCase();
  const colors = PRIORITY_COLORS[key] || "bg-secondary text-muted-foreground border-border/40";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase shadow-sm ${colors}`}>
      {priority}
    </span>
  );
}

export function TasksTab({ data }: { data: AnalyticsDashboardData | null }) {
  const coda = data?.coda;

  if (!coda) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <Kanban className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Connect Coda to see your task board</p>
          <p className="text-xs text-muted-foreground">Set CODA_API_TOKEN and CODA_DOC_ID environment variables</p>
        </div>
      </div>
    );
  }

  const statuses = coda.cardsByStatus;
  const recentCards = coda.recentCards;
  const mostRecentUpdate = recentCards.length > 0 ? recentCards[0].updatedAt : undefined;

  // Group recent cards by status for kanban view
  const cardsByStatus: Record<string, CodaCard[]> = {};
  statuses.forEach((s) => { cardsByStatus[s.status] = []; });
  recentCards.forEach((card) => {
    if (!cardsByStatus[card.status]) cardsByStatus[card.status] = [];
    cardsByStatus[card.status].push(card);
  });

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Cards"
          value={coda.totalCards.toLocaleString()}
          icon={CheckSquare}
        />
        <StatCard
          label="Status Columns"
          value={statuses.length.toString()}
          subtitle={statuses.map((s) => s.status).join(", ")}
          icon={Kanban}
        />
        <StatCard
          label="Most Recent Update"
          value={timeAgo(mostRecentUpdate)}
          icon={Clock}
        />
      </div>

      {/* Kanban Board */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-5 shadow-sm backdrop-blur-md">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Task Board</h3>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {statuses.map((statusGroup) => (
            <div
              key={statusGroup.status}
              className="min-w-[240px] flex-1 rounded-xl border border-border/40 bg-column-bg/80 p-4 shadow-sm backdrop-blur-md"
            >
              {/* Column header */}
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-bold tracking-tight text-foreground">
                  {statusGroup.status}
                </span>
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-md border border-primary/20 bg-primary/10 px-1.5 text-[11px] font-bold text-primary shadow-sm">
                  {statusGroup.count}
                </span>
              </div>

              {/* Cards in column */}
              <div className="space-y-2">
                {(cardsByStatus[statusGroup.status] || []).length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No recent cards
                  </p>
                ) : (
                  (cardsByStatus[statusGroup.status] || []).map((card) => (
                    <div
                      key={card.id}
                      className="group cursor-pointer rounded-xl border border-border/50 bg-card p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
                    >
                      <p className="mb-3 text-[13px] font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
                        {card.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge priority={card.priority} />
                        {card.assignee && (
                          <span className="flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground shadow-sm">
                            <User className="h-3 w-3" />
                            {card.assignee}
                          </span>
                        )}
                        <span className="ml-auto text-[10px] font-medium text-muted-foreground">
                          {timeAgo(card.updatedAt)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-5 shadow-sm backdrop-blur-md">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Activity</h3>
        {recentCards.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4">Card</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Priority</th>
                  <th className="pb-3 pr-4">Assignee</th>
                  <th className="pb-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentCards.map((card) => (
                  <tr
                    key={card.id}
                    className="group border-b border-border/40 transition-colors hover:bg-gradient-to-r hover:from-muted/40 hover:to-transparent"
                  >
                    <td className="py-3 pr-4 font-semibold text-foreground">
                      {card.name}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-md border border-border/40 bg-secondary/50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-secondary-foreground shadow-sm">
                        {card.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <PriorityBadge priority={card.priority} />
                    </td>
                    <td className="py-3 pr-4 text-[13px] font-medium text-muted-foreground">
                      {card.assignee ? (
                        <span className="flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          {card.assignee}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-[13px] font-medium text-muted-foreground">
                      {timeAgo(card.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

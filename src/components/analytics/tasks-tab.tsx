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
  critical: "bg-red-500/10 text-red-500",
  p1: "bg-red-500/10 text-red-500",
  high: "bg-orange-500/10 text-orange-500",
  p2: "bg-orange-500/10 text-orange-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  p3: "bg-yellow-500/10 text-yellow-500",
  low: "bg-blue-500/10 text-blue-500",
  p4: "bg-blue-500/10 text-blue-500",
};

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const key = priority.toLowerCase();
  const colors = PRIORITY_COLORS[key] || "bg-secondary text-muted-foreground";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${colors}`}>
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
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Task Board</h3>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {statuses.map((statusGroup) => (
            <div
              key={statusGroup.status}
              className="min-w-[240px] flex-1 rounded-lg bg-secondary/30 p-3"
            >
              {/* Column header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {statusGroup.status}
                </span>
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
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
                      className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/40"
                    >
                      <p className="mb-2 text-sm font-medium text-foreground line-clamp-2">
                        {card.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge priority={card.priority} />
                        {card.assignee && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <User className="h-2.5 w-2.5" />
                            {card.assignee}
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground">
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
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Activity</h3>
        {recentCards.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Card</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Priority</th>
                  <th className="pb-2 pr-4 font-medium">Assignee</th>
                  <th className="pb-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentCards.map((card) => (
                  <tr
                    key={card.id}
                    className="border-b border-border/50 transition-colors hover:bg-secondary/20"
                  >
                    <td className="py-2.5 pr-4 font-medium text-foreground">
                      {card.name}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded bg-secondary px-2 py-0.5 text-xs text-foreground">
                        {card.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <PriorityBadge priority={card.priority} />
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {card.assignee || "—"}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
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

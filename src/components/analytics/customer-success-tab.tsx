"use client";

import type { AnalyticsDashboardData } from "@/lib/analytics/types";

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function CustomerSuccessTab({ data }: { data: AnalyticsDashboardData | null }) {
  const pylon = data?.pylon;
  const coda = data?.coda;
  const product = data?.product;

  if (!pylon && !coda && !product) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No customer-success data available for this range.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Open Pylon Conversations</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{pylon?.openConversations ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Urgent Conversations</p>
          <p className="mt-1 text-2xl font-semibold text-red-500">{pylon?.urgentConversations ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Product Throughput</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatPct(product?.throughputRate)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Coda Cards</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{coda?.totalCards ?? "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Pylon Support Health</h3>
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-muted-foreground">Waiting on team: <span className="text-foreground">{pylon?.waitingOnTeam ?? "—"}</span></p>
            <p className="text-muted-foreground">Resolved in range: <span className="text-foreground">{pylon?.resolvedInRange ?? "—"}</span></p>
            <p className="text-muted-foreground">Avg first response: <span className="text-foreground">{pylon?.avgFirstResponseMinutes ?? "—"} min</span></p>
            <p className="text-muted-foreground">CSAT: <span className="text-foreground">{pylon?.csat ?? "—"}</span></p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">Product Execution Signals</h3>
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-muted-foreground">Created tasks: <span className="text-foreground">{product?.createdTasksInRange ?? "—"}</span></p>
            <p className="text-muted-foreground">Completed tasks: <span className="text-foreground">{product?.completedTasksInRange ?? "—"}</span></p>
            <p className="text-muted-foreground">Backlog growth: <span className="text-foreground">{product?.backlogGrowth ?? "—"}</span></p>
            <p className="text-muted-foreground">Active contributors: <span className="text-foreground">{product?.activeContributors ?? "—"}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}


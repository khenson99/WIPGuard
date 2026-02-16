"use client";

import type { PlannedVsUnplannedResult } from "./types";

interface ScopeCreepSummaryProps {
  data: PlannedVsUnplannedResult | null;
}

function StatCard({
  label,
  value,
  subtext,
  variant = "default",
}: {
  label: string;
  value: string | number;
  subtext?: string;
  variant?: "default" | "warning" | "danger" | "success";
}) {
  const borderClass = {
    default: "border-border",
    warning: "border-wip-at-border",
    danger: "border-wip-over-border",
    success: "border-emerald-300",
  }[variant];

  const valueClass = {
    default: "text-foreground",
    warning: "text-wip-at-text",
    danger: "text-wip-over-text",
    success: "text-success",
  }[variant];

  return (
    <div className={`rounded-lg border-2 ${borderClass} bg-card px-4 py-3`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </p>
      {subtext && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}

export function ScopeCreepSummary({ data }: ScopeCreepSummaryProps) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-border bg-muted"
          />
        ))}
      </div>
    );
  }

  const { summary } = data;
  const totalTasks = summary.totalPlanned + summary.totalUnplanned;
  const creepPercent = totalTasks > 0
    ? Math.round((summary.totalUnplanned / totalTasks) * 100)
    : 0;
  const completionRate = totalTasks > 0
    ? Math.round(((summary.plannedDone + summary.unplannedDone) / totalTasks) * 100)
    : 0;

  const creepVariant: "default" | "warning" | "danger" | "success" =
    creepPercent > 30 ? "danger" : creepPercent > 15 ? "warning" : "default";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Planned tasks"
        value={summary.totalPlanned}
        subtext={`${summary.plannedDone} done`}
      />
      <StatCard
        label="Unplanned (scope creep)"
        value={summary.totalUnplanned}
        subtext={`${summary.unplannedDone} done`}
        variant={creepVariant}
      />
      <StatCard
        label="Creep ratio"
        value={`${creepPercent}%`}
        subtext={`${summary.totalUnplanned} of ${totalTasks} tasks`}
        variant={creepVariant}
      />
      <StatCard
        label="Sprint completion"
        value={`${completionRate}%`}
        subtext={`${summary.plannedDone + summary.unplannedDone} of ${totalTasks} done`}
        variant={completionRate >= 80 ? "success" : "default"}
      />
    </div>
  );
}

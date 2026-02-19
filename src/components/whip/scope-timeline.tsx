"use client";

import { useMemo } from "react";
import type { PlannedVsUnplannedResult } from "./types";

interface ScopeTimelineProps {
  data: PlannedVsUnplannedResult | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/**
 * Stacked bar chart showing planned vs unplanned tasks over time.
 * Pure CSS -- no chart library needed for standup readability.
 */
export function ScopeTimeline({ data }: ScopeTimelineProps) {
  const deltas = useMemo(() => data?.dailyDeltas ?? [], [data?.dailyDeltas]);

  const maxTotal = useMemo(() => {
    let max = 1;
    for (const d of deltas) {
      const total = d.planned.total + d.unplanned.total;
      if (total > max) max = total;
    }
    return max;
  }, [deltas]);

  if (!data) {
    return (
      <div className="h-48 animate-pulse rounded-lg border border-border bg-muted" />
    );
  }

  if (deltas.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
        No daily data available for this sprint.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        Planned vs Unplanned Timeline
      </h3>

      {/* Legend */}
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
          Planned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
          Unplanned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Done
        </span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1 overflow-x-auto pb-1" role="img" aria-label="Scope timeline chart">
        {deltas.map((delta) => {
          const planned = delta.planned.total;
          const unplanned = delta.unplanned.total;
          const total = planned + unplanned;
          const done = delta.planned.done + delta.unplanned.done;
          const barHeight = maxTotal > 0 ? (total / maxTotal) * 120 : 0;
          const plannedHeight = total > 0 ? (planned / total) * barHeight : 0;
          const unplannedHeight = total > 0 ? (unplanned / total) * barHeight : 0;
          const hasAdditions = delta.additions.length > 0;

          return (
            <div
              key={delta.date}
              className="group relative flex min-w-[2.5rem] flex-1 flex-col items-center"
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-48 -translate-x-1/2 rounded-md border border-border bg-popover p-2 text-xs shadow-lg group-hover:block">
                <p className="font-semibold text-popover-foreground">{formatDate(delta.date)}</p>
                <p className="text-muted-foreground">
                  Planned: {planned} ({delta.planned.done} done)
                </p>
                <p className="text-muted-foreground">
                  Unplanned: {unplanned} ({delta.unplanned.done} done)
                </p>
                {hasAdditions && (
                  <div className="mt-1 border-t border-border pt-1">
                    <p className="font-medium text-primary">
                      +{delta.additions.length} added:
                    </p>
                    {delta.additions.slice(0, 3).map((a) => (
                      <p key={a.taskId} className="truncate text-muted-foreground">
                        {a.title}
                      </p>
                    ))}
                    {delta.additions.length > 3 && (
                      <p className="text-muted-foreground">
                        +{delta.additions.length - 3} more
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Bar */}
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm"
                style={{ height: `${Math.max(barHeight, 4)}px` }}
              >
                {unplannedHeight > 0 && (
                  <div
                    className="w-full bg-primary/80 transition-all duration-300"
                    style={{ height: `${unplannedHeight}px` }}
                  />
                )}
                {plannedHeight > 0 && (
                  <div
                    className="w-full bg-blue-500/80 transition-all duration-300"
                    style={{ height: `${plannedHeight}px` }}
                  />
                )}
              </div>

              {/* Done indicator dot */}
              {done > 0 && (
                <div className="mt-0.5 h-1 w-1 rounded-full bg-emerald-500" />
              )}

              {/* Day-added indicator */}
              {hasAdditions && (
                <div className="mt-0.5 h-1 w-3 rounded-full bg-primary/60" />
              )}

              {/* Labels */}
              <p className="mt-1 text-[10px] leading-none text-muted-foreground">
                {formatWeekday(delta.date)}
              </p>
              <p className="text-[9px] leading-none text-muted-foreground/60">
                {formatDate(delta.date)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Unplanned additions list */}
      {deltas.some((d) => d.additions.length > 0) && (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Unplanned Additions
          </h4>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {deltas
              .flatMap((d) =>
                d.additions.map((a) => ({
                  ...a,
                  date: d.date,
                }))
              )
              .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
              .slice(0, 15)
              .map((addition) => (
                <div
                  key={addition.taskId}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-[4rem] text-muted-foreground">
                    {formatDate(addition.date)}
                  </span>
                  <span className="truncate font-medium text-foreground">
                    {addition.title}
                  </span>
                  {addition.unplannedReason && (
                    <span className="ml-auto shrink-0 rounded bg-tag-bg px-1.5 py-0.5 text-[10px] text-tag-text">
                      {addition.unplannedReason.replace(/_/g, " ").toLowerCase()}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

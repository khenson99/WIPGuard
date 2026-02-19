"use client";

import type { FlowRiskIntelligenceReport, PersonWipPressure } from "./types";

interface WipPressureHeatmapProps {
  riskReport: FlowRiskIntelligenceReport | null;
}

function pressureColor(score: number): string {
  if (score >= 150) return "bg-red-500/20 border-red-400/40 text-red-600";
  if (score >= 100) return "bg-orange-500/15 border-orange-400/30 text-orange-600";
  if (score >= 75) return "bg-amber-500/15 border-amber-400/30 text-amber-600";
  if (score >= 50) return "bg-yellow-500/10 border-yellow-400/20 text-yellow-600";
  return "bg-emerald-500/10 border-emerald-400/20 text-emerald-600";
}

function pressureLabel(score: number): string {
  if (score >= 150) return "Critical";
  if (score >= 100) return "Over limit";
  if (score >= 75) return "Near limit";
  if (score >= 50) return "Moderate";
  return "Healthy";
}

function PressureCell({ person }: { person: PersonWipPressure }) {
  const color = pressureColor(person.pressureScore);

  return (
    <div
      className={`rounded-lg border-2 ${color} px-3 py-2.5 transition-all duration-200`}
      title={`${person.name ?? "Unknown"}: ${person.activeTaskCount} active / ${person.wipLimit} limit`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">
          {person.name ?? person.email ?? "Unassigned"}
        </span>
        {person.overloaded && (
          <span className="shrink-0 text-xs font-bold">!!!</span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums">
          {person.activeTaskCount}
        </span>
        <span className="text-xs opacity-70">/ {person.wipLimit}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
          {pressureLabel(person.pressureScore)}
        </span>
        <span className="text-[10px] tabular-nums opacity-60">
          {Math.round(person.pressureScore)}%
        </span>
      </div>

      {/* Mini pressure bar */}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/5">
        <div
          className="h-full rounded-full bg-current opacity-60 transition-all duration-500"
          style={{ width: `${Math.min(100, person.pressureScore)}%` }}
        />
      </div>
    </div>
  );
}

export function WipPressureHeatmap({ riskReport }: WipPressureHeatmapProps) {
  if (!riskReport) {
    return (
      <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" />
    );
  }

  const people = riskReport.wipPressure.people;

  if (people.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
        No active task assignments found.
      </div>
    );
  }

  // Summary stats
  const overloaded = people.filter((p) => p.overloaded).length;
  const avgPressure = Math.round(
    people.reduce((sum, p) => sum + p.pressureScore, 0) / people.length
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          WIP Pressure by Assignee
        </h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {overloaded > 0 && (
            <span className="flex items-center gap-1 font-medium text-wip-over-text">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {overloaded} overloaded
            </span>
          )}
          <span>Avg: {avgPressure}%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {people.map((person) => (
          <PressureCell key={person.userId} person={person} />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { FlowRiskIntelligenceReport, PersonWipPressure } from "./types";
import { useRovingTabindex } from "@/hooks/useRovingTabindex";

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

function severityIndicator(score: number): string {
  if (score >= 150) return "\u25C6"; // diamond
  if (score >= 100) return "\u25B2"; // triangle up
  if (score >= 75) return "\u25CF"; // filled circle
  if (score >= 50) return "\u25CB"; // open circle
  return "\u2713"; // checkmark
}

interface PressureCellProps {
  person: PersonWipPressure;
  cellRef: (el: HTMLElement | null) => void;
  tabIndex: number;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  ariaColIndex: number;
  ariaRowIndex: number;
}

function PressureCell({
  person,
  cellRef,
  tabIndex,
  onKeyDown,
  onFocus,
  ariaColIndex,
  ariaRowIndex,
}: PressureCellProps) {
  const color = pressureColor(person.pressureScore);
  const label = pressureLabel(person.pressureScore);
  const displayName = person.name ?? person.email ?? "Unassigned";

  const ariaLabel = `${displayName}: ${label} pressure, ${person.activeTaskCount} active tasks out of ${person.wipLimit} WIP limit, ${Math.round(person.pressureScore)}% pressure score`;

  return (
    <div
      ref={cellRef}
      role="gridcell"
      aria-rowindex={ariaRowIndex}
      aria-colindex={ariaColIndex}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className={`rounded-lg border-2 ${color} px-3 py-2.5 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 cursor-pointer`}
      title={`${displayName}: ${person.activeTaskCount} active / ${person.wipLimit} limit`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">
          {displayName}
        </span>
        {person.overloaded && (
          <span
            role="img"
            aria-label="Overloaded"
            className="shrink-0 text-xs font-bold"
          >
            !!!
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums">
          {person.activeTaskCount}
        </span>
        <span className="text-xs opacity-70">/ {person.wipLimit}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-80">
          <span aria-hidden="true">{severityIndicator(person.pressureScore)}</span>{" "}
          {label}
        </span>
        <span className="text-[10px] tabular-nums opacity-60">
          {Math.round(person.pressureScore)}%
        </span>
      </div>

      {/* Mini pressure bar */}
      <div
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/5"
        role="progressbar"
        aria-valuenow={Math.min(100, Math.round(person.pressureScore))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Pressure: ${Math.round(person.pressureScore)}%`}
      >
        <div
          className="h-full rounded-full bg-current opacity-60 transition-all duration-500"
          style={{ width: `${Math.min(100, person.pressureScore)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Returns the current responsive column count matching Tailwind breakpoints:
 * grid-cols-2 (default) | sm:grid-cols-3 (>=640) | lg:grid-cols-4 (>=1024)
 */
function getResponsiveCols(): number {
  if (typeof window === "undefined") return 2;
  if (window.innerWidth >= 1024) return 4;
  if (window.innerWidth >= 640) return 3;
  return 2;
}

function useGridCols(): number {
  const [cols, setCols] = useState(getResponsiveCols);

  useEffect(() => {
    const queries = [
      { mq: window.matchMedia("(min-width: 1024px)"), cols: 4 },
      { mq: window.matchMedia("(min-width: 640px)"), cols: 3 },
    ];

    function update() {
      setCols(getResponsiveCols());
    }

    queries.forEach(({ mq }) => mq.addEventListener("change", update));
    return () => queries.forEach(({ mq }) => mq.removeEventListener("change", update));
  }, []);

  return cols;
}

export function WipPressureHeatmap({ riskReport }: WipPressureHeatmapProps) {
  const cols = useGridCols();

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

      <HeatmapGrid people={people} cols={cols} />
    </div>
  );
}

interface HeatmapGridProps {
  people: PersonWipPressure[];
  cols: number;
}

function HeatmapGrid({ people, cols }: HeatmapGridProps) {
  const { getCellProps } = useRovingTabindex(people.length, cols);

  const rowCount = Math.ceil(people.length / cols);

  // Build grid-cols class based on cols value
  const gridColsClass =
    cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div
      role="grid"
      aria-label="WIP pressure by team member"
      aria-rowcount={rowCount}
      aria-colcount={cols}
      className={`grid ${gridColsClass} gap-2`}
    >
      {Array.from({ length: rowCount }, (_, rowIdx) => {
        const startIdx = rowIdx * cols;
        const rowPeople = people.slice(startIdx, startIdx + cols);

        return (
          <div
            key={rowIdx}
            role="row"
            aria-rowindex={rowIdx + 1}
            style={{ display: "contents" }}
          >
            {rowPeople.map((person, colIdx) => {
              const linearIndex = startIdx + colIdx;
              const cellProps = getCellProps(linearIndex);
              return (
                <PressureCell
                  key={person.userId}
                  person={person}
                  cellRef={cellProps.ref}
                  tabIndex={cellProps.tabIndex}
                  onKeyDown={cellProps.onKeyDown}
                  onFocus={cellProps.onFocus}
                  ariaColIndex={colIdx + 1}
                  ariaRowIndex={rowIdx + 1}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

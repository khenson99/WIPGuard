"use client";

import { useCallback, useRef, useState } from "react";
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

function severityIndicator(score: number): string {
  if (score >= 150) return "\u25C6"; // diamond
  if (score >= 100) return "\u25B2"; // triangle up
  if (score >= 75) return "\u25CF"; // filled circle
  if (score >= 50) return "\u25CB"; // open circle
  return "\u2713"; // checkmark
}

interface PressureCellProps {
  person: PersonWipPressure;
  cellRef: React.Ref<HTMLDivElement>;
  isFocused: boolean;
}

function PressureCell({ person, cellRef, isFocused }: PressureCellProps) {
  const color = pressureColor(person.pressureScore);
  const label = pressureLabel(person.pressureScore);
  const displayName = person.name ?? person.email ?? "Unassigned";

  const ariaLabel = `${displayName}: ${label} pressure, ${person.activeTaskCount} active tasks out of ${person.wipLimit} WIP limit, ${Math.round(person.pressureScore)}% pressure score`;

  return (
    <div
      ref={cellRef}
      role="gridcell"
      tabIndex={isFocused ? 0 : -1}
      aria-label={ariaLabel}
      className={`rounded-lg border-2 ${color} px-3 py-2.5 transition-all duration-200 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1`}
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

export function WipPressureHeatmap({ riskReport }: WipPressureHeatmapProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const focusedIndexRef = useRef(0);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  // getColumnCount reads window.innerWidth on each call, so it always returns
  // the current value even without a resize listener. This is acceptable
  // because it is only invoked during keydown events, not during render.
  const getColumnCount = useCallback((): number => {
    // Match the responsive grid breakpoints: grid-cols-2 sm:grid-cols-3 lg:grid-cols-4
    if (typeof window === "undefined") return 2;
    const width = window.innerWidth;
    if (width >= 1024) return 4; // lg
    if (width >= 640) return 3;  // sm
    return 2;                     // default
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, totalCells: number) => {
      const cols = getColumnCount();
      const current = focusedIndexRef.current;
      let nextIndex = current;

      switch (e.key) {
        case "ArrowRight":
          nextIndex = Math.min(current + 1, totalCells - 1);
          break;
        case "ArrowLeft":
          nextIndex = Math.max(current - 1, 0);
          break;
        case "ArrowDown":
          nextIndex = Math.min(current + cols, totalCells - 1);
          break;
        case "ArrowUp":
          nextIndex = Math.max(current - cols, 0);
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = totalCells - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      focusedIndexRef.current = nextIndex;
      setFocusedIndex(nextIndex);
      cellRefs.current[nextIndex]?.focus();
    },
    [getColumnCount]
  );

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

  // Guard against focusedIndex exceeding bounds (e.g. if people list shrinks)
  const safeFocusedIndex = Math.min(focusedIndex, people.length - 1);

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

      <div
        role="grid"
        aria-label="WIP pressure by team member"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        onKeyDown={(e) => handleKeyDown(e, people.length)}
      >
        {/* Single ARIA row wrapper using display:contents to preserve CSS grid layout */}
        <div role="row" style={{ display: "contents" }}>
          {people.map((person, index) => (
            <PressureCell
              key={person.userId}
              person={person}
              isFocused={index === safeFocusedIndex}
              cellRef={(el) => {
                cellRefs.current[index] = el;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

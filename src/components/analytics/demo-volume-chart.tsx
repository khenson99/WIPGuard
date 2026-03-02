"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { startOfWeek, format, parseISO } from "date-fns";
import type { DemoWeeklyTrend, DemoRecord } from "@/lib/analytics/types";

// ---- Color palette ----
const SOURCE_COLORS: Record<string, string> = {
  Organic: "#3b82f6",
  Paid: "#f59e0b",
  Referral: "#10b981",
  Outbound: "#8b5cf6",
  Partner: "#ec4899",
  Other: "#6b7280",
};

const FALLBACK_COLORS = ["#06b6d4", "#f97316", "#84cc16", "#e879f9", "#14b8a6"];

const OUTCOME_COLORS = {
  scheduled: "#3b82f6",
  completed: "#10b981",
  "no-show": "#ef4444",
};

function getSourceColor(source: string, index: number): string {
  return SOURCE_COLORS[source] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

// ---- Data transforms ----
interface OutcomeTrendPoint {
  week: string;
  Scheduled: number;
  Completed: number;
  "No-Show": number;
}

function normalizeWeeklyTrend(trend: DemoWeeklyTrend[]): OutcomeTrendPoint[] {
  return trend.map((t) => ({
    week: format(parseISO(t.week), "MMM d"),
    Scheduled: t.scheduled,
    Completed: t.completed,
    "No-Show": t.noShows,
  }));
}

interface ChartDataPoint {
  week: string;
  [sourceKey: string]: number | string;
}

interface SourceBreakdown {
  data: ChartDataPoint[];
  sources: string[];
}

function buildSourceWeeklyData(demos: DemoRecord[]): SourceBreakdown {
  if (!demos || demos.length === 0) return { data: [], sources: [] };

  const sourcesSet = new Set<string>();
  const weekMap = new Map<string, Record<string, number>>();

  for (const demo of demos) {
    const weekStart = format(
      startOfWeek(parseISO(demo.scheduledAt), { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    sourcesSet.add(demo.source);

    if (!weekMap.has(weekStart)) {
      weekMap.set(weekStart, {});
    }
    const bucket = weekMap.get(weekStart)!;
    bucket[demo.source] = (bucket[demo.source] ?? 0) + 1;
  }

  const sources = Array.from(sourcesSet).sort();
  const sortedWeeks = Array.from(weekMap.keys()).sort();

  const data: ChartDataPoint[] = sortedWeeks.map((week) => {
    const entry: ChartDataPoint = { week: format(parseISO(week), "MMM d") };
    for (const source of sources) {
      entry[source] = weekMap.get(week)?.[source] ?? 0;
    }
    return entry;
  });

  return { data, sources };
}

// ---- Component ----
export interface DemoVolumeChartProps {
  weeklyTrend?: DemoWeeklyTrend[];
  demos?: DemoRecord[];
}

type ViewMode = "by-outcome" | "by-source";

export function DemoVolumeChart({ weeklyTrend, demos }: DemoVolumeChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("by-outcome");

  const outcomeTrendData = useMemo(
    () => (weeklyTrend?.length ? normalizeWeeklyTrend(weeklyTrend) : []),
    [weeklyTrend],
  );

  const { data: sourceData, sources } = useMemo(
    () => buildSourceWeeklyData(demos ?? []),
    [demos],
  );

  const hasOutcomeData = outcomeTrendData.length > 0;
  const hasSourceData = sourceData.length > 0;

  if (!hasOutcomeData && !hasSourceData) return null;

  const showToggle = hasOutcomeData && hasSourceData;
  const activeViewMode: ViewMode =
    !hasOutcomeData ? "by-source" : !hasSourceData ? "by-outcome" : viewMode;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5">
      {/* Header with optional toggle */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Demo Volume Over Time</h3>
          <p className="text-xs text-muted-foreground">Weekly demo activity by {activeViewMode === "by-outcome" ? "outcome" : "source"}</p>
        </div>
        {showToggle && (
          <div
            className="inline-flex overflow-hidden rounded-md border border-border"
            role="radiogroup"
            aria-label="Chart view mode"
          >
            <button
              role="radio"
              aria-checked={activeViewMode === "by-outcome"}
              onClick={() => setViewMode("by-outcome")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                activeViewMode === "by-outcome"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              By Outcome
            </button>
            <button
              role="radio"
              aria-checked={activeViewMode === "by-source"}
              onClick={() => setViewMode("by-source")}
              className={`border-l border-border px-3 py-1 text-xs font-medium transition-colors ${
                activeViewMode === "by-source"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              By Source
            </button>
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        className="h-64 w-full"
        aria-label="Demo volume time series chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          {activeViewMode === "by-outcome" ? (
            <BarChart data={outcomeTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Completed" stackId="outcome" fill={OUTCOME_COLORS.completed} />
              <Bar dataKey="Scheduled" stackId="outcome" fill={OUTCOME_COLORS.scheduled} />
              <Bar dataKey="No-Show" stackId="outcome" fill={OUTCOME_COLORS["no-show"]} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <BarChart data={sourceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              {sources.map((source, idx) => (
                <Bar
                  key={source}
                  dataKey={source}
                  stackId="source"
                  fill={getSourceColor(source, idx)}
                  radius={idx === sources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";

export interface ForecastChartPoint {
  month: number;
  label: string;
  value: number;
}

export interface ForecastChartSeries {
  name: string;
  data: ForecastChartPoint[];
  color: string;
  dashed?: boolean;
}

interface ForecastChartProps {
  series: ForecastChartSeries[];
  height?: number;
  formatValue?: (v: number) => string;
  title?: string;
}

const PADDING = { top: 16, right: 16, bottom: 40, left: 64 };
const GRID_LINES = 5;

function defaultFormat(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function ForecastChart({
  series,
  height = 240,
  formatValue = defaultFormat,
  title,
}: ForecastChartProps) {
  const nonEmptySeries = useMemo(
    () => series.filter((s) => s.data.length > 0),
    [series],
  );

  const { paths, yLabels, xLabels, chartWidth, yMin, yRange } = useMemo(() => {
    if (nonEmptySeries.length === 0) {
      return { paths: [], yLabels: [], xLabels: [], chartWidth: 800, yMin: 0, yRange: 1 };
    }

    // Compute extent across all series
    const allValues = nonEmptySeries.flatMap((s) => s.data.map((d) => d.value));
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const padding = (rawMax - rawMin) * 0.05 || 1;
    const computedYMin = Math.max(0, rawMin - padding);
    const computedYMax = rawMax + padding;
    const computedYRange = computedYMax - computedYMin || 1;

    // Take the longest series for the x-axis
    const maxPoints = Math.max(...nonEmptySeries.map((s) => s.data.length));
    const computedChartWidth = 800;

    const plotW = computedChartWidth - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;

    // Build polyline paths for each series
    const computedPaths = nonEmptySeries.map((s) => {
      const points = s.data.map((d, i) => {
        const x =
          PADDING.left +
          (maxPoints > 1 ? (i / (maxPoints - 1)) * plotW : plotW / 2);
        const y =
          PADDING.top + (1 - (d.value - computedYMin) / computedYRange) * plotH;
        return { x, y };
      });

      const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

      // Area fill path: line + close along bottom
      const first = points[0];
      const last = points[points.length - 1];
      const bottomY = PADDING.top + plotH;
      const areaPath = `M${first.x},${first.y} ${points
        .slice(1)
        .map((p) => `L${p.x},${p.y}`)
        .join(" ")} L${last.x},${bottomY} L${first.x},${bottomY} Z`;

      return { linePoints, areaPath, color: s.color, dashed: s.dashed };
    });

    // Y-axis labels
    const computedYLabels = Array.from({ length: GRID_LINES }, (_, i) => {
      const val =
        computedYMin + ((GRID_LINES - 1 - i) / (GRID_LINES - 1)) * computedYRange;
      const y = PADDING.top + (i / (GRID_LINES - 1)) * plotH;
      return { label: formatValue(val), y };
    });

    // X-axis labels — show every 3rd month
    const longestSeries =
      nonEmptySeries.reduce((a, b) => (a.data.length >= b.data.length ? a : b), nonEmptySeries[0]);
    const computedXLabels = longestSeries.data
      .filter((_, i) => i % 3 === 0)
      .map((d, _, arr) => {
        const idx = longestSeries.data.indexOf(d);
        const x =
          PADDING.left +
          (maxPoints > 1 ? (idx / (maxPoints - 1)) * plotW : plotW / 2);
        return { label: d.label, x };
      });

    return {
      paths: computedPaths,
      yLabels: computedYLabels,
      xLabels: computedXLabels,
      chartWidth: computedChartWidth,
      yMin: computedYMin,
      yRange: computedYRange,
    };
  }, [nonEmptySeries, height, formatValue]);

  if (nonEmptySeries.length === 0) return null;

  const plotH = height - PADDING.top - PADDING.bottom;

  return (
    <div className="w-full">
      {title && (
        <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      )}
      <svg
        viewBox={`0 0 ${chartWidth} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Horizontal grid lines */}
        {yLabels.map((yl, i) => (
          <line
            key={i}
            x1={PADDING.left}
            y1={yl.y}
            x2={chartWidth - PADDING.right}
            y2={yl.y}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((yl, i) => (
          <text
            key={i}
            x={PADDING.left - 8}
            y={yl.y + 4}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {yl.label}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((xl, i) => (
          <text
            key={i}
            x={xl.x}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {xl.label}
          </text>
        ))}

        {/* Area fills + polylines */}
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.areaPath} fill={p.color} opacity={0.1} />
            <polyline
              points={p.linePoints}
              fill="none"
              stroke={p.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={p.dashed ? "6 4" : undefined}
            />
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
        {nonEmptySeries.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-xs text-muted-foreground">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

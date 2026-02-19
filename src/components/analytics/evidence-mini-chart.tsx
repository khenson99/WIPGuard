"use client";

/**
 * Lightweight SVG sparkline and bar components for AI insight evidence.
 * Pure SVG — no chart library dependency. Matches the RingStat pattern in bar-display.tsx.
 */

interface MiniTrendProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function MiniTrend({
  values,
  width = 80,
  height = 24,
  color = "currentColor",
}: MiniTrendProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 2;

  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (v - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface MiniBarProps {
  value: number;
  max: number;
  width?: number;
  height?: number;
  color?: string;
}

export function MiniBar({
  value,
  max,
  width = 80,
  height = 16,
  color = "currentColor",
}: MiniBarProps) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const barWidth = Math.max(pct * width, 2);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      aria-hidden
    >
      <rect
        x={0}
        y={2}
        width={width}
        height={height - 4}
        rx={3}
        fill="currentColor"
        opacity={0.1}
      />
      <rect
        x={0}
        y={2}
        width={barWidth}
        height={height - 4}
        rx={3}
        fill={color}
        opacity={0.8}
      />
    </svg>
  );
}

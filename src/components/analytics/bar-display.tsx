"use client";

import { useState } from "react";

/* ── Horizontal Bar Chart ── */

interface BarItem {
  label: string;
  value: number;
  color?: string;
}

interface BarDisplayProps {
  items: BarItem[];
  formatValue?: (v: number) => string;
  maxValue?: number;
  /** Show value label inside the bar when it's wide enough */
  inlineValues?: boolean;
  /** Bar height class (default: "h-2.5") */
  barHeight?: string;
  /** Enable gradient fill on bars */
  gradient?: boolean;
}

export function BarDisplay({
  items,
  formatValue,
  maxValue,
  inlineValues = false,
  barHeight = "h-2.5",
  gradient = false,
}: BarDisplayProps) {
  const max = maxValue || Math.max(...items.map((i) => i.value), 1);
  const fmt = formatValue || ((v: number) => v.toLocaleString());
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = Math.min((item.value / max) * 100, 100);
        const barColor = item.color || "var(--primary)";
        const isWide = pct > 25;

        return (
          <div
            key={i}
            className="group relative"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-foreground">{item.label}</span>
              <span className="tabular-nums font-medium text-foreground">
                {fmt(item.value)}
              </span>
            </div>
            <div className={`${barHeight} w-full overflow-hidden rounded-full bg-secondary`}>
              <div
                className={`${barHeight} rounded-full transition-all duration-700 ease-out`}
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: gradient
                    ? `linear-gradient(90deg, ${barColor}, ${barColor}dd)`
                    : barColor,
                  animationDelay: `${i * 60}ms`,
                }}
              >
                {inlineValues && isWide && (
                  <span className="flex h-full items-center justify-end pr-2 text-[10px] font-bold text-white drop-shadow">
                    {fmt(item.value)}
                  </span>
                )}
              </div>
            </div>

            {/* Hover Tooltip */}
            {hoveredIdx === i && (
              <div
                className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md"
              >
                {item.label}: {fmt(item.value)}
                <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-border bg-popover" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Donut Ring Stat ── */

interface RingStatProps {
  value: number;
  max: number;
  label: string;
  color?: string;
  size?: number;
  /** Custom center text — overrides the default percent display */
  valueLabel?: string;
  /** Thickness of the ring stroke (default: 8) */
  strokeWidth?: number;
}

export function RingStat({
  value,
  max,
  label,
  color = "var(--primary)",
  size = 120,
  valueLabel,
  strokeWidth = 8,
}: RingStatProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const displayText = valueLabel ?? `${pct.toFixed(0)}%`;

  return (
    <div className="group flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="transition-transform duration-200 group-hover:scale-105"
      >
        {/* Subtle glow on hover */}
        <defs>
          <filter id={`ring-glow-${label.replace(/\s/g, "")}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          opacity={0.6}
        />

        {/* Animated value arc */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 50 50)"
          className="transition-all duration-1000 ease-out group-hover:brightness-110"
          style={{
            filter: `drop-shadow(0 0 3px ${color}40)`,
          }}
        />

        {/* Center value */}
        <text
          x="50"
          y={label ? 46 : 52}
          textAnchor="middle"
          className="fill-foreground"
          fontSize={displayText.length > 4 ? 14 : 18}
          fontWeight="700"
        >
          {displayText}
        </text>

        {/* Label below value */}
        {label && (
          <text
            x="50"
            y="62"
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="9"
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}

/* ── Mini Sparkline ── */

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({
  data,
  color = "var(--primary)",
  width = 80,
  height = 24,
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      {/* Gradient fill under line */}
      <defs>
        <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill="url(#sparkline-fill)"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (
        <circle
          cx={width - padding}
          cy={padding + (1 - (data[data.length - 1] - min) / range) * (height - padding * 2)}
          r="2"
          fill={color}
        />
      )}
    </svg>
  );
}

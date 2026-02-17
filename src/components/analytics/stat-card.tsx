// ─── Enhanced Stat Card ──────────────────────────────────
// Reusable KPI card with loading state, sparkline, size variants, and glow accents.

import { type LucideIcon } from "lucide-react";
import { StatCardSkeleton } from "./skeleton";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  /** Tiny inline sparkline — pass 6-12 numeric data points */
  sparkline?: number[];
  /** Compact size for secondary metrics */
  size?: "default" | "sm";
  /** Show shimmer skeleton instead of content */
  loading?: boolean;
}

export function StatCard({
  label,
  value,
  change,
  changeType = "neutral",
  subtitle,
  icon: Icon,
  iconColor,
  sparkline,
  size = "default",
  loading,
}: StatCardProps) {
  if (loading) return <StatCardSkeleton />;

  const changeColors = {
    positive: "text-emerald-500",
    negative: "text-red-500",
    neutral: "text-muted-foreground",
  };

  const glowBorder = {
    positive: "border-emerald-500/20",
    negative: "border-red-500/20",
    neutral: "border-border",
  };

  const isSmall = size === "sm";

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:bg-secondary/30 ${
        change ? glowBorder[changeType] : "border-border"
      } ${isSmall ? "p-3.5" : "p-5"}`}
    >
      {/* Subtle accent glow for positive/negative */}
      {changeType === "positive" && change && (
        <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-emerald-500/5 blur-2xl" />
      )}
      {changeType === "negative" && change && (
        <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-red-500/5 blur-2xl" />
      )}

      <div className="flex items-start justify-between">
        <span
          className={`font-medium uppercase tracking-wider text-muted-foreground ${
            isSmall ? "text-[10px]" : "text-xs"
          }`}
        >
          {label}
        </span>
        {Icon && (
          <div
            className={`rounded-lg p-1.5 ${
              iconColor || "text-primary bg-primary/10"
            }`}
          >
            <Icon className={isSmall ? "h-3 w-3" : "h-3.5 w-3.5"} />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p
          className={`font-bold tabular-nums text-foreground ${
            isSmall ? "text-xl" : "text-2xl"
          }`}
        >
          {value}
        </p>
        {sparkline && sparkline.length > 1 && (
          <MiniSparkline data={sparkline} trend={changeType} />
        )}
      </div>

      {change && (
        <p
          className={`mt-1 text-xs font-medium ${changeColors[changeType]}`}
        >
          {change}
        </p>
      )}
      {subtitle && (
        <p className={`mt-1 text-muted-foreground ${isSmall ? "text-[10px]" : "text-[11px]"}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** Tiny SVG sparkline — 48×20px */
function MiniSparkline({
  data,
  trend,
}: {
  data: number[];
  trend: "positive" | "negative" | "neutral";
}) {
  const w = 48;
  const h = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const strokeColor =
    trend === "positive"
      ? "#22c55e"
      : trend === "negative"
        ? "#ef4444"
        : "#9ca3af";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
    >
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

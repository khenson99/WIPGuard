"use client";

import type { TrendIndicator } from "@/lib/journey-bucketing";
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from "lucide-react";

interface TrendBadgeProps {
  trend: TrendIndicator;
  format?: "percent" | "absolute" | "both";
  className?: string;
}

export function TrendBadge({ trend, format = "both", className = "" }: TrendBadgeProps) {
  if (trend.direction === "insufficient") {
    return (
      <span
        className={`text-xs text-muted-foreground italic ${className}`}
        aria-label="Insufficient data for trend"
      >
        —
      </span>
    );
  }

  const Icon =
    trend.direction === "up"
      ? ArrowUpIcon
      : trend.direction === "down"
        ? ArrowDownIcon
        : MinusIcon;

  const colorClass =
    trend.direction === "up"
      ? "text-green-600 dark:text-green-400"
      : trend.direction === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  const parts: string[] = [];
  if ((format === "percent" || format === "both") && trend.percentChange !== null) {
    const sign = trend.percentChange > 0 ? "+" : "";
    parts.push(`${sign}${trend.percentChange.toFixed(1)}%`);
  }
  if (format === "absolute" || format === "both") {
    const sign = trend.absoluteChange > 0 ? "+" : "";
    parts.push(`${sign}${trend.absoluteChange.toFixed(1)}`);
  }

  const label = `${trend.direction} ${parts.join(", ")} vs ${trend.previousPeriod}`;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass} ${className}`}
      aria-label={label}
      title={`${trend.currentPeriod} vs ${trend.previousPeriod}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{parts.join(" / ")}</span>
    </span>
  );
}

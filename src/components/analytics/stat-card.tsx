// Reusable stat card for analytics dashboard
import React from "react";
import { type LucideIcon } from "lucide-react";

type StatCardIcon = React.ElementType | React.ReactNode | LucideIcon;

interface StatCardProps {
  label?: string;
  title?: string;
  className?: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  icon?: StatCardIcon;
  iconColor?: string;
  /** Optional trend data for sparkline rendering */
  trend?: { data: number[] };
}

export function StatCard({
  title,
  className,
  label,
  value,
  change,
  changeType = "neutral",
  subtitle,
  icon,
  iconColor = "text-primary",
}: StatCardProps) {
  const changeColors = {
    positive: "text-emerald-500",
    negative: "text-red-500",
    neutral: "text-muted-foreground",
  };

  const displayLabel = label ?? title ?? "";
  let iconNode: React.ReactNode = null;
  if (icon) {
    if (React.isValidElement(icon)) {
      iconNode = icon;
    } else if (
      typeof icon === "function" ||
      (typeof icon === "object" && icon !== null && "$$typeof" in icon)
    ) {
      iconNode = React.createElement(icon as React.ElementType, {
        className: "h-3.5 w-3.5",
      });
    } else {
      iconNode = icon;
    }
  }

  return (
    <div className={`rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary/30 ${className ?? ""}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {displayLabel}
        </span>
        {iconNode && (
          <div className={`rounded-lg bg-primary/10 p-1.5 ${iconColor}`}>
            {iconNode}
          </div>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {change && (
        <p className={`mt-1 text-xs font-medium ${changeColors[changeType]}`}>
          {change}
        </p>
      )}
      {subtitle && (
        <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

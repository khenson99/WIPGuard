// Reusable stat card for analytics dashboard
import type React from "react";
import { type LucideIcon } from "lucide-react";

type StatCardIcon = LucideIcon | React.ReactNode;

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
  const iconNode =
    typeof icon === "function"
      ? (() => {
          const Icon = icon as LucideIcon;
          return <Icon className="h-3.5 w-3.5" />;
        })()
      : icon;

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

// Reusable stat card for analytics dashboard
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
}

export function StatCard({
  label,
  value,
  change,
  changeType = "neutral",
  subtitle,
  icon: Icon,
  iconColor = "text-primary",
}: StatCardProps) {
  const changeColors = {
    positive: "text-emerald-500",
    negative: "text-red-500",
    neutral: "text-muted-foreground",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary/30">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <div className={`rounded-lg bg-primary/10 p-1.5 ${iconColor}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        {value}
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

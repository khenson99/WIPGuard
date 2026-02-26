// Shared dashboard primitives for deep analytics views
import { AlertTriangle, TrendingDown, ArrowRight, ArrowUp, ArrowDown, Minus } from "lucide-react";
import type React from "react";

/* ── Formatting helpers ───────────────────────────────── */

export function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtN(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+∞%" : "—";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

export function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function fmtDuration(mins: number): string {
  if (mins < 1) return "<1m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ── AlertBanner ──────────────────────────────────────── */

const ALERT_CONFIG = {
  critical: {
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />,
    titleColor: "text-red-500",
  },
  warning: {
    border: "border-yellow-500/20",
    bg: "bg-yellow-500/5",
    icon: <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />,
    titleColor: "text-yellow-500",
  },
  info: {
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
    icon: <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />,
    titleColor: "text-blue-500",
  },
} as const;

export function AlertBanner({
  severity,
  title,
  description,
}: {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
}) {
  const cfg = ALERT_CONFIG[severity];
  return (
    <div className={`flex items-start gap-2 rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-2.5`}>
      {cfg.icon}
      <div className="text-xs">
        <p className={`font-semibold ${cfg.titleColor}`}>{title}</p>
        <p className="mt-0.5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/* ── ChangeIndicator ──────────────────────────────────── */

export function ChangeIndicator({
  current,
  previous,
  format = "percent",
  invertColors = false,
}: {
  current: number;
  previous: number;
  format?: "percent" | "absolute" | "dollar";
  invertColors?: boolean;
}) {
  if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">—</span>;

  const diff = current - previous;
  const pct = previous !== 0 ? ((diff / previous) * 100) : (current > 0 ? 100 : 0);
  const isPositive = diff > 0;
  const isNeutral = diff === 0;

  let colorClass: string;
  if (isNeutral) {
    colorClass = "text-muted-foreground";
  } else if (invertColors) {
    colorClass = isPositive ? "text-red-500" : "text-emerald-500";
  } else {
    colorClass = isPositive ? "text-emerald-500" : "text-red-500";
  }

  let label: string;
  if (format === "dollar") {
    label = `${isPositive ? "+" : ""}${fmt$(diff)}`;
  } else if (format === "absolute") {
    label = `${isPositive ? "+" : ""}${fmtN(diff)}`;
  } else {
    label = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }

  const Icon = isNeutral ? Minus : isPositive ? ArrowUp : ArrowDown;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/* ── MiniStat ─────────────────────────────────────────── */

export function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/* ── DataTable ────────────────────────────────────────── */

export interface DataTableColumn<T> {
  key: string;
  header?: string;
  label?: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  emptyMessage = "No data available",
  rowClassName,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  emptyMessage?: string;
  rowClassName?: (row: T) => string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`pb-2 pr-4 font-medium last:pr-0 ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                }`}
              >
                {col.header ?? col.label ?? col.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-border/50 last:border-0 transition-colors hover:bg-secondary/20 ${
                rowClassName?.(row) ?? ""
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-2.5 pr-4 last:pr-0 ${
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
                  }`}
                >
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── InsightCard ──────────────────────────────────────── */

const SEVERITY_STYLES = {
  critical: "border-red-500/20 bg-red-500/5",
  warning: "border-yellow-500/20 bg-yellow-500/5",
  info: "border-blue-500/20 bg-blue-500/5",
  success: "border-emerald-500/20 bg-emerald-500/5",
} as const;

const SEVERITY_TEXT = {
  critical: "text-red-500",
  warning: "text-yellow-500",
  info: "text-blue-500",
  success: "text-emerald-500",
} as const;

export function InsightCard({
  title,
  insight,
  action,
  severity = "info",
}: {
  title: string;
  insight: string;
  action?: string;
  severity?: "critical" | "warning" | "info" | "success";
}) {
  return (
    <div className={`rounded-lg border p-3 ${SEVERITY_STYLES[severity]}`}>
      <p className={`text-xs font-semibold ${SEVERITY_TEXT[severity]}`}>{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{insight}</p>
      {action && (
        <p className="mt-1.5 text-xs font-medium text-foreground">{action}</p>
      )}
    </div>
  );
}

/* ── TrendSparkline ───────────────────────────────────── */

export function TrendSparkline({
  data,
  height = 40,
  color = "var(--color-primary)",
}: {
  data: number[];
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 120;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── SectionCard ──────────────────────────────────────── */

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      {subtitle && <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

/* ── EmptyDashboard ───────────────────────────────────── */

export function EmptyDashboard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-muted-foreground/40">
          {icon}
        </div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/**
 * Formatting + small metric helpers, ported from `prototype/app/components.jsx`.
 * Numbers use compact currency / unit-aware formatting with tabular figures.
 */

import type { ImladrisModel, MetricUnit, NormalizedMetric } from "./types";

export function fmtCurrency(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}m`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}k`;
  return `${sign}$${a.toFixed(0)}`;
}

export function fmtByUnit(v: number | null | undefined, unit: MetricUnit | string): string {
  if (v == null || Number.isNaN(v)) return "—";
  switch (unit) {
    case "currency": return fmtCurrency(v);
    case "percent": return `${v.toFixed(1)}%`;
    case "months": return `${v.toFixed(1)} mo`;
    case "ratio": return `${v.toFixed(1)}x`;
    case "score": return Math.round(v).toString();
    case "days": return `${v.toFixed(1)}d`;
    case "count": return Math.round(v).toLocaleString();
    default: return String(v);
  }
}

export function fmtMetric(metric: Pick<NormalizedMetric, "unit">, value: number | null | undefined): string {
  return fmtByUnit(value, metric.unit);
}

export interface Snapshot {
  value: number;
  prev: number | null;
  idx: number;
}

export function snapshot(metric: Pick<NormalizedMetric, "history">, idx?: number | null): Snapshot {
  const h = metric.history;
  const i = idx == null ? h.length - 1 : Math.max(0, Math.min(idx, h.length - 1));
  return { value: h[i], prev: i > 0 ? h[i - 1] : null, idx: i };
}

export function deltaPct(value: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return ((value - prev) / Math.abs(prev)) * 100;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthName(ym: string): string {
  const p = String(ym).split("-");
  const idx = parseInt(p[1], 10) - 1;
  if (Number.isNaN(idx) || !MONTH_NAMES[idx]) return String(ym);
  return `${MONTH_NAMES[idx]} ${p[0]}`;
}

export function monthAbbr(ym: string): string {
  const p = String(ym).split("-");
  const idx = parseInt(p[1], 10) - 1;
  if (Number.isNaN(idx) || !MONTH_ABBR[idx]) return String(ym);
  return MONTH_ABBR[idx];
}

/** Short month label for chart axes (year suffix on January). */
export function monthShort(ym: string): string {
  const p = String(ym).split("-");
  const m = parseInt(p[1], 10) - 1;
  const yy = (p[0] ?? "").slice(2);
  if (Number.isNaN(m) || !MONTH_ABBR[m]) return String(ym);
  return m === 0 ? `${MONTH_ABBR[m]} ${yy}` : MONTH_ABBR[m];
}

/** Direction-aware pacing state for a metric vs its target. */
export function paceState(
  value: number,
  target: number | null | undefined,
  good: "up" | "down",
): "on" | "behind" | null {
  if (target == null) return null;
  return good === "down"
    ? value <= target * 1.05 ? "on" : "behind"
    : value >= target * 0.92 ? "on" : "behind";
}

/** In live mode a metric only has a trend if the time-series API covered it. */
export function hasTrend(model: Pick<ImladrisModel, "mode" | "trendsAvailable">, m: Pick<NormalizedMetric, "liveTrend">): boolean {
  return model.mode !== "live" ? true : model.trendsAvailable && !!m.liveTrend;
}

export const PALETTE = ["#FC5A29", "#F59E7B", "#404040", "#A0A0A0", "#D0D0D0"];

export function syncLabel(daysAgo: number): string {
  return daysAgo === 0 ? "synced today" : daysAgo === 1 ? "synced yesterday" : `synced ${daysAgo}d ago`;
}

export const DEPT_LABEL: Record<string, string> = {
  finance: "Finance",
  sales: "Sales",
  marketing: "Marketing",
  development: "Development",
  "customer-success": "Customer Success",
};

export const PROVIDER_STATE_COLOR: Record<string, string> = {
  connected: "#16a34a",
  stale: "#D97706",
  partial: "#2563EB",
  error: "#DC2626",
};

export function numberOr0(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

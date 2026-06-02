// Shared computation helpers for financial planning features.
// This module contains pure computation logic that runs on both server and client.

/** Default SaaS expense category ratios (sum to 1.0). */
export const DEFAULT_EXPENSE_RATIOS: Record<string, number> = {
  cogs: 0.25,
  payroll: 0.35,
  marketing: 0.15,
  infrastructure: 0.1,
  ops: 0.15,
};

/** Variance between planned and actual amounts. */
export function computeVariance(
  planned: number,
  actual: number | null,
): { variance: number | null; variancePct: number | null } {
  if (actual == null) return { variance: null, variancePct: null };
  const variance = actual - planned;
  const variancePct = planned === 0 ? (actual === 0 ? 0 : 100) : (variance / planned) * 100;
  return { variance, variancePct };
}

/** Progress toward a target value as a clamped 0-100 percentage. */
export function computeProgressPct(
  current: number,
  target: number,
  direction: "higher" | "lower" = "higher",
): number {
  if (direction === "lower") {
    if (current === 0) return target >= 0 ? 100 : 0;
    if (target === 0) return current <= 0 ? 100 : 0;
    return Math.min(Math.max((target / current) * 100, 0), 100);
  }

  if (target === 0) return current > 0 ? 100 : 0;
  return Math.min(Math.max((current / target) * 100, 0), 100);
}

/** Format a signed delta with + / − prefix and dollar sign. */
export function fmtDelta(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs >= 1_000
    ? `$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
    : `$${abs.toFixed(0)}`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

/** Format months with a short suffix, handling infinity. */
export function fmtMonths(n: number): string {
  if (!Number.isFinite(n) || n >= 999) return "∞";
  return `${n.toFixed(1)}mo`;
}

/** Format a ratio like LTV:CAC as "3.2×". */
export function fmtRatio(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}×`;
}

/** Tailwind text color class for runway month thresholds. */
export function runwayColor(months: number): string {
  if (months >= 999 || months >= 12) return "text-emerald-500";
  if (months >= 6) return "text-yellow-500";
  return "text-red-500";
}

/** Tailwind background color class for runway month thresholds. */
export function runwayBgColor(months: number): string {
  if (months >= 999 || months >= 12) return "bg-emerald-500";
  if (months >= 6) return "bg-yellow-500";
  return "bg-red-500";
}

/** HSL color string for a 0-100 health score. */
export function healthScoreColor(score: number): string {
  if (score >= 80) return "hsl(142, 71%, 45%)";
  if (score >= 60) return "hsl(48, 96%, 53%)";
  if (score >= 40) return "hsl(25, 95%, 53%)";
  return "hsl(0, 84%, 60%)";
}

/** Tailwind text color for a letter grade. */
export function gradeColor(grade: string): string {
  const normalized = grade.trim().toUpperCase();
  if (normalized === "A") return "text-emerald-500";
  if (normalized === "B") return "text-blue-500";
  if (normalized === "C") return "text-yellow-500";
  if (normalized === "D") return "text-orange-500";
  return "text-red-500";
}

/** Severity color for LTV:CAC ratio health. */
export function ltvCacSeverity(ratio: number): "positive" | "neutral" | "negative" {
  if (ratio >= 3) return "positive";
  if (ratio >= 1) return "neutral";
  return "negative";
}

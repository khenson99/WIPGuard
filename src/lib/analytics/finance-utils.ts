// ─── Finance Utility Helpers ─────────────────────────────
// Shared computation helpers for financial planning engines.
// Pure functions used by forecast-engine, pnl-builder,
// unit-economics, budget-variance, and finance UI tabs.

/**
 * SaaS-standard expense allocation ratios.
 * Mercury only provides aggregate inflows/outflows — no transaction-level
 * detail — so we estimate category breakdowns using these ratios.
 */
export const DEFAULT_EXPENSE_RATIOS = {
  cogs: 0.25,
  payroll: 0.35,
  marketing: 0.15,
  infrastructure: 0.10,
  ops: 0.15,
} as const;

/** Budget vs actual variance as a percentage. */
export function computeVariance(actual: number, budget: number): number {
  if (budget === 0) return actual === 0 ? 0 : 100;
  return ((actual - budget) / budget) * 100;
}

/** Progress toward a target, clamped to 0-100%. */
export function computeProgressPct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

/** Format a numeric delta as a compact dollar string: "+$1.2K" or "-$500". */
export function fmtDelta(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** Format a number of months as a readable string: "12.5 mo" or ">24 mo". */
export function fmtMonths(n: number): string {
  if (n > 24) return ">24 mo";
  return `${n.toFixed(1)} mo`;
}

/** Format a ratio with one decimal place: "3.2x". */
export function fmtRatio(n: number): string {
  return `${n.toFixed(1)}x`;
}

/** Runway health color: <6 red, <12 yellow, else green. */
export function runwayColor(months: number): string {
  if (months < 6) return "#ef4444";
  if (months < 12) return "#eab308";
  return "#22c55e";
}

/** Runway health background color (lighter tints). */
export function runwayBgColor(months: number): string {
  if (months < 6) return "#fef2f2";
  if (months < 12) return "#fefce8";
  return "#f0fdf4";
}

/** Health score color: <40 red, <70 yellow, else green. */
export function healthScoreColor(score: number): string {
  if (score < 40) return "#ef4444";
  if (score < 70) return "#eab308";
  return "#22c55e";
}

/** Letter-grade color: A green, B blue, C yellow, D/F red. */
export function gradeColor(grade: string): string {
  const g = grade.toUpperCase().charAt(0);
  if (g === "A") return "#22c55e";
  if (g === "B") return "#3b82f6";
  if (g === "C") return "#eab308";
  return "#ef4444";
}

/** LTV:CAC ratio severity band. */
export function ltvCacSeverity(
  ratio: number,
): "critical" | "warning" | "info" | "success" {
  if (ratio < 1) return "critical";
  if (ratio < 3) return "warning";
  if (ratio < 5) return "info";
  return "success";
}

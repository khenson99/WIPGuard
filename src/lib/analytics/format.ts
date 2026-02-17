// ─── Shared Analytics Formatting Utilities ────────────────
// Consolidated from duplicated fmt$, fmtN, fmtPct, etc. across analytics tabs.

/**
 * Format a number as compact currency: $1.5M, $12.3K, $450
 */
export function fmtCurrency(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Format a number with locale separators: 1,234 or compact: 1.2K, 3.4M
 */
export function fmtNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * Format a number as a percentage: 85.6%
 * Pass raw value (e.g. 85.6 not 0.856) — no auto-multiplication.
 */
export function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

/**
 * Format seconds into human-readable duration: 2m 15s, 1h 30m, 45s
 */
export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Calculate and format percentage change between two values.
 * Returns "+12.3%" or "-5.1%" or "—" for zero-denominator cases.
 */
export function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+∞%" : "—";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

/**
 * Determine if a change is positive, negative, or neutral.
 */
export function changeDirection(current: number, previous: number): "positive" | "negative" | "neutral" {
  if (current > previous) return "positive";
  if (current < previous) return "negative";
  return "neutral";
}

// ─── Smart Formatting ──────────────────────────────────────
// Auto-detect value type based on key name patterns and format accordingly.
// Used by SnapshotCards to replace generic String(value) rendering.

const CURRENCY_PATTERNS = /(?:revenue|mrr|spend|cost|balance|amount|price|inflow|outflow|burn|cashFlow|value|arpu|cpa|cpc|budget|profit|loss|fee)/i;
const PERCENT_PATTERNS = /(?:rate|pct|percent|ratio|share|coverage|growth|churn|bounce|ctr|roas|conversion|winRate|effectiveWinRate|noShowRate|throughput|successRate)/i;
const DURATION_PATTERNS = /(?:duration|seconds|minutes|hours|time|latency|response|avg.*time|session.*duration)/i;

/**
 * Auto-format a value based on its key name. Useful for generic snapshot rendering.
 */
export function smartFormat(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;

  if (typeof value === "number") {
    // Check key patterns to decide format
    if (CURRENCY_PATTERNS.test(key)) return fmtCurrency(value);
    if (PERCENT_PATTERNS.test(key)) return fmtPercent(value);
    if (DURATION_PATTERNS.test(key)) return fmtDuration(value);
    return fmtNumber(value);
  }

  return String(value);
}

/**
 * Convert a camelCase or snake_case key to a human-readable label.
 * e.g. "avgDealSize" -> "Avg Deal Size", "total_revenue_30d" -> "Total Revenue 30d"
 */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase split
    .replace(/_/g, " ") // snake_case split
    .replace(/\b\w/g, (c) => c.toUpperCase()) // capitalize words
    .replace(/\b(\d+)([dDmMyY])\b/g, "$1$2"); // keep "30d" compact
}

/**
 * Guess an icon name for a metric key. Returns a Lucide icon identifier string.
 * Used by SnapshotCards for automatic icon assignment.
 */
export function guessIconForKey(key: string): string {
  const lower = key.toLowerCase();
  if (CURRENCY_PATTERNS.test(lower)) return "dollar-sign";
  if (/user|contact|contributor|customer|subscriber/i.test(lower)) return "users";
  if (/deal|pipeline|funnel/i.test(lower)) return "target";
  if (/task|card|ticket/i.test(lower)) return "check-square";
  if (/session|pageview|visit|traffic/i.test(lower)) return "globe";
  if (/email|message|conversation/i.test(lower)) return "mail";
  if (PERCENT_PATTERNS.test(lower)) return "trending-up";
  if (DURATION_PATTERNS.test(lower)) return "clock";
  return "bar-chart-2";
}

"use client";

/**
 * Static palette for Recharts — matches Arda design system.
 * Brand orange first, then blue, emerald, violet, amber, pink.
 */
export const CHART_PALETTE = [
  "#FC5A29", // primary orange
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#6366f1", // indigo-500
];

export function getChartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

/**
 * Shared Recharts config constants.
 * CSS variable reads happen at render time so dark mode works automatically.
 */
export const CHART_DEFAULTS = {
  animationDuration: 400,
  strokeWidth: 2,
  dotRadius: 3,
  activeDotRadius: 5,
  gridStrokeDasharray: "3 3",
  tooltipBg: "hsl(var(--card))",
  tooltipBorder: "hsl(var(--border))",
  tooltipText: "hsl(var(--foreground))",
  tooltipMuted: "hsl(var(--muted-foreground))",
} as const;

/**
 * Responsive utilities for mobile-first field workflows.
 *
 * Breakpoints follow Tailwind CSS defaults:
 *   sm  640px
 *   md  768px
 *   lg  1024px
 *   xl  1280px
 */

export type Breakpoint = "sm" | "md" | "lg" | "xl";
export type CardSize = "compact" | "standard" | "expanded";
export interface ColumnLayout { columns: number; gap: number; cardSize: CardSize; }

export const BREAKPOINT_VALUES: Record<Breakpoint, number> = { sm: 640, md: 768, lg: 1024, xl: 1280 };

export function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINT_VALUES.xl) return "xl";
  if (width >= BREAKPOINT_VALUES.lg) return "lg";
  if (width >= BREAKPOINT_VALUES.md) return "md";
  return "sm";
}

export function getResponsiveColumns(width: number): ColumnLayout {
  const bp = getBreakpoint(width);
  switch (bp) {
    case "sm": return { columns: 1, gap: 8, cardSize: "compact" };
    case "md": return { columns: 2, gap: 12, cardSize: "standard" };
    case "lg": return { columns: 3, gap: 16, cardSize: "standard" };
    case "xl": return { columns: 4, gap: 16, cardSize: "expanded" };
  }
}

export function getCardSize(width: number): CardSize {
  return getResponsiveColumns(width).cardSize;
}

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { msMaxTouchPoints?: number };
  return (
    "ontouchstart" in window ||
    nav.maxTouchPoints > 0 ||
    (nav.msMaxTouchPoints ?? 0) > 0
  );
}

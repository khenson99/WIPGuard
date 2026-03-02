/**
 * Minimal recharts mock for vitest / jsdom.
 *
 * jsdom does not implement SVGElement layout, so Recharts' ResponsiveContainer
 * cannot measure its container and often throws or renders nothing useful.
 * This mock replaces every Recharts component with a lightweight passthrough so
 * tests can assert on the data-driven output (aria labels, rendered text) rather
 * than on chart internals.
 *
 * Usage in a test file:
 *   vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"));
 */

import type { ReactNode } from "react";

function Passthrough({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

function SvgPassthrough({ children }: { children?: ReactNode }) {
  return <svg>{children}</svg>;
}

export const ResponsiveContainer = Passthrough;
export const LineChart = SvgPassthrough;
export const AreaChart = SvgPassthrough;
export const BarChart = SvgPassthrough;
export const PieChart = SvgPassthrough;
export const ComposedChart = SvgPassthrough;

export function Line() {
  return <line />;
}
export function Area() {
  return <path />;
}
export function Bar() {
  return <rect />;
}
export function Pie() {
  return <g />;
}
export function Cell() {
  return null;
}
export function XAxis() {
  return <g />;
}
export function YAxis() {
  return <g />;
}
export function CartesianGrid() {
  return <g />;
}
export function Tooltip() {
  return null;
}
export function Legend() {
  return null;
}

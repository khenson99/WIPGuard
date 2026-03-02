# frontend Agent — Accumulated Knowledge

This file is updated by the frontend agent after each iteration.
Future iterations read this file to benefit from previously discovered
patterns, gotchas, and conventions.

## Discovered Patterns
- Dashboard visual refresh (DonutChart + StackedBarChart + SparkLine) landed in PR #276 (commit ed0f418 on main)
- PersonalizedDashboard uses `focusKey` state to drive interactive focus list (blocked/overdue/dueSoon/active)
- `completedByDay` sparkline is sliced to `.slice(-7)` to match "Completed (7d)" label
- teamStatusKeys legend humanizes WORKING_ON_TODAY → Working On Today via `.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())`
- Recharts mock pattern: `vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"))` — reusable shared mock at `src/lib/__mocks__/recharts.tsx`
- Chart components live in `src/components/charts/`: SparkLine, DonutChart, StackedBarChart, AreaTrend, ComposedMetric, HorizontalFunnel
- SparkLine returns null for data.length < 2 to avoid rendering a degenerate single-point line

## Gotchas
- Recharts mock must cover ALL exports used across chart components: LineChart, AreaChart, BarChart, PieChart, ComposedChart, Bar, Line, Area, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend
- Pre-existing TS errors in `src/app/api/deals/` and `src/components/analytics/customer-journey-*` — NOT introduced by dashboard work
- DonutChart center overlay uses `pointer-events-none absolute inset-0` so it doesn't block chart interaction

## Conventions
- Chart tests: use `vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"))` at the top of each test file
- Chart __tests__ directory: `src/components/charts/__tests__/`

## Stack-Specific Notes
- recharts mock shared module: `src/lib/__mocks__/recharts.tsx`
- vitest config has no global setup file — mocks must be registered per test file
- **Tailwind v4** (no tailwind.config.ts): all theme extensions (colors, custom animations, keyframes) go in `src/app/globals.css` inside `@theme { }`. Custom keyframes: define `@keyframes foo { }` + register `--animate-foo: foo 0.4s ease-out both` in `@theme`. Use `animate-foo` and `motion-safe:animate-foo` in JSX.
- `motion-safe:` variant in Tailwind v4 automatically wraps rules in `@media (prefers-reduced-motion: no-preference)` — no manual media query needed.
- Tooltip pattern for funnel badges: make the badge a `<button>` (free keyboard focus), add `onFocus`/`onBlur`/`onMouseEnter`/`onMouseLeave` state tracking, render `<FunnelTooltip>` with `visible={isVisible}` (returns null when not visible). Wire `aria-describedby={tooltipId}` on badge + `id={tooltipId}` + `role="tooltip"` on tooltip.
- Test co-location: analytics component tests live alongside components (e.g., `visual-funnel.test.tsx` beside `visual-funnel.tsx`), NOT in a `__tests__` subdirectory.
- `fireEvent.focus()` in jsdom correctly triggers `onFocus` handlers for tooltip-show tests without needing userEvent.
- `useId()` from React 19 generates stable unique IDs for `aria-describedby` linkage in lists.


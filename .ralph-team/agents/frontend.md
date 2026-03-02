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
- **No @testing-library/jest-dom** — project does NOT have jest-dom matchers; use `.toBeTruthy()` / `.toBeNull()` / `.getAttribute("x")` instead of `toBeInTheDocument` / `toHaveAttribute`
- `DemoRecord` uses `scheduledAt` (not `date`) and `DemoWeeklyTrend` uses `noShows` (not `noShow`) — always audit actual types before writing transforms
- Stacked BarChart pattern: `stackId="group"`, dynamic `<Bar>` from `sources.map()`, adapter function to normalize field names for chart data
- `JourneyPath` type originally had `segments` but runtime/usage code uses `sequence: TouchpointChannel[]` — fixed in #146 to match actual usage
- Path matching: `matchJourneysToPath` derives unique channel sequence per journey via dedup loop (mirrors `buildTopPaths` logic); checks contiguous subsequence
- Custom SVG Sankey: no external library needed; pure layout engine in `src/lib/analytics/sankey-layout.ts`; uses filled bezier paths (M/C/L/Z) for links
- Drawer pattern: `fixed inset-0 z-50` container, `absolute inset-0 bg-black/50` backdrop (click to close), `absolute right-0 top-0 h-full` panel; Escape via `document.addEventListener("keydown", handler)` in `useEffect`
- `fireEvent.keyDown(document, { key: "Escape" })` triggers document-level Escape handler in tests
- SVG links as filled `<path>` elements (not strokes): `fillOpacity` controlled via hover state — works well in jsdom tests with `getAttribute("fill-opacity")`
- Client-side filter pattern: wrap raw deal array into typed interface; use `useMemo` for filtered set + `recomputeFunnelMetrics()` to derive all aggregates; pass recomputed values to sub-sections; compare `isFiltered` flag to decide which data source to use
- Split component for hooks-before-return: when a component has an early `null` return, extract the inner logic into a sub-component (`SalesFunnelTabInner`) to keep hooks unconditional
- `getDateRangeFromPreset` uses `setHours(0,0,0,0)` — causes diff to be slightly > N days; use ±0.5 day tolerance in date range tests
- Avoid querying bare numeric text (e.g. `getByText("2")`) in integration tests — multiple matches cause failures; prefer `role="status"` aria-live indicators or labeled container queries
- lib unit tests go in `src/lib/__tests__/` (confirmed); analytics component tests are colocated beside source files


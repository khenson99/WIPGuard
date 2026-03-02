# frontend Agent — Accumulated Knowledge

This file is updated by the frontend agent after each iteration.
Future iterations read this file to benefit from previously discovered
patterns, gotchas, and conventions.

## Discovered Patterns
- Dashboard pages are thin wrappers around `*Dashboard` client components (e.g. `ConferenceDashboard`)
- `useDashboardResource` hook handles fetch/cache/stale/error state uniformly across all dashboards
- Stat cards pattern: compute stats via `useMemo` in dashboard component, pass as props to presentational component
- ARIA: wrap stat grid in `<section aria-label="...">`, each card uses `role="region" aria-label="{label}: {value}"`
- Icon library: lucide-react (already installed); no heroicons
- Dashboard visual refresh (DonutChart + StackedBarChart + SparkLine) landed in PR #276 (commit ed0f418 on main)
- PersonalizedDashboard uses `focusKey` state to drive interactive focus list (blocked/overdue/dueSoon/active)
- `completedByDay` sparkline is sliced to `.slice(-7)` to match "Completed (7d)" label
- teamStatusKeys legend humanizes WORKING_ON_TODAY → Working On Today via `.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())`
- Recharts mock pattern: `vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"))` — reusable shared mock at `src/lib/__mocks__/recharts.tsx`
- Chart components live in `src/components/charts/`: SparkLine, DonutChart, StackedBarChart, AreaTrend, ComposedMetric, HorizontalFunnel
- SparkLine returns null for data.length < 2 to avoid rendering a degenerate single-point line
- ARIA grid pattern: role=grid → role=row (display:contents) → role=gridcell with aria-rowindex + aria-colindex
- Roving tabindex: only focused cell has tabIndex=0, all others -1; implement via hook `useRovingTabindex`
- Responsive grid columns tracked via matchMedia listeners (lg:4 / sm:3 / default:2 breakpoints)

## Gotchas
- `ConferenceListItem` has NO `attendeeCount` field — use `_count.leads` for lead count stats
- Pre-existing TypeScript errors throughout repo (missing Prisma client); not introduced by frontend work
- `resource.lastUpdatedAt` is safe as `now` ref for filtering, but use `new Date()` in pure utility functions for testability
- Recharts mock must cover ALL exports used across chart components: LineChart, AreaChart, BarChart, PieChart, ComposedChart, Bar, Line, Area, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend
- Pre-existing TS errors in `src/app/api/deals/` and `src/components/analytics/customer-journey-*` — NOT introduced by dashboard work
- DonutChart center overlay uses `pointer-events-none absolute inset-0` so it doesn't block chart interaction
- jsdom sets `window.innerWidth` to 1024 by default — override in tests when breakpoint-sensitive behavior matters
- jsdom has no `window.matchMedia` — mock it in tests for components using responsive breakpoints

## Conventions
- File naming: kebab-case for all component and utility files (`conference-stat-cards.tsx`, `compute-conference-stats.ts`, `wip-pressure-heatmap.tsx`)
- Exports: named exports for components used across files; default export avoided
- Tests live in `__tests__/` subdirectory co-located with the source file (or `src/hooks/__tests__/`)
- `src/lib/conferences/` — pure utility functions (no React); `src/components/conferences/` — React components
- Focus rings: use `focus-visible:*` (not `focus:*`) to avoid mouse visual noise
- WIP heatmap lives at `src/components/whip/wip-pressure-heatmap.tsx` (note: "whip" directory, not "heatmap")
- Chart tests: use `vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"))` at the top of each test file
- Chart __tests__ directory: `src/components/charts/__tests__/`

## Stack-Specific Notes
- Vitest: jsdom environment, `@/` alias via `resolve.alias`, no global setup file
- Testing library: `@testing-library/react` + `vitest` (+ `@testing-library/user-event` when needed); use `screen.getByRole` for ARIA-based queries
- Tailwind responsive grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` works well for 4-wide grids
- recharts mock shared module: `src/lib/__mocks__/recharts.tsx`
- vitest config has no global setup file — mocks must be registered per test file
- `display: contents` on ARIA row wrappers: keeps CSS grid layout while adding semantic row structure; some ATs may not expose role=row, but aria-rowindex on gridcells provides fallback

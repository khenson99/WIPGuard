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

## Gotchas
- `ConferenceListItem` has NO `attendeeCount` field — use `_count.leads` for lead count stats
- Pre-existing TypeScript errors throughout repo (missing Prisma client); not introduced by frontend work
- `resource.lastUpdatedAt` is safe as `now` ref for filtering, but use `new Date()` in pure utility functions for testability
- Recharts mock must cover ALL exports used across chart components: LineChart, AreaChart, BarChart, PieChart, ComposedChart, Bar, Line, Area, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend
- Pre-existing TS errors in `src/app/api/deals/` and `src/components/analytics/customer-journey-*` — NOT introduced by dashboard work
- DonutChart center overlay uses `pointer-events-none absolute inset-0` so it doesn't block chart interaction

## Conventions
- File naming: kebab-case for all component and utility files (`conference-stat-cards.tsx`, `compute-conference-stats.ts`)
- Exports: named exports for components used across files; default export avoided
- Tests live in `__tests__/` subdirectory co-located with the source file
- `src/lib/conferences/` — pure utility functions (no React); `src/components/conferences/` — React components
- Chart tests: use `vi.mock("recharts", async () => import("@/lib/__mocks__/recharts"))` at the top of each test file
- Chart __tests__ directory: `src/components/charts/__tests__/`

## Stack-Specific Notes
- Vitest: jsdom environment, `@/` alias via `resolve.alias`, no global setup file
- Testing library: `@testing-library/react` + `vitest`; use `screen.getByRole` for ARIA-based queries
- Tailwind responsive grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` works well for 5 stat cards
- recharts mock shared module: `src/lib/__mocks__/recharts.tsx`
- vitest config has no global setup file — mocks must be registered per test file

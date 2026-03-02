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

## Gotchas
- `ConferenceListItem` has NO `attendeeCount` field — use `_count.leads` for lead count stats
- Pre-existing TypeScript errors throughout repo (missing Prisma client); not introduced by frontend work
- `resource.lastUpdatedAt` is safe as `now` ref for filtering, but use `new Date()` in pure utility functions for testability

## Conventions
- File naming: kebab-case for all component and utility files (`conference-stat-cards.tsx`, `compute-conference-stats.ts`)
- Exports: named exports for components used across files; default export avoided
- Tests live in `__tests__/` subdirectory co-located with the source file
- `src/lib/conferences/` — pure utility functions (no React); `src/components/conferences/` — React components

## Stack-Specific Notes
- Vitest: jsdom environment, `@/` alias via `resolve.alias`, no global setup file
- Testing library: `@testing-library/react` + `vitest`; use `screen.getByRole` for ARIA-based queries
- Tailwind responsive grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` works well for 5 stat cards


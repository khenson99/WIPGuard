# Imladris Product Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset the repository around Imladris as a governed operating-metrics platform while preserving provider/API/auth/data plumbing.

**Architecture:** Keep the existing Next.js app, NextAuth, Prisma schema, integration APIs, provider clients, Imladris raw/canonical metric services, CEO report services, and automation runtime. Replace the app shell and user-facing routes with four first-class workspaces: Sources, Metrics, Reports, and Automation Pipelines. Legacy WIPGuard/analytics/deals/conference UI surfaces are deleted or redirected out of the primary product.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, NextAuth, Vitest, React Testing Library.

---

### Task 1: Lock Product Boundaries With Tests

**Files:**
- Modify: `src/lib/platform/workspaces.ts`
- Test: `src/lib/__tests__/platform-workspaces.test.ts`
- Test: `src/components/marketing/home-landing.test.tsx`
- Test: `src/components/workspaces/workspace-home.test.tsx`

- [ ] Add tests that assert the primary workspace model contains exactly `sources`, `metrics`, `reports`, and `pipelines`.
- [ ] Add tests that assert workspace navigation no longer imports analytics funnel children.
- [ ] Add tests for a reusable workspace home component with title, summary, system-of-record cards, and action links.
- [ ] Run the focused tests and verify they fail before implementation.

### Task 2: Build New Workspace UI

**Files:**
- Create: `src/components/workspaces/workspace-model.ts`
- Create: `src/components/workspaces/workspace-home.tsx`
- Create: `src/components/workspaces/sources-workspace.tsx`
- Create: `src/components/workspaces/metrics-workspace.tsx`
- Create: `src/components/workspaces/reports-workspace.tsx`
- Create: `src/components/workspaces/pipelines-workspace.tsx`
- Modify: `src/app/(dashboard)/sources/page.tsx`
- Modify: `src/app/(dashboard)/metrics/page.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Modify: `src/app/(dashboard)/pipelines/page.tsx`

- [ ] Implement a small typed workspace model that describes summary stats, system records, API surfaces, preserved code, and primary actions.
- [ ] Implement workspace pages as simple, durable product surfaces that reference the preserved APIs rather than legacy analytics components.
- [ ] Update the four workspace route pages to render the new components.
- [ ] Re-run focused tests and verify they pass.

### Task 3: Simplify Navigation And Redirect Legacy Entrypoints

**Files:**
- Modify: `src/lib/platform/workspaces.ts`
- Modify: `src/components/layout/sidebar-nav-group.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/app/(dashboard)/analytics/page.tsx`
- Modify: `src/app/(dashboard)/integrations/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] Remove analytics child navigation from the primary sidebar model.
- [ ] Remove analytics-only connection status rendering from sidebar groups.
- [ ] Redirect `/dashboard` and `/analytics` to `/metrics`.
- [ ] Keep `/integrations` redirecting to `/sources`.
- [ ] Keep authenticated landing redirect aligned to `/metrics`.

### Task 4: Delete Legacy UI Surfaces

**Files:**
- Delete route directories under `src/app/(dashboard)` for legacy analytics detail pages, deals pages, conference pages, retention pages, and duplicate automation entrypoints where `/pipelines` is now canonical.
- Delete component directories that only support deleted legacy surfaces: `src/components/analytics`, `src/components/conferences`, `src/components/customer-success`, `src/components/dashboard`, `src/components/deals`, `src/components/retention`, and unused chart primitives.
- Keep API routes, integration clients, service-layer analytics/fetcher code, Prisma models, worker code, and tests around provider/API behavior.

- [ ] Remove deleted route/component files.
- [ ] Search for imports of removed components and fix or delete callers.
- [ ] Ensure no primary navigation item points at a deleted route.

### Task 5: Update Product Documentation

**Files:**
- Modify: `README.md`

- [ ] Update the README opening to describe the reset product shape.
- [ ] Add a preserved-systems section listing auth, integrations, Imladris metric layer, CEO reports, and automation APIs.
- [ ] Add a legacy-removal note explaining that WIPGuard UI surfaces have been removed from the primary product.

### Task 6: Verify

**Commands:**
- `npm test -- src/lib/__tests__/platform-workspaces.test.ts src/components/marketing/home-landing.test.tsx src/components/workspaces/workspace-home.test.tsx`
- `npm run lint`
- `npm run build`

- [ ] Run focused tests.
- [ ] Run lint.
- [ ] Run production build.
- [ ] Summarize any failures that remain outside the reset scope.

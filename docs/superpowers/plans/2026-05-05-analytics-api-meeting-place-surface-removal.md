# Analytics API Meeting Place Surface Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WIPGuard's visible product surface analytics-first by sending authenticated users to `/analytics`, hiding task/board/work-management routes and CTAs, and reframing legacy task-derived CEO metrics as internal execution data while preserving existing backend contracts.
**Architecture:** Add a shared analytics-home route constant, redirect legacy work-management pages to `/analytics`, make workspace navigation analytics-first, prune task/board settings tabs, update marketing copy, remove task creation controls from analytics, and keep legacy data/API surfaces available for compatibility.
**Tech Stack:** Next.js App Router, React, TypeScript, Vitest/React Testing Library, existing analytics registry, existing CEO metric trust layer, Prisma models preserved.

---

## Operating Constraints

- [ ] Do not delete Prisma task, board, project, sprint, priority, or department models in this phase.
- [ ] Do not remove task/project/sprint API routes in this phase.
- [ ] Do not change automation execution contracts that currently emit `create_task` actions.
- [ ] Do remove visible navigation, pages, settings tabs, and CTA paths that position WIPGuard as a task or board product.
- [ ] Keep all redirects authenticated by the existing `(dashboard)` layout. Page-level auth checks are unnecessary for legacy pages inside that layout.
- [ ] Stage and commit only files touched by this implementation. The worktree contains unrelated changes that must be preserved.

## Task 1: Centralize Analytics Home And Redirect Legacy Product Routes

- [ ] Add a route constant file at `src/lib/platform/routes.ts`:

  ```ts
  export const ANALYTICS_HOME = "/analytics" as const;
  ```

- [ ] Add a legacy redirect helper at `src/app/(dashboard)/legacy-analytics-redirect.ts`:

  ```ts
  import { redirect } from "next/navigation";
  import { ANALYTICS_HOME } from "@/lib/platform/routes";

  export function redirectToAnalyticsHome(): never {
    redirect(ANALYTICS_HOME);
  }
  ```

- [ ] Update `src/app/page.tsx` so authenticated users redirect to `ANALYTICS_HOME` instead of `"/dashboard"`:

  ```ts
  import { ANALYTICS_HOME } from "@/lib/platform/routes";

  if (session?.user) {
    redirect(ANALYTICS_HOME);
  }
  ```

- [ ] Replace legacy product pages with calls to `redirectToAnalyticsHome()`:

  - `src/app/(dashboard)/dashboard/page.tsx`
  - `src/app/(dashboard)/tasks/page.tsx`
  - `src/app/(dashboard)/board/page.tsx`
  - `src/app/(dashboard)/my-tasks/page.tsx`
  - `src/app/(dashboard)/projects/page.tsx`
  - `src/app/(dashboard)/standup/page.tsx`
  - `src/app/(dashboard)/today/page.tsx`
  - `src/app/(dashboard)/whip/page.tsx`
  - `src/app/(dashboard)/table/page.tsx`
  - `src/app/(dashboard)/logbook/page.tsx`

  Each page should become the same shape:

  ```ts
  import { redirectToAnalyticsHome } from "@/app/(dashboard)/legacy-analytics-redirect";

  export default function LegacyDashboardRoute() {
    redirectToAnalyticsHome();
  }
  ```

- [ ] Remove `KanbanBoard` and `auth` imports from `src/app/(dashboard)/tasks/page.tsx`.
- [ ] Keep `src/app/(dashboard)/automations/ralph-board/page.tsx` redirecting to `/automations`; it already prevents the board UI from rendering and keeps automation context in the automation workspace.
- [ ] Replace `src/app/(dashboard)/tasks/page.test.tsx` with redirect coverage for the new `TasksPage` behavior, or move it into the new route test file below.
- [ ] Add `src/app/(dashboard)/legacy-product-routes.test.tsx` covering all redirected legacy pages:

  ```ts
  import { beforeEach, describe, expect, it, vi } from "vitest";
  import DashboardPage from "@/app/(dashboard)/dashboard/page";
  import TasksPage from "@/app/(dashboard)/tasks/page";
  import BoardPage from "@/app/(dashboard)/board/page";
  import MyTasksPage from "@/app/(dashboard)/my-tasks/page";
  import ProjectsPage from "@/app/(dashboard)/projects/page";
  import StandupPage from "@/app/(dashboard)/standup/page";
  import TodayPage from "@/app/(dashboard)/today/page";
  import WhipPage from "@/app/(dashboard)/whip/page";
  import TablePage from "@/app/(dashboard)/table/page";
  import LogbookPage from "@/app/(dashboard)/logbook/page";
  import { ANALYTICS_HOME } from "@/lib/platform/routes";

  vi.mock("next/navigation", () => ({
    redirect: vi.fn((target: string) => {
      throw new Error(`NEXT_REDIRECT:${target}`);
    }),
  }));

  const routes = [
    ["dashboard", DashboardPage],
    ["tasks", TasksPage],
    ["board", BoardPage],
    ["my-tasks", MyTasksPage],
    ["projects", ProjectsPage],
    ["standup", StandupPage],
    ["today", TodayPage],
    ["whip", WhipPage],
    ["table", TablePage],
    ["logbook", LogbookPage],
  ] as const;

  describe("legacy product routes", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each(routes)("redirects /%s to analytics", async (_name, Page) => {
      const { redirect } = await import("next/navigation");

      await expect(async () => Page()).rejects.toThrow(`NEXT_REDIRECT:${ANALYTICS_HOME}`);
      expect(redirect).toHaveBeenCalledWith(ANALYTICS_HOME);
    });
  });
  ```

- [ ] Run:

  ```bash
  npm test -- 'src/app/(dashboard)/legacy-product-routes.test.tsx' 'src/app/(dashboard)/tasks/page.test.tsx'
  ```

  Expected output: Vitest reports the listed route tests passing. If `tasks/page.test.tsx` is removed, omit it from the command.

## Task 2: Make The Sidebar Analytics-First

- [ ] Update `src/lib/platform/workspaces.ts`:

  - Remove `"dashboard"` from `WorkspaceId`.
  - Remove the Dashboard entry from `WORKSPACE_NAV_ITEMS`.
  - Put `analytics` first, then `integrations`, then `deals`, then `automations`.
  - Update analytics description to: `"Metric trust, source health, customer journey, and operating intelligence."`
  - Keep CEO Command Center as the first analytics child.

- [ ] Update `src/components/layout/sidebar-nav-config.ts`:

  - Remove `LayoutDashboard` import.
  - Remove `dashboard: LayoutDashboard` from `WORKSPACE_ICONS`.
  - Keep icon mappings for `analytics`, `integrations`, `deals`, and `automations`.

- [ ] Update `src/components/layout/sidebar.tsx`:

  - Replace the brand icon import with `Activity`.
  - Replace visible brand text from `WIPGuard` to `WIPGuard Analytics`.
  - Keep the Settings secondary link.

  Target brand block:

  ```tsx
  <Activity className="h-6 w-6 text-primary" aria-hidden="true" />
  <span className="text-lg font-bold text-foreground">WIPGuard Analytics</span>
  ```

- [ ] Update `src/lib/__tests__/sidebar-analytics-nav.test.ts`:

  - Rename `"builds the five top-level product pillars"` to `"builds the analytics-first workspace pillars"`.
  - Expect top-level IDs in this order:

    ```ts
    expect(navItems.map((item) => item.id)).toEqual([
      "analytics",
      "integrations",
      "deals",
      "automations",
    ]);
    ```

  - Keep assertions for `/analytics/ai-insights`, `/integrations`, `/automations`, and `/automations/artifacts`.
  - Add an assertion that `navItems.some((item) => item.href === "/dashboard")` is `false`.

- [ ] Run:

  ```bash
  npm test -- src/lib/__tests__/sidebar-analytics-nav.test.ts
  ```

  Expected output: Sidebar nav tests pass and no type errors reference the removed `dashboard` workspace ID.

## Task 3: Remove Task/Board Settings Tabs From The Visible Product

- [ ] Update `src/app/(dashboard)/settings/page.tsx`:

  - Remove imports for:
    - `BoardSettingsTab`
    - `SprintsTab`
    - `ProjectsTab`
    - `PrioritiesTab`
    - `DepartmentsTab`
    - `DesignInterviewTab`
  - Keep imports for `TeamTab` and `OperationsTab`.
  - Replace `TABS` with:

    ```ts
    const TABS = [
      { id: "team", label: "Team" },
      { id: "operations", label: "Operations" },
    ] as const;
    ```

  - Add:

    ```ts
    const LEGACY_SETTINGS_TABS = new Set([
      "board",
      "sprints",
      "projects",
      "departments",
      "priorities",
      "design-interview",
    ]);
    ```

  - Change the default active tab to `"team"`.
  - Keep `tab=integrations` redirecting to `/integrations` with remaining query params preserved.
  - Redirect any legacy settings tab to the same settings URL with `tab=team`, preserving remaining query params:

    ```ts
    if (tabParam && LEGACY_SETTINGS_TABS.has(tabParam)) {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", "team");
      const basePath = pathname || "/settings";
      router.replace(`${basePath}?${params.toString()}`, { scroll: false });
    }
    ```

  - Return `null` while `tab=integrations` or a legacy settings tab is being redirected.
  - Replace the settings subtitle with:

    ```tsx
    Configure team access and analytics operating guardrails.
    ```

  - Render only:

    ```tsx
    {activeTab === "team" && <TeamTab />}
    {activeTab === "operations" && <OperationsTab />}
    ```

- [ ] Update `src/app/(dashboard)/settings/page.test.tsx`:

  - Mock only `TeamTab` and `OperationsTab`.
  - Assert default render shows `Team` and `Operations`.
  - Assert these visible tabs are absent:
    - `Board & WIP Limits`
    - `Sprints`
    - `Projects`
    - `Departments`
    - `Company Priorities`
    - `Design Interview`
  - Keep the legacy integrations redirect test.
  - Add a legacy tab redirect test:

    ```ts
    mockSearchParams = new URLSearchParams("tab=board&source=old-link");

    render(<SettingsPage />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/settings?tab=team&source=old-link",
        { scroll: false },
      );
    });
    ```

- [ ] Run:

  ```bash
  npm test -- 'src/app/(dashboard)/settings/page.test.tsx'
  ```

  Expected output: Settings tests pass and no removed settings tab component is imported by the page.

## Task 4: Reframe Marketing Copy Around Analytics And Metric Trust

- [ ] Update `src/components/marketing/home-landing.tsx` to remove board/WIP/task positioning from the public landing page.
- [ ] Replace the hero eyebrow with:

  ```tsx
  Analytics API meeting place
  ```

- [ ] Replace the H1 with:

  ```tsx
  Make every business metric traceable.
  ```

- [ ] Replace hero body copy with:

  ```tsx
  WIPGuard brings finance, sales, marketing, customer success, and internal execution sources into one governed metric layer with freshness, lineage, and board-ready exports.
  ```

- [ ] Keep the primary CTA text `Access workspace`.
- [ ] Replace the secondary CTA text with `See the metric layer`.
- [ ] Replace task/board-oriented stat cards with analytics-oriented cards:

  ```ts
  const METRICS = [
    {
      label: "Source trust",
      value: "Freshness, lineage, and warnings stay attached to every number",
    },
    {
      label: "Board packs",
      value: "Weekly exec, board, investor, and custom snapshots reuse the same facts",
    },
    {
      label: "Live integrations",
      value: "Finance, CRM, ads, web, CS, and workspace systems meet in one API layer",
    },
  ];
  ```

- [ ] Replace any remaining visible phrases in `home-landing.tsx` that position the product as task management:

  - `WIP-limited GTM operating system`
  - `Stop starting. Start finishing revenue work.`
  - `Board movement`
  - `WIP policies`
  - `task gets pulled`
  - `See the flow`

- [ ] Update `src/components/marketing/home-landing.test.tsx`:

  ```ts
  expect(
    screen.getByRole("heading", {
      name: /make every business metric traceable\./i,
    })
  ).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /access workspace/i }).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /see the metric layer/i })).toBeTruthy();
  ```

- [ ] Run:

  ```bash
  npm test -- src/components/marketing/home-landing.test.tsx
  ```

  Expected output: Landing page test passes with analytics-first copy.

## Task 5: Remove Analytics Task Creation CTAs

- [ ] Update `src/components/analytics/insight-card-actions.tsx`:

  - Remove `onCreateTask` and `isCreatingTask` props.
  - Remove the `Task` button.
  - Keep only pin and dismiss actions.

- [ ] Update `src/components/analytics/insight-card-full.tsx`:

  - Remove `onCreateTask` and `isCreatingTask` props.
  - Change `showActions` to:

    ```ts
    const showActions = onTogglePin != null && onDismiss != null;
    ```

  - Pass only `isPinned`, `onTogglePin`, and `onDismiss` to `InsightCardActions`.

- [ ] Update `src/components/analytics/ai-insights-page.tsx`:

  - Stop destructuring `createTaskFromInsight` and `creatingTaskForId` from `useInsightPreferences()`.
  - Remove `taskError`, `setTaskError`, and `handleCreateTask`.
  - Remove the task error banner.
  - Stop passing `onCreateTask` and `isCreatingTask` to `InsightCardFull`.
  - In the right-side action queue, remove the `Create task` button and keep only the destination link when present.
  - Rename the right-side heading from `Action queue` to `Recommended moves`.
  - Keep `Actionable Plays` as a signal count because it describes insight metadata, not task management.

- [ ] Leave `src/lib/hooks/use-insight-preferences.ts` unchanged in this phase. It is an internal compatibility hook and may still be used by future automation flows.
- [ ] Update `src/components/analytics/ai-insights-page.test.tsx`:

  - Keep the existing pagination and rerun tests.
  - Strengthen the create-task absence assertion:

    ```ts
    expect(screen.queryByRole("button", { name: /create task/i })).toBeNull();
    expect(screen.queryByText(/^Task$/)).toBeNull();
    expect(screen.queryByText(/Creating\.\.\./)).toBeNull();
    ```

  - Assert the side panel heading is `Recommended moves`.

- [ ] Keep `src/components/analytics/__tests__/insight-card-actions.test.tsx` expecting exactly two buttons.
- [ ] Run:

  ```bash
  npm test -- src/components/analytics/ai-insights-page.test.tsx src/components/analytics/__tests__/insight-card-actions.test.tsx
  ```

  Expected output: AI insights and action toolbar tests pass with no visible create-task controls.

## Task 6: Reframe Legacy Execution Metrics Without Breaking Metric Keys

- [ ] Update `src/lib/ceo/metric-trust.ts` labels and descriptions without changing metric keys:

  - `ceo.flow_reliability_score`
    - Label: `Internal Execution Reliability`
    - Description: `Composite legacy internal execution reliability score from overdue, stale, blocker, throughput, and work-in-progress signals.`
  - `ceo.throughput_30d`
    - Label: `Internal Execution Throughput 30d`
    - Description: `Completed legacy internal execution items over the trailing 30 days.`
  - `ceo.overdue_open_tasks`
    - Label: `Legacy Open Execution Items`
    - Description: `Open legacy internal execution items past their expected date.`

- [ ] Update report section titles in `src/lib/ceo/metric-trust.ts`:

  - `Execution` to `Internal Execution`
  - `Operating System` to `Operational Signals`

- [ ] Update `src/components/analytics/ceo-command-center.test.tsx` fixtures and assertions from `Flow Reliability Score` to `Internal Execution Reliability`.
- [ ] Update `src/components/analytics/customer-success-operational-view-model.ts` label `Overdue Open Tasks` to `Legacy Open Execution Items`.
- [ ] Update `src/components/analytics/ops-insights.tsx` labels:

  - `Flow Reliability` to `Internal Execution Reliability`
  - `Overdue Open Tasks` to `Legacy Open Execution Items`

- [ ] Update any tests that assert the old labels:

  ```bash
  rg -n "Flow Reliability|Throughput 30d|Overdue Open Tasks|Operating System|Execution" src/**/*.test.ts src/**/*.test.tsx src/lib src/components
  ```

  Expected output after edits: no user-facing assertions remain for old task-management labels except intentional internal metric keys.

- [ ] Run:

  ```bash
  npm test -- src/components/analytics/ceo-command-center.test.tsx src/lib/ceo/service.test.ts
  ```

  Expected output: CEO command center and CEO service tests pass. Service tests may keep metric-key assertions; only display labels should change.

## Task 7: Fix Analytics Registry Legacy Redirects And Labels

- [ ] Update `src/lib/analytics/section-registry.ts`:

  - Change `LEGACY_ANALYTICS_ROUTE_REDIRECTS.tasks` from `"/dashboard"` to `"/analytics/customer-success"`.
  - Keep `LEGACY_ANALYTICS_TAB_REDIRECTS.tasks` at `"/analytics/customer-success"`.
  - Rename subsection label `Free Kanban Generator (Whitepaper)` to `Coda Lead Magnet (Whitepaper)` while preserving id `ads-coda-kanban` and path `/analytics/ads-coda-kanban` for compatibility.

- [ ] Update `src/lib/__tests__/analytics-section-registry.test.ts`:

  - Add:

    ```ts
    expect(LEGACY_ANALYTICS_ROUTE_REDIRECTS.tasks).toBe("/analytics/customer-success");
    ```

  - Add an assertion that the `ads-coda-kanban` subsection label is `Coda Lead Magnet (Whitepaper)`.

- [ ] Run:

  ```bash
  npm test -- src/lib/__tests__/analytics-section-registry.test.ts
  ```

  Expected output: Analytics registry tests pass and no legacy analytics route points to `/dashboard`.

## Task 8: Focused Verification

- [ ] Run the focused surface-removal suite:

  ```bash
  npm test -- \
    'src/app/(dashboard)/legacy-product-routes.test.tsx' \
    'src/app/(dashboard)/settings/page.test.tsx' \
    src/lib/__tests__/sidebar-analytics-nav.test.ts \
    src/lib/__tests__/analytics-section-registry.test.ts \
    src/components/marketing/home-landing.test.tsx \
    src/components/analytics/ai-insights-page.test.tsx \
    src/components/analytics/__tests__/insight-card-actions.test.tsx \
    src/components/analytics/ceo-command-center.test.tsx \
    src/lib/ceo/service.test.ts
  ```

  Expected output: all listed tests pass.

- [ ] Run typecheck:

  ```bash
  npx tsc --noEmit --pretty false
  ```

  Expected output: command exits 0 with no TypeScript errors.

- [ ] Run lint:

  ```bash
  npm run lint
  ```

  Expected output: command exits 0.

- [ ] Run production build:

  ```bash
  npm run build
  ```

  Expected output: Next.js build exits 0.

## Task 9: Manual Product Smoke

- [ ] Start the local server:

  ```bash
  npm run dev
  ```

- [ ] In an authenticated browser session, verify:

  - `/` redirects to `/analytics`.
  - `/dashboard` redirects to `/analytics`.
  - `/tasks` redirects to `/analytics`.
  - `/board` redirects to `/analytics`.
  - `/projects` redirects to `/analytics`.
  - `/settings` shows only `Team` and `Operations`.
  - `/settings?tab=board` redirects or replaces URL to `/settings?tab=team`.
  - Sidebar top-level nav shows `Analytics`, `Integrations`, `Deals`, and `Automations`.
  - Sidebar does not show `Dashboard`, `Tasks`, `Board`, `Projects`, `Sprints`, or task-management settings links.
  - `/analytics/ai-insights` has no visible `Create task`, `Task`, or `Creating...` controls.
  - `/analytics/ceo` still loads and shows the CEO metric trust layer.

- [ ] Stop the local dev server before ending the implementation turn.

## Task 10: Commit Scope

- [ ] Inspect changed files:

  ```bash
  git status --short
  ```

- [ ] Stage only files touched by this implementation.
- [ ] Do not stage unrelated existing changes in CEO metrics, Mercury, HubSpot MRR, or other analytics work unless this implementation directly modified them.
- [ ] Commit with:

  ```bash
  git commit -m "feat: make analytics the primary product surface"
  ```

## Completion Criteria

- [ ] Authenticated users land on `/analytics`, not `/dashboard`.
- [ ] Legacy product routes redirect to `/analytics`.
- [ ] Sidebar no longer exposes task, board, or dashboard product surfaces.
- [ ] Settings no longer exposes task/board/project/sprint/priority/department tabs.
- [ ] Marketing copy positions WIPGuard as an analytics API meeting place and metric trust layer.
- [ ] AI insights no longer create tasks from the UI.
- [ ] CEO metric keys remain stable, but task-flavored display labels are reframed as internal execution data.
- [ ] Focused tests, typecheck, lint, and build pass.
- [ ] No backend schema or API compatibility is removed in this phase.

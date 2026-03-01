# WIPGuard Dashboard Screens — Full Data/Visualization Walkthrough

Generated: 2026-02-28 (America/Los_Angeles)

This document is a repo-grounded, screen-by-screen walkthrough of every “dashboard screen” under `src/app/(dashboard)` plus every Analytics “virtual screen” defined in `src/lib/analytics/section-registry.ts`.

---

## Overview

### What counts as a “dashboard screen”

For this report, a “screen” is:

1) Every route implemented by a `page.tsx` under `src/app/(dashboard)` (including redirect-only routes), and
2) Every Analytics screen identified by section IDs in `src/lib/analytics/section-registry.ts`:
   - `ANALYTICS_PRIMARY_SECTIONS` (7 primary sections)
   - `ANALYTICS_SUB_SECTIONS` (provider/ops/drilldown subsections)

Authoritative route inventory (from `find src/app/(dashboard) -name page.tsx`):

- Work-management routes:
  - `/dashboard` → `src/app/(dashboard)/dashboard/page.tsx` → `src/components/dashboard/personalized-dashboard.tsx`
  - `/today` → `src/app/(dashboard)/today/page.tsx` → `src/components/standup/standup-view.tsx` and `src/components/board/kanban-board.tsx`
  - `/tasks` → `src/app/(dashboard)/tasks/page.tsx` → `src/components/board/kanban-board.tsx` + `src/components/tasks/task-table-view.tsx` + `/api/views`
  - `/projects` → `src/app/(dashboard)/projects/page.tsx` → `src/components/projects/project-dashboard.tsx`
  - `/projects/[id]` → `src/app/(dashboard)/projects/[id]/page.tsx` → `src/components/projects/project-detail.tsx`
  - `/deals` → `src/app/(dashboard)/deals/page.tsx` → `src/components/deals/deals-dashboard.tsx`
  - `/deals/[id]` → `src/app/(dashboard)/deals/[id]/page.tsx` → `src/components/deals/deal-detail.tsx`
  - `/deals/analytics` → `src/app/(dashboard)/deals/analytics/page.tsx` → `src/components/deals/deals-analytics.tsx`
  - `/conferences` → `src/app/(dashboard)/conferences/page.tsx` → `src/components/conferences/conference-dashboard.tsx`
  - `/conferences/[id]` → `src/app/(dashboard)/conferences/[id]/page.tsx` → `src/components/conferences/conference-detail.tsx`
  - `/logbook` → `src/app/(dashboard)/logbook/page.tsx` → `/api/logbook`
  - `/automations` → `src/app/(dashboard)/automations/page.tsx` → `/api/automations`
  - `/automations/approvals` → `src/app/(dashboard)/automations/approvals/page.tsx` → `/api/automations/approvals`
  - `/automations/[id]` → `src/app/(dashboard)/automations/[id]/page.tsx` → `/api/automations/[id]` (workflow builder)
  - `/automations/[id]/runs` → `src/app/(dashboard)/automations/[id]/runs/page.tsx` → `/api/automations/[id]/runs`
  - `/settings` → `src/app/(dashboard)/settings/page.tsx` → `src/components/settings/*`
  - `/standup` → `src/app/(dashboard)/standup/page.tsx` (**demo-only**, uses `src/lib/standup-engine.ts`, not `/api/standup`)
  - `/whip` → `src/app/(dashboard)/whip/page.tsx` → `src/components/whip/*`

- Redirect-only / legacy routes:
  - `/board` → `src/app/(dashboard)/board/page.tsx` → redirects to `/dashboard`
  - `/table` → `src/app/(dashboard)/table/page.tsx` → redirects to `/tasks?view=table-audit`
  - `/my-tasks` → `src/app/(dashboard)/my-tasks/page.tsx` → redirects to `/tasks?view=my-work`

- Analytics routes (also under `(dashboard)`):
  - `/analytics` → `src/app/(dashboard)/analytics/page.tsx` → `src/components/analytics/analytics-summary-page.tsx`
  - `/analytics/[section]` → `src/app/(dashboard)/analytics/[section]/page.tsx` → `src/components/analytics/analytics-section-page.tsx`
  - `/analytics/ai-insights` → `src/app/(dashboard)/analytics/ai-insights/page.tsx` → `src/components/analytics/ai-insights-page.tsx`
  - `/analytics/customer-journey` → `src/app/(dashboard)/analytics/customer-journey/page.tsx` → `src/components/analytics/customer-journey-page.tsx`

### Global patterns (cross-cutting)

#### Auth gating

Most server routes are gated by NextAuth:

- API routes typically call `auth()` (`src/lib/auth`) and return `401` when `!session?.user`.
  - Examples: `src/app/api/tasks/route.ts`, `src/app/api/logbook/route.ts`, `src/app/api/dashboard/personalized/route.ts`.
- Analytics uses `getServerSession(authOptions)` in `src/app/api/analytics/route.ts`.

Implication: almost every dashboard visualization is “auth-dependent”; the UI expects `401` to manifest as “empty/unavailable” states.

#### UI data loading + client caching

Many screens use `useDashboardResource()` (`src/components/dashboard/use-dashboard-resource.ts`) which provides:

- A `sessionStorage` warm-start via `readSessionCache()` / `writeSessionCache()` (see `src/lib/client/session-cache`).
- A two-phase behavior:
  - render cached data immediately (`fromCache: true`)
  - then fetch fresh data (`fromCache: false` on success)
- “Stale mode”:
  - If a refresh fails but there was previous data, `stale: true` and stale banners are shown (e.g. `DashboardStaleBanner`).

Several screens implement their own lighter caching, but the semantics are similar: “render cached → fetch → if fetch fails keep cached.”

#### HTTP caching headers (server responses)

Some APIs explicitly return `Cache-Control` headers:

- `GET /api/dashboard/personalized` returns `private, max-age=30, stale-while-revalidate=120` (`src/app/api/dashboard/personalized/route.ts`).
- `GET /api/analytics` and `GET /api/analytics/summary` also use `private, max-age=30, stale-while-revalidate=120` unless `refresh=true` (see `src/app/api/analytics/route.ts`, `src/app/api/analytics/summary/route.ts`).

This is separate from the client’s `sessionStorage` caching; in practice, both exist.

#### Time ranges (analytics only)

Analytics screens support:

- Presets: `range=7d|30d|90d` (default behaviors vary by page)
- Absolute: `from=YYYY-MM-DD&to=YYYY-MM-DD`

UI builds the query string with `buildRangeQuery()` (`src/lib/analytics/time-range.ts`) and API parses with `parseAnalyticsTimeRange()` (`src/lib/analytics/time-range.ts`).

#### “Not configured / no data / failing” tri-state

Many Analytics components use a connection-status abstraction (e.g. `populateConnectionStatus(...)`) to label a provider as:

- `not_configured` (missing credentials),
- `failing` (credentials exist but API calls error),
- `no_data` (provider returns successfully but results are empty),
- `healthy` (normal).

This affects what each visualization renders: numbers vs explanatory strings vs empty states.

---

## Data Sources & Storage (cross-cutting)

### Prisma storage (core tables used by dashboards)

All “internal” screens ultimately read/write Prisma models in `prisma/schema.prisma`. The key models touched by dashboard screens include (non-exhaustive, but the minimum set used in this doc):

#### Work management

- `Project` — name/description/status, department, RACI roles, tasks.
- `Task` — status workflow, due dates, priority, RACI roles, dependencies, sprint association, unplanned scope metadata, order (`columnOrder`), plus `statusHistory` and `logbookEntries`.
- `Sprint`, `SprintCommitment`, `PlanningSession` — sprint metadata and commitment ledger used by WIP/scope screens.
- `BoardSettings` and `WipPolicy` — WIP limits and enforcement modes used in Kanban and transition checks.
- `StatusHistory` — append-only task transition history used in analytics/ops signals.
- `LogbookEntry` — append-only “completed work archive” created when tasks move to `DONE`.

#### CRM / revenue / events

- `Deal`, `DealStageHistory`, `DealMeeting`, `DealCompany`, `DealContact` — used by Deals dashboards + analytics.
- `Conference` and children (`ConferenceDeadline`, `ConferenceBudget`, `ConferenceExpense`, `ConferenceLead`, etc.) — used by Conferences dashboards.

#### Integrations and observability

- `IntegrationConnection` — stored OAuth tokens / connection metadata for providers.
- `IntegrationRule` — system-managed “recipes” for ingestion (enabled/lastError/lastRunAt/etc).
- `IntegrationReceipt` — per-external-object dedupe receipts + “created task” linkage.
- `OutboxEvent` — event bus / failure tracking for integrations and ops dashboards.

#### Analytics snapshots

- `AnalyticsSnapshot` — cached provider payloads with `status`, `capturedAt`, `expiresAt`, `lastError`, keyed by `{userId, providerKey, contextKey, rangePreset, toDate}`.

#### Automation engine

- `WorkflowDefinition`, `WorkflowNode`, `WorkflowEdge` — workflow builder graph.
- `WorkflowRun`, `WorkflowRunStep`, `WorkflowApproval` — execution traces + approval inbox.

### External providers referenced by Analytics

Analytics pulls live data from external providers when credentials exist (see `src/app/api/analytics/route.ts` and fetchers under `src/lib/analytics/*`). Providers include:

- HubSpot (CRM deals/contacts/owners)
- Stripe (subscriptions + charges; customer charge lookups for performance pack)
- Mercury (bank accounts + transactions)
- GA4 (Google Analytics Data API)
- Google Ads (Google Ads API via `searchStream` GAQL)
- Meta Ads + Meta Page + Instagram (Meta Graph API)
- Reddit Ads (Reddit Ads API v3)
- Webflow (Webflow API v2: site/pages/collections/form submissions)
- Coda (Coda API: tables/columns/rows for “Free Kanban Generator”/whitepaper flows)
- SEMrush (SEMrush API: domain overview/keywords/competitors/backlinks)
- Pylon (support issues; via `src/lib/integrations/pylon-client`)
- “Integration telemetry” (Google Workspace, Slack, etc.) derived from internal `IntegrationRule`/`IntegrationReceipt`/`OutboxEvent` rather than calling the providers directly for analytics

### Snapshot system (Analytics pipeline)

Analytics is snapshot-backed by design:

- Primary route: `GET /api/analytics` (`src/app/api/analytics/route.ts`)
- Snapshot persistence: `src/lib/analytics/snapshots.ts` writing to `AnalyticsSnapshot`

High-level behavior per “domain” (provider key) requested for a section:

1) Determine required domains for `section` via `SECTION_DOMAINS` (`src/app/api/analytics/route.ts`).
2) Parse the time range.
3) For each domain:
   - If `refresh=true`: fetch live (with per-domain timeout), store a fresh snapshot on success.
   - Else:
     - Read latest snapshot (`readLatestSnapshot`).
     - If snapshot exists:
       - Serve it immediately.
       - If it’s stale, enqueue a best-effort background refresh (`queueStaleSnapshotRefresh`) while still serving the stale snapshot.
     - If no snapshot exists:
       - Fetch live; on success store snapshot; on failure store a failure snapshot and attempt fallback to `readLatestSuccessfulSnapshot`.
4) After provider domains resolve, compute derived domains (funnels, journeys, AI insights, KPIs, planning/forecast/P&L/unit economics) and return `AnalyticsDashboardData` with `meta`, `freshness`, `staleDomains`, and `errors`.

Important: The API intentionally favors “serve something (even stale)” over “fail the whole page.”

Known snapshot-related failure modes are documented per screen in the Analytics sections below.

---

## Screen-by-Screen Walkthrough

### `/dashboard` (Personalized Dashboard)

**Purpose**

- Provide a per-user “home cockpit” combining:
  - personal work queues (active/blocked/overdue/due soon),
  - personal completion trend,
  - team-level status distribution and risk signals,
  - project progress snapshots,
  - an explicit “recommended next actions” ranking.

**Visualizations (exhaustive list)**

- Header + refresh button (manual refresh triggers `useDashboardResource.refresh()`).
- Stale banner (`DashboardStaleBanner`) and error banner (`DashboardErrorBanner`) as needed.
- KPI strip (6 cards):
  - `My Active`, `My Blocked`, `My Overdue`, `Completed (7d)` (includes `SparkLine`), `Team Overdue`, `Task Total`.
- “Visual overview” (2 panels):
  - `My Workload` donut chart (`DonutChart`) + clickable legend that sets “focus” panel
  - `Team Status Overview` stacked bar (`StackedBarChart`) + legend chips (status → count).
- “Recommended Next Actions” grid (task cards with score, priority, relative due date).
- “Focused task list” (two `TaskList` panels):
  - One follows the current “focus” (Blocked/Overdue/Due Soon/Active)
  - One is always “My Due Soon”.
- “Team and Project Context”:
  - 3 small stat tiles: `Stale Tasks`, `Blocked Tasks`, `Overdue Tasks`
  - Active project progress cards with progress bar (done/total and percent).

**Data inputs (API calls / hooks)**

- UI uses `useDashboardResource` (`src/components/dashboard/use-dashboard-resource.ts`)
  - `fetch("/api/dashboard/personalized")`
  - If user clicks refresh: re-fetch with `cache: "no-store"`.

**Series/statistics capture & computation**

All data is computed server-side in `GET /api/dashboard/personalized` (`src/app/api/dashboard/personalized/route.ts`) from Prisma:

- Personal lists:
  - `myActive`: `Task` where `responsible` includes current user and `status in {WORKING_ON_TODAY, ACTIVE, QUEUED}`, ordered by `dueDate`, `updatedAt`.
  - `myBlocked`: `Task` where `responsible` includes current user AND (`status=NOT_DONE` OR has any `dependsOn` not `DONE`), ordered by `updatedAt`.
  - `myOverdue`: `Task` where `responsible` includes user AND `status != DONE` AND `dueDate < now`.
  - `myDueSoon`: `Task` where `responsible` includes user AND `status != DONE` AND `now <= dueDate <= now+7d`.
- Personal throughput:
  - `myCompletedWeek`: count of `Task` where `responsible` includes user AND `status=DONE` AND `updatedAt >= now-7d`.
  - `completedByDay`: derived daily series via `buildDailyCountSeriesUtc(...)` (`src/lib/dashboard-trends`) from `Task.updatedAt` timestamps for DONE tasks in a 14-day window.
- Team risk signals:
  - `staleTasks`: count of tasks in {ACTIVE, WORKING_ON_TODAY, QUEUED} with `updatedAt < now-5d`
  - `blockedTasks`: count of tasks with `status=NOT_DONE` (note: team “blocked” is defined differently from per-task dependency blocking)
  - `overdueTasks`: count of tasks with `status != DONE` and `dueDate < now`
  - `taskStatusOverview`: `Task.groupBy(status)._count`
  - `taskTotal`: sum of the grouped status counts (computed client-side from `taskStatusOverview`).
- Project progress cards:
  - `activeProjects`: `Project` where `status=ACTIVE`, includes tasks with statuses; progress is `round(done/total*100)`.
- Recommendation scoring:
  - `recommendations` are built from the union of the “personal lists” (overdue/blocked/dueSoon/active), de-duplicated by task ID.
  - For each task:
    - `priorityWeight`: `P0=8`, `P1=5`, `P2=3`, `P3=1`
    - `overdueScore`: `daysOverdue(dueDate) * 2`
    - `blockedBonus`: `+5` if `status==="NOT_DONE"` (not dependency-based)
    - `dependencyBonus`: `dependedBy.length * 2`
    - `recommendationScore = priorityWeight + overdueScore + blockedBonus + dependencyBonus`
  - Sorted descending, truncated to top 12.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin (query/function) |
|---|---|---|
| KPI: My Active | `personal.myActive.length` | Prisma `task.findMany` (active statuses) |
| KPI: Completed (7d) + sparkline | `personal.myCompletedWeek`, `personal.completedByDay[].count` | Prisma `task.count` + `buildDailyCountSeriesUtc` |
| Donut: My Workload | list lengths (`myBlocked/myOverdue/myDueSoon/myActive`) | server lists + client aggregation |
| StackedBar: Team Status Overview | `team.taskStatusOverview` | Prisma `task.groupBy({by:["status"]})` |
| Recommended Next Actions | `personal.recommendations[]` | server scoring + sort |
| Project progress cards | `projects.active[]` | Prisma `project.findMany` + done/total calc |

**Freshness / caching / failure modes**

- Server sets `Cache-Control: private, max-age=30, stale-while-revalidate=120`.
- Client additionally caches in `sessionStorage` via `useDashboardResource`.
- On refresh failure:
  - if cached data exists: UI shows stale banner (`resource.stale=true`) and continues rendering cached payload
  - if no cached data: UI shows empty state / error banner.

---

### `/today` (Standup + “Working on Today” board)

**Purpose**

- Provide a daily operational “today view” with two modes:
  - Standup cockpit (flow coaching + owner grouping)
  - A focused board view restricted to `WORKING_ON_TODAY` and `ACTIVE` tasks

**Visualizations (exhaustive list)**

- Header with mode toggle (Standup vs Board).
- Standup mode (`StandupView`):
  - Top bar with timer (start/pause), facilitator mode toggles, owner focusing controls.
  - Coaching prompts panel (severity-labeled messages).
  - WIP state panels (per-column count/limit, exceeded status).
  - Grouped task lists:
    - tasks by owner (including unassigned)
    - blocked tasks
    - stale tasks
  - Per-task action controls:
    - Defer (PATCH task status to BACKLOG)
    - Advance (POST advance in status flow)
    - Split (currently informational toast)
  - Expand/collapse task details (dependencies).
- Board mode (`KanbanBoard`) with `filterByStatus={["WORKING_ON_TODAY","ACTIVE"]}`:
  - Drag-and-drop columns, WIP limit badges, filters, task modal.

**Data inputs (API calls / hooks)**

- Standup mode:
  - `GET /api/standup`
  - Action calls:
    - `PATCH /api/tasks/:id` with `{status:"BACKLOG"}` (defer)
    - `POST /api/tasks/:id/advance` (advance)
- Board mode:
  - Same inputs as `/tasks` Kanban:
    - `GET /api/tasks?status=...` (via `KanbanBoard` filters; implemented as multiple query params)
    - plus `GET /api/board-settings`, `/api/team`, `/api/projects`, `/api/sprints`, `/api/departments`
    - optional `GET /api/sprints/:id/report` for commitment badges

**Series/statistics capture & computation**

Standup data is computed server-side in `GET /api/standup` (`src/app/api/standup/route.ts`):

- Active task set: all tasks with `status in {QUEUED, WORKING_ON_TODAY, ACTIVE, NOT_DONE}` with includes:
  - `project`, `responsible`, `dependsOn`, `dependedBy`.
- `blocked`: tasks where any `dependsOn.status != DONE` (dependency-based definition).
- `stale`: tasks where `updatedAt < now - 3 days`.
- Grouping:
  - Builds owner groups for each responsible user and computes:
    - `wipCount`: count of tasks in `WORKING_ON_TODAY` or `ACTIVE`
    - `blockedCount`: count of blocked tasks
    - `staleCount`: count of stale tasks
  - `unassigned`: tasks with `responsible.length===0`.
- Column WIP state:
  - Loads policies via `loadPolicies()` (reads `WipPolicy` records).
  - Counts tasks by status (`task.groupBy(status)`).
  - Builds `wipState[]` entries: `{column, count, limit, exceeded}`.
- Coaching prompts:
  - Per-owner prompts:
    - `finish_before_start`: if `wipCount > 2` (hardcoded personal WIP heuristic)
    - `blocked_alert`: if `blockedCount > 0`
  - Global prompts:
    - `wip_exceeded`: any policy column exceeded
    - `stale_warning`: if any stale tasks exist

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin (query/function) |
|---|---|---|
| Owner cards | `owners[]` | Group active tasks by `Task.responsible[]` |
| Blocked list | `blocked[]` | Dependency check on `Task.dependsOn[]` |
| Stale list | `stale[]` | `Task.updatedAt < now-3d` |
| Column WIP | `wipState[]` | `loadPolicies()` + `task.groupBy(status)` |
| Coaching prompts | `coachingPrompts[]` | heuristic rules in `/api/standup` |

**Freshness / caching / failure modes**

- `StandupView` has client-side loading/error states; no snapshot caching.
- Standup actions re-fetch `/api/standup` after completion to refresh derived coaching.
- Dependency on policy tables:
  - If `loadPolicies()` returns empty, `wipState` may not include expected columns; UI will display fewer WIP tiles.

---

### `/tasks` (Unified Tasks Workspace)

**Purpose**

- Provide a single “tasks hub” supporting:
  - Kanban board view (drag/drop, WIP policies, grouping, filtering)
  - Table view (sortable, quick-open modal)
  - Split view (board + table)
  - Saved views (user-defined) and built-in views (my work / today focus / audit)

**Visualizations (exhaustive list)**

- Header + saved view selector + “Save Current as View” modal.
- Layout toggle buttons:
  - Kanban, Table, Split.
- Main workspace:
  - Kanban view: `KanbanBoard`
  - Table view: `TaskTableView`
  - Split: both side-by-side (responsive)
- Save-view modal (name input, Save/Cancel).

Within `KanbanBoard` (major visual elements):

- Board filter bar (`BoardFilters`) including:
  - assignee, project, sprint, priority filters
  - display presets (standard/dense/triage) and metadata toggles
  - grouping mode: by status / by project / by department
- Drag & drop board (`DragDropContext`) with:
  - status columns (or project/department “generic columns” when grouping)
  - per-column WIP badge (from board settings)
  - per-task cards with metadata (priority/due/project/assignees)
- Task modal (`TaskModal`) showing detailed task fields, dependencies, history, etc.
- Toast notifications + confirm dialogs for destructive/blocked actions.
- Commitment indicators:
  - active sprint highlight and “committedTaskIds” used for badges/labels.

Within `TaskTableView`:

- Table with sortable headers: Title, Status, Priority, Project, Due Date, (Assignee).
- Row hover styling + click to open `TaskModal`.
- Empty state when there are no tasks.

**Data inputs (API calls / hooks)**

Saved views:

- `GET /api/views?scope=tasks`
- `POST /api/views` to create saved view
- `PATCH /api/views/:id` to set default (`{isDefault:true}`) or update metadata/config

Kanban board data bundle (`KanbanBoard`):

- `GET /api/tasks` with optional query params (constructed via `URLSearchParams`):
  - `assignee=<userId>` (from built-in view or filter)
  - `project=<projectId>`
  - `priority=<P0|P1|P2|P3>`
  - `sprint=<sprintId>`
  - (Status filtering is applied client-side by selecting which columns to render; `/today` passes `filterByStatus` which affects column list, but tasks fetched are still filtered by query params, not by status.)
- `GET /api/board-settings`
- `GET /api/team`
- `GET /api/projects`
- `GET /api/sprints`
- `GET /api/departments`
- If an active sprint exists: `GET /api/sprints/:id/report` (to extract `commitmentSnapshot.committedTaskIds`)

Mutations used by board interactions:

- `PATCH /api/tasks/reorder` (batch columnOrder + status updates; includes optimistic locking via `expectedUpdatedAt`)
- `PATCH /api/tasks/:id` (edit fields/status/deps/RACI, with WIP enforcement and optimistic locking)
- `POST /api/tasks/:id/advance` (status forward)
- `POST /api/tasks/:id/retreat` (status backward)
- `POST /api/tasks` (create task)
- `DELETE /api/tasks/:id` (delete)

Table view data:

- `GET /api/tasks?assignee=<userId>` (table applies `statusFilter` client-side)

**Series/statistics capture & computation**

Core task list:

- `GET /api/tasks` (`src/app/api/tasks/route.ts`) builds a Prisma `where` from query params:
  - `status`, `assignee`, `project`, `sprint`, `priority`
  - Returns tasks including project, sprint, parent, and RACI role users.
  - Sort: `columnOrder asc`, then `createdAt desc`.

Task modal / single task:

- `GET /api/tasks/:id` includes:
  - parent/children, dependency graph, status history, logbook entries, and RACI roles.

Status transitions and WIP policy enforcement:

- `PATCH /api/tasks/:id` and `POST /api/tasks/:id/advance|retreat` enforce WIP via:
  - `getUserRole()` + `enforcePolicy(...)` (`src/lib/policy-check.ts`)
  - `checkWipPolicy(...)` pure logic (`src/lib/policy-engine.ts`)
  - In `BLOCK` mode with override roles, client must supply `overrideReason` and server records `PolicyOverride`.
- Transitions are audited:
  - A `StatusHistory` row is inserted whenever status changes.
- “Done” writes logbook:
  - When moving into `DONE`, the API creates a `LogbookEntry` snapshot with task and contextual metadata.

Ordering:

- New tasks get `columnOrder = getNextColumnOrder(...)` (effectively “append to end of column”).
- After transitions/reorders, `compactColumns(...)` normalizes columnOrder to `0..n-1`.
- Reorder supports optimistic concurrency:
  - each reorder item may include `expectedUpdatedAt` and server returns `409 Conflict` if mismatched.

Saved views:

- Backed by `UserSavedView` table with `config` JSON.
- Default view selection uses `setDefaultSavedView` (see `src/lib/saved-views`).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin (query/function) |
|---|---|---|
| Saved views dropdown | array of views | `GET /api/views?scope=tasks` → `UserSavedView` |
| Board columns + cards | tasks list + groupings | `GET /api/tasks` → `Task.findMany` |
| WIP badges/limits | `board-settings` | `GET /api/board-settings` → `BoardSettings.findMany` |
| Sprint commitments badge | `committedTaskIds` | `GET /api/sprints/:id/report` → sprint ledger |
| Table rows | tasks list | `GET /api/tasks` + client sorting |
| Task modal (history/logbook) | `statusHistory`, `logbookEntries` | `GET /api/tasks/:id` |

**Freshness / caching / failure modes**

- Saved views and board/table data use sessionStorage caching (either via `useDashboardResource` or local `readSessionCache` patterns).
- If `/api/board-settings` fails, WIP limits fall back to defaults (client initializes defaults; columns still render).
- If WIP enforcement blocks a move:
  - API returns `409` with a `policy` object; UI should surface confirm/override flows (board implements confirm + toast patterns).
- If optimistic locking fails:
  - API returns `409 Conflict` with `STALE_VERSION`; UI must refresh and retry.

---

### `/projects` (Projects Dashboard)

**Purpose**

- Provide a multi-view browse/filter interface for projects, with saved views and department swimlanes.

**Visualizations (exhaustive list)**

- Header with refresh and “New Project” (routes user to settings projects tab).
- Stale banner + error banners.
- KPI strip (4 cards): Total, Active, Completed, On Hold.
- Controls row:
  - Search input
  - Saved views dropdown + “Save View” modal
  - Status filter dropdown
  - Department filter dropdown
  - View mode toggle: Grid / Swimlane / List
- Main project listing:
  - Grid: `ProjectCard` tiles
  - Swimlane: grouped by department, each lane contains `ProjectCard` tiles
  - List: HTML table (project/status/department/task count/updated)
- Save view modal (name input, Escape to close).

**Data inputs (API calls / hooks)**

Loaded as a bundle via `useDashboardResource`:

- `GET /api/projects?meta=true`
- `GET /api/departments`
- `GET /api/views?scope=projects`

Saved view mutations:

- `POST /api/views` (scope=projects)

**Series/statistics capture & computation**

- `GET /api/projects` includes:
  - department + companyPriority + RACI roles
  - `_count.tasks`
  - `tasks: {select:{status}}` used to compute `taskStatusCounts` server-side.
- KPI counts are computed client-side from the returned project list (counts by status).
- Swimlanes: computed client-side by grouping `projects` by `departmentId`.
- Saved view “defaults”:
  - View config supports `defaultLayout`, `filterStatus`, `filterDepartment` (see `resolveViewDefaults` in `project-dashboard.tsx`).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin (query/function) |
|---|---|---|
| KPI: Active/Completed/etc | derived counts | client filter on `/api/projects` result |
| Grid/list/swimlane | `projects[]`, `departments[]` | `/api/projects`, `/api/departments` |
| Saved views | `savedViews[]` | `/api/views?scope=projects` |

**Freshness / caching / failure modes**

- Client uses `useDashboardResource` caching and stale banners.
- If views fail to load, the page still renders projects but saved view behavior degrades (see error banners).

---

### `/projects/[id]` (Project Detail)

**Purpose**

- Provide a project “detail cockpit” with:
  - inline editing of project fields,
  - RACI assignments,
  - task distribution and project task list,
  - sub-project navigation.

**Visualizations (exhaustive list)**

- Breadcrumb/back button to `/projects`.
- Inline editable fields:
  - Name, description, status, type, department, company priority, business function (based on rendered controls).
- Saving indicator (small “Saving…” with pulsing dot).
- Metrics row (5 cards): Total Tasks, Completed, Progress %, Blocked, Overdue.
- Task Distribution:
  - Horizontal stacked distribution bar (one segment per status; clickable legend buttons to filter task list by status).
- RACI panel (“Team (RACI)”):
  - Chips per role (Sponsor/Responsible/Accountable/Consulted/Informed) with remove controls
  - Add-user picker dropdown per role.
- Tasks list:
  - List of tasks with status dot, title, priority badge, status label.
  - Filter by clicked status from distribution legend.
- Sub-Projects list (if any):
  - Buttons to navigate to child projects, with status dot and label.

**Data inputs (API calls / hooks)**

- Core project payload:
  - `GET /api/projects/:id`
  - `PATCH /api/projects/:id` for edits
- Reference data for pickers:
  - `GET /api/departments`
  - `GET /api/priorities`
  - `GET /api/team`

**Series/statistics capture & computation**

Server-side:

- `/api/projects/:id` returns:
  - project + department + companyPriority + RACI + parent/children
  - `tasks[]` (includes responsible/accountable) ordered by createdAt desc
  - computed `taskStatusCounts` built by iterating tasks and counting by `Task.status`.

Client-side metrics in `ProjectDetail`:

- `metrics.total`: sum of `taskStatusCounts`
- `metrics.done`: `taskStatusCounts["DONE"]`
- `metrics.blocked`: `taskStatusCounts["NOT_DONE"]` (note: “blocked” here equals NOT_DONE status, not dependency-based)
- `metrics.overdue`: count of `tasks` where `dueDate < now` and `status != DONE`
- `metrics.pct`: round(done/total*100)

Task distribution bar:

- Each segment width: `(count / metrics.total) * 100`
- Tooltip/title: status label + count (uses `COLUMN_LABELS`).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin (query/function) |
|---|---|---|
| Metrics row | `taskStatusCounts`, `tasks[].dueDate` | `/api/projects/:id` + client aggregation |
| Task Distribution | `taskStatusCounts` | `/api/projects/:id` |
| RACI chips | `project.sponsor/responsible/...` | `/api/projects/:id` and PATCH updates |
| Tasks list | `project.tasks[]` | `/api/projects/:id` |
| Sub-projects | `project.children[]` | `/api/projects/:id` |

**Freshness / caching / failure modes**

- Uses sessionStorage caching via `readSessionCache`/`writeSessionCache` (per projectId key).
- Inline edits call `PATCH` then re-fetch `GET /api/projects/:id`; failures show toast-like notifications and preserve UI state.

---

### `/deals` (Deals Dashboard)

**Purpose**

- Provide a pipeline dashboard for deals, including:
  - pipeline (stage columns),
  - table view,
  - filters,
  - creation and meeting capture modals,
  - HubSpot sync trigger.

**Visualizations (exhaustive list)**

- Header with:
  - link to `/deals/analytics`
  - “Sync from HubSpot” button
  - “New Deal” button (opens `DealCreateModal`)
- Stale banner + error banner.
- View toggle:
  - Pipeline view (stage columns)
  - Table view (DataTable)
- Filters:
  - stage dropdown, owner dropdown, min/max amount, query text.
- Pipeline view:
  - Four open-stage columns: LEAD, QUALIFIED, PROPOSAL, NEGOTIATION
  - each contains `DealCard` items.
- Table view:
  - `DataTable` columns: Deal, Company, Stage, Amount, Owner, Meetings
- Modals:
  - Deal create modal (`DealCreateModal`)
  - Meeting modal (`DealMeetingModal`) (opened from deal interactions)

**Data inputs (API calls / hooks)**

- Primary data:
  - `GET /api/deals` (loaded via `useDashboardResource`)
- Optional sync:
  - `POST /api/deals/sync` (HubSpot sync)
- Navigation to detail:
  - `/deals/:id` (separate screen)

**Series/statistics capture & computation**

Server-side list (`GET /api/deals`, `src/app/api/deals/route.ts`):

- Supports query params (not all are used by the UI; UI mostly filters client-side):
  - `stage`, `ownerId`, `minAmount`, `maxAmount`, `search`
- Includes:
  - `company`, `owner`, `contacts`, `_count.meetings`, `_count.contacts`
  - fetches latest meeting date via `meetings: take 1 orderBy startAt desc`
- Enriches response:
  - `lastMeetingAt = meetings[0]?.startAt` and removes `meetings` array in the list response.

Pipeline columns:

- Computed client-side by filtering list items by `Deal.stage` for the open stages.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin (query/function) |
|---|---|---|
| Pipeline columns | `DealListItem.stage` | `/api/deals` |
| DealCard contents | deal name/company/amount/owner/lastMeetingAt | `/api/deals` includes relations + enrichment |
| Table view | same list | `/api/deals` + `DataTable` renderers |
| HubSpot sync | sync result (not directly visualized) | `/api/deals/sync` → `syncDealsFromHubSpot` |

**Freshness / caching / failure modes**

- Uses `useDashboardResource` caching.
- Sync failure is non-fatal; UI simply stops showing the spinner and the user can refresh.
- If HubSpot isn’t configured, sync may error (surfaced as request failure).

---

### `/deals/[id]` (Deal Detail)

**Purpose**

- Provide a single-deal record view with:
  - editable core fields,
  - tabbed subviews for contacts, meetings, stage history.

**Visualizations (exhaustive list)**

- Header with back link, stage badge, and “Deals Analytics” link.
- Inline form fields:
  - name, stage, amount, source, expected close date, notes, company, owner.
- Tabs:
  - Overview: core fields + save button
  - Contacts: `DataTable` of contacts
  - Meetings: `DataTable` of meetings with status badges and attendance ratio
  - History: stage history list
- Save button with spinner/disabled state.

**Data inputs (API calls / hooks)**

- `GET /api/deals/:id`
- `PATCH /api/deals/:id` on save
- Auxiliary reference data:
  - `GET /api/team` (owner select)
  - `GET /api/deals/companies` (company select)

**Series/statistics capture & computation**

- Deal payload includes:
  - `contacts[]`, `meetings[]`, `stageHistory[]` ordered by changedAt desc.
- Stage changes:
  - `PATCH` records `DealStageHistory` row when stage changes.
  - If stage becomes terminal (`CLOSED_WON` or `CLOSED_LOST`), API sets `closedAt = now`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Contacts table | `deal.contacts[]` | `/api/deals/:id` |
| Meetings table | `deal.meetings[]` | `/api/deals/:id` |
| Stage history | `deal.stageHistory[]` | `/api/deals/:id` + writes from PATCH/POST |
| Owner/company dropdowns | `/api/team`, `/api/deals/companies` | Prisma `User`, `DealCompany` |

**Freshness / caching / failure modes**

- Deal detail does not use `useDashboardResource`; it loads directly and has local loading/error states.
- Team list is session-cached (`TEAM_CACHE_KEY`) in `sessionStorage`.

---

### `/deals/analytics` (Deals Analytics)

**Purpose**

- Provide pipeline health analytics computed purely from internal `Deal*` tables (plus meetings/history).

**Visualizations (exhaustive list)**

- Header with back link.
- KPI row (4 cards):
  - Pipeline Value, Close Rate, Avg Deal Velocity, Meetings.
- Insight cards (`InsightCard`) generated client-side from analytics payload.
- Charts:
  - Pipeline funnel (`HorizontalFunnel`) using stage totalAmount for open stages
  - Velocity trend (`AreaTrend`) showing avgDays by month
  - Meeting activity (`StackedBarChart`, single bar key `count`)
  - Close rate trend (`AreaTrend`) stacked won/lost
  - Source attribution donut (`DonutChart`)
  - Attendance donut (`DonutChart`) (attended vs no-show)
- Table:
  - Stale deals `DataTable` (dealName/company/stage/amount/days stale).

**Data inputs (API calls / hooks)**

- `GET /api/deals/analytics`

**Series/statistics capture & computation**

Computed in `src/app/api/deals/analytics/route.ts` from:

- `Deal.findMany` including:
  - `company` and most recent meeting date (`meetings take 1 startAt desc`)
- `DealMeeting.findMany` (for totals + attendance)
- `DealStageHistory.findMany` (ordered asc) (for velocity by stage)

Key computations:

- Pipeline breakdown:
  - For each `DealStage`: count + sum(amount)
  - `totalValue` and `totalDeals` consider only open stages `{LEAD, QUALIFIED, PROPOSAL, NEGOTIATION}`.
- Velocity:
  - For each deal with >=2 stage history entries:
    - `totalDays = |first.changedAt - last.changedAt|` (in days)
    - bucketed into month of last change
  - Per-stage durations:
    - For each adjacent pair: duration is time between `history[i].changedAt` and `history[i+1].changedAt` attributed to `history[i].toStage`.
  - `avgDaysPerStage` is mean duration (rounded) or 0 if no samples.
  - `avgTotalDays` is mean totalDays (rounded) or 0.
- Meetings:
  - `completed` = count where `status=COMPLETED`
  - `upcoming` = count where `status=SCHEDULED` and `startAt > now`
  - Attendance rate = `sum(actualAttendees)/sum(expectedAttendees)` (0 if denom 0).
  - By month = meeting count bucketed by `monthKey(startAt)`.
- Close rate:
  - `won` = deals stage CLOSED_WON, `lost` = CLOSED_LOST, `open` = open stage count
  - `rate = won/(won+lost)` (0 if no closed deals)
  - Trend = month-bucketed won/lost and computed per-month rate.
- Stale deals:
  - Open deals only
  - “last activity” is `max(deal.updatedAt, lastMeetingAt)` if meeting exists, else `deal.updatedAt`
  - stale if last activity < `now - 14 days`

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Funnel | `pipeline.stages[].totalAmount` | Deal aggregation by stage |
| Velocity trend | `velocity.trend[].avgDays` | StageHistory durations |
| Source donut | `sourceAttribution[].count` | Deal aggregation by source |
| Stale table | `staleDeals[]` | Deal.updatedAt + latest meeting date |

**Freshness / caching / failure modes**

- No explicit caching; page loads once via `useEffect`.
- If API returns 401/500, UI shows empty-state message.

---

### `/conferences` (Conference Dashboard)

**Purpose**

- Provide an event planning hub: upcoming/past filtering, status filtering, create conference, seed playbooks.

**Visualizations (exhaustive list)**

- Header with refresh + “New Conference”.
- Stale banner + error banner.
- Filters:
  - status dropdown
  - timing dropdown (all/upcoming/past)
  - search input (name/location)
- Conference grid:
  - `ConferenceCard` tiles (1–3 columns responsive)
- Create modal (`ConferenceCreateModal`)

**Data inputs (API calls / hooks)**

- `GET /api/conferences?meta=true`
- Create:
  - `POST /api/conferences`
- Optional seed action after creation:
  - `POST /api/conferences/:id/apply-playbook` (best-effort)

**Series/statistics capture & computation**

- List payload is `Conference.findMany` including:
  - owner and `_count` of deadlines/leads/expenses/tasks/projects.
- Upcoming/past filter uses endDate vs “lastUpdatedAt” time from meta payload.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Conference cards | `Conference` + `_count.*` | `/api/conferences` |
| Timing filter | `endDate` | client compare to `meta.servedAt` |

**Freshness / caching / failure modes**

- Uses `useDashboardResource` with stale banner support.
- If apply-playbook fails after creation, it is non-fatal and user can apply later from detail.

---

### `/conferences/[id]` (Conference Detail)

**Purpose**

- Provide a per-conference operating cockpit with:
  - overview KPIs and details
  - deadlines management
  - budget + expenses
  - leads and follow-ups
  - optional “seed playbook” action

**Visualizations (exhaustive list)**

- Header with back link + refresh controls.
- Tab bar (keyboard navigable): Overview / Deadlines / Budget / Leads.
- Overview tab:
  - Summary cards (tasks, deadlines, cost variance, leads, timing)
  - Editable conference metadata fields (inputs/selects)
  - Seed playbook call-to-action (confirm modal)
- Deadlines tab:
  - Deadline list/table with due dates, completion status, owners, and actions
- Budget tab:
  - Planned budget line items
  - Expenses list and variance display
- Leads tab:
  - Lead list/table with status badges
  - Follow-up task linkage and push-to-HubSpot statuses (where applicable)
- Confirm dialogs:
  - Seed playbook confirmation
  - Delete confirmation for objects (deadline/expense/lead depending on tab actions)

**Data inputs (API calls / hooks)**

- Main payload bundle:
  - `GET /api/conferences/:id` (returns `{conference, summary, meta}`)
- Additional actions (varies by tab):
  - `POST /api/conferences/:id/apply-playbook`
  - `GET/POST/PATCH/DELETE` routes under:
    - `src/app/api/conferences/[id]/deadlines`
    - `src/app/api/conferences/[id]/expenses`
    - `src/app/api/conferences/[id]/leads`
- Team reference:
  - `GET /api/team` (for owner/assignee selects)

**Series/statistics capture & computation**

Conference summary is computed in `computeConferenceSummary(...)` (`src/lib/conferences/summary.ts`) from:

- Task counts:
  - total/done/overdue based on conference tasks (`Task` where `conferenceId=id`) and `dueDate < now`.
- Deadline counts:
  - total/completed/overdue and `nextDueAt` among incomplete.
- Costs:
  - planned = sum(budget line item plannedAmount)
  - actual = sum(expense.amount)
  - variance = actual - planned
- Leads:
  - counts by `ConferenceLeadStatus`
  - pushedCount by `pushedToHubspotAt != null`
  - followupOpenCount by looking up linked followup task status != DONE
- Timing:
  - daysUntilStart / daysSinceEnd computed via UTC day diffs.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Summary cards | `summary.*` | `/api/conferences/:id` → `computeConferenceSummary` |
| Deadline lists | `conference.deadlines[]` | Prisma include on conference |
| Budget/expenses | `conference.budget`, `conference.expenses[]` | Prisma include + child routes |
| Leads | `conference.leads[]` | Prisma include + child routes |

**Freshness / caching / failure modes**

- Uses `useDashboardResource` with stale banner behavior.
- Team list is session-cached; if it fails, dropdowns may be empty but page still renders.

---

### `/logbook` (Completed Work Archive)

**Purpose**

- Provide an audit-friendly archive of completed tasks (“logbook entries”), with date filtering and pagination.

**Visualizations (exhaustive list)**

- Header with date range controls (start/end date inputs).
- Loading spinner, error panel with retry, and empty-state message.
- Entry list:
  - Card per logbook entry with title, notes preview, completed date, project/sprint tags, priority, owner string.
- Pagination controls: previous/next + “Page N”.

**Data inputs (API calls / hooks)**

- `GET /api/logbook?page=<n>&limit=25&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

**Series/statistics capture & computation**

Server-side (`src/app/api/logbook/route.ts`):

- Reads `LogbookEntry` ordered by `archivedAt desc`.
- Optional filter by `archivedAt` between startDate/endDate (dates are parsed as JS Date).
- Uses transaction:
  - `findMany(skip/take)` plus `count()` to compute totalPages.

Important capture rule:

- Logbook entries are created when a task transitions to `DONE`:
  - in `PATCH /api/tasks/:id`
  - in `POST /api/tasks/:id/advance`
  - (reorder/other paths may also write logbook if they move to done; see the task APIs)

The “captured statistics” here are not computed aggregates; they are stored snapshots of task fields at the time of completion.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Entry cards | `LogbookEntry.*` | Prisma `logbookEntry.findMany` |
| Pagination | `pagination.totalPages` | Prisma `count()` |

**Freshness / caching / failure modes**

- Page uses sessionStorage caching keyed by page + date filters.
- If fetch fails and cached exists, the page may display cached entries (depends on cache hit timing); otherwise shows error state.

---

### `/automations` (Workflow List + Templates + System Recipes)

**Purpose**

- Provide an “automation hub”:
  - list of user-owned and shared workflows
  - templates to create new workflows
  - “system-managed recipes” derived from `IntegrationRule` (integration automations)

**Visualizations (exhaustive list)**

- Header with:
  - link to approval inbox
  - “New Workflow” button (creates a blank draft)
- Error banner for create failures.
- Filter toolbar:
  - scope (all/private/shared)
  - status (draft/active/paused/error/archived)
  - provider (dynamic list)
  - health (healthy/needs-attention/never-run)
- Workflows list:
  - card per workflow showing name/scope/status/providers/owner, plus latest run status and error.
- Templates section (if present in payload):
  - template cards with description and “create from template”
- System-managed recipes section:
  - list derived from `IntegrationRule` (enabled vs paused; last error/run time).

**Data inputs (API calls / hooks)**

- `GET /api/automations`
- Create:
  - `POST /api/automations` with graph JSON

**Series/statistics capture & computation**

Server-side (`src/app/api/automations/route.ts`):

- Workflows:
  - `WorkflowDefinition.findMany` where owner is current user OR scope=SHARED
  - includes owner, latest run (take 1), and counts of nodes/edges/runs.
- System-managed recipes:
  - derived from `IntegrationRule.findMany(where userId=session.user.id)`
  - mapped into synthetic recipe objects (id=`rule-<id>`, status from enabled).
- Templates:
  - `AUTOMATION_TEMPLATES` static list (`src/lib/automations/templates`).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Workflow list | `workflows[]` | Prisma `workflowDefinition.findMany` |
| Latest run status | `workflow.runs[0]` | Prisma include `runs take 1 orderBy createdAt desc` |
| System recipes | `systemManagedRecipes[]` | Prisma `integrationRule.findMany` mapped to list |

**Freshness / caching / failure modes**

- Page session-caches the entire `/api/automations` payload.
- If `/api/automations` errors, list will show cached data if present; otherwise error state.

---

### `/automations/approvals` (Approval Inbox)

**Purpose**

- Provide an “approval queue” for workflow steps requiring manual decision.

**Visualizations (exhaustive list)**

- Header + back link.
- Error banner.
- Filter controls:
  - search by workflow name / nodeKey
  - status filter (pending/approved/rejected)
  - sort order (newest/oldest)
- Approvals list:
  - card per approval with workflow name, nodeKey, timeoutAt, requester
  - action buttons:
    - Open workflow
    - Reject (opens notes textarea)
    - Approve (opens notes textarea)
- Notes modal/inline textarea UI for approve/reject reason.

**Data inputs (API calls / hooks)**

- `GET /api/automations/approvals`
- Decisions:
  - `POST /api/automations/approvals/:approvalId/approve` with optional `{note}`
  - `POST /api/automations/approvals/:approvalId/reject` with optional `{note}`

**Series/statistics capture & computation**

Server-side inbox filter (`src/app/api/automations/approvals/route.ts`):

- Always fetches `WorkflowApproval` rows where `status=PENDING`.
- Behavior depends on app role:
  - For admins: approvals assigned to them OR unassigned
  - For non-admins: approvals assigned to them
- Ordered by `timeoutAt` then `createdAt`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Approval cards | `WorkflowApproval` + `run.workflow` + `requestedBy` | Prisma `workflowApproval.findMany(include run.workflow, requestedBy)` |

**Freshness / caching / failure modes**

- Session-cached approvals list.
- Decision POST failures show an error banner and keep the item in list until refresh.

---

### `/automations/[id]` (Workflow Builder / DAG Editor)

**Purpose**

- Provide an interactive workflow graph editor:
  - edit workflow metadata (name/description/scope/providers),
  - edit nodes/edges,
  - validate graph,
  - save, publish, and test-run.

**Visualizations (exhaustive list)**

- Header with navigation (back to /automations), save/publish/test actions.
- Graph validation status (from `validateWorkflowGraph`).
- Canvas-like node list UI:
  - list of nodes with type/label
  - selection highlight
  - inline editing of node label/config fields
  - add node, add edge, delete node confirm
- Providers list display (derived from workflow definition).
- Save message “Saved / Publish failed / etc.”

**Data inputs (API calls / hooks)**

- `GET /api/automations/:id`
- `PATCH /api/automations/:id` (save)
- `POST /api/automations/:id/publish`
- `POST /api/automations/:id/test-run` (manual event)
- Navigation to run history:
  - `/automations/:id/runs`

**Series/statistics capture & computation**

- Graph validation is client-side:
  - `validateWorkflowGraph(...)` (`src/lib/automations/graph`) checks structural validity.
- Server-side save/publish:
  - `PATCH` updates workflow definition, then `syncWorkflowGraphRecords(...)` persists nodes/edges tables.
  - Publish transitions workflow status and may validate role policy and providers (see `src/lib/automations/service`).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Node list | `workflow.nodes[]`, `workflow.edges[]` | `/api/automations/:id` |
| Validation status | derived | `validateWorkflowGraph` |
| Save/publish | status message | API response status codes |

**Freshness / caching / failure modes**

- Session-caches workflow detail payload.
- Save failures show `saveMessage` and do not mutate cached graph; user can retry.

---

### `/automations/[id]/runs` (Workflow Run History)

**Purpose**

- Provide execution traces per workflow: run status, steps, approvals.

**Visualizations (exhaustive list)**

- Header + back link.
- Status filter dropdown.
- Error banner (retry).
- Run cards:
  - run id prefix
  - status icon + label (succeeded/failed/running/pending/paused)
  - created timestamp and run error string (if any)
  - “Steps” list (nodeKey/nodeType/status/error)
  - “Approvals” list (nodeKey/status/timeoutAt)

**Data inputs (API calls / hooks)**

- `GET /api/automations/:id/runs`

**Series/statistics capture & computation**

- No derived series; the page renders run records as returned.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Run cards | `WorkflowRun.*` | `/api/automations/:id/runs` (Prisma reads) |
| Steps | `run.steps[]` | `WorkflowRunStep` |
| Approvals | `run.approvals[]` | `WorkflowApproval` |

**Freshness / caching / failure modes**

- Session-cached run history payload.
- If the API fails, page shows error banner; cached results may still show depending on cache hit.

---

### `/settings` (Tabbed Settings Hub)

**Purpose**

- Provide a unified configuration UI for:
  - board settings and WIP limits,
  - sprints,
  - projects/departments/priorities,
  - team members and invites,
  - integrations and sync,
  - operations/observability.

**Visualizations (exhaustive list)**

- Header.
- Tab bar (keyboard navigable with ArrowLeft/ArrowRight/Home/End).
- Tab content (varies):
  - Board & WIP Limits: list of columns with WIP limits and save/apply behavior
  - Sprints: sprint list + create/edit
  - Projects: project create/edit tool (admin)
  - Departments: department list + create/edit/delete
  - Company Priorities: priority list + create/edit
  - Team: team member list + invite flow + profile updates
  - Integrations: provider connection status cards + connect/disconnect + token forms + sync actions
  - Operations: observability summary (outbox + integration failures)

**Data inputs (API calls / hooks)**

Representative APIs per tab (non-exhaustive; see `src/components/settings/*`):

- Board:
  - `GET /api/board-settings`
  - `PUT /api/board-settings`
- Sprints:
  - `GET /api/sprints`
  - `POST /api/sprints`, `PATCH /api/sprints/:id`
- Departments:
  - `GET /api/departments`
  - `POST /api/departments`, `PATCH /api/departments/:id`, `DELETE /api/departments/:id`
- Priorities:
  - `GET /api/priorities`
  - `POST /api/priorities`, `PATCH /api/priorities/:id`
- Team:
  - `GET /api/team`
  - `POST /api/team/invite`
  - `PATCH /api/profile`
- Integrations:
  - `GET /api/integrations`
  - provider-specific connect/sync endpoints (e.g. `/api/integrations/hubspot/sync`, `/api/integrations/coda/token`, etc.)
- Operations:
  - `GET /api/ops/observability`

**Series/statistics capture & computation**

- Primarily CRUD surfaces for configuration tables; most “stats” are direct counts/fields from DB.
- Board tab writes security audit events on update (`recordSecurityAuditEvent` in `src/app/api/board-settings/route.ts`).

**Data sources → surfaced fields mapping**

| UI element | Data | Origin |
|---|---|---|
| WIP limits | `BoardSettings` / `WipPolicy` | `/api/board-settings` + policy tables |
| Integration statuses | `IntegrationConnection` | `/api/integrations` |
| Observability | `OutboxEvent` rollups | `/api/ops/observability` |

**Freshness / caching / failure modes**

- Integrations tab forces `cache: "no-store"` in several fetches to avoid stale token display.
- Many settings calls require elevated permissions; permission errors should be handled as 403/deniedResponse.

---

### `/standup` (Standup Cockpit — Demo-only)

**Purpose**

- Provide a demo standup cockpit UX (timer + coaching + Slack formatting) that is not wired to the real backend.

**Visualizations (exhaustive list)**

- Header + facilitator mode toggle.
- Keyboard shortcut legend (N/P/D/S).
- Standup timer component (`StandupTimer`).
- Coaching prompts panel (`FlowCoachingPromptPanel`).
- Member cards (`StandupMemberCard`) grouped by demo owner groups.
- Standup summary metrics panel (`StandupSummary`) and generated Slack message + copy-to-clipboard.

**Data inputs (API calls / hooks)**

- None. This screen uses static demo arrays:
  - `DEMO_MEMBERS`, `DEMO_TASKS` in `src/app/(dashboard)/standup/page.tsx`
- Computation uses pure helpers in `src/lib/standup-engine.ts`:
  - `groupTasksByOwner`, `generateCoachingPrompts`, `calculateStandupMetrics`, `formatStandupForSlack`.

**Series/statistics capture & computation**

- All stats are computed in-memory:
  - WIP checks are based on `DEFAULT_COACHING_CONFIG` (perMember=3, team=12).
  - “aging tasks” and “blocked too long” use thresholds (aging=5 days, blocked=2 days).
  - Standup metrics (duration, avg seconds per member, tasks discussed, etc.) computed from timer start/stop.

**Data sources → surfaced fields mapping**

| UI element | Data | Origin |
|---|---|---|
| Coaching prompts | derived prompts | `generateCoachingPrompts(DEMO_TASKS, DEMO_MEMBERS, DEFAULT_COACHING_CONFIG)` |
| Slack output | formatted string | `formatStandupForSlack(...)` |

**Freshness / caching / failure modes**

- No server dependencies; only browser runtime concerns (e.g. clipboard API availability).
- This screen must be treated as demo-only when interpreting metrics.

---

### `/whip` (Scope Creep + WIP Pressure)

**Purpose**

- Provide a standup triage cockpit focused on:
  - sprint scope creep (planned vs unplanned),
  - daily scope change timeline,
  - WIP pressure per assignee,
  - quick actions for unplanned work,
  - retro export.

**Visualizations (exhaustive list)**

- Header (active sprint label).
- Error banner with Retry/Dismiss.
- Filter bar (`WhipFilterBar`):
  - sprint selector (auto-select active)
  - priority filter
  - owner filter
- Loading skeletons.
- Scope creep summary cards (`ScopeCreepSummary`):
  - planned tasks, unplanned tasks, creep ratio %, sprint completion %
  - creep percent severity styling:
    - warning when >15%
    - danger when >30%
- Scope timeline (`ScopeTimeline`):
  - CSS stacked bars (planned vs unplanned cumulative totals by day)
  - done indicator dot
  - day-added indicator
  - hover tooltip per day
  - “Unplanned Additions” list (most recent 15)
- WIP pressure heatmap (`WipPressureHeatmap`):
  - grid of pressure cells with severity coloring
  - mini pressure bar per person
  - summary: overloaded count + avg pressure
- Quick actions panel (`QuickActionsPanel`):
  - list of unplanned tasks (not done), prioritized for triage
  - per-row buttons: Defer / De-scope (confirm modal)
  - success/failure badges per action
- Retro export (`RetroExport`) (exports sprintData/riskReport/tasks into a retrospective format).

**Data inputs (API calls / hooks)**

From `useWhipData()` (`src/components/whip/use-whip-data.ts`):

- `GET /api/sprints` (auto-select active sprint)
- `GET /api/sprints/:id/planned-vs-unplanned`
- `GET /api/tasks?sprint=:id&priority=:P?&assignee=:userId?`
- `GET /api/flow/risk`
- Quick action mutation:
  - `PATCH /api/tasks/:id` (e.g. `{status:"BACKLOG"}` or `{status:"BACKLOG", sprintId:null}`)

**Series/statistics capture & computation**

Planned vs unplanned computation:

- `/api/sprints/:id/planned-vs-unplanned` calls `computePlannedVsUnplanned(sprintId)` (`src/lib/sprint-ledger.ts`).
- Commitment snapshot:
  - uses earliest `SprintCommitment` snapshot (`findFirst orderBy snapshotAt asc`) to define `committedTaskIds`.
- Categorization:
  - planned = committed AND NOT explicitly marked `unplanned`
  - unplanned = not committed OR explicitly `unplanned`
- Daily deltas:
  - for each UTC day in sprint range:
    - cumulative planned/unplanned totals and done counts
    - “additions” list for unplanned tasks created on that day
  - `byReason` breakdown counts `unplannedReason ?? "UNSPECIFIED"`.

WIP pressure computation:

- `GET /api/flow/risk` computes `FlowRiskIntelligenceReport` (`src/lib/flow/risk-intelligence.ts`).
- Person pressure:
  - counts tasks in WIP statuses `{QUEUED, WORKING_ON_TODAY, ACTIVE, NOT_DONE}` grouped by responsible user (or “unassigned”).
  - `pressureRatio = activeTaskCount / wipLimit` (wipLimit defaults to config `personWipLimit`, default 2)
  - `pressureScore = min(200, pressureRatio*100)`
  - `overloaded = activeTaskCount > wipLimit`

Quick action eligibility:

- candidate tasks = tasks where `unplanned=true` and `status != DONE`
- sorted by priority (lowest first; P3 first) to suggest de-scope candidates.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Scope cards | `plannedVsUnplanned.summary.*` | `computePlannedVsUnplanned` |
| Timeline bars | `plannedVsUnplanned.dailyDeltas[]` | `buildDailyDeltas(...)` |
| Heatmap cells | `riskReport.wipPressure.people[]` | `computePersonWipPressure(...)` |
| Quick actions list | `tasks[]` filtered to unplanned | `/api/tasks` + client filter |

**Freshness / caching / failure modes**

- `useWhipData` is direct-fetch (no `useDashboardResource`); it has local `error` and `retryKey`.
- If risk endpoint fails, heatmap renders as skeleton/empty, but scope data can still render.

---

### `/board` (Legacy redirect-only)

**Purpose**

- Preserve old route; redirect to `/dashboard`.

**Visualizations (exhaustive list)**

- None (redirect).

**Data inputs (API calls / hooks)**

- None.

**Series/statistics capture & computation**

- None.

**Data sources → surfaced fields mapping**

- N/A.

**Freshness / caching / failure modes**

- Redirect is server-side via `redirect("/dashboard")`.

---

### `/table` (Legacy redirect-only)

**Purpose**

- Preserve old route; redirect to `/tasks?view=table-audit`.

**Visualizations (exhaustive list)**

- None (redirect).

**Data inputs (API calls / hooks)**

- None.

**Series/statistics capture & computation**

- None.

**Data sources → surfaced fields mapping**

- N/A.

**Freshness / caching / failure modes**

- Redirect is server-side via `redirect("/tasks?view=table-audit")`.

---

### `/my-tasks` (Legacy redirect-only)

**Purpose**

- Preserve old route; redirect to `/tasks?view=my-work`.

**Visualizations (exhaustive list)**

- None (redirect).

**Data inputs (API calls / hooks)**

- None.

**Series/statistics capture & computation**

- None.

**Data sources → surfaced fields mapping**

- N/A.

**Freshness / caching / failure modes**

- Redirect is server-side via `redirect("/tasks?view=my-work")`.

---

### `/analytics` (Analytics Summary / Overview)

**Purpose**

- Provide a high-level analytics overview:
  - section connectivity/health,
  - cross-domain highlights,
  - lifecycle funnel panel,
  - AI insights preview,
  - links into each analytics section.

**Visualizations (exhaustive list)**

- Header:
  - time range controls (`AnalyticsTimeRangeControls`)
  - “Refresh now” button
  - last updated timestamp
- Stale banner and error banner based on meta + stale domains.
- Highlights KPI cards (Total Tasks, Overdue Tasks, Active Projects, Active Contributors, Discipline Coverage).
- Section health grid:
  - each primary section row shows status icon (connected/partial/degraded/missing),
  - list of child integrations with last snapshot and lastError diagnostics.
- Lifecycle funnel panel (`LifecycleFunnelPanel`) (derived domain).
- AI insights panel (`AiInsightsPanel`) (derived domain).
- Cross-domain insights panel (`CrossDomainInsightsPanel`) (currently passed `data={null}` placeholder in this page).
- CSV export buttons:
  - “Export highlights” and “Export sections” which create CSV downloads client-side.

**Data inputs (API calls / hooks)**

Loaded via `useDashboardResource` with cacheKey `analytics:summary:v1:<rangeQuery>`:

- `GET /api/analytics/summary` (with time range query; plus `refresh=true` if user forces refresh)
- `GET /api/analytics?section=overview` (same time range; plus `refresh=true` if forced)

**Series/statistics capture & computation**

Summary health (`/api/analytics/summary`, `src/app/api/analytics/summary/route.ts`):

- Highlights:
  - `totalTasks`: `Task.groupBy(status)` sum of counts
  - `overdueTasks`: count `Task` where `status != DONE` and `dueDate < to`
  - `activeProjects`: count `Project` where status ACTIVE
  - `activeContributors`: distinct `StatusHistory.changedBy` in range
  - `disciplineCoverage`: percent of primary sections not “missing”
- Connectivity:
  - Reads credentials via `getCredentials(userId)` and maps each domain to “configured” boolean.
  - Reads latest `AnalyticsSnapshot` records for provider keys and determines stale/error state.
  - Derives child status via `deriveDomainSectionStatus(...)` and aggregates to primary status.

Overview data (`/api/analytics?section=overview`) uses the full analytics pipeline:

- Reads snapshots, refreshes stale in background, computes derived domains:
  - lifecycle funnel (`buildLifecycleFunnelData`)
  - cross funnel (`buildCrossFunnelData`)
  - ai insights (`buildAiInsightsBundle`)
  - distilled insights (`buildDistilledInsights`)
  - KPIs (`computeAnalyticsKpis`)

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Highlights | `summary.highlights.*` | `/api/analytics/summary` Prisma queries |
| Section health | `summary.primarySections[]` | credentials + `AnalyticsSnapshot` latest status |
| Funnel panel | `overview.lifecycleFunnel` | derived builder `buildLifecycleFunnelData` |
| AI panel | `overview.aiInsights` | derived builder `buildAiInsightsBundle` |

**Freshness / caching / failure modes**

- `/api/analytics/summary` sets `Cache-Control: private, max-age=30, stale-while-revalidate=120`.
- `/api/analytics` similarly caches unless `refresh=true`.
- If one provider fails:
  - summary may still show “configured but failing”
  - overview may include `errors[]` and `staleDomains[]`, and UI surfaces stale banners and per-section degraded states.

Known gap:

- `CrossDomainInsightsPanel` is rendered with `data={null}` in this page, so it currently functions as a placeholder/empty view.

---

### `/analytics/[section]` (Analytics Section Dispatcher / Router)

**Purpose**

- Provide a canonical route that:
  - redirects legacy section slugs to canonical section IDs
  - validates the section ID exists in registry
  - renders `AnalyticsSectionPage` to display the requested analytics screen

**Visualizations (exhaustive list)**

- This file itself renders only the `AnalyticsSectionPage` output; its “visualizations” are those of the resolved analytics screen (documented below per section ID).

**Data inputs (API calls / hooks)**

- Redirect mapping:
  - `LEGACY_ANALYTICS_ROUTE_REDIRECTS` in `src/lib/analytics/section-registry.ts`.
- Registry validation:
  - `getAnalyticsPrimarySectionById` / `getAnalyticsSubSectionById`.
- After validation:
  - `AnalyticsSectionPage` loads either:
    - `/api/analytics?section=<sectionId>` (most sections), or
    - dedicated endpoints for ops subsections (decision dashboard / flow metrics / flow risk / observability).

**Series/statistics capture & computation**

- Routing-only; no computation besides redirect and notFound checks.

**Data sources → surfaced fields mapping**

- N/A (delegated).

**Freshness / caching / failure modes**

- Invalid section ID yields `notFound()`.
- Legacy route ID yields `redirect(target)`.

---

### `/analytics/ai-insights` (AI Insights Feed)

**Purpose**

- Provide a filterable, sortable feed of AI insights derived from the full analytics overview payload.

**Visualizations (exhaustive list)**

- KPI strip (4 `StatCard`s): Critical, Warnings, Info, Avg Confidence.
- Filter controls:
  - severity (all/critical/warning/info)
  - section (all/ads/finance/sales/cs)
  - sort mode (severity/confidence)
- Insight cards (full content): `InsightCardFull` for each insight.
- Error panel with retry, loading state.

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=overview`
  - result is cached in `sessionStorage` key `analytics:overview` (also re-used across other analytics pages).
- Local derived KPIs:
  - uses `data.kpis` if present, else computes via `computeAnalyticsKpis(data)`.

**Series/statistics capture & computation**

- Insight list:
  - `allInsights = data.aiInsights.global`
  - filtering/sorting is client-side only.
- KPI counts:
  - Prefer `kpis.ai.*` fields; else count from `aiInsights.global`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Insight list | `aiInsights.global[]` | `/api/analytics` → `buildAiInsightsBundle` |
| KPI strip | `kpis.ai.*` | `computeAnalyticsKpis` |

**Freshness / caching / failure modes**

- If analytics overview fetch fails, cached `sessionStorage` payload (if present) may still render.
- Insights may be marked `stale` when based on stale domains (see `AiInsight.stale` field from insight engine).

---

### `/analytics/customer-journey` (Dedicated Customer Journey Experience)

**Purpose**

- Provide a “journey-first” visualization of the lifecycle funnel, with stage selection and evidence/transition drilldowns.

**Visualizations (exhaustive list)**

- AI insights panel filtered to customer-journey (`AiInsightsPanel defaultFilter="customer-journey"`).
- Header + time range controls.
- KPI strip (4 `StatCard`s): Total Contacts, Avg Conversion, Stages, Active Insights.
- Lifecycle funnel (“hero funnel”):
  - `HorizontalFunnel` of lifecycle stages, colored by stage.
  - Clickable stage pills (keyboard navigable) to select a stage.
- Stage detail panel (when a stage selected):
  - Evidence Sources list (`LifecycleSegment[]`)
  - Stage metrics: volume, conversion, confidence, trend delta (as rendered)
  - Transitions list (from selected stage) with conversion percentages.
- Error state + retry, loading state, “no lifecycle data” state.

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=overview` with time range query (`range|from/to`)
- Reads/writes `sessionStorage` cache key `analytics:overview:<rangeQuery>`

**Series/statistics capture & computation**

- Primary data: `data.lifecycleFunnel` (derived in analytics pipeline by `buildLifecycleFunnelData` in `src/lib/analytics/funnel.ts`).
- Average conversion:
  - computed client-side as mean of `conversionFromPrevious` across stages (excluding null).
- Total Contacts:
  - computed as sum of stage `value` volumes shown in the funnel.
- Evidence sources:
  - come from `LifecycleStage.evidence[]` segments, each with `source`, `detail`, `contribution`, and `share/confidence`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Funnel stages | `lifecycleFunnel.stages[]` | `buildLifecycleFunnelData` (derived) |
| Evidence list | `selectedStage.evidence[]` | derived from multiple provider domains |
| Transition list | `lifecycleFunnel.transitions[]` | derived conversion computations |

**Freshness / caching / failure modes**

- If the `lifecycleFunnel` domain is missing (no provider data), the page explicitly shows “No lifecycle data available.”
- Because this page pulls `section=overview`, it inherits snapshot staleness and errors from the analytics pipeline.

---

## Analytics “Virtual Screens” (per `section-registry.ts`)

Every section ID below is treated as its own screen. For each one, the underlying route is `/analytics/<id>` (via `src/app/(dashboard)/analytics/[section]/page.tsx`) except where noted, and the renderer is `AnalyticsSectionPage` (`src/components/analytics/analytics-section-page.tsx`) unless the route has a dedicated `page.tsx` override.

### Analytics core pipeline (applies to most screens below)

For any section rendered through `AnalyticsSectionPage`:

- Primary fetch:
  - `GET /api/analytics?section=<sectionId>` plus time range query.
- Section domains:
  - determined by `SECTION_DOMAINS[sectionId]` in `src/app/api/analytics/route.ts`.
- Result shape:
  - `AnalyticsDashboardData` which may contain:
    - provider payloads (`hubspot`, `stripe`, `mercury`, `googleAnalytics`, `googleAds`, `metaAds`, `metaPage`, `instagram`, `redditAds`, `webflow`, `coda`, `semrush`, `pylon`, `googleWorkspace`, `slack`, plus telemetry domains),
    - derived payloads (`lifecycleFunnel`, `funnelJourney`, `customerJourney`, `demoAnalytics`, `processAnalytics`, `aiInsights`, `distilledInsights`, `recommendations`, `kpis`),
    - `meta`, `freshness`, `staleDomains`, `errors`.

Ops exceptions (do not use `/api/analytics`):

- `cs-decision-dashboard` → `GET /api/analytics/decision-dashboard?lookbackDays=<n>`
- `cs-flow-metrics` → `GET /api/flow/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD&interval=week`
- `cs-flow-risk` → `GET /api/flow/risk?...`
- `cs-observability` → `GET /api/ops/observability?...`

The sections below document visuals + which domains drive them.

---

### `/analytics/ads-traffic` (Primary: Ads & Traffic)

**Purpose**

- Provide a unified marketing cockpit across GA4 + paid ads + owned social + Webflow + SEMrush.

**Visualizations (exhaustive list)**

Rendered by `MarketingTabNew` (`src/components/analytics/marketing-tab-new.tsx`):

- AI insights panel for Ads (`AiInsightsPanel defaultFilter="ads-traffic"`).
- KPI row (4 `StatCard`s):
  - Sessions (30d) with change %
  - Total ad spend
  - Total conversions
  - Meta page followers
- Traffic section (2 cards):
  - Traffic by channel (`BarDisplay`)
  - Top pages list (top 5)
- Channel comparison table (`ChannelTable`) when paid channels are configured and healthy.
- Ad performance accordion:
  - Google Ads (expanded view shows spend/impressions/clicks/conversions + CTR/CPC/CPA/ROAS + top campaigns list)
  - Meta Ads (similar KPI grids + top campaigns)
  - Reddit Ads (similar KPI grids + top campaigns)
- Meta Page Insights card:
  - followers/likes, reach, engagement, plus top posts list
  - (traffic/bounce/clicks/returning are present but currently stubbed to 0 in fetcher)
- Instagram Insights card:
  - followers, reach, engagement, plus top posts list
  - (reach is currently proxied from engagement in fetcher)
- Webflow card:
  - site name, last published, counts of pages/collections
  - traffic/bounce/clicks/repeat visitors (currently hardcoded 0 in fetcher)
  - form submissions by form name
  - custom domains list
- SEMrush card:
  - StatCards: authority score, backlinks, organic keywords, organic traffic
  - top keywords table/list
  - competitors table/list

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=ads-traffic` with time range query.

**Series/statistics capture & computation**

Provider capture (high-level):

- GA4: sessions/users/pageviews/bounce/avg duration, traffic by channel/day, top pages (see Appendix).
- Google Ads: spend/impressions/clicks/conversions from GAQL query.
- Meta Ads: spend/impressions/clicks/actions-derived conversions.
- Reddit Ads: spend/impressions/clicks/conversions (sum of lead/purchase/sign_up/custom conversions).
- Meta Page: page fan_count/followers + page impressions/engaged users + top posts impressions/engagement.
- Instagram: followers/media + recent media likes/comments; reach30d proxied as engagement sum.
- Webflow: site/pages/collections/form_submissions; traffic metrics are placeholders.
- SEMrush: domain overview + top keywords + competitors.

Cross-provider computations in this tab:

- “Total Ad Spend” is the sum of spend across configured paid providers.
- “Total Conversions” sums conversions across Google Ads and Meta Ads in the payload.
- The tab uses connection-status to decide “Not configured / failing / no data / healthy”.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Sessions card + change | `googleAnalytics.sessions30d`, `googleAnalytics.sessionsPrev30d` | GA4 fetcher |
| Traffic by channel | `googleAnalytics.trafficByChannel[]` | GA4 fetcher (dimension `sessionDefaultChannelGroup`) |
| Google Ads KPIs | `googleAds.*` | Google Ads fetcher |
| Meta Ads KPIs | `metaAds.*` | Meta Ads fetcher |
| Reddit Ads KPIs | `redditAds.*` | Reddit Ads fetcher |
| Meta Page insights | `metaPage.*` | Meta Page fetcher (Graph API) |
| Instagram insights | `instagram.*` | Instagram fetcher (Graph API) |
| Webflow | `webflow.*` | Webflow fetcher (API v2) |
| SEMrush | `semrush.*` | SEMrush fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed per domain:
  - the tab can be “partially” populated if one provider fails.
- Known stubbed fields (explicit):
  - `webflow.traffic`, `webflow.bounceRate`, `webflow.clicks`, `webflow.returningVisitors` are currently hardcoded to `0` in `fetchWebflowData`.
  - `metaPage.traffic`, `metaPage.bounceRate`, `metaPage.clicks`, `metaPage.returningVisitors` are hardcoded to `0` in `fetchMetaPageData`.
  - `instagram.reach30d` is proxied from engagement (`engagement30d`) in `fetchMetaInstagramData`.

---

### `/analytics/ads-google-analytics` (Subsection: Google Analytics)

**Purpose**

- Provide GA4-focused traffic and content performance diagnostics.

**Visualizations (exhaustive list)**

Rendered by `AdsGoogleAnalyticsTab` (`src/components/analytics/ads-google-analytics-tab.tsx`):

- KPI cards for sessions/users/pageviews and bounce/avg duration (as implemented in component)
- Trend charts (daily sessions) where present
- Channel breakdown (table or bars) where present
- Top pages table/list where present

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=ads-google-analytics` with time range query.

**Series/statistics capture & computation**

- All GA4 stats come from GA Data API `runReport`:
  - metrics: `sessions`, `totalUsers`, `screenPageViews`, `bounceRate`, `averageSessionDuration`
  - breakdown report includes dimensions: `sessionDefaultChannelGroup`, `date`
  - top pages uses `pagePath`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Sessions/users/pageviews | `googleAnalytics.sessions30d/users30d/pageviews30d` | GA4 fetcher |
| Bounce + duration | `googleAnalytics.bounceRate/avgSessionDuration` | GA4 fetcher |
| Channel breakdown | `googleAnalytics.trafficByChannel[]` | GA4 fetcher |
| Daily trend | `googleAnalytics.dailyTrend[]` | GA4 fetcher |
| Top pages | `googleAnalytics.topPages[]` | GA4 fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed (`providerKey="googleAnalytics"`).
- If GA4 credentials are missing/invalid, this tab shows “not configured”/error states.

---

### `/analytics/ads-google-ads` (Subsection: Google Ads)

**Purpose**

- Provide Google Ads performance diagnostics at account and campaign level.

**Visualizations (exhaustive list)**

Rendered by `AdsGoogleAdsTab` (`src/components/analytics/ads-google-ads-tab.tsx`):

- KPI strip (spend, impressions, clicks, conversions, CTR/CPC/CPA/ROAS as rendered)
- Campaigns table/list (top campaigns)
- Any trend chart components present in the tab implementation

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=ads-google-ads` with time range query.

**Series/statistics capture & computation**

- Google Ads API:
  - OAuth2 refresh-token exchange (`https://oauth2.googleapis.com/token`)
  - GAQL query via `googleAds:searchStream` selecting:
    - `campaign.name`
    - `metrics.cost_micros`, `metrics.impressions`, `metrics.clicks`, `metrics.conversions`
  - Derived ratios:
    - `ctr = clicks/impressions*100`
    - `cpc = spend/clicks`
    - `cpa = spend/conversions`
    - `estimatedRevenue = conversions * 500` (heuristic constant)
    - `roas = estimatedRevenue/spend`

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| KPIs | `googleAds.*` | `fetchGoogleAdsData` |
| Campaign list | `googleAds.campaigns[]` | `fetchGoogleAdsData` |

**Freshness / caching / failure modes**

- Snapshot-backed.
- Failure modes include:
  - refresh-token exchange failures
  - API parse failures (streamed JSON parsing).

---

### `/analytics/ads-meta-ads` (Subsection: Meta Ads / Meta Page / Instagram)

**Purpose**

- Provide Meta Ads performance plus owned social (Page + Instagram) diagnostics.

**Visualizations (exhaustive list)**

Rendered by `AdsMetaAdsTab` (`src/components/analytics/ads-meta-ads-tab.tsx`):

- Ads KPIs (spend/impressions/clicks/conversions + derived ratios)
- Campaign list/table for Meta Ads
- Page followers/likes and engagement blocks
- Instagram followers/reach/engagement and top posts list

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=ads-meta-ads` with time range query.
  - Required domains: `metaAds`, `metaPage`, `instagram` (see `SECTION_DOMAINS`).

**Series/statistics capture & computation**

- Meta Ads:
  - `act_<adAccountId>/insights?fields=spend,impressions,clicks,actions` (level=account)
  - `act_<adAccountId>/campaigns?fields=name,insights{...}` with `time_range`
  - conversions extracted by scanning `actions[]` for lead/offsite conversions.
- Meta Page:
  - `/<pageId>?fields=fan_count,followers_count`
  - `/<pageId>/insights?metric=page_impressions,page_engaged_users&since&until`
  - `/<pageId>/posts?fields=message,insights{metric(post_impressions,post_engaged_users)},created_time&limit=5`
- Instagram:
  - `/<instagramAccountId>?fields=id,username,followers_count,media_count`
  - `/<instagramAccountId>/media?fields=id,caption,timestamp,like_count,comments_count&limit=25`
  - `reach30d` currently proxied as `engagement30d` (likes+comments sum).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Meta Ads KPIs | `metaAds.*` | `fetchMetaAdsData` |
| Meta Page blocks | `metaPage.*` | `fetchMetaPageData` |
| Instagram blocks | `instagram.*` | `fetchMetaInstagramData` |

**Freshness / caching / failure modes**

- Snapshot-backed per domain; partial data is common (e.g., ads works but page doesn’t).
- Stubbed fields to call out:
  - `metaPage.traffic/bounceRate/clicks/returningVisitors` are 0 placeholders.
  - `instagram.reach30d` uses engagement proxy.

---

### `/analytics/ads-reddit-ads` (Subsection: Reddit Ads)

**Purpose**

- Provide Reddit Ads performance with campaign rollups.

**Visualizations (exhaustive list)**

Rendered by `AdsRedditAdsTab` (`src/components/analytics/ads-reddit-ads-tab.tsx`):

- KPI strip (spend/impressions/clicks/conversions, derived CTR/CPC/CPA/ROAS where present)
- Campaign table/list
- Any “ops” diagnostics panel if the tab renders reddit telemetry

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=ads-reddit-ads` with time range query.
  - Domains: `redditAds` and `redditOps`.

**Series/statistics capture & computation**

- OAuth token exchange:
  - `POST https://www.reddit.com/api/v1/access_token` with refresh_token grant.
- Campaign list:
  - `GET https://ads-api.reddit.com/api/v3/ad_accounts/<id>/campaigns`
- Reports:
  - `POST https://ads-api.reddit.com/api/v3/ad_accounts/<id>/reports` with:
    - breakdowns: `["CAMPAIGN_ID"]`
    - fields: `CAMPAIGN_ID`, `SPEND`, `IMPRESSIONS`, `CLICKS`, and conversion fields
  - Conversions are summed from lead/purchase/sign_up/custom counts.
- Ops telemetry:
  - derived from internal `OutboxEvent` + receipts (see `fetchIntegrationTelemetryData` and provider `redditOps`).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| KPIs | `redditAds.*` | `fetchRedditAdsData` |
| Campaign list | `redditAds.campaigns[]` | `fetchRedditAdsData` |
| Ops diagnostics | `redditOps.*` | `fetchIntegrationTelemetryData` for provider REDDIT |

**Freshness / caching / failure modes**

- Snapshot-backed.
- If reddit token exchange fails, ads data is missing but ops telemetry may still render.

---

### `/analytics/ads-webflow` (Subsection: Webflow)

**Purpose**

- Show Webflow site structural stats + form submission counts for the selected range.

**Visualizations (exhaustive list)**

Rendered by `AdsWebflowTab` (`src/components/analytics/ads-webflow-tab.tsx`):

- Site info panel (site name, last published, domains)
- Counts panels (pages, collections)
- Form submissions table/list
- (Traffic metrics fields exist but are currently placeholders)

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=ads-webflow` with time range query.

**Series/statistics capture & computation**

Webflow API v2 calls in `fetchWebflowData`:

- `GET /v2/sites/<siteId>`
- `GET /v2/sites/<siteId>/pages`
- `GET /v2/sites/<siteId>/collections`
- `GET /v2/sites/<siteId>/form_submissions` (filtered by createdOn when `from/to` provided)

Returned placeholder fields to flag:

- `traffic`, `bounceRate`, `clicks`, `returningVisitors` are currently set to `0` in fetcher.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Page/collection counts | `webflow.totalPages/totalCollections` | Webflow pages/collections endpoints |
| Form submissions | `webflow.formSubmissions[]` | Webflow form_submissions endpoint |

**Freshness / caching / failure modes**

- Snapshot-backed.
- Missing Webflow scopes can produce “missing scope” errors; fetcher annotates error messages with a scope hint.

---

### `/analytics/ads-semrush` (Subsection: SEMrush)

**Purpose**

- Provide SEO diagnostics: authority, backlinks, organic vs paid footprint, keyword/campaign landscape.

**Visualizations (exhaustive list)**

Rendered by `AdsSemrushTab` (`src/components/analytics/ads-semrush-tab.tsx`):

- Overview StatCards (authority score, backlinks, organic traffic/keywords, paid traffic/keywords as present)
- Top keywords table/list
- Organic competitors table/list

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=ads-semrush`

**Series/statistics capture & computation**

SEMrush fetcher (`src/lib/analytics/fetchers-semrush.ts`) pulls:

- Domain ranks:
  - endpoint `/` with query `type=domain_ranks` and export columns `Ot,Oc,Ad,At,Ac,Or`
- Backlinks overview:
  - endpoint `/analytics/v1/` with query `type=backlinks_overview` and export columns `ascore,total`
- Top keywords:
  - endpoint `/` with `type=domain_organic` and export columns `Ph,Po,Nq,Cp,Tr,Ur`
- Organic competitors:
  - endpoint `/` with `type=domain_organic_organic` and export columns `Dn,Np,Or,Ot`

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Authority/backlinks | `semrush.authorityScore/backlinks` | backlinks_overview |
| Organic/paid footprint | `semrush.organicTraffic/organicKeywords/paidTraffic/paidKeywords` | domain_ranks |
| Top keywords | `semrush.topKeywords[]` | domain_organic |
| Competitors | `semrush.organicCompetitors[]` | domain_organic_organic |

**Freshness / caching / failure modes**

- SEMrush fetch uses `next: { revalidate: 3600 }` for HTTP caching in fetcher; still snapshot-stored in analytics pipeline.
- Invalid domains are rejected early by normalization (must be root domain).

---

### `/analytics/ads-coda-kanban` (Subsection: Coda “Free Kanban Generator”)

**Purpose**

- Provide whitepaper / free-kanban funnel telemetry from a Coda document:
  - cards created, creator activity windows, engaged lead candidates, recent submitters, and (when configured) enrichment via HubSpot/Stripe.

**Visualizations (exhaustive list)**

Rendered by `AdsCodaKanbanTab` (`src/components/analytics/ads-coda-kanban-tab.tsx`):

- KPI cards: total cards, creator counts, trends by window, engaged leads, etc. (as implemented)
- Tables/lists:
  - recent cards
  - creator breakdown
  - recent submitters list
  - engaged lead candidates list (scored)
- Trend chart(s) for daily card creation (if rendered).

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=ads-coda-kanban`
  - domains: `coda` and `codaOps`.

**Series/statistics capture & computation**

Coda base capture (`fetchCodaData`, `src/lib/analytics/fetchers-coda.ts`):

- `GET https://coda.io/apis/v1/docs/<docId>/tables`
- `GET https://coda.io/apis/v1/docs/<docId>/tables/<tableId>/columns`
- `GET https://coda.io/apis/v1/docs/<docId>/tables/<tableId>/rows?limit=500&valueFormat=simple` (paged by nextPageToken)

Derived computations in fetcher:

- Detect creator/email columns (override or auto-detect).
- Build creator windows (30/60/90 days) with:
  - total cards in window
  - previous window total
  - trend delta %
  - unique creators + breakdown
- Build daily trend (counts by UTC day key).
- Lead intelligence/enrichment:
  - optional HubSpot search enrichment and Stripe email enrichment via helper modules.

Ops telemetry:

- `codaOps` is derived from internal integration telemetry (`IntegrationRule`/`IntegrationReceipt`/`OutboxEvent`) for provider CODA.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Total cards | `coda.totalCards` | count of Coda rows in range |
| Creator breakdown | `coda.creatorWindows[].byCreator[]` | `buildCreatorWindow(...)` |
| Engaged leads | `coda.engagedLeadCandidates[]` | `scoreCodaEngagedLeads(...)` pipeline |
| Ops trends | `codaOps.trend[]` | internal telemetry fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed.
- If the Coda document/table structure changes, column auto-detection may fail, increasing “Unknown” creators; the tab should call this out operationally.

---

### `/analytics/finance` (Primary: Finance)

**Purpose**

- Provide finance cockpit across Stripe + Mercury + (optionally) HubSpot revenue context, plus derived planning/forecast/P&L/unit economics sections.

**Visualizations (exhaustive list)**

Rendered by `FinanceTab` (`src/components/analytics/finance-tab.tsx`):

- AI insights panel filtered to finance.
- KPI cards for MRR/ARR, runway, burn, revenue growth, payment success, churn (as implemented).
- Revenue trend chart(s) (e.g. `ForecastChart`, `AreaTrend`, etc as implemented).
- Account balance tables/lists from Mercury.
- Subscription health panels from Stripe.
- Links to finance subsections (planning/forecast/P&L/unit economics) via sidebar nav in section page.

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=finance` with time range query.

**Series/statistics capture & computation**

- Stripe:
  - subscriptions list, charges in range, revenue trend; MRR computed from active subscriptions (monthly-normalized).
  - Note: `mrrChange` is currently hardcoded to `0` in fetcher output.
- Mercury:
  - account balances and transactions for inflows/outflows; runway computed as `totalBalance / burnRate`.
- Derived planning data (when finance planning is requested):
  - budgets/goals/pnl/unit economics/forecasts are computed server-side in the analytics route via:
    - `computeBudgetActuals`, `computeBudgetSummary`
    - `buildProfitAndLossCore` / `buildProfitAndLoss`
    - `computeUnitEconomics`
    - `buildDefaultScenarios`, `buildForecastScenario`

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| MRR/Revenue trend | `stripe.revenue.*`, `stripe.revenueTrend[]` | Stripe fetcher |
| Runway/Burn | `mercury.cashFlow.*` | Mercury fetcher |
| Unit economics | `unitEconomics` domain | derived builder |

**Freshness / caching / failure modes**

- Snapshot-backed.
- Stripe timeouts are higher than others (20s) in analytics pipeline; other domains default 8.5s.
- Stubbed metric:
  - `stripe.revenue.mrrChange` is `0` placeholder.

---

### `/analytics/finance-mercury` (Subsection: Mercury)

**Purpose**

- Provide bank-side cash visibility: balances, inflows/outflows, runway.

**Visualizations (exhaustive list)**

Rendered by `FinanceMercuryTab` (`src/components/analytics/finance-mercury-tab.tsx`):

- Accounts table/list (account name, type, balance)
- Cash flow KPI cards (total balance, inflows, outflows, net flow, runway, burn) as implemented

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=finance-mercury`

**Series/statistics capture & computation**

Mercury fetcher (`fetchMercuryData`):

- `GET https://api.mercury.com/api/v1/accounts`
- For each account:
  - `GET https://api.mercury.com/api/v1/account/<accountId>/transactions?start=<YYYY-MM-DD>&end=<YYYY-MM-DD>&limit=500`
  - counts inflows/outflows for transactions with `status==="sent"`
- Runway:
  - `burnRate = outflows > 0 ? outflows : 1`
  - `runway = totalBalance / burnRate` (rounded to 0.1).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Balance totals | `mercury.accounts[]`, `mercury.cashFlow.totalBalance` | Mercury accounts endpoint |
| Inflow/outflow | `mercury.cashFlow.inflows30d/outflows30d` | Mercury transactions |

**Freshness / caching / failure modes**

- Snapshot-backed.
- If a single account’s transaction fetch fails, that account is skipped (best-effort); totals may be understated.

---

### `/analytics/finance-stripe` (Subsection: Stripe)

**Purpose**

- Provide Stripe-side recurring revenue and payment health.

**Visualizations (exhaustive list)**

Rendered by `FinanceStripeTab` (`src/components/analytics/finance-stripe-tab.tsx`):

- Revenue KPI cards (MRR, 30d revenue, growth, ARPC)
- Subscription KPI cards (active/past due/trialing/canceled/churn)
- Payment success cards (succeeded/failed/successRate)
- Revenue trend chart
- Recent churn events list

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=finance-stripe`

**Series/statistics capture & computation**

Stripe fetcher (`fetchStripeData`):

- Subscriptions:
  - `GET /v1/subscriptions?status=active&limit=100`
  - `GET /v1/subscriptions?status=canceled&limit=50`
  - Past due + trialing counts via paginated subscription list per status.
- Charges:
  - `GET /v1/charges?limit=100&created[gte]=<from>&created[lte]=<to>` (paged for up to 5 pages)
  - Also fetches previous-period charges for growth calculation.
- MRR:
  - computed from active subscription first price item, normalized to monthly for interval types.
- Revenue growth:
  - `((rev30d - revPrev) / revPrev) * 100` (0 if prev is 0).

Known stub:

- `revenue.mrrChange` is currently `0`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| MRR | `stripe.revenue.mrr` | computed from subscriptions |
| 30d revenue + growth | `stripe.revenue.totalRevenue30d`, `stripe.revenue.revenueGrowth` | charges in range + prev range |
| Churn list | `stripe.subscriptions.recentChurnEvents[]` | canceled subscriptions |

**Freshness / caching / failure modes**

- Snapshot-backed.
- Stripe domain uses longer timeout in pipeline; still can fail on rate limits or large datasets.

---

### `/analytics/finance-hubspot` (Subsection: HubSpot Finance Context)

**Purpose**

- Provide HubSpot-derived funnel and deal value context in a finance view.

**Visualizations (exhaustive list)**

Rendered by `FinanceHubSpotTab` (`src/components/analytics/finance-hubspot-tab.tsx`):

- Funnel stage panels (counts and values)
- Deals by source and by rep charts/tables (as implemented)
- Any finance-specific diagnostics panels

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=finance-hubspot`

**Series/statistics capture & computation**

HubSpot fetcher:

- Deals list paginated via `GET /crm/v3/objects/deals?limit=100&properties=...&after=...`
- Stage mapping via `HUBSPOT_STAGE_MAP` in fetcher.
- Aggregations:
  - stage counts and values
  - `winRate`, `effectiveWinRate`, `noShowRate`, `avgDealSize`
  - rep and source rollups.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Funnel metrics | `hubspot.funnel.*` | HubSpot fetcher aggregation |
| Rep/source breakdowns | `hubspot.funnel.dealsByRep/dealsBySource` | HubSpot fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed.
- HubSpot fetch can be heavy; max pages controlled by env `HUBSPOT_MAX_PAGES` (clamped to 1000).

---

### `/analytics/finance-planning` (Subsection: Budget & Goals)

**Purpose**

- Provide planning artifacts: budgets, goals, recommendations, and progress against targets.

**Visualizations (exhaustive list)**

Rendered by `FinancePlanningTab` (`src/components/analytics/finance-planning-tab.tsx`):

- Budget selection and budget line item table(s)
- Variance charts/rows (planned vs actual)
- Goals list with status, progress %, and deadlines
- Scenario planning blocks (if present)

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=finance-planning`

**Series/statistics capture & computation**

Computed server-side in analytics route when finance planning domains are requested:

- Budgets/goals are stored in Prisma models (`Budget`, `BudgetLineItem`, `FinancialGoal`, etc. in `schema.prisma`).
- Actuals:
  - computed from Stripe/Mercury data in range via `computeBudgetActuals(...)`.
- Progress percent:
  - computed via `computeProgressPct(...)` (finance-utils).
- Goal status:
  - derived from current metric vs target and deadline.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Budget variance | `financePlanning.budgets[]`, `budgetActuals` | DB budgets + derived actuals |
| Goals | `financePlanning.goals[]` | DB goals + derived status/progress |

**Freshness / caching / failure modes**

- Requires Stripe and/or Mercury to produce meaningful “actuals”; otherwise variance is 0 or missing.

---

### `/analytics/finance-forecast` (Subsection: Forecasts)

**Purpose**

- Provide forward-looking financial scenarios and forecasts.

**Visualizations (exhaustive list)**

Rendered by `FinanceForecastTab` (`src/components/analytics/finance-forecast-tab.tsx`):

- Forecast chart(s) (e.g., `ForecastChart`)
- Scenario cards for default vs custom scenarios
- Assumptions table (inputs used for projections)

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=finance-forecast`

**Series/statistics capture & computation**

- Forecasts computed server-side via:
  - `buildDefaultScenarios(...)`
  - `buildForecastScenario(...)`
- Uses Stripe (MRR, revenue) and Mercury (cash balance/runway) as base inputs.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Forecast series | `financeForecast.scenarios[]` | forecast engine |

**Freshness / caching / failure modes**

- Without Stripe/Mercury configured, forecasts degrade to empty-state.

---

### `/analytics/finance-pnl` (Subsection: P&L)

**Purpose**

- Provide profit & loss view (revenue, costs, net).

**Visualizations (exhaustive list)**

Rendered by `FinancePnlTab` (`src/components/analytics/finance-pnl-tab.tsx`):

- P&L summary cards (revenue, costs, net, margin)
- Line item table(s) and category rollups

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=finance-pnl`

**Series/statistics capture & computation**

- Computed in analytics pipeline by `buildProfitAndLossCore` / `buildProfitAndLoss`.
- Depends on available revenue and cost signals (primarily Stripe + Mercury + internal budgets).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| P&L rows | `financePnl.*` | pnl builder |

**Freshness / caching / failure modes**

- Missing finance providers yields “no data” placeholders.

---

### `/analytics/finance-unit-economics` (Subsection: Unit Economics)

**Purpose**

- Provide unit economics computations (CAC/LTV/payback proxies).

**Visualizations (exhaustive list)**

Rendered by `FinanceUnitEconomicsTab` (`src/components/analytics/finance-unit-economics-tab.tsx`):

- KPI cards and tables for computed unit-econ metrics
- Supporting breakdowns by channel/source where available

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=finance-unit-economics`

**Series/statistics capture & computation**

- Computed server-side via `computeUnitEconomics(...)`.
- Inputs include:
  - Stripe revenue/subscriptions
  - Mercury cash flow
  - HubSpot funnel context when available

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Unit econ metrics | `unitEconomics.*` | `computeUnitEconomics` |

**Freshness / caching / failure modes**

- Requires sufficient base signals; otherwise metrics may be null/0.

---

### `/analytics/sales-pipeline` (Primary: Sales & Pipeline)

**Purpose**

- Provide sales funnel cockpit across HubSpot + Stripe + workspace telemetry and derived funnel metrics.

**Visualizations (exhaustive list)**

Rendered by `SalesFunnelTab` (`src/components/analytics/sales-funnel-tab.tsx`):

- Funnel visualization(s) and KPI cards:
  - deal counts and values by stage
  - win rate and effective win rate
  - no-show rate and demo follow-up counts
- Tables for deals by rep and source
- Integrations child dashboard panels where applicable

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=sales-pipeline`

**Series/statistics capture & computation**

- HubSpot deals are mapped to stage labels and aggregated.
- Stripe customer charge enrichment may be applied for “performance pack” contexts (see analytics route’s `hydrateStripeCustomerLinks` and `fetchStripeChargesByCustomer` logic).
- Workspace/slack telemetry is derived from internal integration telemetry.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Funnel stages | `hubspot.funnel.stages[]` | HubSpot fetcher |
| Win/no-show rates | `hubspot.funnel.winRate/noShowRate` | HubSpot fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed; partial results common if HubSpot fails.

---

### `/analytics/sales-hubspot` (Subsection: HubSpot)

**Purpose**

- Provide a HubSpot-only view for sales pipeline.

**Visualizations (exhaustive list)**

Rendered by `SalesHubspotTab` (`src/components/analytics/sales-hubspot-tab.tsx`):

- HubSpot funnel panels, stage table, deals list and breakdowns.

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=sales-hubspot`

**Series/statistics capture & computation**

- Same HubSpot fetcher aggregation as other sections; includes optional filtering of “inactive prospects” unless requested with includeInactiveProspects in performance pack context.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| HubSpot funnel | `hubspot.funnel.*` | `fetchHubSpotData` |

**Freshness / caching / failure modes**

- Snapshot-backed.

---

### `/analytics/sales-stripe` (Subsection: Stripe)

**Purpose**

- Provide Stripe-only view for sales/revenue signals.

**Visualizations (exhaustive list)**

Rendered by `SalesStripeTab` (`src/components/analytics/sales-stripe-tab.tsx`):

- Stripe revenue/subscription metrics relevant to sales pipeline.

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=sales-stripe`

**Series/statistics capture & computation**

- Same Stripe fetcher output as finance; this tab simply presents a sales-context subset.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Stripe metrics | `stripe.*` | `fetchStripeData` |

**Freshness / caching / failure modes**

- Snapshot-backed.

---

### `/analytics/sales-performance` (Subsection: Performance Pack)

**Purpose**

- Provide the “Sales Performance Pack” view combining HubSpot deals + HubSpot contacts + Stripe charges by customer.

**Visualizations (exhaustive list)**

Rendered by `SalesPerformanceView` (`src/components/analytics/sales-performance-view.tsx`):

- Rep scoreboard and rep/month performance tables
- Channel attribution tables (cohorts by source group)
- Audit table of deals (quality checks)
- Any embedded charts/sparklines used by the view

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=sales-performance`
  - domain: `salesPerformance` only (pipeline fetcher builds it server-side).

**Series/statistics capture & computation**

Built in the analytics route:

- Pull HubSpot data and contacts.
- Hydrate Stripe customer links (`StripeCustomerLink`) onto HubSpot deals.
- Identify closed-won deals in range and build Stripe charge requests per customer.
- Build performance pack via `buildSalesPerformancePack(...)` in `src/lib/analytics/fetchers.ts`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Performance pack | `salesPerformance.*` | `buildSalesPerformancePack` (derived) |

**Freshness / caching / failure modes**

- Snapshot-backed as `providerKey="salesPerformance"`.
- If Stripe is missing, pack may still compute but with reduced revenue attribution.

---

### `/analytics/sales-google-workspace` (Subsection: Google Workspace telemetry)

**Purpose**

- Provide integration telemetry for Google Workspace-based workflows.

**Visualizations (exhaustive list)**

Rendered by `GenericWorkspaceTab` (`src/components/analytics/generic-workspace-tab.tsx`):

- Telemetry KPI cards (rules enabled, receipts, tasks created, failures)
- Trend chart/table for daily receipts/tasks/failures
- Top failure reasons list

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=sales-google-workspace`

**Series/statistics capture & computation**

Telemetry is computed from internal tables (`fetchIntegrationTelemetryData`):

- `IntegrationRule` (rule status)
- `IntegrationReceipt` (events observed; tasks created when taskId present)
- `OutboxEvent` (failure events by provider prefix)

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Telemetry | `googleWorkspace.*` | internal telemetry fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed.
- Even if OAuth tokens are missing, telemetry can still exist from past receipts/outbox events.

---

### `/analytics/sales-slack` (Subsection: Slack telemetry)

**Purpose**

- Provide integration telemetry for Slack-based workflows.

**Visualizations (exhaustive list)**

Rendered by `GenericSlackTab` (`src/components/analytics/generic-slack-tab.tsx`) with similar visuals to workspace telemetry.

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=sales-slack`

**Series/statistics capture & computation**

- Derived from internal telemetry for provider SLACK.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Telemetry | `slack.*` | internal telemetry fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed.

---

### `/analytics/customer-success` (Primary: Customer Success)

**Purpose**

- Provide CS cockpit across Pylon support, Coda/product signals, and ops telemetry.

**Visualizations (exhaustive list)**

Rendered by `CustomerSuccessTab` (`src/components/analytics/customer-success-tab.tsx`):

- Support KPI cards (open/urgent/waiting/resolved, CSAT, first response)
- Product adoption / throughput panels (from `product` domain)
- Integration telemetry panels (Google Workspace/Slack/Coda)
- AI insights panel filtered to CS

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=customer-success`

**Series/statistics capture & computation**

- Pylon:
  - issues fetched and classified into urgent/waiting/resolved; averages computed from fields if present.
- Product domain:
  - derived from internal task/project/sprint signals in analytics pipeline (see Appendix: derived domains).
- Coda/product/workspace/slack telemetry:
  - internal telemetry computations as described above.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Support KPIs | `pylon.*` | `fetchPylonData` |
| Ops telemetry | `codaOps/googleWorkspace/slack` | `fetchIntegrationTelemetryData` |

**Freshness / caching / failure modes**

- Snapshot-backed; CS tab can render with partial provider coverage.

---

### `/analytics/cs-pylon` (Subsection: Pylon)

**Purpose**

- Provide Pylon support operations view.

**Visualizations (exhaustive list)**

Rendered by `CsPylonTab` (`src/components/analytics/cs-pylon-tab.tsx`):

- KPI cards for open/urgent/waiting/resolved
- CSAT and first response metrics
- Lists of urgent conversations where present

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=cs-pylon`

**Series/statistics capture & computation**

- Pylon issues fetched via `fetchPylonIssues(...)` and classified by helper heuristics:
  - urgent: priority high/urgent or tag includes “urgent”
  - waitingOnTeam: status includes waiting_on_team/pending_internal/open
  - resolved: status includes resolved/closed
- Averages:
  - first response and csat are means of available numeric samples.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Support KPIs | `pylon.openConversations/urgentConversations/...` | `fetchPylonData` |

**Freshness / caching / failure modes**

- Snapshot-backed with a shorter nextRefresh hint (10 min) inside the pylon meta, but still snapshot-stored by analytics route.

---

### `/analytics/cs-coda` (Subsection: Coda)

**Purpose**

- Provide Coda-derived CS signals and Coda integration telemetry.

**Visualizations (exhaustive list)**

Rendered by `CsCodaTab` (`src/components/analytics/cs-coda-tab.tsx`):

- Coda card counts and creator activity panels
- Telemetry panels for coda ops (failures, receipts)

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=cs-coda`

**Series/statistics capture & computation**

- Coda data via `fetchCodaData`
- Coda ops via internal telemetry (`codaOps`)

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Coda metrics | `coda.*` | Coda fetcher |
| Ops | `codaOps.*` | telemetry |

**Freshness / caching / failure modes**

- Snapshot-backed.

---

### `/analytics/cs-product` (Subsection: Product)

**Purpose**

- Provide “product operations” signals derived from internal WIPGuard task system.

**Visualizations (exhaustive list)**

Rendered by `CsProductTab` (`src/components/analytics/cs-product-tab.tsx`):

- KPI cards for throughput, backlog health, WIP compliance (as implemented)
- Tables of key tasks/projects contributing to product success metrics

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=cs-product`

**Series/statistics capture & computation**

- Product domain is derived inside analytics pipeline from internal Prisma data (tasks/status history), not from an external provider API.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Product success | `product.*` | derived builder |

**Freshness / caching / failure modes**

- Snapshot-backed as providerKey `"product"` is computed, not fetched; it will still be marked stale if upstream domains needed for derived computations are stale (depending on builder logic).

---

### `/analytics/cs-google-workspace` (Subsection: Google Workspace telemetry)

**Purpose**

- Provide integration telemetry for Customer Success workflows that rely on Google Workspace integration rules (rule health, receipts → tasks, and failure reasons).

**Visualizations (exhaustive list)**

Rendered by `GenericWorkspaceTab` (`src/components/analytics/generic-workspace-tab.tsx`) via the shared `TelemetryDashboard`:

- Empty state (`FinanceDataEmptyState(provider="Google Workspace")`) when `data.googleWorkspace` is missing (reasons sourced from `data.errors[source="googleWorkspace"]` + `freshness.googleWorkspace.lastError`).
- Alert banners (`AlertBanner`) driven by telemetry thresholds:
  - “N rule(s) in error state” when `erroredRules > 0` (critical if > 3 else warning)
  - “High failure rate” when `failuresInRange/eventsInRange > 10%`
  - “All rules disabled” when `enabledRules===0 && totalRules>0`
- KPI grid (8 `StatCard`s):
  - Total Rules, Active Rules, Errored Rules, Events Processed
  - Receipts, Tasks Created, Failures, Error Rate (%)
- Rule Health (`SectionCard`):
  - `RingStat` segments: Active (= `enabledRules - erroredRules`), Errored, Disabled
  - Legend rows with colored dots and values
- Activity Trend (`SectionCard`): daily receipts mini-bar chart from `trend[]` (height normalized by max receipts).
- Top Failure Reasons (`SectionCard`): `DataTable` of `{ reason, count }` from `topFailureReasons`.
- Insights (`SectionCard`): `InsightCard`s for “Fix Errored Rules”, “Automation Conversion”, and “Zero Failures” (when conditions match).

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=cs-google-workspace&range=<7d|30d|90d|180d|365d|custom>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

Server-side domain: `googleWorkspace` only (see `SECTION_DOMAINS["cs-google-workspace"]` in `src/app/api/analytics/route.ts`).

Computed by `fetchIntegrationTelemetryData` (`src/lib/analytics/fetchers-integrations.ts`) from Prisma tables:

- `IntegrationRule` → `totalRules`, `enabledRules`, `erroredRules` (errored = `lastError != null`)
- `IntegrationReceipt` (joined to rules by provider) filtered by `lastObservedAt in [from,to]`:
  - `receiptsInRange = receipts.length`
  - `tasksCreatedInRange = count(receipt.taskId != null)`
  - daily `trend[]` buckets increment receipts + createdTasks by receipt date
- `OutboxEvent` failures filtered by:
  - `aggregateType==="integration_rule"`
  - `eventType startsWith "integration.google"`
  - `createdAt in [from,to]`
  - failures counted when `eventType.endsWith(".failed") || error != null`
  - `topFailureReasons`: frequency over `reason = error.trim() || eventType` (top 5)

Client-side derived values in `TelemetryDashboard`:

- `errorRatePct = eventsInRange > 0 ? (failuresInRange / eventsInRange) * 100 : 0`
- Rule health segments computed from `totalRules/enabledRules/erroredRules`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Rules KPI + ring | `googleWorkspace.totalRules/enabledRules/erroredRules` | Prisma `integrationRule.findMany` |
| Receipts / Tasks Created | `googleWorkspace.receiptsInRange/tasksCreatedInRange` | Prisma `integrationReceipt.findMany` |
| Events / Failures / reasons | `googleWorkspace.eventsInRange/failuresInRange/topFailureReasons[]` | Prisma `outboxEvent.findMany` + aggregation |
| Trend chart | `googleWorkspace.trend[]` | daily bucketing in fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed (`AnalyticsSnapshot`) like other analytics domains; stale fallback can render old telemetry with stale banners.
- This telemetry is internal (DB-backed) and does not require external provider API calls to render.

---

### `/analytics/cs-slack` (Subsection: Slack telemetry)

**Purpose**

- Provide the same integration telemetry, but for Customer Success Slack workflows (rule health, receipts → tasks, and failure reasons).

**Visualizations (exhaustive list)**

Rendered by `GenericSlackTab` (`src/components/analytics/generic-slack-tab.tsx`) which reuses the same `TelemetryDashboard` visuals as Google Workspace telemetry:

- Empty state, alert banners, KPI grid, Rule Health ring, Activity Trend bar chart, Top Failure Reasons table, Insights list.

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=cs-slack&range=<7d|30d|90d|180d|365d|custom>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

Server-side domain: `slack` only (see `SECTION_DOMAINS["cs-slack"]` in `src/app/api/analytics/route.ts`).

Computed by the same internal telemetry fetcher:

- `fetchIntegrationTelemetryData({ provider: IntegrationProvider.SLACK, ... })`
  - uses the same tables: `IntegrationRule`, `IntegrationReceipt`, `OutboxEvent`
  - failure prefix is `"integration.slack"` (`getFailurePrefix`)

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Telemetry dashboard | `slack.*` | internal telemetry fetcher |

**Freshness / caching / failure modes**

- Snapshot-backed.

---

### `/analytics/cs-decision-dashboard` (Ops child: Decision Dashboard)

**Purpose**

- Provide an ops decision cockpit derived from internal task flow data (not provider snapshots).

**Visualizations (exhaustive list)**

Rendered by `DecisionDashboardView` from `src/components/analytics/ops-insights.tsx`:

- KPI cards and diagnostics panels derived from the decision dashboard payload.

**Data inputs (API calls / hooks)**

- `GET /api/analytics/decision-dashboard?lookbackDays=<7..120>`

**Series/statistics capture & computation**

- Computation lives in `src/lib/analytics/decision-dashboard.ts` (see API route `src/app/api/analytics/decision-dashboard/route.ts`).
- Derived from internal tables:
  - `Task`, `StatusHistory`, `BoardSettings`, and user/team context.

**Data sources → surfaced fields mapping**

- UI elements map to the JSON payload returned by that endpoint (not `AnalyticsDashboardData`).

**Freshness / caching / failure modes**

- Not snapshot-backed; computed live per request.

---

### `/analytics/cs-flow-metrics` (Ops child: Flow Metrics)

**Purpose**

- Provide flow metrics time series for internal work system.

**Visualizations (exhaustive list)**

Rendered by `FlowMetricsView` from `src/components/analytics/ops-insights.tsx`:

- Trend charts/tables (weekly interval) for throughput/lead time metrics (as implemented).

**Data inputs (API calls / hooks)**

- `GET /api/flow/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD&interval=week`

**Series/statistics capture & computation**

- Computed live from internal task/status history and sprint data (see `src/app/api/flow/metrics/route.ts` and related libs).

**Data sources → surfaced fields mapping**

- Payload fields map directly to FlowMetricsView rendering.

**Freshness / caching / failure modes**

- Not snapshot-backed; computed live.

---

### `/analytics/cs-flow-risk` (Ops child: Flow Risk)

**Purpose**

- Provide flow risk intelligence and recommendations for internal task system.

**Visualizations (exhaustive list)**

Rendered by `FlowRiskView` (`src/components/analytics/ops-insights.tsx`):

- WIP pressure tables
- Chronic blockers list
- Stale dependency chains
- Fixed date alerts
- Recommendations list
- Slippage correlation block

**Data inputs (API calls / hooks)**

- `GET /api/flow/risk?blockerLookbackDays=30&fixedDateLookaheadDays=14` (plus other tunables)

**Series/statistics capture & computation**

- Derived by `computeFlowRiskIntelligence(...)` (`src/lib/flow/risk-intelligence.ts`) from:
  - `Task` + dependencies + responsible
  - `StatusHistory` events (for blocker transitions into NOT_DONE)
  - Board settings/WIP policies

**Data sources → surfaced fields mapping**

- Payload maps to `FlowRiskIntelligenceReport`.

**Freshness / caching / failure modes**

- Live compute; can be expensive if task set is large.

---

### `/analytics/cs-observability` (Ops child: Observability)

**Purpose**

- Provide observability diagnostics on outbox/integration health.

**Visualizations (exhaustive list)**

Rendered by `ObservabilityView` (`src/components/analytics/ops-insights.tsx`):

- Outbox status counts and recent failures
- Integration failure rollups and top reasons

**Data inputs (API calls / hooks)**

- `GET /api/ops/observability` (may accept range params depending on endpoint design)

**Series/statistics capture & computation**

- Computed from `OutboxEvent` plus integration rule metadata.

**Data sources → surfaced fields mapping**

- Maps to ops observability payload.

**Freshness / caching / failure modes**

- Live compute; may be subject to DB load.

---

### `/analytics/cj-overview` (Customer Journey: Journey drill-down)

**Purpose**

- Provide a per-deal journey drill-down: a browsable list of journeys where each row expands to a touchpoint timeline.

**Visualizations (exhaustive list)**

Rendered by `CustomerJourneyDrillDown` (`src/components/analytics/customer-journey-drill-down.tsx`):

- Search box (deal name or contact email substring match)
- Channel filter select (derived from channels present in `journeys[].touchpoints[]`)
- Stage filter select (derived from `journeys[].currentStage`)
- Journey list (up to 50 rows) with expand/collapse:
  - Collapsed row: deal name, contact email (or “No contact”), current stage, touches count, days in pipeline, deal value
  - Expanded row: vertical timeline with colored channel dots + channel badge + touchpoint type + detail + date + optional value
- “Showing 50 of N” note when filtered results exceed 50
- Empty state when no journeys exist

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=cj-overview&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Requires the derived `customerJourney` domain (`SECTION_DOMAINS["cj-overview"]` in `src/app/api/analytics/route.ts`).

**Series/statistics capture & computation**

The primary payload is derived server-side by:

- `buildCustomerJourneyData(data)` (`src/lib/analytics/customer-journey.ts`)

Key mechanics (as implemented today):

- Touchpoints are first extracted from *multiple* domains (HubSpot, Stripe, ads, Webflow, GA, Pylon, Workspace/Slack telemetry).
- Journeys are then assembled per HubSpot deal using this association rule:
  - `tp.detail.includes(deal.dealName) || tp.channel==="hubspot" || tp.type==="first-touch"`
- Pipeline duration proxy:
  - `daysInPipeline = max(1, round((lastTouch - firstTouch)/86_400_000))` using min/max timestamps in the associated touchpoints.
- Notable current constraints:
  - `contactEmail` is currently `null` in the derived records.
  - Because the association rule includes *all* `tp.channel==="hubspot"` touchpoints and *all* `tp.type==="first-touch"` touchpoints, many timelines include global/non-deal-specific events; treat the drill-down as directional.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Journey list | `customerJourney.journeys[]` | `buildCustomerJourneyData` (derived) |
| Timeline items | `journeys[].touchpoints[]` | derived touchpoints + association rule |
| Days in pipeline | `journeys[].daysInPipeline` | derived from min/max timestamps |

**Freshness / caching / failure modes**

- Snapshot-backed; failures can fall back to the last successful snapshot.
- Derived quality depends on which upstream domains loaded and the association heuristics above.

---

### `/analytics/cj-touchpoints` (Customer Journey: Touchpoints drill-down)

**Purpose**

- Provide a channel-filterable touchpoint drill-down. As implemented today, this screen renders the same component as `cj-overview` and relies on its channel filter to drive a “touchpoints” workflow.

**Visualizations (exhaustive list)**

- Same as `/analytics/cj-overview` (renderer: `CustomerJourneyDrillDown`).

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=cj-touchpoints&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

- Same `customerJourney` derived domain (`buildCustomerJourneyData`); no extra fetches.

**Data sources → surfaced fields mapping**

- Same mappings as `/analytics/cj-overview`.

**Freshness / caching / failure modes**

- Snapshot-backed; same heuristic limitations apply.

---

### `/analytics/cj-conversion` (Customer Journey: Conversion analysis)

**Purpose**

- Provide conversion and drop-off analysis over the derived journeys (stage-to-stage conversion, first-touch source conversion, multi-touch path conversion).

**Visualizations (exhaustive list)**

Rendered by `CustomerJourneyConversionTab` (`src/components/analytics/customer-journey-conversion-tab.tsx`):

- KPI row (4 cards): Overall Conversion, Converted Revenue, Avg Deal Value, Median Days to Close
- Stage-to-stage conversion list with conversion bars and optional revenue-at-risk callouts
- “Conversion by First-Touch Source” table
- “Highest-Converting Paths” list (channel badges + arrows)
- “Drop-off Summary” card grid (worst transitions)

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=cj-conversion&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

- Upstream journeys come from `customerJourney.journeys[]` (derived server-side).
- Conversion series are computed client-side by:
  - `buildStageConversions`, `buildSourceConversions`, `buildPathConversions` in `src/lib/analytics/customer-journey-conversion.ts`.

Key formulas:

- Overall conversion uses `CLOSE_STAGES = {"Closed Won","Subscription","Active"}` and `pct(converted,total)` (rounded to 0.1%).
- Stage conversions:
  - stages are ordered by a canonical stage order with fallback insertion ordering for unknown stages
  - `conversionRate = pct(min(to.count, from.count), from.count)`
  - `revenueAtRisk = max(0, from.totalValue - to.totalValue)`
- Source conversions:
  - group key = `journey.touchpoints[0]?.channel` (first touchpoint channel)
- Path conversions:
  - channel path = unique channel set across touchpoints, joined by `" → "`, ranked by conversion then volume.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Conversion KPIs | `customerJourney.journeys[]`, `customerJourney.medianDaysToClose` | derived builder + client aggregation |
| Stage conversion rows | (computed) | `buildStageConversions` |
| Source conversion table | (computed) | `buildSourceConversions` |
| Path conversion list | (computed) | `buildPathConversions` |

**Freshness / caching / failure modes**

- Snapshot-backed; conversion analysis inherits any association artifacts in `customerJourney.journeys[]`.

---

### `/analytics/demo-analytics` (Primary: Demo Analytics)

**Purpose**

- Provide a demo conversion cockpit: demo volume, completion/no-show rates, lead time to next stage, and a “demo scheduled → close” funnel.

**Visualizations (exhaustive list)**

Rendered by `DemoAnalyticsTab` (`src/components/analytics/demo-analytics-tab.tsx`):

- KPI row (5 `StatCard`s):
  - Demos Scheduled
  - Completed (with completion rate subtitle and positive/negative styling)
  - No-Show Rate (with no-show count subtitle and positive/negative styling)
  - Avg Lead Time (demo → next stage)
  - Demo → Close (conversionFromPrevious on the last funnel step)
- Demo Conversion Funnel panel:
  - bar rows for each step in `demoAnalytics.conversionFunnel[]`
  - width = `step.count / maxCount` with per-step color
  - conversionFromPrevious shown in the right column
- Demo Outcomes panel:
  - `RingStat` for completion rate + `RingStat` for no-show rate
  - outcome breakdown list with colored dot, count, pct (includes `unknown`)
- Bottleneck alerts panel (severity-based callouts):
  - critical when `demo.noShowRate > 20`
  - warning when `demo.avgLeadTimeDays > 14`
  - warning when completion rate < 60
  - success callout when no-show <= 15, avg lead time <= 7, and completion >= 60
- Weekly Demo Trend table (last 8 weeks):
  - scheduled/completed/no-shows + computed attendance %
- Recent Demos table (top 5 by scheduledAt desc):
  - outcome pill + follow-up status + suggested next action text

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=demo-analytics&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Domains required by `SECTION_DOMAINS["demo-analytics"]` in `src/app/api/analytics/route.ts` include the derived `demoAnalytics` domain.

**Series/statistics capture & computation**

Derived server-side by `buildDemoAnalyticsData` (`src/lib/analytics/demo-analytics.ts`):

- Demo inclusion:
  - Deals are considered “demo deals” if their stage is in:
    - `DEMO_STAGES = {"Demo Scheduled","No-Show/Reschedule","Demo Follow-Up"}` OR
    - `POST_DEMO_STAGES = ["Demo Follow-Up","Budgetary Quote Sent","Payment Link Sent","Free Trial","Freemium","Subscription","Closed Won"]`
- Outcome inference:
  - `"No-Show/Reschedule" → "no-show"`
  - `"Demo Scheduled" → "pending"`
  - `stage in POST_DEMO_STAGES → "completed"`
  - otherwise → `"rescheduled"`
  - plus a heuristic: “pending” demos in the past by > 1 day become `"unknown"`
- Timestamp proxies:
  - `scheduledAt` currently uses `deal.createdAt` (fallback to now)
  - `daysToNextStage` uses a proxy based on `Date.now() - deal.updatedAt` for completed demos
- Series:
  - `bySource[]`: group by `deal.source || "Unknown"`
  - `byOutcome[]`: counts across `completed/no-show/rescheduled/pending/unknown`
  - `weeklyTrend[]`: groups by weekStart derived from scheduledAt (Sunday-based)
  - `conversionFunnel[]`: mixes HubSpot funnel counts (`demoScheduled`, `closedWon`) with derived “completed” and “follow-up sent” counts.
  - `journeyPaths[]`: grouped by source and enriched with Stripe churn events if present (heuristic matching by stripeCustomerId/dealId/dealName).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| KPI row | `demoAnalytics.totalScheduled/totalCompleted/totalNoShows/noShowRate/avgLeadTimeDays` | derived builder |
| Funnel | `demoAnalytics.conversionFunnel[]` + `hubspot.funnel.demoScheduled/closedWon` | derived builder + HubSpot |
| Outcomes | `demoAnalytics.byOutcome[]` | derived builder |
| Weekly trend | `demoAnalytics.weeklyTrend[]` | derived builder |
| Recent demos | `demoAnalytics.demos[]` | derived builder (sorted client-side) |

**Freshness / caching / failure modes**

- Snapshot-backed.
- Many values are heuristic (notably `scheduledAt = deal.createdAt` and lead time based on `deal.updatedAt`), so treat as directional.

---

### `/analytics/demo-scheduling` (Child: Demo Scheduling)

**Purpose**

- Provide a scheduling drill-down: weekly density of demos, filters, and a detailed table of demo records.

**Visualizations (exhaustive list)**

Rendered by `DemoSchedulingView` (`src/components/analytics/demo-scheduling-view.tsx`):

- Weekly scheduling density strip (last 12 weeks):
  - each week is a colored block, opacity scales with scheduled count (`scheduled/maxScheduled`)
  - tooltip includes scheduled/completed/no-shows counts
- Outcome filter pills (Completed / No-Show / Rescheduled / Pending) with counts
- Search input (deal name / contact email)
- Demo records table (up to 50 rows) with:
  - deal + source + scheduled date + outcome pill
  - follow-up indicator
  - days to next stage
  - resulting stage

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=demo-scheduling&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

- Uses the same derived `demoAnalytics` domain as `/analytics/demo-analytics` (built by `buildDemoAnalyticsData`).
- Additional client-side computations:
  - `weeklyDensity[]` is derived from `demoAnalytics.weeklyTrend`
  - outcome pills and table are filters over `demoAnalytics.demos[]`

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Density strip | `demoAnalytics.weeklyTrend[]` | derived builder + client normalization |
| Table | `demoAnalytics.demos[]` | derived builder + client filtering |

**Freshness / caching / failure modes**

- Snapshot-backed.
- Search-by-email is limited because `contactEmail` is currently null in demo records.

---

### `/analytics/demo-attribution` (Child: Demo Attribution)

**Purpose**

- Provide source-centric conversion views: per-source completion/no-show rates, a source→outcome matrix, and source-level lifecycle path proxies.

**Visualizations (exhaustive list)**

Rendered by `DemoAttributionView` (`src/components/analytics/demo-attribution-view.tsx`):

- KPI summary row: Top Source, Sources Tracked, Avg Conversion (KPI), Lowest Conversion (for sources with enough volume)
- Source → Outcome Matrix table (scheduled/completed/no-shows + completion/no-show %)
- Customer Journey Path Analysis table (conditional, uses `demoAnalytics.journeyPaths[]`)
- Source Conversion Ranking mini-bar list (top 5)
- Outcome Distribution by Source stacked mini-bars (up to 6 sources) + legend

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=demo-attribution&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

- Uses `demoAnalytics.bySource[]` and `demoAnalytics.journeyPaths[]` from the server-side derived builder.
- Additional client logic:
  - best/worst sources computed by conversionRate
  - no-show % per source computed from scheduled/noShows
  - average conversion KPI is computed by `computeAnalyticsKpis` (`src/lib/analytics/kpis.ts`) as the mean of `bySource[].conversionRate`.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Source KPIs + matrix | `demoAnalytics.bySource[]` | derived builder |
| Journey path table | `demoAnalytics.journeyPaths[]` | derived builder (HubSpot + Stripe churn heuristic) |
| Avg conversion KPI | `kpis.demo.avgConversionRatePct` | `computeAnalyticsKpis` |

**Freshness / caching / failure modes**

- Snapshot-backed.
- Although the API requests additional ad/traffic domains for `demo-attribution`, the current view is primarily driven by `deal.source` and derived demo outcomes.

---

### `/analytics/process-analytics` (Primary: Process Analytics)

**Purpose**

- Provide a pipeline/process health cockpit derived from HubSpot funnel stages: velocity, bottlenecks, health scoring, throughput, leakage, and stage-to-stage conversion.

**Visualizations (exhaustive list)**

Rendered by `ProcessAnalyticsTab` (`src/components/analytics/process-analytics-tab.tsx`):

- KPI row (Health Score, Avg Cycle Time, Bottlenecks, Active Deals)
- Health score breakdown card (RingStat + factor bars + factor detail lines)
- Bottleneck cards list (severity + recommendation) or “no bottlenecks” success callout
- Stage velocity table (avg/median/p90 days + deal count, with bar widths normalized to max avg)
- Weekly throughput trend table (entered/exited/net) when `throughput.length > 1`
- Leakage analysis list (lost count/value/pct + reason chips)
- Stage-to-stage conversion table (from→to + conversion % bar)
- Empty state when `data.processAnalytics` is missing

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=process-analytics&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

Derived server-side by `buildProcessAnalyticsData` (`src/lib/analytics/process-analytics.ts`) from HubSpot deals and funnel stage aggregates:

- Stage velocity (`stageVelocity[]`):
  - For each non-terminal funnel stage, compute day values from `Date.now() - deal.updatedAt` (min 1 day).
  - Aggregations: avg (rounded to 0.1), median, p90.
- Bottlenecks (`bottlenecks[]`):
  - Flag stages where `avgDays > mean(avgDays) * 1.3`; severity from ratio thresholds; top 5.
- Health score (`healthScore`, `healthFactors[]`):
  - Weighted factors: winRate (30), demo attendance / no-show rate (20), bottlenecks (25), cycle time (25).
- Throughput (`throughput[]`):
  - Buckets deals by weekStart based on updatedAt; increments entered/exited depending on terminal stage.
- Leakage points (`leakagePoints[]`):
  - Uses canned leakage stage list + funnel stage count/value and canned reasons.
- Conversion by stage (`conversionByStage[]`):
  - Computed from canonical stage list + funnel stage counts; `avgDays` is currently `0` (explicit placeholder).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Velocity table | `processAnalytics.stageVelocity[]` | derived builder |
| Bottleneck cards | `processAnalytics.bottlenecks[]` | derived builder |
| Health score | `processAnalytics.healthScore/healthFactors[]` | derived builder |
| Throughput | `processAnalytics.throughput[]` | derived builder |
| Leakage | `processAnalytics.leakagePoints[]` | derived builder |
| Stage conversion | `processAnalytics.conversionByStage[]` | derived builder |

**Freshness / caching / failure modes**

- Snapshot-backed for HubSpot inputs; metrics use `deal.updatedAt` as a proxy for time-in-stage and should be treated as directional.

---

### `/analytics/process-bottlenecks` (Child: Bottlenecks)

**Purpose**

- Provide a bottleneck-focused view (top bottleneck stages + velocity comparison + leakage near bottlenecks).

**Visualizations (exhaustive list)**

Rendered by `ProcessBottlenecksView` (`src/components/analytics/process-bottlenecks-view.tsx`):

- KPI row: Total Bottlenecks, Deals Affected, Worst Stage, Avg Cycle Time
- Bottleneck Analysis cards (severity, avg days, deals, p90 when available, recommendation) or “no bottlenecks” success callout
- Stage Velocity Comparison bar list
- Leakage points list (conditional)
- Empty state when `processAnalytics` is missing

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=process-bottlenecks&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

- Uses `processAnalytics.*` derived by `buildProcessAnalyticsData`.
- Screen-local aggregates:
  - critical/warning counts derived from `bottlenecks[].severity`
  - `dealsAffected = sum(bottlenecks[].dealCount)`

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Bottlenecks view | `processAnalytics.bottlenecks[]`, `processAnalytics.stageVelocity[]`, `processAnalytics.leakagePoints[]` | derived builder |

**Freshness / caching / failure modes**

- Snapshot-backed.

---

### `/analytics/process-velocity` (Child: Velocity)

**Purpose**

- Provide a velocity-focused view (avg/median/p90 time-in-stage). As implemented today, this child ID renders the same component as `process-bottlenecks`.

**Visualizations (exhaustive list)**

- Same as `/analytics/process-bottlenecks` (renderer: `ProcessBottlenecksView`).

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=process-velocity&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

- Same `processAnalytics.stageVelocity[]` series and bottleneck detection rules as the primary process analytics section.

**Data sources → surfaced fields mapping**

- Same mappings as `/analytics/process-bottlenecks`.

**Freshness / caching / failure modes**

- Snapshot-backed.

---

### `/analytics/process-health` (Child: Health)

**Purpose**

- Provide a health-focused view (health score, factor breakdown, and recommendations), plus a throughput trend table.

**Visualizations (exhaustive list)**

Rendered by `ProcessHealthView` (`src/components/analytics/process-health-view.tsx`):

- KPI row: Health Score (with grade), Strong Factors, Weak Factors, Avg Cycle
- Overall Pipeline Health gauge (RingStat) + factor list
- Health Factor Breakdown panel (bars + weight labels + detail text)
- Improvement Recommendations list (or “all above threshold” success callout)
- Pipeline Throughput Trend table with a small entered/exited flow bar (conditional)
- Empty state when `processAnalytics` is missing

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=process-health&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

- Uses the same `processAnalytics.healthScore/healthFactors[]/throughput[]` computed by `buildProcessAnalyticsData`.
- “Weak factors” threshold is `score < 70`; recommendations are chosen from a factor-name mapping in the component.

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Health view | `processAnalytics.healthScore/healthFactors[]/throughput[]` | derived builder + client thresholding |

**Freshness / caching / failure modes**

- Snapshot-backed.

---

### `/analytics/process-throughput` (Child: Throughput)

**Purpose**

- Provide a throughput-focused view (weekly entered/exited). As implemented today, this child ID renders the same component as `process-health`.

**Visualizations (exhaustive list)**

- Same as `/analytics/process-health` (renderer: `ProcessHealthView`; the throughput table is the main differentiated element).

**Data inputs (API calls / hooks)**

- `GET /api/analytics?section=process-throughput&range=<preset>&from=YYYY-MM-DD&to=YYYY-MM-DD`

**Series/statistics capture & computation**

- Uses `processAnalytics.throughput[]` computed by `buildProcessAnalyticsData` (weekly buckets derived from deal.updatedAt).

**Data sources → surfaced fields mapping**

| UI element | Payload field(s) | Origin |
|---|---|---|
| Throughput table | `processAnalytics.throughput[]` | derived builder |

**Freshness / caching / failure modes**

- Snapshot-backed.

---

## Appendices

### Appendix A — Analytics provider capture specs (endpoints, metrics, auth)

This appendix documents how each Analytics provider domain is captured in code (auth method, endpoints, and key metrics/dimensions).

#### Google Analytics (GA4) — `googleAnalytics`

- Fetcher: `src/lib/analytics/fetchers-ga-webflow.ts` (`fetchGAData`)
- Auth:
  - OAuth2 refresh token: `GA_REFRESH_TOKEN` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, or
  - Service account JWT: `GA_CLIENT_EMAIL` + `GA_PRIVATE_KEY`
- Endpoints:
  - `POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport`
- Reports executed in parallel:
  - Current period totals: metrics `sessions,totalUsers,screenPageViews,bounceRate,averageSessionDuration`
  - Previous period totals: same metrics
  - Traffic by channel + date: dimensions `sessionDefaultChannelGroup,date`, metrics `sessions,totalUsers,screenPageViews`
  - Top pages: dimension `pagePath`, metrics `screenPageViews,averageSessionDuration`, ordered by pageviews desc, limit 10

#### Webflow — `webflow`

- Fetcher: `src/lib/analytics/fetchers-ga-webflow.ts` (`fetchWebflowData`)
- Auth: bearer token `WEBFLOW_API_TOKEN` + `WEBFLOW_SITE_ID`
- Endpoints:
  - `GET https://api.webflow.com/v2/sites/{siteId}`
  - `GET https://api.webflow.com/v2/sites/{siteId}/pages`
  - `GET https://api.webflow.com/v2/sites/{siteId}/collections`
  - `GET https://api.webflow.com/v2/sites/{siteId}/form_submissions`
- Metrics captured:
  - structural: siteName, lastPublished, totalPages, totalCollections, customDomains
  - form submissions count by formName
- Known stubbed fields:
  - `traffic`, `bounceRate`, `clicks`, `returningVisitors` are currently hardcoded to `0`.

#### Google Ads — `googleAds`

- Fetcher: `src/lib/analytics/fetchers-ads.ts` (`fetchGoogleAdsData`)
- Auth:
  - refresh token exchange via `https://oauth2.googleapis.com/token`
  - requires developer token + customer id + client id/secret
- Endpoint:
  - `POST https://googleads.googleapis.com/v21/customers/{customerId}/googleAds:searchStream`
- Query (GAQL):
  - `SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN ... AND campaign.status='ENABLED'`
- Derived metrics:
  - CTR, CPC, CPA, estimatedRevenue (=conversions*500), ROAS

#### Meta Ads — `metaAds`

- Fetcher: `src/lib/analytics/fetchers-ads.ts` (`fetchMetaAdsData`)
- Auth: user/system user bearer token (rejects app tokens that look like `app_id|...`)
- Endpoints:
  - `GET https://graph.facebook.com/v21.0/act_{adAccountId}/insights?fields=spend,impressions,clicks,actions&time_range=...&level=account`
  - `GET https://graph.facebook.com/v21.0/act_{adAccountId}/campaigns?fields=name,insights{spend,impressions,clicks,actions}&time_range=...`
- Conversions:
  - extracted from `actions[]` by matching action_type containing “lead” or offsite conversion.

#### Meta Page — `metaPage`

- Fetcher: `src/lib/analytics/fetchers-ads.ts` (`fetchMetaPageData`)
- Endpoints:
  - `GET /{pageId}?fields=fan_count,followers_count`
  - `GET /{pageId}/insights?metric=page_impressions,page_engaged_users&since&until`
  - `GET /{pageId}/posts?fields=message,insights{metric(post_impressions,post_engaged_users)},created_time&limit=5`
- Known stubbed fields:
  - `traffic`, `bounceRate`, `clicks`, `returningVisitors` are hardcoded `0`.

#### Instagram — `instagram`

- Fetcher: `src/lib/analytics/fetchers-ads.ts` (`fetchMetaInstagramData`)
- Endpoints:
  - `GET /{instagramAccountId}?fields=id,username,followers_count,media_count`
  - `GET /{instagramAccountId}/media?fields=id,caption,timestamp,like_count,comments_count`
- Derived:
  - `engagement30d` computed as sum(likes+comments) across fetched media
  - `reach30d` proxied as `engagement30d` (explicit proxy)

#### Reddit Ads — `redditAds`

- Fetcher: `src/lib/analytics/fetchers-ads.ts` (`fetchRedditAdsData`)
- Auth:
  - refresh token exchange: `POST https://www.reddit.com/api/v1/access_token`
  - then bearer access token to ads API
- Endpoints:
  - `GET https://ads-api.reddit.com/api/v3/ad_accounts/{adAccountId}/campaigns`
  - `POST https://ads-api.reddit.com/api/v3/ad_accounts/{adAccountId}/reports`
    - breakdowns: `["CAMPAIGN_ID"]`
    - fields include spend/impressions/clicks and multiple conversion counters
- Conversions:
  - summed from lead/purchase/sign_up/custom conversions

#### HubSpot — `hubspot` (and `hubspotOps` telemetry)

- Fetcher: `src/lib/analytics/fetchers.ts` (`fetchHubSpotData`, `fetchHubSpotContacts`)
- Auth: bearer token (PAT/OAuth)
- Deal endpoints:
  - `GET https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=...&after=...`
  - Owners:
    - `GET https://api.hubapi.com/crm/v3/owners?limit=100`
- Contact endpoints:
  - Search:
    - `POST https://api.hubapi.com/crm/v3/objects/contacts/search` with createdate filters
  - Lightweight count:
    - `GET https://api.hubapi.com/crm/v3/objects/contacts?limit=1&properties=createdate` (uses `total` field)
- Stage mapping:
  - `HUBSPOT_STAGE_MAP` maps raw `dealstage` IDs to labels.

#### Stripe — `stripe`

- Fetcher: `src/lib/analytics/fetchers.ts` (`fetchStripeData`, `fetchStripeChargesByCustomer`)
- Auth: secret key bearer token
- Endpoints:
  - `GET https://api.stripe.com/v1/subscriptions?...`
  - `GET https://api.stripe.com/v1/charges?...` (with created range; optionally with `customer=...`)
- Key computations:
  - monthly-normalized MRR from subscription recurring interval
  - 30d revenue from succeeded charges
  - payment success rate from succeeded vs failed charges in range
- Known stub:
  - `mrrChange` is returned as `0`.

#### Mercury — `mercury`

- Fetcher: `src/lib/analytics/fetchers.ts` (`fetchMercuryData`)
- Endpoints:
  - `GET https://api.mercury.com/api/v1/accounts`
  - `GET https://api.mercury.com/api/v1/account/{id}/transactions?start=...&end=...`

#### Coda — `coda` (and `codaOps` telemetry)

- Fetcher: `src/lib/analytics/fetchers-coda.ts` (`fetchCodaData`)
- Endpoints:
  - `GET https://coda.io/apis/v1/docs/{docId}/tables`
  - `GET https://coda.io/apis/v1/docs/{docId}/tables/{tableId}/columns`
  - `GET https://coda.io/apis/v1/docs/{docId}/tables/{tableId}/rows?...` (paged)

#### SEMrush — `semrush`

- Fetcher: `src/lib/analytics/fetchers-semrush.ts` (`fetchSemrushData`)
- Endpoints: SEMrush CSV APIs using `type=` and `export_columns=` parameters.

#### Pylon — `pylon`

- Fetcher: `src/lib/analytics/fetchers-pylon.ts` (`fetchPylonData`)
- Underlying client: `src/lib/integrations/pylon-client`
- Captures:
  - issue counts and averages derived from issue fields, with “urgent/waiting/resolved” heuristics.

#### Integration telemetry — `googleWorkspace`, `slack`, `codaOps`, `hubspotOps`, `redditOps`

- Fetcher: `src/lib/analytics/fetchers-integrations.ts` (`fetchIntegrationTelemetryData`)
- Inputs:
  - `IntegrationRule` rows (enabled/lastError)
  - `IntegrationReceipt` rows in range (receipt count and tasks created)
  - `OutboxEvent` failures in range (by provider eventType prefix)

---

### Appendix B — Derived domains (where computed)

These are not “direct provider payloads”; they are computed from one or more domains:

- Lifecycle funnel (`lifecycleFunnel`) and cross funnel (`funnelJourney`):
  - Computed by `buildLifecycleFunnelData` / `buildCrossFunnelData` in `src/lib/analytics/funnel.ts`.
  - Evidence segments explicitly list contributing provider domains and confidence weights.
- Customer journey (`customerJourney`):
  - Computed by `buildCustomerJourneyData` in `src/lib/analytics/customer-journey.ts`.
  - Touchpoints are derived from multiple provider payloads using heuristics.
- Demo analytics (`demoAnalytics`):
  - Computed by `buildDemoAnalyticsData` in `src/lib/analytics/demo-analytics.ts`.
  - Relies heavily on HubSpot stage label semantics.
- Process analytics (`processAnalytics`):
  - Computed by `buildProcessAnalyticsData` in `src/lib/analytics/process-analytics.ts`.
  - Uses stage velocity approximations based on `deal.updatedAt` as a proxy.
- AI insights (`aiInsights`) and distilled insights (`distilledInsights`):
  - Computed by `buildAiInsightsBundle` and `buildDistilledInsights` in `src/lib/analytics/insight-engine.ts`.
  - Each insight includes evidence entries referencing provider metrics and staleness flags.
- KPIs (`kpis`):
  - Computed by `computeAnalyticsKpis` in `src/lib/analytics/kpis.ts`.
  - Consolidates a “headline dashboard” across finance/sales/demo/traffic/ads/ops/support/AI.

---

### Appendix C — Known limitations / gaps (explicit)

The following gaps are present in code today and can cause dashboards to show misleading zeros unless called out:

- Webflow traffic metrics are placeholders:
  - `fetchWebflowData` returns `traffic/bounceRate/clicks/returningVisitors = 0`.
- Meta Page traffic metrics are placeholders:
  - `fetchMetaPageData` returns `traffic/bounceRate/clicks/returningVisitors = 0`.
- Instagram reach is currently a proxy:
  - `fetchMetaInstagramData` sets `reach30d = engagement30d` (likes+comments).
- Stripe `mrrChange` is currently stubbed:
  - `fetchStripeData` returns `revenue.mrrChange = 0`.
- Analytics overview “cross-domain insights” panel placeholder:
  - `AnalyticsSummaryPage` renders `CrossDomainInsightsPanel` with `data={null}`.
- Several derived analytics computations are heuristic and should be treated as directional:
  - Process analytics stage velocity uses `Date.now() - deal.updatedAt` rather than true stage-enter timestamps.
  - Customer journey touchpoint association filters by `detail.includes(dealName)` and other coarse rules.
  - Customer journey association currently includes all HubSpot touchpoints and all “first-touch” touchpoints in every journey (because of the `tp.channel==="hubspot" || tp.type==="first-touch"` rule).
  - Demo analytics uses proxies: `scheduledAt = deal.createdAt` and (for completed demos) `daysToNextStage = Date.now() - deal.updatedAt`.
- Customer journey records currently do not include contact emails:
  - `buildCustomerJourneyData` sets `contactEmail: null` for all journeys.
- Demo records currently do not include contact emails:
  - `buildDemoAnalyticsData` sets `contactEmail: null` for all demos.
- Process analytics “conversion by stage” does not compute stage dwell time:
  - `buildConversionByStage` sets `avgDays: 0` (explicit placeholder).
- Some sections request domains that are not consumed by the current renderer/derived builders:
  - `demo-attribution` requests ad/traffic domains in `SECTION_DOMAINS`, but the view is driven primarily by HubSpot `deal.source` and derived demo outcomes.
  - `process-analytics` requests `stripe` in `SECTION_DOMAINS`, but `buildProcessAnalyticsData` reads HubSpot data only.

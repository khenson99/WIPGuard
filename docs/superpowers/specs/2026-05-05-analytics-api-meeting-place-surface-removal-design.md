# Analytics API Meeting Place Surface Removal

Date: 2026-05-05

## Purpose

WIPGuard is pivoting away from task management. The product should become an analytics API meeting place: a governed layer where source systems meet, metrics are computed consistently, freshness and lineage are visible, and reports/API consumers can reuse the same trusted facts.

This phase removes the task-management product surface while retaining legacy task, project, sprint, and board tables as internal historical inputs until analytics dependencies are replaced.

## Product Decision

Use the product-surface removal path first.

User-facing navigation, routes, settings, and calls to action should stop presenting WIPGuard as a task, board, sprint, standup, or WIP management tool. Legacy task-related APIs and Prisma models stay temporarily so existing analytics, customer-success summaries, automations, and CEO metric lineage do not break during the transition.

## In Scope

- Make `/analytics` the primary authenticated landing experience. Keep `/analytics/ceo` as a prominent analytics child route.
- Remove task-management entries from primary navigation and workspace definitions.
- Hide or redirect these product routes from the main UI:
  - `/board`
  - `/tasks`
  - `/my-tasks`
  - `/projects`
  - `/standup`
  - `/today`
  - `/whip`
  - `/table`
- Remove board/project/sprint/priority/department settings tabs from the visible settings surface unless a tab directly supports analytics source configuration.
- Remove dashboard cards, empty states, and CTAs that push users toward managing tasks or boards.
- Reframe task-derived analytics as legacy internal execution data where still displayed.
- Keep existing CEO metrics and reports working, but label task-flow metrics as internal execution metrics until replaced by provider snapshot/event metrics.
- Keep task-related API routes and Prisma models available for legacy/internal dependencies in this phase.

## Out of Scope

- Deleting Prisma `Task`, `Project`, `Sprint`, board settings, priority, or department models.
- Dropping task-related database tables.
- Removing internal integrations that currently create or update local tasks.
- Replacing every task-derived metric with a new event model.
- Public API version removals for `/api/tasks`, `/api/projects`, or `/api/sprints`.

Those belong in a later hard-deprecation phase after analytics replacements exist.

## Architecture

The app shell should define the new product shape through workspace configuration. The visible top-level product areas should be:

- Analytics
- CEO Metrics and Reports
- Integrations
- Deals, framed as revenue source context rather than pipeline task execution
- Automations, framed around analytics sync, data processing, reports, and remediation artifacts

Task-management modules become legacy/internal modules. They remain importable by analytics and integration jobs but should not be reachable from primary user navigation.

## Data Flow

No database migration is required in this phase.

Existing analytics data flow remains:

1. Provider integrations fetch or sync source data.
2. Analytics snapshots store provider payloads and source health.
3. Canonical metrics compute from provider snapshots plus retained legacy internal data where necessary.
4. CEO reports and analytics UI consume canonical metric output.

The only change is product routing and presentation: users enter through analytics/reporting surfaces, not task execution surfaces.

## Route Behavior

Deprecated product routes should not 404 abruptly. They should redirect authenticated users to the closest analytics surface:

- `/board`, `/tasks`, `/my-tasks`, `/projects`, `/table` -> `/analytics`
- `/standup`, `/today`, `/whip` -> `/analytics`

If a route still needs to exist for a hidden internal workflow, it should render no primary navigation affordance and should be marked legacy in code comments or route metadata.

## API Behavior

Task APIs remain available but should be treated as legacy/internal. No public removal happens in this phase.

If a user-facing automation still creates local tasks, it should either:

- remain hidden from the product surface, or
- be relabeled as creating remediation artifacts instead of task-board work, if that can be done without changing behavior.

Actual task-write behavior changes are deferred unless a workflow is visibly exposed in the UI.

## UI Behavior

The UI should use analytics-first language:

- "Sources"
- "Metrics"
- "Freshness"
- "Lineage"
- "Reports"
- "Exports"
- "Readiness"
- "Provider health"
- "Data quality"

Avoid primary labels such as:

- "Board"
- "Tasks"
- "My Tasks"
- "Projects"
- "Sprints"
- "Standup"
- "WIP"

Historical/internal metric labels may still mention internal execution data when needed for accuracy.

## Testing

Focused tests should cover:

- Workspace/navigation config no longer exposes task-management destinations.
- Deprecated product routes redirect to analytics destinations.
- Settings no longer exposes board/project/sprint/priority/department product tabs.
- Analytics and CEO routes still render.
- Existing task APIs still compile and existing analytics tests pass.

Regression gates:

- `npm test`
- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run build`

## Rollout

This change is production-safe because it does not delete data or schema. It changes product entry points and visible navigation first. After deployment, validate:

- `/` lands on the analytics-first experience.
- `/analytics` loads.
- `/analytics/ceo` loads.
- `/integrations` loads.
- Deprecated task-management routes redirect.
- CEO report generation still works.

## Follow-Up Phase

After this surface removal is stable, replace task-derived analytics with provider snapshot and event-derived metrics. Once no board-grade metric or integration depends on legacy task tables, plan a separate hard-deprecation migration for task/project/sprint/board schema and APIs.

# Decision Dashboard Metric Definitions

This document defines the executive decision dashboard exposed by `/api/analytics/decision-dashboard`.

## Tunable Query Parameters
- `lookbackDays` (7-120): analysis window for north-star and action metrics.
- `monthlyWindowMonths` (3-12): number of months included in board export.
- `staleTaskDays` (1-45): inactivity threshold for stale active work.

## Event Definitions
- `task.created` from `Task.createdAt`
- `task.status_changed` from `StatusHistory.changedAt`
- `task.completed` from `Task.completedOn` and status transitions to `DONE`
- `task.blocked` from status transitions to `NOT_DONE`
- `task.overdue_open` from open tasks with past-due `dueDate`

Every metric in the payload references these definitions to avoid interpretation drift.

## North-Star
- `flowReliabilityScore`: composite score balancing overdue rate, stale WIP rate, blocker event rate, throughput trend, and on-time delivery.
- `throughput30d`: tasks completed in lookback window.
- `throughputTrendPct`: comparison versus previous equally sized window.
- `onTimeCompletionRate`: completed tasks with due dates finished on/before due date.
- `activeContributors30d`: distinct users creating or moving work.

## Supporting Flow Health
- Open/blocked/overdue/stale WIP counts.
- Reblocked tasks (tasks entering `NOT_DONE` 2+ times in lookback).
- WIP limit breaches by column based on `BoardSettings`.
- Unplanned completion rate for the lookback window.

## Cohort View
Task cohorts are grouped into:
- `CEO`: admin-owned or admin-sponsored work
- `MARKETING`: project department includes marketing/growth
- `SALES`: project department includes sales/revenue
- `OPS`: project department includes ops/operations
- `OTHER`: fallback

Each cohort includes active workload, overdue pressure, stale WIP, completion, and unplanned completion signals.

## Monthly Board Export
- Rows include `created`, `completed`, `netFlow`, `overdueCarryover`, `unplannedCompleted`.
- Narrative annotations are generated from monthly anomalies (intake > completion, overdue carryover, unplanned spikes, or strong burn-down).
- Payload includes a pre-rendered markdown report for copy/paste into board updates.

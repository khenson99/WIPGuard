# Flow Risk Intelligence Definitions

This document defines the risk signals served by `/api/flow/risk`.

## Query Parameters (Tunable Thresholds)
- `personWipLimit` (1-12)
- `staleTaskDays` (1-60)
- `blockerLookbackDays` (7-120)
- `chronicBlockerThreshold` (2-12)
- `fixedDateLookaheadDays` (1-60)
- `staleDependencyDays` (1-60)
- `riskAlertMinScore` (10-95)
- `maxRecommendations` (3-30)

## WIP Pressure
- Per-person pressure: active tasks (`QUEUED`, `WORKING_ON_TODAY`, `ACTIVE`, `NOT_DONE`) divided by `personWipLimit`.
- Per-column pressure: current task count divided by configured board WIP limit.
- Output includes pressure ratio, pressure score, and overload flag for explainability.

## Chronic Blockers
- Source: `StatusHistory` transitions to `NOT_DONE`.
- Signal: task exceeds `chronicBlockerThreshold` blocker transitions inside `blockerLookbackDays`.
- Output includes transition count, last blocked timestamp, and human-readable reasons.

## Stale Dependency Chains
- Source: task dependency graph (`Task.dependsOn`) plus dependency `updatedAt`/`dueDate`.
- Signal: dependency is stale (`updatedAt` older than `staleDependencyDays`) or overdue.
- Output includes blocked dependency IDs, stale counts, max stale age, urgency score, and reasons.

## Fixed-Date Risk Alerts
- Source: non-done tasks with `dueDate` inside lookahead window.
- Risk score combines:
  - due-date urgency / overdue age
  - execution progress (`BACKLOG`/`QUEUED`)
  - stale dependency chains
  - stale task inactivity
  - owner WIP overload
- Alerts are emitted only when score >= `riskAlertMinScore`.

## Recommendation Feed
- Automatically publishes explainable de-scope recommendations by type:
  - reduce owner WIP load
  - split chronic blockers
  - escalate stale dependency chains
  - protect fixed-date commitments
- Recommendations include rationale, target task IDs, and concrete suggested actions.

## Slippage Correlation Signal
- Calculates a correlation between risk score and observed slippage (`overdue days`) for fixed-date alerts.
- Also reports high-risk overdue rate versus baseline overdue rate to keep risk model tuning explicit.

# Flow Analytics Definitions

This document defines the metrics served by `/api/flow/metrics`.

## Query Parameters
- `from`: optional ISO timestamp or `YYYY-MM-DD` (default: now - 30 days)
- `to`: optional ISO timestamp or `YYYY-MM-DD` (default: now)
- `interval`: optional `day` or `week` (default: `day`)

Responses include fixed bucket boundaries (`bucketStart`, `bucketEnd`) so both dashboard
visualizations and export consumers can reproduce the same aggregations.

## Cumulative Flow Diagram (CFD)
- Source: `Task.createdAt`, `StatusHistory.changedAt`, `StatusHistory.toStatus`
- Definition: Count of tasks in each workflow status at the end of each interval bucket.
- Use: Visualize WIP distribution and queue buildup over time.

## Throughput
- Source: `StatusHistory.toStatus = DONE`
- Definition: Number of tasks that transitioned to DONE in each interval bucket.
- Use: Measure delivery output and completion velocity.

## Lead Time
- Source: `Task.createdAt` -> first `DONE` transition (`StatusHistory`) or `Task.completedOn` fallback.
- Definition: Duration in days from task creation to completion.
- Use: End-to-end flow efficiency measurement.

## Cycle Time
- Source: first `ACTIVE` / `WORKING_ON_TODAY` transition -> first `DONE` transition.
- Definition: Duration in days spent in active execution before completion.
- Use: Execution efficiency after work starts.

## Data Quality Validation
- Checks for:
  - missing status history
  - status transitions before task creation
  - from-status chain mismatches
  - DONE tasks missing completion transition/timestamp
- Output includes issue counts and sampled task IDs for traceability.

# WIPGuard PRD v2 - Ralph Team Loop Execution Plan

Version: 2.0
Date: 2026-02-13
Source baseline: `docs/prd/WIPGuard_PRD_v1_extracted.md`
Owner: khenson99 / Arda GTM

## 1. Intent

This PRD upgrades WIPGuard from a strong internal prototype into a category-defining GTM execution system by combining:
- strict Kanban/WIP-limited flow control,
- GTM-native workflows and integrations,
- reliability/observability standards from modern software operations,
- behavioral and organizational design from Lean, Theory of Constraints, and human factors.

The execution strategy is designed for Ralph Team Loop operation with atomic, label-routed GitHub issues.

## 2. Product North Star

WIPGuard should make overcommitment visibly expensive, finishing work visibly rewarding, and record-keeping automatic.

North-star outcome:
- For a 5-25 person GTM team, increase finished work per sprint while decreasing concurrent work, without requiring additional status-meeting overhead.

## 3. Design Principles (Cross-Discipline)

1. Kanban first
- WIP is treated as a budget, not a suggestion.
- Every policy must make queue size obvious and actionable.

2. Theory of Constraints
- Identify and protect bottlenecks (people, queues, dependencies).
- Elevate flow over local utilization.

3. Queueing science
- Reduce average cycle time by reducing queue depth and context switching.
- Prioritize flow efficiency over raw task-start count.

4. Human factors
- Reduce cognitive load in high-churn GTM contexts (field sales, customer escalations).
- Build fast recognition interfaces (minimal card mode, standup cockpit).

5. SRE reliability
- Define SLOs for board latency, event delivery, and integration sync freshness.
- Instrument and alert on flow regressions, not just infra uptime.

6. Behavioral economics
- Default workflows should reward completion and expose cost-of-starting.
- Use visual cues and lightweight guardrails before hard blocks.

7. Safety science / pre-mortem
- Explicitly model likely operational failures (sync loops, stale tasks, alert fatigue).
- Add reversible controls and auditability for all automations.

## 4. Scope

In scope for this execution wave:
- P0/P1 completion and hardening from v1 PRD.
- Integration backbone (HubSpot, Slack, Google Workspace).
- Flow analytics and operational intelligence.
- Test, accessibility, performance, and rollout discipline.

Out of scope for this wave:
- Native mobile apps (web responsive + offline-lite only).
- Multi-tenant enterprise hierarchy.
- Public API marketplace.

## 5. Success Metrics

Flow metrics:
- 30% reduction in average cycle time by Day 60.
- 40% reduction in WIP violations per sprint by Day 45.
- >85% weekly flow efficiency (active time / total elapsed) for committed work.

Adoption metrics:
- >95% daily active usage across GTM team.
- >90% standups run from WIPGuard without external artifacts.

Reliability metrics:
- p95 board interaction latency < 300ms.
- integration event success >= 99.5% with replay.
- no silent sync failures > 5 minutes.

Business metrics:
- 20% reduction in deal cycle time by Month 3.
- unplanned work ratio visible daily and trending down.

## 6. System Architecture Direction

- Frontend: Next.js 16, React 19, typed component system.
- Backend: Next API routes moving toward service-layer boundaries.
- Data: PostgreSQL + Prisma with explicit outbox/event ledger.
- Realtime: Socket.IO with idempotent event handling.
- Integrations: queue-backed workers with retries, DLQ, and audit trails.
- Observability: metrics, traces, structured logs tied to task/deal IDs.

## 7. Delivery Method (Ralph Team Loop)

- Planner translates this PRD into atomic issues.
- Architect orchestrates dependency order and flow.
- Backend/Frontend/QA/Design agents execute with strict acceptance criteria.
- Reviewer enforces correctness, test evidence, and quality gates.

WIP policy for execution board:
- Max 2 in-progress tickets per agent lane.
- No new feature ticket starts when `status:blocked` ticket count > 3.
- Expedite lane reserved for production incidents only.

## 8. Ticket Catalog (Tasks + Subtasks)

### WGX-001 - Policy engine for WIP enforcement and override governance
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:feature` `repo:backend` `status:ready`
Dependencies: none
Subtasks:
- [ ] Implement policy model for soft warning, hard block, and role-based override.
- [ ] Persist override reason, actor, and timestamp.
- [ ] Add API guardrails for drag, advance, and bulk reorder paths.
- [ ] Expose policy config endpoints for settings UI.
Acceptance criteria:
- [ ] Every status transition path enforces the same policy behavior.
- [ ] Override events appear in audit history.
- [ ] Policy changes take effect without restart.

### WGX-002 - Replenishment and commitment protocol UX
Primary agent: frontend
Labels: `agent:frontend` `priority:high` `type:feature` `repo:frontend` `status:ready`
Dependencies: WGX-001
Subtasks:
- [ ] Add explicit replenish action for pulling from backlog to queued.
- [ ] Add commitment marker for sprint-committed items.
- [ ] Add contextual warnings when pulling work without free WIP budget.
- [ ] Add standup-ready visual badges for committed/uncommitted.
Acceptance criteria:
- [ ] Users can distinguish committed and opportunistic work at a glance.
- [ ] Replenishment actions are logged and reversible.

### WGX-003 - Class of service lanes (standard, fixed-date, expedite)
Primary agent: frontend
Labels: `agent:frontend` `priority:medium` `type:feature` `repo:frontend` `status:ready`
Dependencies: WGX-001
Subtasks:
- [ ] Add class-of-service field and lane styling tokens.
- [ ] Add expedite policy explanation and visual debt indicator.
- [ ] Add fixed-date breach risk highlight.
- [ ] Add filtering by class of service.
Acceptance criteria:
- [ ] Class of service is visible on cards, board, and table.
- [ ] Expedite usage is measurable per sprint.

### WGX-004 - Concurrency-safe board mutations and ordering integrity
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:feature` `repo:backend` `status:ready`
Dependencies: WGX-001
Subtasks:
- [ ] Add optimistic locking/version checks for task status updates.
- [ ] Add deterministic order compaction routine per column.
- [ ] Add conflict response payload for simultaneous edits.
- [ ] Ensure websocket events remain idempotent under retries.
Acceptance criteria:
- [ ] Parallel drag operations never corrupt column order.
- [ ] Conflict cases are user-visible and recoverable.

### WGX-005 - Hierarchy correctness and inheritance engine hardening
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:feature` `repo:backend` `status:ready`
Dependencies: WGX-004
Subtasks:
- [ ] Enforce parent-child integrity constraints.
- [ ] Implement deterministic RACI inheritance resolution.
- [ ] Add recursive retrieval endpoint for Priority->Project->Epic->Task->Subtask.
- [ ] Add migration checks for orphaned relationships.
Acceptance criteria:
- [ ] Inheritance behavior is predictable and tested.
- [ ] Hierarchy endpoint supports board and table consumers.

### WGX-006 - Sprint commitment ledger and planned/unplanned flow model
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:feature` `repo:backend` `status:ready`
Dependencies: WGX-005
Subtasks:
- [ ] Add planning-session entity and link to task creation/update events.
- [ ] Add immutable sprint commitment snapshot at sprint start.
- [ ] Add unplanned reason taxonomy.
- [ ] Add API for planned vs unplanned deltas by day.
Acceptance criteria:
- [ ] Sprint reports clearly separate planned and unplanned throughput.
- [ ] Mid-sprint additions are attributable to actor and reason.

### WGX-007 - Whip View for scope creep and WIP pressure
Primary agent: frontend
Labels: `agent:frontend` `priority:high` `type:feature` `repo:frontend` `status:ready`
Dependencies: WGX-006
Subtasks:
- [ ] Build Whip View page with planned vs unplanned timeline.
- [ ] Visualize WIP pressure index by day and assignee.
- [ ] Add quick actions to de-scope or defer unplanned tasks.
- [ ] Add sprint retrospective export cards.
Acceptance criteria:
- [ ] Scope creep is visible within 10 seconds during standup.
- [ ] Users can filter by sprint, priority, and owner.

### WGX-008 - Outbox/event bus foundation for integrations
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:feature` `repo:shared` `status:ready`
Dependencies: WGX-004
Subtasks:
- [ ] Implement transactional outbox table for domain events.
- [ ] Add worker with retries, jitter backoff, and dead-letter queue.
- [ ] Add idempotency keys and replay tooling.
- [ ] Add operational dashboards for event lag and failures.
Acceptance criteria:
- [ ] Integration events survive transient failures without duplicates.
- [ ] Operators can replay failed events safely.

### WGX-009 - HubSpot bi-directional sync MVP
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:feature` `repo:backend` `status:ready`
Dependencies: WGX-008
Subtasks:
- [ ] Implement mapping config between task statuses and deal stages.
- [ ] Sync task transitions to HubSpot with idempotency.
- [ ] Ingest HubSpot stage changes and reconcile task status.
- [ ] Add drift detection and conflict resolution strategy.
Acceptance criteria:
- [ ] Stage changes sync both directions within SLO.
- [ ] Conflicts are logged and resolvable without data loss.

### WGX-010 - Slack integration for flow events and task capture
Primary agent: backend
Labels: `agent:backend` `priority:medium` `type:feature` `repo:backend` `status:ready`
Dependencies: WGX-008
Subtasks:
- [ ] Post assignment/status/blocked notifications.
- [ ] Support creating tasks from Slack messages.
- [ ] Add mention-to-notification bridge for RACI fields.
- [ ] Add channel routing policies by project or priority.
Acceptance criteria:
- [ ] Slack updates are actionable and non-spammy.
- [ ] Task creation from Slack includes source traceability.

### WGX-011 - Google Workspace context (Calendar + Gmail)
Primary agent: backend
Labels: `agent:backend` `priority:medium` `type:feature` `repo:backend` `status:ready`
Dependencies: WGX-008
Subtasks:
- [ ] Surface upcoming meetings on relevant tasks.
- [ ] Link Gmail threads to tasks with permission checks.
- [ ] Add one-click event creation from tasks.
- [ ] Add sync health indicators per user.
Acceptance criteria:
- [ ] Meeting and thread context appears on task detail reliably.
- [ ] Users can revoke access cleanly.

### WGX-012 - Standup cockpit with flow coaching prompts
Primary agent: frontend
Labels: `agent:frontend` `priority:high` `type:feature` `repo:frontend` `status:ready`
Dependencies: WGX-006
Subtasks:
- [ ] Build standup view grouped by owner and blocked state.
- [ ] Add prompts for finish-before-start when WIP exceeds limits.
- [ ] Add one-click action suggestions: unblock, defer, split.
- [ ] Add facilitator mode for screen-share use.
Acceptance criteria:
- [ ] Team can run full daily standup from this page.
- [ ] Standup duration and blockers are captured automatically.

### WGX-013 - Minimal card mode and cognitive load controls
Primary agent: frontend
Labels: `agent:frontend` `priority:medium` `type:feature` `repo:frontend` `status:ready`
Dependencies: WGX-002
Subtasks:
- [ ] Add dense card mode (title + essential signals only).
- [ ] Add per-user display presets.
- [ ] Add progressive disclosure for metadata on demand.
- [ ] Add keyboard navigation for high-speed triage.
Acceptance criteria:
- [ ] Heavy users can scan large boards with reduced eye-travel.
- [ ] Mode switches do not alter task data or ordering.

### WGX-014 - Flow analytics engine (CFD, throughput, cycle/lead)
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:feature` `repo:shared` `status:ready`
Dependencies: WGX-006, WGX-008
Subtasks:
- [ ] Build analytics aggregation jobs from status history.
- [ ] Add CFD and throughput APIs with date-window parameters.
- [ ] Add cycle-time and lead-time computation with percentile outputs.
- [ ] Add data-quality validation for missing timestamps.
Acceptance criteria:
- [ ] Metrics are reproducible and traceable to raw events.
- [ ] APIs support dashboard and export consumers.

### WGX-015 - Constraint and flow-risk intelligence
Primary agent: backend
Labels: `agent:backend` `priority:medium` `type:feature` `repo:shared` `status:ready`
Dependencies: WGX-014
Subtasks:
- [ ] Compute WIP pressure score per person/column.
- [ ] Detect chronic blockers and stale dependency chains.
- [ ] Generate risk alerts for fixed-date items.
- [ ] Publish recommendation feed for de-scoping actions.
Acceptance criteria:
- [ ] Risk scores correlate with observed slippage.
- [ ] Alerts are explainable and tunable.

### WGX-016 - Observability, SLOs, and incident operations
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:chore` `repo:shared` `status:ready`
Dependencies: WGX-008
Subtasks:
- [ ] Define service-level objectives for board and integrations.
- [ ] Instrument structured logs/metrics/traces by domain event.
- [ ] Add runbooks for sync lag, queue backup, and websocket degradation.
- [ ] Add lightweight on-call dashboard for product + engineering.
Acceptance criteria:
- [ ] SLO breaches are detectable within 5 minutes.
- [ ] Runbooks are executable and tested.

### WGX-017 - Authentication, authorization, and audit hardening
Primary agent: backend
Labels: `agent:backend` `priority:high` `type:feature` `repo:backend` `status:ready`
Dependencies: WGX-001
Subtasks:
- [ ] Add role-based permission matrix for admin/member/observer.
- [ ] Harden invite flow with signed, expiring tokens.
- [ ] Add security audit events for privileged operations.
- [ ] Add session and OAuth token hygiene checks.
Acceptance criteria:
- [ ] Unauthorized state transitions are blocked across all endpoints.
- [ ] Audit trail covers all policy and permission changes.

### WGX-018 - Design system conformance and accessibility remediation
Primary agent: design-system
Labels: `agent:design-system` `priority:high` `type:chore` `repo:frontend` `status:ready`
Dependencies: WGX-013
Subtasks:
- [ ] Normalize color/token usage to Arda design tokens.
- [ ] Remediate contrast, focus state, and semantic landmark issues.
- [ ] Validate keyboard-only board and modal flows.
- [ ] Publish UI compliance checklist for future PR review.
Acceptance criteria:
- [ ] WCAG AA compliance for key workflows.
- [ ] Design drift checks are automatable.

### WGX-019 - QA quality gate suite (unit, integration, e2e, contract)
Primary agent: qa
Labels: `agent:qa` `priority:high` `type:test` `repo:shared` `status:ready`
Dependencies: WGX-005, WGX-006, WGX-008
Subtasks:
- [ ] Establish API integration tests for task lifecycle and policies.
- [ ] Add Playwright flows for board, standup, and settings.
- [ ] Add integration contract tests for HubSpot/Slack/Google adapters.
- [ ] Add CI gate that fails on coverage or critical flow regressions.
Acceptance criteria:
- [ ] Critical user journeys are test-covered in CI.
- [ ] Regression signals are actionable within one pipeline run.

### WGX-020 - Performance and resilience validation at scale envelope
Primary agent: qa
Labels: `agent:qa` `priority:medium` `type:test` `repo:shared` `status:ready`
Dependencies: WGX-016, WGX-019
Subtasks:
- [ ] Run load tests for concurrent board users and event bursts.
- [ ] Run chaos tests for integration endpoint failures.
- [ ] Validate graceful degradation paths for websocket loss.
- [ ] Produce tuning recommendations with before/after evidence.
Acceptance criteria:
- [ ] Defined scale envelope is documented and reproducible.
- [ ] Failure modes preserve data correctness.

### WGX-021 - Product instrumentation and decision dashboard
Primary agent: backend
Labels: `agent:backend` `priority:medium` `type:feature` `repo:shared` `status:ready`
Dependencies: WGX-014
Subtasks:
- [ ] Instrument user actions for flow outcomes and friction points.
- [ ] Build executive dashboard for north-star + supporting metrics.
- [ ] Add cohort view by role (CEO, marketing, sales, ops).
- [ ] Add board-ready monthly export with narrative annotations.
Acceptance criteria:
- [ ] Leadership can inspect adoption and flow health in one view.
- [ ] Metrics are tied to explicit event definitions.

### WGX-022 - Release train, rollout controls, and change management
Primary agent: qa
Labels: `agent:qa` `priority:high` `type:chore` `repo:shared` `status:ready`
Dependencies: WGX-018, WGX-019, WGX-020
Subtasks:
- [ ] Define phased rollout (pilot, full internal, external beta).
- [ ] Add feature flags for high-risk capabilities.
- [ ] Add rollback and data-backfill playbooks.
- [ ] Add release readiness checklist with hard gates.
Acceptance criteria:
- [ ] Every release has clear go/no-go criteria.
- [ ] Rollback can be executed in under 15 minutes.

### WGX-023 - Coda migration and data trustworthiness
Primary agent: backend
Labels: `agent:backend` `priority:medium` `type:feature` `repo:backend` `status:ready`
Dependencies: WGX-005
Subtasks:
- [ ] Build deterministic import pipeline from Coda export snapshots.
- [ ] Add reconciliation report (source vs destination counts/hashes).
- [ ] Add duplicate and orphan detection.
- [ ] Add dry-run mode with human-readable diff output.
Acceptance criteria:
- [ ] Migration can run repeatably with no silent corruption.
- [ ] Reconciliation output is attachable to release artifacts.

### WGX-024 - Mobile-responsive and offline-lite field workflow
Primary agent: frontend
Labels: `agent:frontend` `priority:medium` `type:feature` `repo:frontend` `status:ready`
Dependencies: WGX-013, WGX-017
Subtasks:
- [ ] Optimize key flows for phone breakpoints (update status, add unplanned task).
- [ ] Add offline draft capture for field notes and delayed sync.
- [ ] Add conflict UI for late sync submissions.
- [ ] Add touch-friendly interaction for card actions.
Acceptance criteria:
- [ ] Field users can log and complete work from mobile web reliably.
- [ ] Offline submissions reconcile without data loss.

## 9. Execution Order

Wave 1: WGX-001, WGX-004, WGX-005, WGX-006, WGX-008, WGX-017
Wave 2: WGX-002, WGX-007, WGX-009, WGX-010, WGX-011, WGX-014, WGX-019
Wave 3: WGX-003, WGX-012, WGX-013, WGX-015, WGX-016, WGX-023
Wave 4: WGX-018, WGX-020, WGX-021, WGX-022, WGX-024

## 10. Operational Guardrails

- Every ticket must include at least one measurable acceptance test.
- No ticket can be marked done without evidence links (tests, screenshots, logs).
- Any blocked ticket older than 48 hours triggers Architect escalation.
- Reviewer cannot approve PRs lacking risk notes for integration/auth changes.

## 11. Exit Criteria for This Program

- All Wave 1-4 tickets reach `status:done`.
- Success metrics trend positively for at least two consecutive sprints.
- GTM team confirms WIPGuard as default daily execution surface.
- External beta readiness decision documented with evidence.

# Architecture Decision Records

This file is maintained by the Architect agent. Each decision follows the
ADR format and is referenced by other agents when making implementation choices.

---


## ADR-001: Policy engine as pure domain function

**Status**: accepted
**Date**: 2026-02-13
**Context**: WIP enforcement logic needs to be consistent across all status transition paths (drag, advance, retreat, reorder, bulk update). Currently BoardSettings has wipLimit but no enforcement.
**Decision**: Implement policy engine as a pure function evaluatePolicy(currentColumnCounts, proposedAction, userRole) => PolicyResult in src/lib/policy-engine.ts. PolicyResult includes {allowed, warning?, requiresOverride?, reason?}. All API routes that mutate task status will call this function before committing. This prevents policy drift between endpoints.

---

## ADR-002: Override audit via dedicated AuditEvent model

**Status**: accepted
**Date**: 2026-02-13
**Context**: Override events need to record actor, reason, timestamp, and the action that was overridden. StatusHistory only tracks from/to status transitions.
**Decision**: Create a new AuditEvent Prisma model rather than extending StatusHistory. AuditEvent stores: id, taskId, userId, eventType (enum: WIP_OVERRIDE, POLICY_CHANGE, etc.), reason, metadata (JSON), createdAt.

---

## ADR-002b: Sequential backend agent with queued parallel track

**Status**: superseded (by ADR-003)
**Date**: 2026-02-13
**Context**: Backend agent has one slot. #4 (concurrency) and #17 (auth hardening) are both unblocked and independent. Need to decide execution order.
**Decision**: #4 first because it's the critical path bottleneck (blocks Track A: #5→#6 and Track B: #8→#9/#10/#11). #17 queued immediately after. If a second backend agent becomes available, #17 can start in parallel since it has no dependency on #4.

---

## ADR-003: Parallel backend agents for independent tracks

**Status**: accepted
**Date**: 2026-02-13
**Context**: #4 (concurrency) has been in-progress for 3 iterations with no commits, no branch, and no PR. It is the critical-path bottleneck blocking 15+ downstream tickets. Meanwhile #17 (auth hardening) is fully unblocked (depends only on #1, which is done) and touches completely independent code paths (auth/roles/audit vs. concurrency/ordering). ADR-002b restricted to one backend agent at a time, which means #17 sits idle despite having zero dependency overlap with #4. Sprint velocity is 1/24 after 5 iterations — we need to accelerate.
**Decision**: Spin up a second backend agent (backend-2) for #17 in parallel with the primary backend agent on #4. Both agents branch from current main. The code paths are isolated: #17 adds role checks to auth callbacks, creates permission middleware, and adds audit endpoints. #4 adds version fields, optimistic locking, and ordering logic to mutation endpoints. No file conflicts expected.
**Consequences**: Two backend agents running simultaneously. Monitor for merge conflicts on shared files (prisma/schema.prisma is the main risk — both may add models). If conflicts arise, the second PR to merge does the resolution. #17 completing partially unblocks #24 (needs #13 too).
**Alternatives considered**: (1) Continue waiting for #4 — rejected because velocity is too low and #17 has no dependency on #4. (2) Reassign #4 to a different agent — premature, the agent may deliver next iteration. (3) Break #4 into sub-tickets — possible escalation if #4 stalls again in iteration 6.

---

## ADR-004: Minimum viable delivery and decomposition for stalled tickets

**Status**: accepted
**Date**: 2026-02-13
**Context**: #4 (concurrency-safe board mutations) has been in-progress for 4 architect iterations with zero visible output — no branch, no commits, no PR. It is the critical-path bottleneck blocking 15+ downstream tickets across Track A (#5→#6→...) and Track B (#8→#9/#10/#11). The ticket has 4 distinct subtasks that can be delivered incrementally. Continued waiting risks the entire sprint.
**Decision**: (1) Define a minimum viable delivery (MVD) for #4: add version field to Task model + optimistic locking check on PATCH /api/tasks/[id]. This is shippable independently and unblocks downstream work that needs concurrency safety on the primary mutation endpoint. (2) If the backend agent fails to deliver even the MVD by end of iteration 6, decompose #4 into sub-tickets (4a through 4e) and assign individually. (3) Frontend agent's #2 work (855 LOC on main) must be shipped immediately — the code is complete, only the git workflow is missing.
**Consequences**: Backend agent gets one final iteration to deliver. If it stalls, the ticket is broken up and potentially reassigned. Frontend agent gets explicit step-by-step shipping instructions. Reviewer agent should expect PRs this iteration.
**Alternatives considered**: (1) Reassign #4 entirely — too aggressive, agent may have been building locally without committing. (2) Skip #4 and work around it — not possible, downstream tickets genuinely need optimistic locking. (3) Accept partial delivery — this IS the chosen approach (MVD).

---

## ADR-004: Minimum viable delivery and decomposition for stalled tickets

**Status**: accepted
**Date**: 2026-02-13
**Context**: #4 has been in-progress for 4 iterations with zero output. It blocks 15+ downstream tickets. The ticket has 4 distinct subtasks that can be delivered incrementally.
**Decision**: Define minimum viable delivery (version field + optimistic locking on PATCH /api/tasks/[id]). If no PR by iteration 7, decompose into sub-tickets 4a-4e. Also: frontend #2 must ship 855 LOC immediately — architect will execute git commands directly if still not shipped by iteration 7.

---

## ADR-005: Architect direct intervention for shipping failures

**Status**: accepted
**Date**: 2026-02-13
**Context**: Two escalation triggers from ADR-004 fired simultaneously in iteration 7: (a) Frontend agent failed to ship #2 after 5 iterations despite having 1115 lines of complete code on main — purely a git workflow failure, not a coding failure. (b) Backend agent failed to deliver any output for #4 after 5 iterations — a stall requiring decomposition. The sprint is at 35% of its iteration budget (7/20) with only 4% completion (1/24). Zero PRs since PR #25 in iteration 1. The pipeline is completely dry.
**Decision**: (1) Architect directly executes the git workflow for #2: creates branch `agent/frontend/issue-2`, commits the 13 changed files, pushes, and opens PR #26. This is a one-time intervention — agents are expected to handle their own git workflow going forward. (2) #4 is decomposed per ADR-004 into sub-tickets #27-#31 (4a-4e). #4 is closed. Backend agent is reassigned to #27 (version field migration) as a deliberately tiny scope to break the stall pattern. (3) Frontend agent is reassigned to #13 (minimal card mode), now unblocked by #2's PR. (4) Reviewer agent is activated for PR #26 — first review work since PR #25.
**Consequences**: PR pipeline is flowing again. Three agents have clear, small-scope assignments. The decomposition of #4 means 28 total tickets instead of 24, but the sub-tickets are individually shippable. Architect sets a precedent that it will intervene directly when agents fail at shipping — this should be rare, not routine.
**Alternatives considered**: (1) Give agents one more iteration — rejected, already gave them 5 iterations with explicit escalation warnings. (2) Reassign #2 to a different frontend agent — unnecessary, the code is complete. (3) Abandon #4 entirely — rejected, optimistic locking is a genuine requirement for downstream tickets.

---

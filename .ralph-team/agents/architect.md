# architect Agent — Accumulated Knowledge

This file is updated by the architect agent after each iteration.
Future iterations read this file to benefit from previously discovered
patterns, gotchas, and conventions.

## Discovered Patterns

- The dependency graph has two main tracks after #4 (concurrency):
  - **Track A** (hierarchy/flow): #4 → #5 → #6 → #14 → #15/#21
  - **Track B** (integrations): #4 → #8 → #9/#10/#11/#16
- **Track C** (auth/security, independent): #1 → #17 → contributes to #24
- **Track D** (frontend UX): #2 → #13 → #18 (design conformance) and #2 → #3 (class of service)
- Frontend tickets are mostly blocked until Track A reaches #6 (sprint commitment ledger)
- #1 (policy engine) was the single bottleneck — now DONE (PR #25 merged)
- #4 (concurrency) is now the primary bottleneck — unlocks both Track A and Track B
- #17 (auth hardening) is independent of #4 — depends only on #1 (done), running in parallel (ADR-003)
- After #2 completes: #13 (minimal card mode) AND #3 (class of service lanes) both unblock for frontend
- **Parallel backend agents are viable** when tickets touch independent code paths
- **#3 (class of service lanes)** depends only on #2 — it's frontend-only and could be worked in parallel with #13 if a second frontend agent is available

## Velocity & Risk

- Sprint velocity: 1/28 done + 1 PR open after 7 iterations. First PR since iteration 1!
- #4 DECOMPOSED — closed and replaced by #27-#31 (4a-4e). Backend agent has fresh start on #27.
- #2 SHIPPED — architect intervened directly (ADR-005), opened PR #26. Reviewer assigned.
- #17 (backend-2) is on iteration 2 — check for branch/commits.
- #13 (frontend) newly assigned — minimal card mode, iteration 1.
- PR pipeline flowing again: PR #26 ready for review. Expect PRs from #27 and #17 next.
- Total tickets: 28 (was 24 before decomposition). Smaller tickets = faster flow.

## Gotchas

- team-state.json initially had wrong depends_on for #23 (was [] should be [5]) and #24 (was [] should be [13, 17]). Always cross-check against issue body.
- Only remote branches: stale `agent/backend/issue-1` (from merged PR #25) and `agent/frontend/issue-2` (PR #26, created by architect).
- PR #25 merged directly to main — policy engine code is on main now.
- **Frontend agent worked directly on main** instead of a feature branch — 855 lines of unstaged changes across 14 files. Architect intervened in iteration 7 to ship it (PR #26).
- ADR-002 (single backend agent) was too conservative — superseded by ADR-003 (parallel backend agents for independent tracks)
- **Agents consistently fail at git "last mile"** — they write code but don't branch/commit/push/PR. Delegation files now include IMPORTANT field requiring branch creation FIRST.
- **ESCALATION field** added to delegation files for urgent directives.
- **Architect direct intervention** (ADR-005) is a last resort for shipping failures. Used once for #2. Should not become routine.
- **Ticket decomposition** is effective for breaking stalls. #4 decomposed into 5 tiny sub-tickets (#27-#31). Backend agent gets a fresh start.
- After decomposition, dependencies must be updated across ALL downstream tickets. #5 and #8 now depend on #28+#31 instead of #4.

## Conventions

- API contract for policy engine defined in delegation file. All agents should reference `.ralph-team/current-tasks/<agent>.json` for their instructions.
- Policy enforcement model: pure function `evaluatePolicy(state, action, role) => PolicyResult`
- Override audit: use dedicated AuditEvent model, not StatusHistory extension
- **Branch naming**: `agent/<agent-role>/issue-<number>` (e.g., agent/backend/issue-17)
- **Delegation files**: `.ralph-team/current-tasks/<agent-role>.json` — include `isolation_notes` when parallel agents work on related code
- **Escalation pattern**: Add `ESCALATION` field to delegation JSON with exact commands when agent is stalled. Include decomposition plan for complex tickets.
- **Minimum viable delivery (MVD)**: When a ticket is too large or stalled, define the smallest shippable increment. Ship early, iterate.
- **IMPORTANT field** in delegation files: Used for mandatory process directives (e.g., "create branch before coding"). Stronger than architectural_notes.
- **Sub-ticket naming**: GitHub issues #27-#31 correspond to 4a-4e. Use `[WGX-004x]` prefix in titles.
- **Sub-ticket dependency chain**: 27→28→29→30/31. Downstream tickets (#5, #8) depend on #28+#31, not the closed parent #4.

## Stack-Specific Notes

- Next.js App Router with Prisma ORM on PostgreSQL
- Existing API routes: /api/tasks, /api/tasks/[id], /api/tasks/[id]/advance, /api/tasks/[id]/retreat, /api/tasks/reorder, /api/projects, /api/sprints, /api/board-settings, /api/auth/[...nextauth]
- BoardSettings model has wipLimit per column — now enforced by policy engine from #1
- New API routes from #1: /api/policy, /api/policy/override, /api/policy/audit
- New models from #1: WipPolicy, PolicyOverride, EnforcementMode enum
- Policy engine: pure function in src/lib/policy-engine.ts, DB helpers in src/lib/policy-check.ts
- Prisma 7.x generates types in src/generated/prisma/models/
- TaskStatus enum: BACKLOG, QUEUED, WORKING_ON_TODAY, ACTIVE, NOT_DONE, DONE
- Auth: NextAuth with JWT strategy, Account/Session models
- **User.role** field exists (String, default "member") — ready for #17's permission matrix
- **WipPolicy.overrideRoles** field exists (String[], default ["admin"]) — already used by policy engine
- Auth helper: `auth()` in src/lib/auth.ts returns session with user.id (but NOT role yet — #17 must add it)

## Context
- Repo type: backend
- Detected stack: {"package_manager":"npm","language":"typescript","framework":"nextjs","styling":"tailwind","orm":"prisma","containerized":true}
- Iteration: 7 of 20

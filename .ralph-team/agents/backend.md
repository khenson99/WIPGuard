# Backend Agent — Accumulated Knowledge

This file is updated by the backend agent after each iteration.
Future iterations read this file to benefit from previously discovered
patterns, gotchas, and conventions.

## Discovered Patterns

- **API route structure**: `export const dynamic = "force-dynamic"` at top, auth via `auth()`, permissions via `enforcePermission()`, Prisma queries in try/catch
- **RACI on all levels**: CompanyPriority, Project, and Task all have RACI relations (responsible, accountable, consulted, informed) as M-N with User
- **Self-referential hierarchy**: Both Project and Task have `parentId` self-references for arbitrary nesting
- **RACI inheritance**: Uses nearest-wins precedence walking Task -> parent Task(s) -> Project -> parent Project(s) -> CompanyPriority. Each role resolved independently. Engine lives in `src/lib/raci-inheritance.ts`
- **Hierarchy endpoint**: `GET /api/hierarchy` supports `?depth=N`, `?priorityId=X`, `?projectId=X`, `?flat=true` for both board (tree) and table (flat) consumers

## Gotchas

- **onDelete behavior**: Project.parentId and Task.parentId use ON DELETE RESTRICT — must reparent/remove children before deleting a parent
- **LogbookEntry**: Changed from ON DELETE RESTRICT to CASCADE (aligns with StatusHistory behavior)
- **Prisma implicit M-N tables**: The `_PriorityResponsible`, `_TaskAccountable` etc. tables already have ON DELETE CASCADE — deleting a user or entity cleans up join table rows automatically
- **USER_SELECT pattern**: Most routes define a `USER_SELECT = { id: true, name: true, email: true, image: true }` const for consistent user projections

## Conventions

- **Test location**: `src/lib/__tests__/<module>.test.ts` for unit tests
- **Test style**: `describe`/`it` blocks, factory helpers like `makePolicy()` / `makeNode()` for test data
- **Error responses**: `{ error: "message" }` with appropriate HTTP status codes
- **Include patterns**: Define `const TASK_INCLUDE = { ... } as const` at top of route file for reuse

## Slack Integration Patterns (Issue #10)

- **Notification throttling**: In-memory per-channel sliding window with `shouldThrottle()` (pure, does not mutate) + `recordSend()` (mutates state). `ThrottleConfig` has `windowMs`, `maxBurst`, `bypassTypes`, `minIntervalMs`. Blocked notifications bypass throttle.
- **Dedupe keys**: Format `slack:<domain>:<channel>:<id>:<type>:<qualifier>` — ensures idempotency. Notification keys include threadTs; task creation keys include trigger type+value.
- **Source traceability**: Every Slack-created task stores a `SlackSourceTraceability` struct in `task.metadata.integration.sourceTraceability` with provider, channelId, threadTs, triggerType, slackUserId, sourceUrl, capturedAt.
- **Channel routing**: First-match-wins with specificity sorting (more match criteria = higher priority). Policies use AND logic. Falls back to `defaultChannelId`, then to user DM. Config stored in `IntegrationRule` with key `slack_channel_routing`. In-memory cache with 30s TTL.
- **RACI -> Notification mapping**: Responsible=assignment+status+blocked, Accountable=status+blocked, Consulted=mention, Informed=status_change. Self-notifications skipped (actor != recipient).
- **Slack Event API handler**: HMAC signature verification with `v0:${timestamp}:${body}` base string and 5-min replay window. Handles `url_verification` challenge, `reaction_added` -> task creation, `/wipguard` slash commands.
- **Dead letter pattern**: Failed Slack operations create `OutboxEvent` with `status: "DEAD_LETTER"` for later inspection/retry.
- **Retry pattern**: `withRetries()` with exponential backoff via `computeRetryDelayMs()` from outbox-worker.

## Test Count

- Total test files: 4 new (slack-notifications, slack-task-creation, slack-channel-routing, slack-raci-bridge)
- Total test cases: 74 new across those 4 files
- All tests are pure function tests — no DB mocking needed

## Stack-Specific Notes

- **Prisma client**: Generated to `src/generated/prisma`, uses `@prisma/adapter-pg` with PrismaPg adapter
- **Prisma singleton**: Lazy proxy in `src/lib/prisma.ts` — avoid creating new PrismaClient instances
- **vitest config**: `@/` alias mapped via `resolve.alias` in `vitest.config.ts`
- **Package scripts**: `npm test` runs `vitest run`, `npm run test:watch` for dev mode
- **Prisma in worktrees**: Need to run `npx prisma generate` in worktrees before tests will pass (the generated client is gitignored)

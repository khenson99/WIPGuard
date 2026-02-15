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

## Stack-Specific Notes

- **Prisma client**: Generated to `src/generated/prisma`, uses `@prisma/adapter-pg` with PrismaPg adapter
- **Prisma singleton**: Lazy proxy in `src/lib/prisma.ts` — avoid creating new PrismaClient instances
- **vitest config**: `@/` alias mapped via `resolve.alias` in `vitest.config.ts`
- **Package scripts**: `npm test` runs `vitest run`, `npm run test:watch` for dev mode

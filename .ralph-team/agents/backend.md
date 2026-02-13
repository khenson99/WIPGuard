# backend Agent — Accumulated Knowledge

This file is updated by the backend agent after each iteration.
Future iterations read this file to benefit from previously discovered
patterns, gotchas, and conventions.

## Discovered Patterns

- **API route structure**: All routes follow `auth() → find existing → business logic → prisma update → statusHistory → response`
- **Status transitions**: Advance uses STATUS_FLOW map, retreat uses STATUS_BACK map. Both are Partial<Record<TaskStatus, TaskStatus>>
- **Policy enforcement**: All status transition paths (advance, retreat, PATCH, reorder) call the same pure `checkWipPolicy()` from `src/lib/policy-engine.ts`
- **Override flow**: When BLOCK enforcement triggers for an override-capable role, API returns 409 with `requiresOverride: true`. Client resends with `overrideReason` in body.
- **Socket events**: Board mutations emit events via `emitBoardEvent()` from `src/lib/socket-emit.ts`
- **Route params**: Next.js 16 uses `{ params: Promise<{ id: string }> }` pattern (params is a Promise)

## Gotchas

- **Prisma generated types location**: Prisma 7.x outputs to `src/generated/prisma/`. Model types are in `models/` subdirectory. Enums are in `enums.ts` and re-exported from `client.ts`.
- **`prisma generate` needed after schema changes**: Migration alone doesn't regenerate the client. Run `npx prisma generate` explicitly if tsc complains about missing Prisma types.
- **Pre-existing lint error**: `src/components/layout/header.tsx:14` has a react-hooks/set-state-in-effect error (pre-existing, not ours).
- **Request body parsing**: In advance/retreat routes the body was originally unused (`_request`). After policy integration, body is needed for `overrideReason`. Changed to `request` and `request.json().catch(() => ({}))` to handle cases where body isn't provided.

## Conventions

- **Error responses**: `{ error: string }` for all error responses. Policy violations return `{ error: string, policy: PolicyResult }` with status 409.
- **TASK_INCLUDE**: Standard include clause for task queries defined in `src/app/api/tasks/[id]/route.ts`
- **Auth guard**: Every route starts with `const session = await auth(); if (!session?.user) return 401`
- **User role**: Stored as `User.role` string field, defaults to "member". Admin override checked via `getUserRole()`.
- **Test framework**: vitest with `@/` alias configured in `vitest.config.ts`

## Stack-Specific Notes

- **Framework**: Next.js 16 with App Router, API routes in `src/app/api/`
- **ORM**: Prisma 7.x with PostgreSQL, custom output to `src/generated/prisma`
- **Auth**: next-auth 4.x with JWT strategy, Google OAuth + dev credentials provider
- **Realtime**: Socket.IO for board event broadcasting
- **State**: zustand for client state management

/**
 * OutboxEvent retention.
 *
 * OutboxEvent previously had no cleanup anywhere: every domain event written
 * by src/lib/event-bus.ts, src/lib/events/outbox-writer.ts,
 * src/lib/automations/runtime.ts and src/lib/integrations/slack-notifications.ts
 * stayed forever (906K rows / 664MB at the 2026-06-10 disk-full outage, with
 * events dating back to 2026-02-16).
 *
 * Lifecycle (src/lib/events/outbox-worker.ts):
 *   - PENDING / FAILED are live — pollPendingEvents retries them — so they are
 *     NEVER deleted here, regardless of age.
 *   - DISPATCHED is terminal success; pruned after a short window.
 *   - DEAD_LETTER is terminal failure but stays inspectable
 *     (/api/events/dead-letter) and replayable (/api/events replay), so it
 *     gets a longer window.
 *
 * Mirrors the AnalyticsSnapshot retention pattern (env-configured days,
 * enforced during the sync cycle — see pruneAnalyticsSnapshots in
 * src/lib/analytics/snapshots.ts), with two differences required by the
 * backlog: deletes are bounded per statement (id-subquery LIMIT, which
 * Prisma's deleteMany cannot express) and the pass is time-budgeted so it can
 * never stall a sync cycle. Status counts in /api/events metrics
 * (collectOutboxMetrics) reflect the retained window after pruning.
 */

import type { PrismaClientType } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DISPATCHED_RETENTION_DAYS = 14;
const DEFAULT_DEAD_LETTER_RETENTION_DAYS = 30;
const DEFAULT_BUDGET_MS = 15_000;
const DEFAULT_BATCH_SIZE = 10_000;

export interface PruneOutboxEventsInput {
  prisma: PrismaClientType;
  /**
   * DISPATCHED events older than this many days (by dispatchedAt, falling
   * back to createdAt) are deleted. Defaults to
   * OUTBOX_DISPATCHED_RETENTION_DAYS (env) or 14.
   */
  dispatchedRetentionDays?: number;
  /**
   * DEAD_LETTER events created more than this many days ago are deleted.
   * Defaults to OUTBOX_DEAD_LETTER_RETENTION_DAYS (env) or 30. Dead letters
   * dead-letter within minutes of creation (5 retries, 5-minute max backoff),
   * so createdAt is a faithful age signal.
   */
  deadLetterRetentionDays?: number;
  /**
   * Soft time budget for one pruning pass. Defaults to
   * OUTBOX_PRUNE_BUDGET_MS (env) or 15s.
   */
  budgetMs?: number;
  /** Max events deleted per DELETE statement. */
  batchSize?: number;
  /** Test seam: reference time for cutoffs. Defaults to now. */
  now?: Date;
  /** Test seam: monotonic clock for the time budget. Defaults to Date.now. */
  clock?: () => number;
}

export interface PruneOutboxEventsResult {
  deletedDispatched: number;
  deletedDeadLetter: number;
  /** DELETE statements issued. */
  batches: number;
  dispatchedCutoff: string;
  deadLetterCutoff: string;
  /**
   * False when the time budget expired before both backlogs fully drained.
   * The next sync cycle picks up where this one stopped.
   */
  completed: boolean;
  durationMs: number;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return fallback;
}

export async function pruneOutboxEvents(
  input: PruneOutboxEventsInput,
): Promise<PruneOutboxEventsResult> {
  const dispatchedRetentionDays = Math.max(
    1,
    Math.floor(
      input.dispatchedRetentionDays ??
        positiveIntFromEnv(
          "OUTBOX_DISPATCHED_RETENTION_DAYS",
          DEFAULT_DISPATCHED_RETENTION_DAYS,
        ),
    ),
  );
  const deadLetterRetentionDays = Math.max(
    1,
    Math.floor(
      input.deadLetterRetentionDays ??
        positiveIntFromEnv(
          "OUTBOX_DEAD_LETTER_RETENTION_DAYS",
          DEFAULT_DEAD_LETTER_RETENTION_DAYS,
        ),
    ),
  );
  const budgetMs = Math.max(
    1,
    Math.floor(input.budgetMs ?? positiveIntFromEnv("OUTBOX_PRUNE_BUDGET_MS", DEFAULT_BUDGET_MS)),
  );
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE));
  const now = input.now ?? new Date();
  const clock = input.clock ?? (() => Date.now());
  const dispatchedCutoff = new Date(now.getTime() - dispatchedRetentionDays * DAY_MS);
  const deadLetterCutoff = new Date(now.getTime() - deadLetterRetentionDays * DAY_MS);

  const startedAt = clock();
  const deadline = startedAt + budgetMs;

  let deletedDispatched = 0;
  let deletedDeadLetter = 0;
  let batches = 0;
  let dispatchedDrained = false;
  let deadLetterDrained = false;

  // Terminal-success events first: they dominate the backlog. Statuses are
  // inlined as SQL literals (not bind params) so Postgres coerces them to the
  // "OutboxEventStatus" enum; PENDING/FAILED are intentionally absent.
  while (clock() < deadline) {
    const deleted = await input.prisma.$executeRaw`
      DELETE FROM "OutboxEvent"
      WHERE "id" IN (
        SELECT "id"
        FROM "OutboxEvent"
        WHERE "status" = 'DISPATCHED'
          AND COALESCE("dispatchedAt", "createdAt") < ${dispatchedCutoff}
        LIMIT ${batchSize}
      )
    `;
    batches += 1;
    deletedDispatched += deleted;
    if (deleted < batchSize) {
      dispatchedDrained = true;
      break;
    }
  }

  while (dispatchedDrained && clock() < deadline) {
    const deleted = await input.prisma.$executeRaw`
      DELETE FROM "OutboxEvent"
      WHERE "id" IN (
        SELECT "id"
        FROM "OutboxEvent"
        WHERE "status" = 'DEAD_LETTER'
          AND "createdAt" < ${deadLetterCutoff}
        LIMIT ${batchSize}
      )
    `;
    batches += 1;
    deletedDeadLetter += deleted;
    if (deleted < batchSize) {
      deadLetterDrained = true;
      break;
    }
  }

  return {
    deletedDispatched,
    deletedDeadLetter,
    batches,
    dispatchedCutoff: dispatchedCutoff.toISOString(),
    deadLetterCutoff: deadLetterCutoff.toISOString(),
    completed: dispatchedDrained && deadLetterDrained,
    durationMs: clock() - startedAt,
  };
}

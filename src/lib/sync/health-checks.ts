/**
 * Shared health-checks sync logic.
 *
 * Called by BOTH:
 *   1. The orchestrator (worker process) via runSync()
 *   2. The legacy cron endpoint (/api/cron/sync)
 *
 * Replaces the inline `Promise.all(userIds.map((uid) => runIntegrationHealthChecks({ userId: uid })))`
 * block that previously lived in the cron route. Returns the same per-user
 * array shape so the cron route can keep its `settled.health` response field
 * trivially in lockstep.
 *
 * USER DISCOVERY:
 *   - Accepts an optional `userIds` array. If provided, uses it directly.
 *   - If omitted, discovers users with at least one recoverable integration
 *     via the shared helper in `./users.ts` (matches the analytics module's
 *     fallback semantics).
 */

import type { PrismaClientType } from '@/lib/prisma';
import { runIntegrationHealthChecks } from '@/lib/integrations/health-checks';
import { discoverConnectedUserIds } from './users';

export interface HealthChecksSyncInput {
  prisma: PrismaClientType;
  /** Pre-discovered user IDs. If omitted, discovers users with recoverable integrations. */
  userIds?: string[];
}

export type HealthChecksSyncResult = Array<
  Awaited<ReturnType<typeof runIntegrationHealthChecks>> & {
    userId?: string;
    error?: string;
  }
>;

/**
 * Run per-user integration health checks across the provided (or discovered)
 * user set. Returns the array of per-user results in the same shape the cron
 * route's `settled.health` field previously consumed.
 */
export async function runHealthChecksSync(
  input: HealthChecksSyncInput
): Promise<HealthChecksSyncResult> {
  const userIds =
    input.userIds && input.userIds.length > 0
      ? input.userIds
      : await discoverConnectedUserIds(input.prisma);

  return Promise.all(
    userIds.map(async (userId) => {
      try {
        return {
          userId,
          ...(await runIntegrationHealthChecks({ userId })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("health_checks_sync.user_failed", {
          userId,
          error: message,
        });
        return {
          userId,
          checked: 0,
          ok: 0,
          failed: 1,
          results: [],
          error: message,
        };
      }
    })
  );
}

/**
 * Shared user discovery helpers for sync modules.
 *
 * Hoisted out of `src/lib/sync/analytics.ts` once a second module
 * (healthChecks) needed the same recoverable-integration filter. The
 * previous note set "two consumers" as the threshold for promotion.
 *
 * Any future sync module that needs to operate on the set of users
 * with at least one recoverable integration should call
 * `discoverConnectedUserIds(prisma)` here instead of re-implementing
 * the query.
 */

import type { PrismaClientType } from '@/lib/prisma';

/**
 * Discover user IDs with at least one integration that should participate in
 * scheduled sync. ERROR rows are included so scheduled health checks can
 * recover integrations after credentials or upstream provider issues are fixed.
 *
 * DISCONNECTED rows remain excluded because they represent an explicit opt-out.
 */
export async function discoverConnectedUserIds(
  prisma: PrismaClientType
): Promise<string[]> {
  const rows = await prisma.integrationConnection.findMany({
    distinct: ['userId'],
    where: { status: { in: ['CONNECTED', 'ERROR'] } },
    select: { userId: true },
  });

  const ownerUserId = process.env.INTEGRATION_OWNER_USER_ID?.trim();
  return Array.from(
    new Set([
      ...(ownerUserId ? [ownerUserId] : []),
      ...rows.map((row) => row.userId),
    ])
  );
}

import { prisma } from "@/lib/prisma";

/**
 * Org-level/shared integrations are stored under a single owner user.
 *
 * If INTEGRATION_OWNER_USER_ID is not set, we fall back to the caller userId
 * to preserve local/dev behavior.
 */
export function resolveIntegrationOwnerUserId(fallbackUserId: string): string {
  const owner = process.env.INTEGRATION_OWNER_USER_ID?.trim();
  return owner && owner.length > 0 ? owner : fallbackUserId;
}

/**
 * Best-effort migration helper:
 * If the owner user is missing a provider connection, copy one from any CONNECTED
 * user (without deleting the source row).
 *
 * This makes it possible to switch to org-level ownership without breaking
 * existing deployments immediately.
 */
export async function bestEffortMigrateConnectionsToOwner(ownerUserId: string): Promise<{
  copied: number;
  skipped: number;
}> {
  const providers = await prisma.integrationConnection.findMany({
    distinct: ["provider"],
    select: { provider: true },
  });

  let copied = 0;
  let skipped = 0;

  for (const { provider } of providers) {
    const existingOwner = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider,
        },
      },
      select: { id: true },
    });
    if (existingOwner) {
      skipped += 1;
      continue;
    }

    const source = await prisma.integrationConnection.findFirst({
      where: {
        provider,
        status: "CONNECTED",
        userId: { not: ownerUserId },
      },
      orderBy: [{ connectedAt: "desc" }],
    });

    if (!source) {
      skipped += 1;
      continue;
    }

    await prisma.integrationConnection.create({
      data: {
        userId: ownerUserId,
        provider: source.provider,
        status: source.status,
        providerAccountId: source.providerAccountId,
        accountLabel: source.accountLabel,
        scopes: source.scopes,
        accessToken: source.accessToken,
        refreshToken: source.refreshToken,
        tokenType: source.tokenType,
        expiresAt: source.expiresAt,
        connectedAt: source.connectedAt,
        lastSyncedAt: source.lastSyncedAt,
        lastError: source.lastError,
        metadata: source.metadata as never,
      },
    });
    copied += 1;
  }

  return { copied, skipped };
}

export async function bestEffortMigrateRulesToOwner(ownerUserId: string): Promise<{
  copied: number;
  skipped: number;
}> {
  const keys = await prisma.integrationRule.findMany({
    distinct: ["provider", "key"],
    select: { provider: true, key: true },
  });

  let copied = 0;
  let skipped = 0;

  for (const { provider, key } of keys) {
    const existingOwner = await prisma.integrationRule.findUnique({
      where: {
        userId_provider_key: {
          userId: ownerUserId,
          provider,
          key,
        },
      },
      select: { id: true },
    });
    if (existingOwner) {
      skipped += 1;
      continue;
    }

    const source = await prisma.integrationRule.findFirst({
      where: {
        provider,
        key,
        enabled: true,
        userId: { not: ownerUserId },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    if (!source) {
      skipped += 1;
      continue;
    }

    await prisma.integrationRule.create({
      data: {
        userId: ownerUserId,
        provider: source.provider,
        key: source.key,
        enabled: source.enabled,
        statusOverride: source.statusOverride,
        config: source.config as never,
        checkpoint: source.checkpoint as never,
        lastObservedAt: source.lastObservedAt,
        lastRunAt: source.lastRunAt,
        lastError: source.lastError,
      },
    });
    copied += 1;
  }

  return { copied, skipped };
}


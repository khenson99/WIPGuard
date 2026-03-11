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

function normalizeOrganizationId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readConnectedByUserId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const candidate = (metadata as Record<string, unknown>).connectedByUserId;
  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function persistResolvedOrganizationId(
  userId: string,
  organizationId: string | null
): Promise<string | null> {
  const normalized = normalizeOrganizationId(organizationId);
  if (!normalized) {
    return null;
  }

  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ organizationId: null }, { organizationId: "" }],
    },
    data: {
      organizationId: normalized,
    },
  });

  return normalized;
}

async function deriveOrganizationIdFromConnections(userId: string): Promise<string | null> {
  const connections = await prisma.integrationConnection.findMany({
    where: { userId },
    select: {
      organizationId: true,
      metadata: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 25,
  });

  for (const connection of connections) {
    const connectionOrganizationId = normalizeOrganizationId(connection.organizationId);
    if (connectionOrganizationId) {
      return connectionOrganizationId;
    }
  }

  const connectedByUserIds = Array.from(
    new Set(
      connections
        .map((connection) => readConnectedByUserId(connection.metadata))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (connectedByUserIds.length === 0) {
    return null;
  }

  const users = await prisma.user.findMany({
    where: {
      id: {
        in: connectedByUserIds,
      },
    },
    select: {
      organizationId: true,
    },
  });

  for (const user of users) {
    const organizationId = normalizeOrganizationId(user.organizationId);
    if (organizationId) {
      return organizationId;
    }
  }

  return null;
}

async function deriveOrganizationIdFromSingleOrganization(): Promise<string | null> {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
    },
    orderBy: [{ createdAt: "asc" }],
    take: 2,
  });

  return organizations.length === 1 ? organizations[0].id : null;
}

async function deriveOrganizationIdFromConnectedUsers(
  ownerUserId: string
): Promise<string | null> {
  const connections = await prisma.integrationConnection.findMany({
    where: {
      userId: { not: ownerUserId },
      status: "CONNECTED",
    },
    distinct: ["userId"],
    select: {
      user: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  const organizationIds = Array.from(
    new Set(
      connections
        .map((connection) => normalizeOrganizationId(connection.user?.organizationId))
        .filter((value): value is string => Boolean(value))
    )
  );

  return organizationIds.length === 1 ? organizationIds[0] : null;
}

export async function ensureIntegrationOwnerOrganizationId(
  ownerUserId: string,
  fallbackOrganizationId?: string | null
): Promise<string | null> {
  const existingOrganizationId = normalizeOrganizationId(
    (
      await prisma.user.findUnique({
        where: { id: ownerUserId },
        select: { organizationId: true },
      })
    )?.organizationId
  );

  if (existingOrganizationId) {
    return existingOrganizationId;
  }

  const normalizedFallback = normalizeOrganizationId(fallbackOrganizationId);
  if (normalizedFallback) {
    return persistResolvedOrganizationId(ownerUserId, normalizedFallback);
  }

  const derivedOrganizationId = await deriveOrganizationIdFromConnections(ownerUserId);
  if (derivedOrganizationId) {
    return persistResolvedOrganizationId(ownerUserId, derivedOrganizationId);
  }

  const connectedUsersOrganizationId = await deriveOrganizationIdFromConnectedUsers(
    ownerUserId
  );
  if (connectedUsersOrganizationId) {
    return persistResolvedOrganizationId(ownerUserId, connectedUsersOrganizationId);
  }

  const singleOrganizationId = await deriveOrganizationIdFromSingleOrganization();
  return persistResolvedOrganizationId(ownerUserId, singleOrganizationId);
}

export async function resolveIntegrationOrganizationId(userId: string): Promise<string | null> {
  const organizationId = normalizeOrganizationId(
    (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      })
    )?.organizationId
  );

  if (organizationId) {
    return organizationId;
  }

  const ownerUserId = process.env.INTEGRATION_OWNER_USER_ID?.trim();
  if (!ownerUserId || ownerUserId !== userId) {
    return null;
  }

  return ensureIntegrationOwnerOrganizationId(ownerUserId);
}

/**
 * Returns true when the given userId matches the configured
 * INTEGRATION_OWNER_USER_ID environment variable.
 *
 * When true, connection lookups that miss for the owner should fall back to
 * searching across all users — connections may not yet have been migrated.
 */
export function isConfiguredIntegrationOwner(userId: string): boolean {
  const owner = process.env.INTEGRATION_OWNER_USER_ID?.trim();
  return Boolean(owner && owner.length > 0 && owner === userId);
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
  let ownerOrganizationId = await ensureIntegrationOwnerOrganizationId(ownerUserId);
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
      select: {
        provider: true,
        status: true,
        providerAccountId: true,
        accountLabel: true,
        scopes: true,
        accessToken: true,
        refreshToken: true,
        tokenType: true,
        expiresAt: true,
        connectedAt: true,
        lastSyncedAt: true,
        lastError: true,
        metadata: true,
        organizationId: true,
        user: {
          select: {
            organizationId: true,
          },
        },
      },
      orderBy: [{ connectedAt: "desc" }],
    });

    if (!source) {
      skipped += 1;
      continue;
    }

    const sourceOrganizationId =
      normalizeOrganizationId(source.organizationId) ??
      normalizeOrganizationId(source.user.organizationId);
    if (!ownerOrganizationId && sourceOrganizationId) {
      ownerOrganizationId = await persistResolvedOrganizationId(
        ownerUserId,
        sourceOrganizationId
      );
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
        organizationId: sourceOrganizationId ?? ownerOrganizationId,
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

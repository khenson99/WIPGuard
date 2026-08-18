export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  AnalyticsSnapshotStatus,
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import {
  defaultFreshnessSnapshot,
  getCredentials,
  hasIntegrationCredential,
} from "@/lib/analytics/credentials";
import { resolveAirtableWriteEnabled } from "@/lib/integrations/airtable";
import {
  evaluateProviderSyncHealth,
  snapshotKeysForIntegrationProvider,
  snapshotsForProvider,
} from "@/lib/analytics/provider-health";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getMissingIntegrationEnv,
  isIntegrationConfigured,
  listIntegrationDefinitions,
} from "@/lib/integrations/catalog";
import { logIntegrationEnvDiagnostic } from "@/lib/integrations/env-diagnostic";
import { normalizeCodaDocId } from "@/lib/integrations/coda-config";
import {
  bestEffortMigrateConnectionsToOwner,
  resolveIntegrationOwnerUserId,
} from "@/lib/integrations/ownership";
import { enforcePermission } from "@/lib/permissions";

function readCodaDocId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const candidate = (metadata as Record<string, unknown>).docId;
  if (typeof candidate !== "string") {
    return null;
  }
  return normalizeCodaDocId(candidate);
}

function readMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const candidate = (metadata as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  logIntegrationEnvDiagnostic();

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: session.user.id,
      action: "integration.read",
      request,
      targetType: "integration",
      targetId: "integrations",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
    const isAdmin = permission.role === "admin";

    // Best-effort migration so existing per-user connections don't disappear
    // when switching to org-level ownership. Run for all users (not just
    // admins) to ensure everyone can see org-level integrations.
    if (ownerUserId !== session.user.id) {
      await bestEffortMigrateConnectionsToOwner(ownerUserId);
    }

    const connections = await prisma.integrationConnection.findMany({
      where: { userId: ownerUserId },
      select: {
        provider: true,
        status: true,
        accountLabel: true,
        connectedAt: true,
        lastSyncedAt: true,
        lastError: true,
        metadata: true,
      },
    });

    const credentials = await getCredentials(ownerUserId);

    const allSnapshotKeys = Array.from(
      new Set(
        listIntegrationDefinitions().flatMap((definition) =>
          snapshotKeysForIntegrationProvider(definition.provider)
        )
      )
    );

    const [latestRows, latestSuccessRows] = await Promise.all([
      prisma.analyticsSnapshot.groupBy({
        by: ["providerKey"],
        where: { userId: ownerUserId, providerKey: { in: allSnapshotKeys } },
        _max: { capturedAt: true },
      }),
      prisma.analyticsSnapshot.groupBy({
        by: ["providerKey"],
        where: {
          userId: ownerUserId,
          providerKey: { in: allSnapshotKeys },
          status: AnalyticsSnapshotStatus.SUCCESS,
        },
        _max: { capturedAt: true },
      }),
    ]);

    const latestOr = latestRows
      .map((row) =>
        row._max.capturedAt
          ? { providerKey: row.providerKey, capturedAt: row._max.capturedAt }
          : null
      )
      .filter(Boolean) as Array<{ providerKey: string; capturedAt: Date }>;

    const latestSuccessOr = latestSuccessRows
      .map((row) =>
        row._max.capturedAt
          ? { providerKey: row.providerKey, capturedAt: row._max.capturedAt }
          : null
      )
      .filter(Boolean) as Array<{ providerKey: string; capturedAt: Date }>;

    const [latestSnapshots, latestSuccessfulSnapshots] = await Promise.all([
      latestOr.length === 0
        ? Promise.resolve([])
        : prisma.analyticsSnapshot.findMany({
            where: { userId: ownerUserId, OR: latestOr },
            select: {
              providerKey: true,
              status: true,
              capturedAt: true,
              expiresAt: true,
              lastError: true,
            },
          }),
      latestSuccessOr.length === 0
        ? Promise.resolve([])
        : prisma.analyticsSnapshot.findMany({
            where: { userId: ownerUserId, OR: latestSuccessOr },
            select: {
              providerKey: true,
              status: true,
              capturedAt: true,
              expiresAt: true,
              lastError: true,
            },
          }),
    ]);

    const latestSuccessByProviderKey = new Map(
      latestSuccessfulSnapshots.map((snapshot) => [snapshot.providerKey, snapshot])
    );
    const snapshots = latestSnapshots.flatMap((latest) => {
      const latestSuccess = latestSuccessByProviderKey.get(latest.providerKey);
      if (!latestSuccess) {
        return [latest];
      }

      const isSameSnapshot =
        latest.capturedAt.getTime() === latestSuccess.capturedAt.getTime() &&
        latest.status === latestSuccess.status;

      return isSameSnapshot ? [latest] : [latest, latestSuccess];
    });

    const byProvider = new Map(
      connections.map((connection) => [connection.provider, connection])
    );

    const response = listIntegrationDefinitions().map((definition) => {
      const connection = byProvider.get(definition.provider);
      const status = connection?.status ?? IntegrationConnectionStatus.DISCONNECTED;
      const freshness =
        credentials.freshness?.[definition.provider] ??
        defaultFreshnessSnapshot(definition.provider);
      const hasCredential = hasIntegrationCredential(definition.provider, credentials);
      const connected = status === IntegrationConnectionStatus.CONNECTED || hasCredential;
      const syncHealth = evaluateProviderSyncHealth({
        connected,
        hasCredential,
        snapshots: snapshotsForProvider(definition.provider, snapshots),
      });

      return {
        slug: definition.slug,
        provider: definition.provider,
        name: definition.name,
        description: definition.description,
        capabilities: definition.capabilities,
        authType: definition.authType,
        configured: isIntegrationConfigured(definition),
        missingEnv: getMissingIntegrationEnv(definition),
        connected,
        status,
        accountLabel: connection?.accountLabel ?? null,
        connectedAt: connection?.connectedAt ?? null,
        lastSyncedAt: connection?.lastSyncedAt ?? null,
        lastError: connection?.lastError ?? null,
        metadata: connection?.metadata ?? null,
        credentialSource: freshness.source,
        syncHealth: syncHealth.syncHealth,
        syncHealthReason: syncHealth.syncHealthReason,
        lastSnapshotAt: syncHealth.lastSnapshotAt,
        lastSnapshotStatus: syncHealth.lastSnapshotStatus,
        canManage: isAdmin,
        ownerUserId: isAdmin ? ownerUserId : null,
        docId:
          definition.provider === IntegrationProvider.CODA
            ? readCodaDocId(connection?.metadata ?? null)
            : null,
        baseId:
          definition.provider === IntegrationProvider.AIRTABLE
            ? readMetadataString(connection?.metadata ?? null, "baseId") ??
              process.env.AIRTABLE_BASE_ID?.trim() ??
              null
            : null,
        writeEnabled:
          definition.provider === IntegrationProvider.AIRTABLE
            ? resolveAirtableWriteEnabled(connection?.metadata ?? null)
            : null,
        tableName:
          definition.provider === IntegrationProvider.AIRTABLE
            ? readMetadataString(connection?.metadata ?? null, "tableName") ??
              process.env.AIRTABLE_TABLE_NAME?.trim() ??
              null
            : null,
      };
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/integrations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch integrations" },
      { status: 500 }
    );
  }
}

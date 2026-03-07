export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  AnalyticsSnapshotStatus,
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { getCredentials } from "@/lib/analytics/credentials";
import { defaultFreshnessSnapshot } from "@/lib/analytics/credentials";
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

function hasCredentialForProvider(
  provider: IntegrationProvider,
  credentials: Awaited<ReturnType<typeof getCredentials>>
): boolean {
  switch (provider) {
    case IntegrationProvider.GOOGLE_WORKSPACE:
      return Boolean(credentials.googleWorkspaceAccessToken);
    case IntegrationProvider.HUBSPOT:
      return Boolean(credentials.hubspotToken);
    case IntegrationProvider.SLACK:
      return Boolean(credentials.slackAccessToken);
    case IntegrationProvider.CODA:
      return Boolean(credentials.codaApiToken);
    case IntegrationProvider.REDDIT:
      return Boolean(credentials.redditRefreshToken);
    case IntegrationProvider.GOOGLE_ANALYTICS:
      return Boolean(
        credentials.gaPropertyId &&
          ((credentials.gaClientEmail && credentials.gaPrivateKey) ||
            (process.env.GA_REFRESH_TOKEN &&
              process.env.GOOGLE_CLIENT_ID &&
              process.env.GOOGLE_CLIENT_SECRET))
      );
    case IntegrationProvider.STRIPE:
      return Boolean(credentials.stripeKey);
    case IntegrationProvider.MERCURY:
      return Boolean(credentials.mercuryKey);
    case IntegrationProvider.WEBFLOW:
      return Boolean(credentials.webflowApiToken);
    case IntegrationProvider.GOOGLE_ADS:
      return Boolean(
        credentials.googleAdsDevToken &&
          credentials.googleAdsCustomerId &&
          credentials.googleAdsRefreshToken &&
          credentials.googleAdsClientId &&
          credentials.googleAdsClientSecret
      );
    case IntegrationProvider.META_ADS:
      return Boolean(credentials.metaAccessToken && credentials.metaAdAccountId);
    case IntegrationProvider.META_PAGE:
      return Boolean(
        credentials.metaAccessToken &&
          (credentials.metaPageId || credentials.metaInstagramAccountId)
      );
    case IntegrationProvider.PYLON:
      return Boolean(credentials.pylonApiKey);
    default:
      return false;
  }
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
    // when switching to org-level ownership.
    if (isAdmin && ownerUserId !== session.user.id) {
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
      const hasCredential = hasCredentialForProvider(definition.provider, credentials);
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

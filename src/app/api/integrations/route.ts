export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
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
import { normalizeCodaDocId } from "@/lib/integrations/coda-config";

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

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await prisma.integrationConnection.findMany({
      where: { userId: session.user.id },
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

    const credentials = await getCredentials(session.user.id);

    const allSnapshotKeys = Array.from(
      new Set(
        listIntegrationDefinitions().flatMap((definition) =>
          snapshotKeysForIntegrationProvider(definition.provider)
        )
      )
    );

    const [latestSnapshots, latestSuccessfulSnapshots] = await Promise.all([
      prisma.analyticsSnapshot.findMany({
        where: {
          userId: session.user.id,
          providerKey: { in: allSnapshotKeys },
        },
        select: {
          providerKey: true,
          status: true,
          capturedAt: true,
          expiresAt: true,
          lastError: true,
        },
        distinct: ["providerKey"],
        orderBy: [{ providerKey: "asc" }, { capturedAt: "desc" }],
      }),
      prisma.analyticsSnapshot.findMany({
        where: {
          userId: session.user.id,
          providerKey: { in: allSnapshotKeys },
          status: AnalyticsSnapshotStatus.SUCCESS,
        },
        select: {
          providerKey: true,
          status: true,
          capturedAt: true,
          expiresAt: true,
          lastError: true,
        },
        distinct: ["providerKey"],
        orderBy: [{ providerKey: "asc" }, { capturedAt: "desc" }],
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
        credentialSource: freshness.source,
        syncHealth: syncHealth.syncHealth,
        syncHealthReason: syncHealth.syncHealthReason,
        lastSnapshotAt: syncHealth.lastSnapshotAt,
        lastSnapshotStatus: syncHealth.lastSnapshotStatus,
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

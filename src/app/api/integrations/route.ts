export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { getCredentials } from "@/lib/analytics/credentials";
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

    const snapshots = await prisma.analyticsSnapshot.findMany({
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
      orderBy: {
        capturedAt: "desc",
      },
      take: 500,
    });

    const hasCredentialByProvider: Record<IntegrationProvider, boolean> = {
      [IntegrationProvider.GOOGLE_WORKSPACE]: Boolean(credentials.googleWorkspaceAccessToken),
      [IntegrationProvider.HUBSPOT]: Boolean(credentials.hubspotToken),
      [IntegrationProvider.SLACK]: Boolean(credentials.slackAccessToken),
      [IntegrationProvider.CODA]: Boolean(credentials.codaApiToken),
      [IntegrationProvider.REDDIT]: Boolean(credentials.redditRefreshToken),
      [IntegrationProvider.STRIPE]: Boolean(credentials.stripeKey),
      [IntegrationProvider.MERCURY]: Boolean(credentials.mercuryKey),
    };

    const byProvider = new Map(
      connections.map((connection) => [connection.provider, connection])
    );

    const response = listIntegrationDefinitions().map((definition) => {
      const connection = byProvider.get(definition.provider);
      const status = connection?.status ?? IntegrationConnectionStatus.DISCONNECTED;
      const syncHealth = evaluateProviderSyncHealth({
        connected: status === IntegrationConnectionStatus.CONNECTED,
        hasCredential: hasCredentialByProvider[definition.provider],
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
        connected: status === IntegrationConnectionStatus.CONNECTED,
        status,
        accountLabel: connection?.accountLabel ?? null,
        connectedAt: connection?.connectedAt ?? null,
        lastSyncedAt: connection?.lastSyncedAt ?? null,
        lastError: connection?.lastError ?? null,
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

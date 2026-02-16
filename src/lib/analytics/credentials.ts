// ─── Analytics Credentials Helper ─────────────────────────
// Resolves analytics credentials from env and integration connections.

import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { unprotectIntegrationSecret } from "@/lib/integrations/token-crypto";

export interface ProviderFreshnessSnapshot {
  provider: IntegrationProvider;
  source: "connection" | "env" | "none";
  status: IntegrationConnectionStatus | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface AnalyticsCredentials {
  hubspotToken: string | null;
  stripeKey: string | null;
  mercuryKey: string | null;

  // Google Analytics (GA4)
  gaPropertyId: string | null;
  gaClientEmail: string | null;
  gaPrivateKey: string | null;

  // Google Ads
  googleAdsDevToken: string | null;
  googleAdsCustomerId: string | null;
  googleAdsRefreshToken: string | null;
  googleAdsClientId: string | null;
  googleAdsClientSecret: string | null;

  // Meta (Facebook/Instagram)
  metaAccessToken: string | null;
  metaAdAccountId: string | null;
  metaPageId: string | null;

  // Reddit Ads
  redditClientId: string | null;
  redditClientSecret: string | null;
  redditRefreshToken: string | null;
  redditAdAccountId: string | null;

  // Webflow
  webflowApiToken: string | null;
  webflowSiteId: string | null;

  // SEMrush
  semrushApiToken: string | null;

  // Coda
  codaApiToken: string | null;
  codaDocId: string | null;

  // Pylon
  pylonApiKey: string | null;

  // Integration OAuth tokens used for integration analytics tabs.
  googleWorkspaceAccessToken: string | null;
  slackAccessToken: string | null;

  freshness: Record<IntegrationProvider, ProviderFreshnessSnapshot>;
}

type ConnectionRecord = {
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  accessToken: string | null;
  refreshToken: string | null;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

function envOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function buildFreshness(
  provider: IntegrationProvider,
  connection: ConnectionRecord | null,
  usingEnvFallback: boolean
): ProviderFreshnessSnapshot {
  if (connection) {
    return {
      provider,
      source: "connection",
      status: connection.status,
      connectedAt: connection.connectedAt.toISOString(),
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      lastError: connection.lastError,
    };
  }

  if (usingEnvFallback) {
    return {
      provider,
      source: "env",
      status: null,
      connectedAt: null,
      lastSyncedAt: null,
      lastError: null,
    };
  }

  return {
    provider,
    source: "none",
    status: null,
    connectedAt: null,
    lastSyncedAt: null,
    lastError: null,
  };
}

export async function getCredentials(userId?: string): Promise<AnalyticsCredentials> {
  let byProvider = new Map<IntegrationProvider, ConnectionRecord>();

  if (userId) {
    const connections = await prisma.integrationConnection.findMany({
      where: { userId },
      select: {
        provider: true,
        status: true,
        accessToken: true,
        refreshToken: true,
        connectedAt: true,
        lastSyncedAt: true,
        lastError: true,
      },
    });

    byProvider = new Map(
      connections.map((connection) => [
        connection.provider,
        {
          provider: connection.provider,
          status: connection.status,
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
          connectedAt: connection.connectedAt,
          lastSyncedAt: connection.lastSyncedAt,
          lastError: connection.lastError,
        },
      ])
    );
  }

  const hubspotConnection = byProvider.get(IntegrationProvider.HUBSPOT) ?? null;
  const codaConnection = byProvider.get(IntegrationProvider.CODA) ?? null;
  const redditConnection = byProvider.get(IntegrationProvider.REDDIT) ?? null;
  const googleWorkspaceConnection = byProvider.get(IntegrationProvider.GOOGLE_WORKSPACE) ?? null;
  const slackConnection = byProvider.get(IntegrationProvider.SLACK) ?? null;
  const stripeConnection = byProvider.get(IntegrationProvider.STRIPE) ?? null;
  const mercuryConnection = byProvider.get(IntegrationProvider.MERCURY) ?? null;

  const envHubspot = envOrNull(process.env.HUBSPOT_ACCESS_TOKEN);
  const envCoda = envOrNull(process.env.CODA_API_TOKEN);
  const envRedditRefresh = envOrNull(process.env.REDDIT_REFRESH_TOKEN);
  const envStripe = envOrNull(process.env.STRIPE_SECRET_KEY);
  const envMercury = envOrNull(process.env.MERCURY_API_TOKEN);

  const hubspotToken =
    envHubspot ??
    (hubspotConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(hubspotConnection.accessToken)
      : null);

  const codaApiToken =
    envCoda ??
    (codaConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(codaConnection.accessToken)
      : null);

  const redditRefreshToken =
    envRedditRefresh ??
    (redditConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(redditConnection.refreshToken)
      : null);

  const googleWorkspaceAccessToken =
    googleWorkspaceConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(googleWorkspaceConnection.accessToken)
      : null;

  const slackAccessToken =
    slackConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(slackConnection.accessToken)
      : null;

  const stripeKey =
    envStripe ??
    (stripeConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(stripeConnection.accessToken)
      : null);

  const mercuryKey =
    envMercury ??
    (mercuryConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(mercuryConnection.accessToken)
      : null);

  const freshness: Record<IntegrationProvider, ProviderFreshnessSnapshot> = {
    [IntegrationProvider.GOOGLE_WORKSPACE]: buildFreshness(
      IntegrationProvider.GOOGLE_WORKSPACE,
      googleWorkspaceConnection,
      false
    ),
    [IntegrationProvider.HUBSPOT]: buildFreshness(
      IntegrationProvider.HUBSPOT,
      hubspotConnection,
      Boolean(envHubspot)
    ),
    [IntegrationProvider.SLACK]: buildFreshness(IntegrationProvider.SLACK, slackConnection, false),
    [IntegrationProvider.CODA]: buildFreshness(
      IntegrationProvider.CODA,
      codaConnection,
      Boolean(envCoda)
    ),
    [IntegrationProvider.REDDIT]: buildFreshness(
      IntegrationProvider.REDDIT,
      redditConnection,
      Boolean(envRedditRefresh)
    ),
    [IntegrationProvider.STRIPE]: buildFreshness(
      IntegrationProvider.STRIPE,
      stripeConnection,
      Boolean(envStripe)
    ),
    [IntegrationProvider.MERCURY]: buildFreshness(
      IntegrationProvider.MERCURY,
      mercuryConnection,
      Boolean(envMercury)
    ),
  };

  return {
    hubspotToken,
    stripeKey,
    mercuryKey,

    gaPropertyId: envOrNull(process.env.GA_PROPERTY_ID),
    gaClientEmail: envOrNull(process.env.GA_CLIENT_EMAIL),
    gaPrivateKey: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() || null,

    googleAdsDevToken: envOrNull(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
    googleAdsCustomerId: envOrNull(process.env.GOOGLE_ADS_CUSTOMER_ID),
    googleAdsRefreshToken: envOrNull(process.env.GOOGLE_ADS_REFRESH_TOKEN),
    googleAdsClientId: envOrNull(process.env.GOOGLE_ADS_CLIENT_ID),
    googleAdsClientSecret: envOrNull(process.env.GOOGLE_ADS_CLIENT_SECRET),

    metaAccessToken: envOrNull(process.env.META_ACCESS_TOKEN),
    metaAdAccountId: envOrNull(process.env.META_AD_ACCOUNT_ID),
    metaPageId: envOrNull(process.env.META_PAGE_ID),

    redditClientId: envOrNull(process.env.REDDIT_CLIENT_ID),
    redditClientSecret: envOrNull(process.env.REDDIT_CLIENT_SECRET),
    redditRefreshToken,
    redditAdAccountId: envOrNull(process.env.REDDIT_AD_ACCOUNT_ID),

    semrushApiToken: envOrNull(process.env.SEMRUSH_API_TOKEN),

    webflowApiToken: envOrNull(process.env.WEBFLOW_API_TOKEN),
    webflowSiteId: envOrNull(process.env.WEBFLOW_SITE_ID) || "67b7700312bb763ca2083376",

    codaApiToken,
    codaDocId: envOrNull(process.env.CODA_DOC_ID) || "dPjhbdhLZh9",

    pylonApiKey: envOrNull(process.env.PYLON_API_KEY),

    googleWorkspaceAccessToken,
    slackAccessToken,

    freshness,
  };
}

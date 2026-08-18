// ─── Analytics Credentials Helper ─────────────────────────
// Resolves analytics credentials from env and integration connections.

import {
  IntegrationConnectionStatus,
  IntegrationProvider,
  type Prisma,
} from "@/generated/prisma/client";
import {
  getIntegrationByProvider,
  getIntegrationOAuthCredentials,
  isOAuthIntegration,
} from "@/lib/integrations/catalog";
import {
  discoverMetaAdAccountId,
  discoverMetaPageAndInstagram,
  exchangeMetaForLongLivedToken,
} from "@/lib/integrations/meta-auth";
import { getIntegrationEnvValue } from "@/lib/integrations/env";
import { compactErrorMessage, refreshOAuthToken } from "@/lib/integrations/oauth";
import { listProviderRegistryEntries } from "@/lib/integrations/provider-registry";
import { validateIntegrationScopes } from "@/lib/integrations/scope-validation";
import { prisma } from "@/lib/prisma";
import {
  protectIntegrationSecret,
  unprotectIntegrationSecret,
} from "@/lib/integrations/token-crypto";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
import { isConfiguredIntegrationOwner } from "@/lib/integrations/ownership";

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
  googleAdsLoginCustomerId: string | null;

  // Meta (Facebook/Instagram)
  metaAccessToken: string | null;
  metaAdAccountId: string | null;
  metaPageId: string | null;
  metaInstagramAccountId: string | null;

  // Reddit Ads
  redditClientId: string | null;
  redditClientSecret: string | null;
  redditRefreshToken: string | null;
  redditAdAccountId: string | null;
  redditUserAgent: string | null;

  // Webflow
  webflowApiToken: string | null;
  webflowSiteId: string | null;

  // SEMrush
  semrushApiToken: string | null;
  semrushDomain: string | null;

  // Coda
  codaApiToken: string | null;
  codaDocId: string | null;

  // Airtable
  airtableApiToken: string | null;
  airtableBaseId: string | null;
  airtableTableName: string | null;

  // Pylon
  pylonApiKey: string | null;
  pylonBaseUrl: string | null;

  // Integration OAuth tokens used for integration analytics tabs.
  googleWorkspaceAccessToken: string | null;
  slackAccessToken: string | null;

  freshness: Record<IntegrationProvider, ProviderFreshnessSnapshot>;
}

export function hasIntegrationCredential(
  provider: IntegrationProvider,
  credentials: AnalyticsCredentials
): boolean {
  switch (provider) {
    case IntegrationProvider.GOOGLE_WORKSPACE:
      return hasValue(credentials.googleWorkspaceAccessToken);
    case IntegrationProvider.HUBSPOT:
      return hasValue(credentials.hubspotToken);
    case IntegrationProvider.SLACK:
      return hasValue(credentials.slackAccessToken);
    case IntegrationProvider.CODA:
      return hasValue(credentials.codaApiToken);
    case IntegrationProvider.AIRTABLE:
      return Boolean(
        hasValue(credentials.airtableApiToken) &&
          hasValue(credentials.airtableBaseId) &&
          hasValue(credentials.airtableTableName)
      );
    case IntegrationProvider.REDDIT:
      return hasValue(credentials.redditRefreshToken);
    case IntegrationProvider.GOOGLE_ANALYTICS:
      return Boolean(
        credentials.gaPropertyId &&
          ((credentials.gaClientEmail && credentials.gaPrivateKey) ||
            (process.env.GA_REFRESH_TOKEN &&
              process.env.GOOGLE_CLIENT_ID &&
              process.env.GOOGLE_CLIENT_SECRET))
      );
    case IntegrationProvider.STRIPE:
      return hasValue(credentials.stripeKey);
    case IntegrationProvider.MERCURY:
      return hasValue(credentials.mercuryKey);
    case IntegrationProvider.WEBFLOW:
      return hasValue(credentials.webflowApiToken);
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
      return hasValue(credentials.pylonApiKey);
    case IntegrationProvider.SEMRUSH:
      return hasValue(credentials.semrushApiToken);
    default:
      return false;
  }
}

type ConnectionRecord = {
  userId: string;
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: Date | null;
  scopes: string[];
  metadata: unknown;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

type OAuthRefreshResult = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: Date | null;
  scopes: string[];
};

type MetaDiscoveryResult = {
  adAccountId: string | null;
  pageId: string | null;
  instagramAccountId: string | null;
};

const REFRESH_MARGIN_MS = 2 * 60_000;
const META_REFRESH_MARGIN_MS = 7 * 24 * 60 * 60_000;
const inflightOAuthRefresh = new Map<string, Promise<OAuthRefreshResult>>();
const inflightMetaDiscovery = new Map<string, Promise<MetaDiscoveryResult>>();

function envOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function hasValue(value: string | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

function looksInvalidMetaInstagramAccountId(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "me") return true;
  if (/^act_/i.test(trimmed)) return true;
  return false;
}
function buildFreshness(
  provider: IntegrationProvider,
  connection: ConnectionRecord | null,
  usingEnvFallback: boolean
): ProviderFreshnessSnapshot {
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

  if (connection && connection.status === IntegrationConnectionStatus.CONNECTED) {
    return {
      provider,
      source: "connection",
      status: connection.status,
      connectedAt: connection.connectedAt.toISOString(),
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      lastError: connection.lastError,
    };
  }

  if (connection) {
    return {
      provider,
      source: "none",
      status: connection.status,
      connectedAt: connection.connectedAt.toISOString(),
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      lastError: connection.lastError,
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

export function defaultFreshnessSnapshot(
  provider: IntegrationProvider
): ProviderFreshnessSnapshot {
  return {
    provider,
    source: "none",
    status: null,
    connectedAt: null,
    lastSyncedAt: null,
    lastError: null,
  };
}

function envGoogleAdsReady(): boolean {
  return Boolean(
    envOrNull(process.env.GOOGLE_ADS_DEVELOPER_TOKEN) &&
      envOrNull(process.env.GOOGLE_ADS_CUSTOMER_ID) &&
      envOrNull(process.env.GOOGLE_ADS_REFRESH_TOKEN) &&
      envOrNull(process.env.GOOGLE_ADS_CLIENT_ID) &&
      envOrNull(process.env.GOOGLE_ADS_CLIENT_SECRET)
  );
}

function envMetaAdsReady(): boolean {
  return Boolean(
    envOrNull(process.env.META_ACCESS_TOKEN) &&
      envOrNull(process.env.META_AD_ACCOUNT_ID)
  );
}

function envMetaPageReady(): boolean {
  return Boolean(
    envOrNull(process.env.META_ACCESS_TOKEN) &&
      (envOrNull(process.env.META_PAGE_ID) ||
        envOrNull(process.env.META_INSTAGRAM_ACCOUNT_ID))
  );
}

async function bestEffortRefreshOAuthConnection(input: {
  userId: string;
  connection: ConnectionRecord;
  required: boolean;
}): Promise<void> {
  const { userId, connection, required } = input;

  const definition = getIntegrationByProvider(connection.provider);
  if (!definition || !isOAuthIntegration(definition)) {
    return;
  }

  const oauthCredentials = getIntegrationOAuthCredentials(definition);
  if (!oauthCredentials) {
    return;
  }

  const key = `${userId}:${connection.provider}`;
  let refresh = inflightOAuthRefresh.get(key);

  if (!refresh) {
    refresh = (async () => {
      if (definition.slug === "meta-ads") {
        const accessToken = unprotectIntegrationSecret(connection.accessToken);
        if (!accessToken) {
          throw new Error("Missing Meta access token");
        }

        const tokenResponse = await exchangeMetaForLongLivedToken({
          accessToken,
          appId: oauthCredentials.clientId,
          appSecret: oauthCredentials.clientSecret,
        });

        const nextAccessToken = protectIntegrationSecret(tokenResponse.accessToken);
        if (!nextAccessToken) {
          throw new Error("Failed to protect refreshed Meta access token");
        }

        const now = new Date();
        await prisma.integrationConnection.update({
          where: {
            userId_provider: {
              userId,
              provider: connection.provider,
            },
          },
          data: {
            accessToken: nextAccessToken,
            tokenType: tokenResponse.tokenType ?? connection.tokenType,
            expiresAt: tokenResponse.expiresAt,
            status: IntegrationConnectionStatus.CONNECTED,
            lastError: null,
            lastSyncedAt: now,
          },
        });

        return {
          accessToken: nextAccessToken,
          refreshToken: connection.refreshToken,
          tokenType: tokenResponse.tokenType ?? connection.tokenType,
          expiresAt: tokenResponse.expiresAt,
          scopes: connection.scopes,
        };
      }

      const refreshToken = unprotectIntegrationSecret(connection.refreshToken);
      if (!refreshToken) {
        throw new Error("Missing OAuth refresh token");
      }

      const tokenResponse = await refreshOAuthToken({
        definition,
        refreshToken,
        clientId: oauthCredentials.clientId,
        clientSecret: oauthCredentials.clientSecret,
      });

      const nextAccessToken = protectIntegrationSecret(tokenResponse.accessToken);
      if (!nextAccessToken) {
        throw new Error("Failed to protect refreshed access token");
      }

      const nextRefreshToken =
        protectIntegrationSecret(tokenResponse.refreshToken) ?? connection.refreshToken;

      const nextScopes =
        tokenResponse.scopes.length > 0 ? tokenResponse.scopes : connection.scopes;

      const now = new Date();
      await prisma.integrationConnection.update({
        where: {
          userId_provider: {
            userId,
            provider: connection.provider,
          },
        },
        data: {
          accessToken: nextAccessToken,
          refreshToken: nextRefreshToken,
          tokenType: tokenResponse.tokenType ?? connection.tokenType,
          expiresAt: tokenResponse.expiresAt,
          scopes: nextScopes,
          status: IntegrationConnectionStatus.CONNECTED,
          lastError: null,
          lastSyncedAt: now,
        },
      });

      return {
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        tokenType: tokenResponse.tokenType ?? connection.tokenType,
        expiresAt: tokenResponse.expiresAt,
        scopes: nextScopes,
      };
    })().finally(() => {
      inflightOAuthRefresh.delete(key);
    });

    inflightOAuthRefresh.set(key, refresh);
  }

  try {
    const outcome = await refresh;
    connection.accessToken = outcome.accessToken;
    connection.refreshToken = outcome.refreshToken;
    connection.tokenType = outcome.tokenType;
    connection.expiresAt = outcome.expiresAt;
    connection.scopes = outcome.scopes;
    connection.status = IntegrationConnectionStatus.CONNECTED;
    connection.lastError = null;
    connection.lastSyncedAt = new Date();
  } catch (error) {
    if (required) {
      const message = compactErrorMessage(error);
      await prisma.integrationConnection.updateMany({
        where: {
          userId,
          provider: connection.provider,
        },
        data: {
          status: IntegrationConnectionStatus.ERROR,
          lastError: message,
          lastSyncedAt: null,
        },
      });
      connection.status = IntegrationConnectionStatus.ERROR;
      connection.lastError = message;
      connection.lastSyncedAt = null;
    } else {
      console.warn(
        `[analytics-credentials] OAuth refresh failed for ${connection.provider}:`,
        error
      );
    }
  }
}

async function bestEffortHealScopeMetadata(input: {
  userId: string;
  connection: ConnectionRecord;
}): Promise<void> {
  const { userId, connection } = input;

  if (connection.scopes.length === 0) {
    return;
  }

  const metadata = asJsonObject(connection.metadata);
  const insufficient = metadata?.insufficientScopes === true;
  const shouldCheck =
    insufficient ||
    Boolean(connection.lastError?.includes("Missing required OAuth scopes"));
  if (!shouldCheck) {
    return;
  }

  const definition = getIntegrationByProvider(connection.provider);
  if (!definition || !isOAuthIntegration(definition)) {
    return;
  }

  const validation = validateIntegrationScopes(definition, connection.scopes);
  if (!validation || !validation.valid) {
    return;
  }

  const nextMetadata: Record<string, unknown> = { ...(metadata ?? {}) };
  nextMetadata.insufficientScopes = false;
  delete nextMetadata.missingScopes;

  await prisma.integrationConnection.updateMany({
    where: {
      userId,
      provider: connection.provider,
    },
    data: {
      metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });

  connection.metadata = nextMetadata;
  connection.lastError = null;
}

export async function getCredentials(userId?: string): Promise<AnalyticsCredentials> {
  let byProvider = new Map<IntegrationProvider, ConnectionRecord>();

  if (userId) {
    const connectionSelect = {
      userId: true,
      provider: true,
      status: true,
      accessToken: true,
      refreshToken: true,
      tokenType: true,
      expiresAt: true,
      scopes: true,
      metadata: true,
      connectedAt: true,
      lastSyncedAt: true,
      lastError: true,
    } as const;

    const connections = await prisma.integrationConnection.findMany({
      where: { userId },
      select: connectionSelect,
    });

    // Owner fallback: when the configured owner is missing one or more providers
    // (migration hasn't run or only partially completed), fill providers that
    // are absent or only have stale non-connected owner rows from the most
    // recently connected non-owner rows.
    if (isConfiguredIntegrationOwner(userId)) {
      const ownerConnectionByProvider = new Map(
        connections.map((connection) => [connection.provider, connection])
      );
      const fallbackProviders = Array.from(
        new Set(
          Object.values(IntegrationProvider).filter((provider) => {
            const ownerConnection = ownerConnectionByProvider.get(provider);
            return !ownerConnection || ownerConnection.status !== IntegrationConnectionStatus.CONNECTED;
          })
        )
      );

      const fallbackWhere =
        fallbackProviders.length === Object.values(IntegrationProvider).length
          ? {
              status: IntegrationConnectionStatus.CONNECTED,
              userId: { not: userId },
            }
          : {
              status: IntegrationConnectionStatus.CONNECTED,
              userId: { not: userId },
              provider: { in: fallbackProviders },
            };

      const fallbackConnections = await prisma.integrationConnection.findMany({
        where: fallbackWhere,
        orderBy: { connectedAt: "desc" },
        select: connectionSelect,
      });

      const fallbackProvidersResolved = new Set<IntegrationProvider>();
      for (const connection of fallbackConnections) {
        if (fallbackProvidersResolved.has(connection.provider)) {
          continue;
        }
        fallbackProvidersResolved.add(connection.provider);

        const ownerIndex = connections.findIndex(
          (ownerConnection) => ownerConnection.provider === connection.provider
        );
        if (ownerIndex === -1) {
          connections.push(connection);
          continue;
        }

        if (connections[ownerIndex].status !== IntegrationConnectionStatus.CONNECTED) {
          connections[ownerIndex] = connection;
        }
      }
    }

    byProvider = new Map(
      connections.map((connection) => [
        connection.provider,
        {
          userId: connection.userId,
          provider: connection.provider,
          status: connection.status,
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
          tokenType: connection.tokenType,
          expiresAt: connection.expiresAt,
          scopes: connection.scopes,
          metadata: connection.metadata,
          connectedAt: connection.connectedAt,
          lastSyncedAt: connection.lastSyncedAt,
          lastError: connection.lastError,
        },
      ])
    );

    const refreshCandidates = [
      IntegrationProvider.GOOGLE_WORKSPACE,
      IntegrationProvider.HUBSPOT,
      IntegrationProvider.META_ADS,
      IntegrationProvider.STRIPE,
      IntegrationProvider.MERCURY,
      IntegrationProvider.WEBFLOW,
    ] as const;

    const now = Date.now();
    await Promise.all(
      refreshCandidates.map(async (provider) => {
        const connection = byProvider.get(provider);
        if (!connection) return;

        if (
          connection.status !== IntegrationConnectionStatus.CONNECTED &&
          connection.status !== IntegrationConnectionStatus.ERROR
        ) {
          return;
        }

        const hasAccessToken = Boolean(unprotectIntegrationSecret(connection.accessToken));
        const expiresAtMs = connection.expiresAt?.getTime() ?? null;
        const refreshMarginMs =
          provider === IntegrationProvider.META_ADS ? META_REFRESH_MARGIN_MS : REFRESH_MARGIN_MS;
        const expiresSoon =
          expiresAtMs !== null && expiresAtMs <= now + refreshMarginMs;

        if (!expiresSoon && hasAccessToken) {
          return;
        }

        const expired = expiresAtMs !== null && expiresAtMs <= now - 30_000;
        const required = expired || !hasAccessToken;

        await bestEffortRefreshOAuthConnection({ userId, connection, required });
      })
    );

    const scopeHealCandidates = [
      ...refreshCandidates,
      IntegrationProvider.GOOGLE_ADS,
    ] as const;

    await Promise.all(
      scopeHealCandidates.map(async (provider) => {
        const connection = byProvider.get(provider);
        if (!connection) return;
        await bestEffortHealScopeMetadata({ userId, connection });
      })
    );
  }

  const hubspotConnection = byProvider.get(IntegrationProvider.HUBSPOT) ?? null;
  const codaConnection = byProvider.get(IntegrationProvider.CODA) ?? null;
  const airtableConnection = byProvider.get(IntegrationProvider.AIRTABLE) ?? null;
  const redditConnection = byProvider.get(IntegrationProvider.REDDIT) ?? null;
  const googleWorkspaceConnection = byProvider.get(IntegrationProvider.GOOGLE_WORKSPACE) ?? null;
  const slackConnection = byProvider.get(IntegrationProvider.SLACK) ?? null;
  const stripeConnection = byProvider.get(IntegrationProvider.STRIPE) ?? null;
  const mercuryConnection = byProvider.get(IntegrationProvider.MERCURY) ?? null;
  const webflowConnection = byProvider.get(IntegrationProvider.WEBFLOW) ?? null;
  const googleAdsConnection = byProvider.get(IntegrationProvider.GOOGLE_ADS) ?? null;
  const metaAdsConnection = byProvider.get(IntegrationProvider.META_ADS) ?? null;
  const metaPageConnection = byProvider.get(IntegrationProvider.META_PAGE) ?? null;
  const pylonConnection = byProvider.get(IntegrationProvider.PYLON) ?? null;

  const envHubspot = envOrNull(process.env.HUBSPOT_ACCESS_TOKEN);
  const envCoda = envOrNull(process.env.CODA_API_TOKEN);
  const envAirtable = envOrNull(process.env.AIRTABLE_API_TOKEN);
  const envAirtableBaseId = envOrNull(process.env.AIRTABLE_BASE_ID);
  const envAirtableTableName = envOrNull(process.env.AIRTABLE_TABLE_NAME);
  const envRedditRefresh = envOrNull(process.env.REDDIT_REFRESH_TOKEN);
  const envStripe = envOrNull(process.env.STRIPE_SECRET_KEY);
  const envMercury = envOrNull(process.env.MERCURY_API_TOKEN);
  const envWebflowToken = envOrNull(process.env.WEBFLOW_API_TOKEN);
  const envWebflowSiteId = envOrNull(process.env.WEBFLOW_SITE_ID);
  const envPylonApiKey = envOrNull(process.env.PYLON_API_KEY);
  const envPylonBaseUrl = envOrNull(process.env.PYLON_API_BASE_URL);
  const envMetaAccessToken = envOrNull(process.env.META_ACCESS_TOKEN);
  const envMetaAdAccountId = envOrNull(process.env.META_AD_ACCOUNT_ID);
  const envMetaPageId = envOrNull(process.env.META_PAGE_ID);
  const envMetaInstagramAccountId = envOrNull(process.env.META_INSTAGRAM_ACCOUNT_ID);

  const hubspotToken =
    hubspotConnection && hubspotConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? await getValidIntegrationAccessToken({
          userId: hubspotConnection.userId,
          provider: IntegrationProvider.HUBSPOT,
        }).catch(() => null)
      : envHubspot;
  const usingHubspotEnvFallback =
    Boolean(envHubspot) &&
    (!hubspotConnection || hubspotConnection.status === IntegrationConnectionStatus.DISCONNECTED);

  const codaApiToken =
    codaConnection && codaConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? unprotectIntegrationSecret(codaConnection.accessToken)
      : envCoda;
  const usingCodaEnvFallback =
    Boolean(envCoda) &&
    (!codaConnection || codaConnection.status === IntegrationConnectionStatus.DISCONNECTED);

  const airtableApiToken =
    airtableConnection && airtableConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? unprotectIntegrationSecret(airtableConnection.accessToken)
      : envAirtable;
  const usingAirtableEnvFallback =
    Boolean(envAirtable) &&
    (!airtableConnection || airtableConnection.status === IntegrationConnectionStatus.DISCONNECTED);
  const airtableBaseId =
    metadataString(airtableConnection?.metadata, "baseId") ?? envAirtableBaseId;
  const airtableTableName =
    metadataString(airtableConnection?.metadata, "tableName") ?? envAirtableTableName;

  const redditRefreshToken =
    redditConnection && redditConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? unprotectIntegrationSecret(redditConnection.refreshToken)
      : envRedditRefresh;
  const usingRedditEnvFallback =
    Boolean(envRedditRefresh) &&
    (!redditConnection || redditConnection.status === IntegrationConnectionStatus.DISCONNECTED);

  const googleWorkspaceAccessToken =
    googleWorkspaceConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? await getValidIntegrationAccessToken({
          userId: googleWorkspaceConnection.userId,
          provider: IntegrationProvider.GOOGLE_WORKSPACE,
        }).catch(() => null)
      : null;

  const slackAccessToken =
    slackConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(slackConnection.accessToken)
      : null;

  const stripeKey =
    stripeConnection && stripeConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? await getValidIntegrationAccessToken({
          userId: stripeConnection.userId,
          provider: IntegrationProvider.STRIPE,
        }).catch(() => null)
      : envStripe;
  const usingStripeEnvFallback =
    Boolean(envStripe) &&
    (!stripeConnection || stripeConnection.status === IntegrationConnectionStatus.DISCONNECTED);

  const mercuryKey =
    mercuryConnection && mercuryConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? await getValidIntegrationAccessToken({
          userId: mercuryConnection.userId,
          provider: IntegrationProvider.MERCURY,
        }).catch(() => null)
      : envMercury;
  const usingMercuryEnvFallback =
    Boolean(envMercury) &&
    (!mercuryConnection || mercuryConnection.status === IntegrationConnectionStatus.DISCONNECTED);

  const webflowApiToken =
    webflowConnection && webflowConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? await getValidIntegrationAccessToken({
          userId: webflowConnection.userId,
          provider: IntegrationProvider.WEBFLOW,
        }).catch(() => null)
      : envWebflowToken;
  const usingWebflowEnvFallback =
    Boolean(envWebflowToken) &&
    (!webflowConnection || webflowConnection.status === IntegrationConnectionStatus.DISCONNECTED);

  const webflowSiteId =
    (webflowConnection && webflowConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? metadataString(webflowConnection?.metadata, "siteId") ??
        metadataString(webflowConnection?.metadata, "defaultSiteId")
      : null) ?? envWebflowSiteId;

  const googleAdsConnectionRefreshToken =
    googleAdsConnection?.status === IntegrationConnectionStatus.CONNECTED
      ? unprotectIntegrationSecret(googleAdsConnection.refreshToken)
      : null;

  const envGoogleAdsRefreshToken = envOrNull(process.env.GOOGLE_ADS_REFRESH_TOKEN);
  const googleAdsRefreshToken = googleAdsConnectionRefreshToken ?? envGoogleAdsRefreshToken;
  const usingGoogleAdsEnvFallback =
    !googleAdsConnectionRefreshToken && envGoogleAdsReady();

  const metaAccessTokenFromAds =
    metaAdsConnection && metaAdsConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? await getValidIntegrationAccessToken({
          userId: metaAdsConnection.userId,
          provider: IntegrationProvider.META_ADS,
        }).catch(() => null)
      : null;
  const metaAccessTokenFromPage =
    metaPageConnection && metaPageConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? await getValidIntegrationAccessToken({
          userId: metaPageConnection.userId,
          provider: IntegrationProvider.META_PAGE,
        }).catch(() => null)
      : null;
  const usingMetaEnvFallback =
    Boolean(envMetaAccessToken) &&
    (!metaAdsConnection || metaAdsConnection.status === IntegrationConnectionStatus.DISCONNECTED) &&
    (!metaPageConnection || metaPageConnection.status === IntegrationConnectionStatus.DISCONNECTED);
  const metaAccessToken =
    metaAccessTokenFromAds ??
    metaAccessTokenFromPage ??
    (usingMetaEnvFallback ? envMetaAccessToken : null);


  const metaAdsMetadata = metaAdsConnection?.metadata ?? null;
  const metaPageMetadata = metaPageConnection?.metadata ?? null;

  let metaAdAccountId = metadataString(metaAdsMetadata, "adAccountId") ?? envMetaAdAccountId;
  let metaPageId =
    metadataString(metaPageMetadata, "pageId") ??
    metadataString(metaAdsMetadata, "pageId") ??
    envMetaPageId;
  let metaInstagramAccountId =
    metadataString(metaPageMetadata, "instagramAccountId") ??
    metadataString(metaAdsMetadata, "instagramAccountId") ??
    envMetaInstagramAccountId;

  if (looksInvalidMetaInstagramAccountId(metaInstagramAccountId)) {
    metaInstagramAccountId = null;
  }

  if (
    userId &&
    metaAccessToken &&
    (!metaAdAccountId || !metaPageId || !metaInstagramAccountId)
  ) {
    const key = `${userId}:meta`;
    let discovery = inflightMetaDiscovery.get(key);

    if (!discovery) {
      discovery = (async () => {
        const result: MetaDiscoveryResult = {
          adAccountId: null,
          pageId: null,
          instagramAccountId: null,
        };

        if (!metaAdAccountId) {
          try {
            result.adAccountId = await discoverMetaAdAccountId({
              accessToken: metaAccessToken,
            });
          } catch (error) {
            console.warn("[analytics-credentials] Meta ad account discovery failed:", error);
          }
        }

        if (!metaPageId || !metaInstagramAccountId) {
          try {
            const discovered = await discoverMetaPageAndInstagram({
              accessToken: metaAccessToken,
            });
            result.pageId = discovered.pageId;
            result.instagramAccountId = discovered.instagramAccountId;
          } catch (error) {
            console.warn("[analytics-credentials] Meta page discovery failed:", error);
          }
        }

        return result;
      })().finally(() => {
        inflightMetaDiscovery.delete(key);
      });

      inflightMetaDiscovery.set(key, discovery);
    }

    try {
      const discovered = await discovery;
      const updates: Record<string, unknown> = {};

      if (discovered.adAccountId && !metaAdAccountId) {
        metaAdAccountId = discovered.adAccountId;
        updates.adAccountId = discovered.adAccountId;
      }

      if (discovered.pageId && !metaPageId) {
        metaPageId = discovered.pageId;
        updates.pageId = discovered.pageId;
      }

      if (discovered.instagramAccountId && !metaInstagramAccountId) {
        metaInstagramAccountId = discovered.instagramAccountId;
        updates.instagramAccountId = discovered.instagramAccountId;
      }

      if (Object.keys(updates).length > 0) {
        const base = asJsonObject(metaAdsConnection?.metadata) ?? {};
        const nextMetadata = {
          ...base,
          ...updates,
          metaDiscoveredAt: new Date().toISOString(),
        } as Prisma.InputJsonObject;

        await prisma.integrationConnection.upsert({
          where: {
            userId_provider: {
              userId,
              provider: IntegrationProvider.META_ADS,
            },
          },
          create: {
            userId,
            provider: IntegrationProvider.META_ADS,
            status: IntegrationConnectionStatus.DISCONNECTED,
            metadata: nextMetadata,
          },
          update: {
            metadata: nextMetadata,
          },
        });

        if (metaAdsConnection) {
          metaAdsConnection.metadata = nextMetadata;
        }
      }
    } catch (error) {
      console.warn("[analytics-credentials] Meta discovery failed:", error);
    }
  }


  const pylonApiKey =
    pylonConnection && pylonConnection.status !== IntegrationConnectionStatus.DISCONNECTED
      ? unprotectIntegrationSecret(pylonConnection.accessToken)
      : envPylonApiKey;
  const usingPylonEnvFallback =
    hasValue(envPylonApiKey) &&
    (!pylonConnection || pylonConnection.status === IntegrationConnectionStatus.DISCONNECTED);

  const pylonBaseUrl =
    metadataString(pylonConnection?.metadata, "baseUrl") ?? envPylonBaseUrl;
  const freshness: Record<IntegrationProvider, ProviderFreshnessSnapshot> = {
    [IntegrationProvider.GOOGLE_WORKSPACE]: buildFreshness(
      IntegrationProvider.GOOGLE_WORKSPACE,
      googleWorkspaceConnection,
      false
    ),
    [IntegrationProvider.HUBSPOT]: buildFreshness(
      IntegrationProvider.HUBSPOT,
      hubspotConnection,
      usingHubspotEnvFallback
    ),
    [IntegrationProvider.SLACK]: buildFreshness(IntegrationProvider.SLACK, slackConnection, false),
    [IntegrationProvider.CODA]: buildFreshness(
      IntegrationProvider.CODA,
      codaConnection,
      usingCodaEnvFallback
    ),
    [IntegrationProvider.AIRTABLE]: buildFreshness(
      IntegrationProvider.AIRTABLE,
      airtableConnection,
      usingAirtableEnvFallback
    ),
    [IntegrationProvider.REDDIT]: buildFreshness(
      IntegrationProvider.REDDIT,
      redditConnection,
      usingRedditEnvFallback
    ),
    [IntegrationProvider.STRIPE]: buildFreshness(
      IntegrationProvider.STRIPE,
      stripeConnection,
      usingStripeEnvFallback
    ),
    [IntegrationProvider.MERCURY]: buildFreshness(
      IntegrationProvider.MERCURY,
      mercuryConnection,
      usingMercuryEnvFallback
    ),
    [IntegrationProvider.WEBFLOW]: buildFreshness(
      IntegrationProvider.WEBFLOW,
      webflowConnection,
      usingWebflowEnvFallback
    ),
    [IntegrationProvider.GOOGLE_ADS]: buildFreshness(
      IntegrationProvider.GOOGLE_ADS,
      googleAdsConnection,
      usingGoogleAdsEnvFallback
    ),
    [IntegrationProvider.META_ADS]: buildFreshness(
      IntegrationProvider.META_ADS,
      metaAdsConnection,
      usingMetaEnvFallback && envMetaAdsReady()
    ),
    [IntegrationProvider.META_PAGE]: buildFreshness(
      IntegrationProvider.META_PAGE,
      metaPageConnection,
      usingMetaEnvFallback && envMetaPageReady()
    ),
    [IntegrationProvider.GOOGLE_ANALYTICS]: buildFreshness(
      IntegrationProvider.GOOGLE_ANALYTICS,
      null,
      Boolean(process.env.GA_PROPERTY_ID && ((process.env.GA_CLIENT_EMAIL && process.env.GA_PRIVATE_KEY) || (process.env.GA_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)))
    ),
    [IntegrationProvider.SEMRUSH]: buildFreshness(
      IntegrationProvider.SEMRUSH,
      null,
      Boolean(getIntegrationEnvValue("SEMRUSH_API_TOKEN"))
    ),
    [IntegrationProvider.GOOGLE_SEARCH_CONSOLE]: defaultFreshnessSnapshot(
      IntegrationProvider.GOOGLE_SEARCH_CONSOLE
    ),
    [IntegrationProvider.WIPGUARD]: defaultFreshnessSnapshot(
      IntegrationProvider.WIPGUARD
    ),
    [IntegrationProvider.PYLON]: buildFreshness(
      IntegrationProvider.PYLON,
      pylonConnection,
      usingPylonEnvFallback
    ),
  };

  for (const entry of listProviderRegistryEntries()) {
    if (!freshness[entry.provider]) {
      freshness[entry.provider] = defaultFreshnessSnapshot(entry.provider);
    }
  }

  return {
    hubspotToken,
    stripeKey,
    mercuryKey,

    gaPropertyId: envOrNull(process.env.GA_PROPERTY_ID),
    gaClientEmail: envOrNull(process.env.GA_CLIENT_EMAIL),
    gaPrivateKey: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() || null,

    googleAdsDevToken: envOrNull(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
    googleAdsCustomerId: envOrNull(process.env.GOOGLE_ADS_CUSTOMER_ID),
    googleAdsRefreshToken,
    googleAdsClientId: envOrNull(process.env.GOOGLE_ADS_CLIENT_ID),
    googleAdsClientSecret: envOrNull(process.env.GOOGLE_ADS_CLIENT_SECRET),
    googleAdsLoginCustomerId: envOrNull(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),

    metaAccessToken,
    metaAdAccountId,
    metaPageId,
    metaInstagramAccountId,

    redditClientId: envOrNull(process.env.REDDIT_CLIENT_ID),
    redditClientSecret: envOrNull(process.env.REDDIT_CLIENT_SECRET),
    redditRefreshToken,
    redditAdAccountId: envOrNull(process.env.REDDIT_AD_ACCOUNT_ID),
    redditUserAgent: envOrNull(process.env.REDDIT_USER_AGENT),

    semrushApiToken: envOrNull(getIntegrationEnvValue("SEMRUSH_API_TOKEN")),
    semrushDomain: envOrNull(process.env.SEMRUSH_DOMAIN),

    webflowApiToken,
    webflowSiteId,

    codaApiToken,
    codaDocId:
      envOrNull(process.env.CODA_DOC_ID) ??
      metadataString(codaConnection?.metadata, "docId") ??
      null,

    airtableApiToken,
    airtableBaseId,
    airtableTableName,

    pylonApiKey,
    pylonBaseUrl,

    googleWorkspaceAccessToken,
    slackAccessToken,

    freshness,
  };
}

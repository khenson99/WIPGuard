import { IntegrationProvider, IntegrationConnectionStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchJsonWithResilience } from "@/lib/integrations/http-client";
import { getIntegrationEnvValue } from "@/lib/integrations/env";
import {
  getIntegrationByProvider,
  getIntegrationOAuthCredentials,
  isOAuthIntegration,
} from "@/lib/integrations/catalog";
import { IntegrationAuthError, IntegrationConfigError } from "@/lib/integrations/errors";
import {
  protectIntegrationSecret,
  unprotectIntegrationSecret,
} from "@/lib/integrations/token-crypto";
import { isConfiguredIntegrationOwner } from "@/lib/integrations/ownership";

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const META_GRAPH_VERSION = "v21.0";

function needsRefresh(expiresAt: Date | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now + EXPIRY_BUFFER_MS;
}

function providerLabel(provider: IntegrationProvider): string {
  return provider.toString().toLowerCase();
}

type OAuthRefreshResult = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: Date | null;
  raw: unknown;
};

async function refreshOAuthTokenViaRefreshToken(input: {
  provider: IntegrationProvider;
  refreshToken: string;
}): Promise<OAuthRefreshResult> {
  const definition = getIntegrationByProvider(input.provider);
  if (!definition || !isOAuthIntegration(definition)) {
    throw new IntegrationConfigError(providerLabel(input.provider), "Provider is not an OAuth integration");
  }

  const credentials = getIntegrationOAuthCredentials(definition);
  if (!credentials) {
    throw new IntegrationConfigError(definition.slug, "OAuth client credentials are missing on the server");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (definition.oauth.tokenClientAuthMethod === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", credentials.clientId);
    body.set("client_secret", credentials.clientSecret);
  }

  const tokenPayload = await fetchJsonWithResilience<Record<string, unknown>>({
    url: definition.oauth.tokenEndpoint,
    init: {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  // Slack uses `ok: false` style payloads; treat them as errors.
  if (definition.slug === "slack" && tokenPayload.ok === false) {
    throw new IntegrationAuthError("slack", String(tokenPayload.error || "Slack refresh failed"));
  }

  const accessToken =
    typeof tokenPayload.access_token === "string" && tokenPayload.access_token.trim()
      ? tokenPayload.access_token.trim()
      : null;
  if (!accessToken) {
    throw new IntegrationAuthError(definition.slug, "Token refresh response missing access_token");
  }

  const refreshToken =
    typeof tokenPayload.refresh_token === "string" && tokenPayload.refresh_token.trim()
      ? tokenPayload.refresh_token.trim()
      : null;
  const tokenType =
    typeof tokenPayload.token_type === "string" && tokenPayload.token_type.trim()
      ? tokenPayload.token_type.trim()
      : null;
  const expiresIn =
    typeof tokenPayload.expires_in === "number" && Number.isFinite(tokenPayload.expires_in)
      ? tokenPayload.expires_in
      : null;
  const expiresAt = expiresIn && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;

  return {
    accessToken,
    refreshToken,
    tokenType,
    expiresAt,
    raw: tokenPayload,
  };
}

async function refreshMetaLongLivedToken(input: {
  accessToken: string;
}): Promise<OAuthRefreshResult> {
  const clientId = getIntegrationEnvValue("META_APP_ID");
  const clientSecret = getIntegrationEnvValue("META_APP_SECRET");
  if (!clientId || !clientSecret) {
    throw new IntegrationConfigError("meta", "META_APP_ID/META_APP_SECRET are missing on the server");
  }

  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("fb_exchange_token", input.accessToken);

  const payload = await fetchJsonWithResilience<Record<string, unknown>>({
    url: url.toString(),
    init: { method: "GET", cache: "no-store" },
    timeoutMs: 12_000,
    maxAttempts: 3,
  });

  const accessToken =
    typeof payload.access_token === "string" && payload.access_token.trim()
      ? payload.access_token.trim()
      : null;
  if (!accessToken) {
    throw new IntegrationAuthError("meta", "Meta token exchange response missing access_token");
  }
  const expiresIn =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : null;
  const expiresAt = expiresIn && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;

  return {
    accessToken,
    refreshToken: null,
    tokenType: "Bearer",
    expiresAt,
    raw: payload,
  };
}

const inflight = new Map<string, Promise<string>>();

function inflightKey(userId: string, provider: IntegrationProvider): string {
  return `${userId}:${provider}`;
}

export async function getValidIntegrationAccessToken(input: {
  userId: string;
  provider: IntegrationProvider;
  forceRefresh?: boolean;
}): Promise<string> {
  const key = inflightKey(input.userId, input.provider);
  if (inflight.has(key)) {
    return inflight.get(key)!;
  }

  const promise = (async () => {
    let connection = await prisma.integrationConnection.findUnique({
      where: {
        userId_provider: {
          userId: input.userId,
          provider: input.provider,
        },
      },
    });

    // Owner fallback: when the configured owner has no connection yet
    // (migration hasn't run), look for any connected user's connection.
    if (!connection && isConfiguredIntegrationOwner(input.userId)) {
      connection = await prisma.integrationConnection.findFirst({
        where: {
          provider: input.provider,
          status: IntegrationConnectionStatus.CONNECTED,
        },
        orderBy: { connectedAt: "desc" },
      });
    }

    if (!connection || connection.status === IntegrationConnectionStatus.DISCONNECTED) {
      throw new IntegrationAuthError(providerLabel(input.provider), "Integration is not connected");
    }

    const token = unprotectIntegrationSecret(connection.accessToken);
    if (!token) {
      throw new IntegrationAuthError(providerLabel(input.provider), "Access token is missing");
    }

    // If a connection is in ERROR, force a refresh attempt to validate/heal
    // credentials even if the current token is not yet expired.
    const shouldRefresh =
      input.forceRefresh === true ||
      needsRefresh(connection.expiresAt) ||
      connection.status === IntegrationConnectionStatus.ERROR;
    if (!shouldRefresh) {
      return token;
    }

    // Meta has no refresh token; it needs long-lived token exchange.
    const isMeta =
      input.provider === IntegrationProvider.META_ADS ||
      input.provider === IntegrationProvider.META_PAGE;

    const refreshed = isMeta
      ? await refreshMetaLongLivedToken({ accessToken: token })
      : await (async () => {
          const refreshToken = unprotectIntegrationSecret(connection.refreshToken);
          if (!refreshToken) {
            throw new IntegrationAuthError(providerLabel(input.provider), "Refresh token is missing");
          }
          return await refreshOAuthTokenViaRefreshToken({
            provider: input.provider,
            refreshToken,
          });
        })();

    await prisma.integrationConnection.update({
      where: {
        userId_provider: {
          userId: input.userId,
          provider: input.provider,
        },
      },
      data: {
        accessToken: protectIntegrationSecret(refreshed.accessToken),
        refreshToken:
          protectIntegrationSecret(refreshed.refreshToken) ??
          connection.refreshToken,
        tokenType: refreshed.tokenType ?? connection.tokenType,
        expiresAt: refreshed.expiresAt,
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: null,
        lastSyncedAt: new Date(),
        metadata: {
          ...(typeof connection.metadata === "object" && connection.metadata && !Array.isArray(connection.metadata)
            ? (connection.metadata as Record<string, unknown>)
            : {}),
          ...(isMeta && refreshed.expiresAt
            ? { tokenExpiresAt: refreshed.expiresAt.toISOString() }
            : {}),
        } as never,
      },
    });

    return refreshed.accessToken;
  })()
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * Run a single refresh+retry cycle when an upstream call fails due to auth.
 */
export async function withAuthRefreshRetry<T>(input: {
  userId: string;
  provider: IntegrationProvider;
  run: (accessToken: string) => Promise<T>;
}): Promise<T> {
  const token = await getValidIntegrationAccessToken({
    userId: input.userId,
    provider: input.provider,
  });
  try {
    return await input.run(token);
  } catch (error) {
    // Only retry on obvious auth failures.
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const looksAuth = message.includes("unauthorized") || message.includes("forbidden") || message.includes("invalid") || message.includes("expired");
    if (!looksAuth) {
      throw error;
    }
    const refreshed = await getValidIntegrationAccessToken({
      userId: input.userId,
      provider: input.provider,
      forceRefresh: true,
    });
    return await input.run(refreshed);
  }
}

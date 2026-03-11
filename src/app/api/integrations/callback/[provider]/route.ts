export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  IntegrationConnectionStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import {
  getIntegrationBySlug,
  getIntegrationOAuthCredentials,
  isOAuthIntegration,
} from "@/lib/integrations/catalog";
import {
  buildOAuthRedirectUri,
  decodeOAuthStateCookie,
  compactErrorMessage,
  exchangeOAuthCode,
  fetchOAuthAccountProfile,
  getOAuthStateCookieName,
} from "@/lib/integrations/oauth";
import {
  discoverMetaAdAccountId,
  discoverMetaPageAndInstagram,
  exchangeMetaForLongLivedToken,
} from "@/lib/integrations/meta-auth";
import { validateIntegrationScopes } from "@/lib/integrations/scope-validation";
import { getAuthenticatedUser } from "@/lib/session-user";
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { protectIntegrationSecret } from "@/lib/integrations/token-crypto";
import {
  ensureIntegrationOwnerOrganizationId,
  resolveIntegrationOwnerUserId,
} from "@/lib/integrations/ownership";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

type UnknownRecord = Record<string, unknown>;
function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

async function augmentMetaMetadata(input: {
  providerSlug: "meta-ads" | "meta-page";
  accessToken: string;
}): Promise<Record<string, unknown>> {
  const base = `https://graph.facebook.com/v21.0`;
  const headers = { Authorization: `Bearer ${input.accessToken}` };

  try {
    if (input.providerSlug === "meta-ads") {
      const url = new URL(`${base}/me/adaccounts`);
      url.searchParams.set("fields", "id,name");
      url.searchParams.set("limit", "5");
      const response = await fetch(url.toString(), { headers, cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as unknown;
      const record = asRecord(payload);
      const first = Array.isArray(record?.data) ? asRecord(record?.data[0]) : null;
      const adAccountId = typeof first?.id === "string" ? first.id : null;
      const adAccountName = typeof first?.name === "string" ? first.name : null;
      return adAccountId ? { adAccountId, adAccountName } : {};
    }

    const url = new URL(`${base}/me/accounts`);
    url.searchParams.set("fields", "id,name,instagram_business_account");
    url.searchParams.set("limit", "5");
    const response = await fetch(url.toString(), { headers, cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as unknown;
    const record = asRecord(payload);
    const first = Array.isArray(record?.data) ? asRecord(record?.data[0]) : null;
    const pageId = typeof first?.id === "string" ? first.id : null;
    const pageName = typeof first?.name === "string" ? first.name : null;
    const ig = asRecord(first?.instagram_business_account);
    const instagramAccountId = typeof ig?.id === "string" ? ig.id : null;
    return pageId ? { pageId, pageName, instagramAccountId } : {};
  } catch {
    return {};
  }
}

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXTAUTH_URL || request.nextUrl.origin;
}

function buildIntegrationsUrl(
  request: NextRequest,
  status: string,
  provider?: string
): URL {
  const url = new URL("/integrations", getBaseUrl(request));
  url.searchParams.set("status", status);
  if (provider) {
    url.searchParams.set("integration", provider);
  }
  return url;
}

function redirectWithStateCookieCleared(
  request: NextRequest,
  status: string,
  cookieName: string,
  provider?: string
): NextResponse {
  const response = NextResponse.redirect(buildIntegrationsUrl(request, status, provider));
  response.cookies.set({
    name: cookieName,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return response;
}

async function markConnectionError(input: {
  userId: string;
  provider: NonNullable<Awaited<ReturnType<typeof getIntegrationBySlug>>>["provider"];
  message: string;
}): Promise<void> {
  await prisma.integrationConnection.upsert({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: input.provider,
      },
    },
    create: {
      userId: input.userId,
      provider: input.provider,
      status: IntegrationConnectionStatus.ERROR,
      lastError: input.message,
    },
    update: {
      status: IntegrationConnectionStatus.ERROR,
      lastError: input.message,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      tokenType: null,
      lastSyncedAt: null,
      scopes: [],
    },
  });
}

export async function GET(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  const { provider } = await context.params;
  const definition = getIntegrationBySlug(provider);
  if (!definition || !isOAuthIntegration(definition)) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = getAuthenticatedUser(session);
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerUserId = resolveIntegrationOwnerUserId(session.user.id);
  const organizationId = sessionUser.organizationId ?? null;
  await ensureIntegrationOwnerOrganizationId(ownerUserId, organizationId);

  const permission = await enforcePermission({
    userId: session.user.id,
    action: "integration.manage",
    request,
    targetType: "integration",
    targetId: definition.provider,
  });
  if (permission.deniedResponse) {
    return permission.deniedResponse;
  }

  const oauthError = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieName = getOAuthStateCookieName(definition.slug);
  const stateCookie = request.cookies.get(cookieName)?.value;
  const statePayload = stateCookie ? decodeOAuthStateCookie(stateCookie) : null;

  if (oauthError) {
    const message = `OAuth denied: ${oauthError}`;
    await markConnectionError({
      userId: ownerUserId,
      provider: definition.provider,
      message,
    });
    return redirectWithStateCookieCleared(
      request,
      "oauth_denied",
      cookieName,
      definition.slug
    );
  }

  if (!code || !state || !statePayload) {
    await markConnectionError({
      userId: ownerUserId,
      provider: definition.provider,
      message: "OAuth callback missing code/state",
    });
    return redirectWithStateCookieCleared(
      request,
      "invalid_state",
      cookieName,
      definition.slug
    );
  }

  const expectedState = statePayload.state;
  const userIdFromCookie = statePayload.userId;
  if (
    !expectedState ||
    !userIdFromCookie ||
    expectedState !== state ||
    userIdFromCookie !== session.user.id
  ) {
    await markConnectionError({
      userId: ownerUserId,
      provider: definition.provider,
      message: "OAuth state mismatch",
    });
    return redirectWithStateCookieCleared(
      request,
      "invalid_state",
      cookieName,
      definition.slug
    );
  }
  if (definition.oauth.pkce && !statePayload.codeVerifier) {
    await markConnectionError({
      userId: ownerUserId,
      provider: definition.provider,
      message: "OAuth PKCE verifier missing",
    });
    return redirectWithStateCookieCleared(
      request,
      "invalid_state",
      cookieName,
      definition.slug
    );
  }

  const credentials = getIntegrationOAuthCredentials(definition);
  if (!credentials) {
    await markConnectionError({
      userId: ownerUserId,
      provider: definition.provider,
      message: "Missing provider OAuth configuration",
    });
    return redirectWithStateCookieCleared(
      request,
      "missing_config",
      cookieName,
      definition.slug
    );
  }

  try {
    const redirectUri = buildOAuthRedirectUri(getBaseUrl(request), definition.slug);
    let tokenResponse = await exchangeOAuthCode({
      definition,
      code,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri,
      codeVerifier: statePayload.codeVerifier ?? undefined,
    });

    if (definition.slug === "meta-ads") {
      try {
        const longLived = await exchangeMetaForLongLivedToken({
          accessToken: tokenResponse.accessToken,
          appId: credentials.clientId,
          appSecret: credentials.clientSecret,
        });

        tokenResponse = {
          ...tokenResponse,
          accessToken: longLived.accessToken,
          tokenType: longLived.tokenType ?? tokenResponse.tokenType,
          expiresAt: longLived.expiresAt ?? tokenResponse.expiresAt,
        };
      } catch (error) {
        console.warn("[integrations] Meta long-lived token exchange failed:", error);
      }
    }

    const accountProfile = await fetchOAuthAccountProfile(
      definition,
      tokenResponse.accessToken,
      tokenResponse.raw
    );

    const metaMetadata =
      definition.slug === "meta-ads" || definition.slug === "meta-page"
        ? await augmentMetaMetadata({
            providerSlug: definition.slug,
            accessToken: tokenResponse.accessToken,
          })
        : {};

    // Validate granted scopes against required scopes
    // Some providers (e.g. Meta) do not return granted scopes in their token response.
    // Avoid flagging false negatives when scope data is absent.
    const scopeValidation =
      tokenResponse.scopes && tokenResponse.scopes.length > 0
        ? validateIntegrationScopes(definition, tokenResponse.scopes)
        : null;
    const hasMissingScopes =
      scopeValidation !== null && !scopeValidation.valid;

    const discoveredMeta: Record<string, unknown> = {};
    if (definition.slug === "meta-ads") {
      try {
        const adAccountId = await discoverMetaAdAccountId({
          accessToken: tokenResponse.accessToken,
        });
        if (adAccountId) {
          discoveredMeta.adAccountId = adAccountId;
        }
      } catch (error) {
        console.warn("[integrations] Meta ad account discovery failed:", error);
      }

      try {
        const { pageId, instagramAccountId } = await discoverMetaPageAndInstagram({
          accessToken: tokenResponse.accessToken,
        });
        if (pageId) {
          discoveredMeta.pageId = pageId;
        }
        if (instagramAccountId) {
          discoveredMeta.instagramAccountId = instagramAccountId;
        }
      } catch (error) {
        console.warn("[integrations] Meta page discovery failed:", error);
      }
    }
    const metadata: Prisma.InputJsonObject = {
      ...(accountProfile.metadata ?? {}),
      ...(metaMetadata ?? {}),
      oauthProvider: definition.slug,
      connectedByUserId: session.user.id,
      ...discoveredMeta,
      ...(hasMissingScopes
        ? {
            insufficientScopes: true,
            missingScopes: scopeValidation.missing,
          }
        : { insufficientScopes: false }),
    };

    const scopeError = hasMissingScopes
      ? `Missing required OAuth scopes: ${scopeValidation.missing.join(", ")}`
      : null;

    await prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId: ownerUserId,
          provider: definition.provider,
        },
      },
      create: {
        userId: ownerUserId,
        provider: definition.provider,
        status: IntegrationConnectionStatus.CONNECTED,
        providerAccountId: accountProfile.providerAccountId,
        accountLabel: accountProfile.accountLabel,
        scopes: tokenResponse.scopes,
        accessToken: protectIntegrationSecret(tokenResponse.accessToken),
        refreshToken: protectIntegrationSecret(tokenResponse.refreshToken),
        tokenType: tokenResponse.tokenType,
        expiresAt: tokenResponse.expiresAt,
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: scopeError,
        metadata,
        organizationId,
      },
      update: {
        status: IntegrationConnectionStatus.CONNECTED,
        providerAccountId: accountProfile.providerAccountId,
        accountLabel: accountProfile.accountLabel,
        scopes: tokenResponse.scopes,
        accessToken: protectIntegrationSecret(tokenResponse.accessToken),
        ...(tokenResponse.refreshToken
          ? { refreshToken: protectIntegrationSecret(tokenResponse.refreshToken) }
          : {}),
        tokenType: tokenResponse.tokenType,
        expiresAt: tokenResponse.expiresAt,
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: scopeError,
        metadata,
        organizationId,
      },
    });

    return redirectWithStateCookieCleared(
      request,
      "connected",
      cookieName,
      definition.slug
    );
  } catch (error) {
    await markConnectionError({
      userId: ownerUserId,
      provider: definition.provider,
      message: compactErrorMessage(error),
    });
    return redirectWithStateCookieCleared(
      request,
      "oauth_failed",
      cookieName,
      definition.slug
    );
  }
}

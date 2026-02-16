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
import { enforcePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { protectIntegrationSecret } from "@/lib/integrations/token-crypto";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXTAUTH_URL || request.nextUrl.origin;
}

function buildSettingsUrl(
  request: NextRequest,
  status: string,
  provider?: string
): URL {
  const url = new URL("/settings", getBaseUrl(request));
  url.searchParams.set("tab", "integrations");
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
  const response = NextResponse.redirect(buildSettingsUrl(request, status, provider));
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

  const permission = await enforcePermission({
    userId: session.user.id,
    action: "profile.write",
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
      userId: session.user.id,
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
      userId: session.user.id,
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
      userId: session.user.id,
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
      userId: session.user.id,
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
      userId: session.user.id,
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
    const tokenResponse = await exchangeOAuthCode({
      definition,
      code,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri,
      codeVerifier: statePayload.codeVerifier ?? undefined,
    });
    const accountProfile = await fetchOAuthAccountProfile(
      definition,
      tokenResponse.accessToken,
      tokenResponse.raw
    );

    const metadata: Prisma.InputJsonObject = {
      ...(accountProfile.metadata ?? {}),
      oauthProvider: definition.slug,
      connectedByUserId: session.user.id,
    };

    await prisma.integrationConnection.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: definition.provider,
        },
      },
      create: {
        userId: session.user.id,
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
        lastError: null,
        metadata,
      },
      update: {
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
        lastError: null,
        metadata,
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
      userId: session.user.id,
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

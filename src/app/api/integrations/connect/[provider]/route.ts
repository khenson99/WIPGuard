export const dynamic = "force-dynamic";

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getIntegrationBySlug,
  getIntegrationOAuthCredentials,
  isOAuthIntegration,
} from "@/lib/integrations/catalog";
import {
  buildOAuthAuthorizationUrl,
  buildOAuthRedirectUri,
  createOAuthPkcePair,
  encodeOAuthStateCookie,
  getOAuthStateCookieName,
} from "@/lib/integrations/oauth";
import { enforcePermission } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXTAUTH_URL || request.nextUrl.origin;
}

function settingsRedirect(request: NextRequest, status: string, provider?: string): URL {
  const url = new URL("/settings", getBaseUrl(request));
  url.searchParams.set("tab", "integrations");
  url.searchParams.set("status", status);
  if (provider) {
    url.searchParams.set("integration", provider);
  }
  return url;
}

export async function GET(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  const { provider } = await context.params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const definition = getIntegrationBySlug(provider);
  if (!definition || !isOAuthIntegration(definition)) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
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

  const credentials = getIntegrationOAuthCredentials(definition);
  if (!credentials) {
    return NextResponse.redirect(
      settingsRedirect(request, "missing_config", definition.slug)
    );
  }

  const state = randomBytes(24).toString("hex");
  const pkce = definition.oauth.pkce ? createOAuthPkcePair() : null;
  const redirectUri = buildOAuthRedirectUri(getBaseUrl(request), definition.slug);
  const authorizationUrl = buildOAuthAuthorizationUrl({
    definition,
    clientId: credentials.clientId,
    redirectUri,
    state,
    codeChallenge: pkce?.codeChallenge,
    codeChallengeMethod: pkce?.codeChallengeMethod,
  });

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set({
    name: getOAuthStateCookieName(definition.slug),
    value: encodeOAuthStateCookie({
      state,
      userId: session.user.id,
      codeVerifier: pkce?.codeVerifier,
    }),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}

import { createHash, randomBytes } from "crypto";
import type { OAuthIntegrationDefinition, IntegrationSlug } from "@/lib/integrations/catalog";

const OAUTH_STATE_COOKIE_PREFIX = "wgint_state";
const PKCE_VERIFIER_BYTES = 32;

interface OAuthTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scopes: string[];
  expiresAt: Date | null;
  raw: unknown;
}

interface AccountProfile {
  providerAccountId: string;
  accountLabel: string | null;
  metadata?: Record<string, unknown>;
}

interface OAuthStateCookiePayload {
  state: string;
  userId: string;
  codeVerifier: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeScopes(rawScope: unknown): string[] {
  if (typeof rawScope !== "string") return [];
  return rawScope
    .split(/[,\s]+/g)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function normalizeBearerToken(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
}

export function getOAuthStateCookieName(slug: IntegrationSlug): string {
  return `${OAUTH_STATE_COOKIE_PREFIX}_${slug}`;
}

export function buildOAuthRedirectUri(baseUrl: string, slug: IntegrationSlug): string {
  const url = new URL(`/api/integrations/callback/${slug}`, baseUrl);
  return url.toString();
}

export function buildOAuthAuthorizationUrl(input: {
  definition: OAuthIntegrationDefinition;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
  codeChallengeMethod?: "S256";
}): string {
  const {
    definition,
    clientId,
    redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod,
  } = input;
  const url = new URL(definition.oauth.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set(
    "scope",
    definition.oauth.scopes.join(definition.oauth.scopeSeparator ?? " ")
  );
  url.searchParams.set("state", state);
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", codeChallengeMethod ?? "S256");
  }

  for (const [key, value] of Object.entries(definition.oauth.extraAuthParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export async function exchangeOAuthCode(input: {
  definition: OAuthIntegrationDefinition;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<OAuthTokenResponse> {
  const { definition, code, clientId, clientSecret, redirectUri, codeVerifier } =
    input;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (definition.slug === "reddit") {
    body.delete("client_id");
    body.delete("client_secret");
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetch(definition.oauth.tokenEndpoint, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const details = asRecord(raw);
    throw new Error(
      getString(details ?? {}, "error_description") ||
        getString(details ?? {}, "error") ||
        `OAuth token exchange failed for ${definition.slug}`
    );
  }

  const tokenPayload = asRecord(raw);
  if (!tokenPayload) {
    throw new Error(`Invalid OAuth token response for ${definition.slug}`);
  }

  const slackOk = tokenPayload.ok;
  if (definition.slug === "slack" && slackOk === false) {
    throw new Error(getString(tokenPayload, "error") || "Slack OAuth failed");
  }

  const accessToken = getString(tokenPayload, "access_token");
  if (!accessToken) {
    throw new Error(`Missing access token for ${definition.slug}`);
  }

  const refreshToken = getString(tokenPayload, "refresh_token");
  const tokenType = getString(tokenPayload, "token_type");
  const expiresIn = getNumber(tokenPayload, "expires_in");
  const expiresAt =
    expiresIn && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

  return {
    accessToken,
    refreshToken,
    tokenType,
    scopes: normalizeScopes(tokenPayload.scope),
    expiresAt,
    raw,
  };
}

export function createOAuthPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
} {
  const codeVerifier = randomBytes(PKCE_VERIFIER_BYTES).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
  };
}

export function encodeOAuthStateCookie(payload: {
  state: string;
  userId: string;
  codeVerifier?: string | null;
}): string {
  const normalized: OAuthStateCookiePayload = {
    state: payload.state,
    userId: payload.userId,
    codeVerifier: payload.codeVerifier ?? null,
  };
  return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
}

export function decodeOAuthStateCookie(value: string): OAuthStateCookiePayload | null {
  if (!value) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as Partial<OAuthStateCookiePayload>;
    if (!payload || typeof payload !== "object") {
      return null;
    }
    if (typeof payload.state !== "string" || payload.state.length === 0) {
      return null;
    }
    if (typeof payload.userId !== "string" || payload.userId.length === 0) {
      return null;
    }
    if (
      payload.codeVerifier !== null &&
      payload.codeVerifier !== undefined &&
      (typeof payload.codeVerifier !== "string" || payload.codeVerifier.length === 0)
    ) {
      return null;
    }
    return {
      state: payload.state,
      userId: payload.userId,
      codeVerifier: payload.codeVerifier ?? null,
    };
  } catch {
    // Backward compatibility for legacy cookies that stored `state:userId`.
    const separatorIndex = value.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      return null;
    }

    return {
      state: value.slice(0, separatorIndex),
      userId: value.slice(separatorIndex + 1),
      codeVerifier: null,
    };
  }
}

async function fetchGoogleProfile(accessToken: string): Promise<AccountProfile> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error("Google user profile request failed");
  }
  const profile = asRecord(raw);
  if (!profile) {
    throw new Error("Google user profile was invalid");
  }

  const providerAccountId = getString(profile, "sub") || getString(profile, "email");
  if (!providerAccountId) {
    throw new Error("Google profile did not include an account identifier");
  }

  return {
    providerAccountId,
    accountLabel: getString(profile, "email") || getString(profile, "name"),
    metadata: {
      name: getString(profile, "name"),
      email: getString(profile, "email"),
    },
  };
}

async function fetchHubSpotProfile(accessToken: string): Promise<AccountProfile> {
  const response = await fetch(
    `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`,
    { cache: "no-store" }
  );
  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error("HubSpot account lookup failed");
  }
  const profile = asRecord(raw);
  if (!profile) {
    throw new Error("HubSpot account response was invalid");
  }

  const hubId = getNumber(profile, "hub_id");
  const user = getString(profile, "user");
  const providerAccountId = hubId ? `hub-${hubId}` : user;
  if (!providerAccountId) {
    throw new Error("HubSpot profile did not include an account identifier");
  }

  return {
    providerAccountId,
    accountLabel: user,
    metadata: {
      hubId,
      hubDomain: getString(profile, "hub_domain"),
      user,
      scopes: profile.scopes,
    },
  };
}

async function fetchSlackProfile(accessToken: string): Promise<AccountProfile> {
  const response = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  });
  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error("Slack account lookup failed");
  }
  const profile = asRecord(raw);
  if (!profile) {
    throw new Error("Slack account response was invalid");
  }
  if (profile.ok === false) {
    throw new Error(getString(profile, "error") || "Slack account lookup failed");
  }

  const teamId = getString(profile, "team_id");
  const userId = getString(profile, "user_id");
  const providerAccountId = teamId || userId;
  if (!providerAccountId) {
    throw new Error("Slack profile did not include an account identifier");
  }

  return {
    providerAccountId,
    accountLabel: getString(profile, "team") || getString(profile, "user"),
    metadata: {
      teamId,
      team: getString(profile, "team"),
      userId,
      user: getString(profile, "user"),
      url: getString(profile, "url"),
    },
  };
}

async function fetchRedditProfile(accessToken: string): Promise<AccountProfile> {
  const userAgent = process.env.REDDIT_USER_AGENT?.trim() || "WIPGuard/1.0";
  const response = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": userAgent,
    },
    cache: "no-store",
  });
  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error("Reddit account lookup failed");
  }
  const profile = asRecord(raw);
  if (!profile) {
    throw new Error("Reddit account response was invalid");
  }

  const providerAccountId = getString(profile, "id") || getString(profile, "name");
  if (!providerAccountId) {
    throw new Error("Reddit profile did not include an account identifier");
  }

  const subreddit = asRecord(profile.subreddit);

  return {
    providerAccountId,
    accountLabel: getString(profile, "name"),
    metadata: {
      name: getString(profile, "name"),
      subreddit: subreddit
        ? {
            displayName: getString(subreddit, "display_name"),
            title: getString(subreddit, "title"),
            subscribers: getNumber(subreddit, "subscribers"),
            over18: subreddit.over_18 === true,
          }
        : null,
    },
  };
}

export async function fetchOAuthAccountProfile(
  definition: OAuthIntegrationDefinition,
  accessToken: string
): Promise<AccountProfile> {
  if (definition.slug === "google-workspace") {
    return fetchGoogleProfile(accessToken);
  }
  if (definition.slug === "hubspot") {
    return fetchHubSpotProfile(accessToken);
  }
  if (definition.slug === "slack") {
    return fetchSlackProfile(accessToken);
  }
  if (definition.slug === "reddit") {
    return fetchRedditProfile(accessToken);
  }
  throw new Error(`No OAuth account profile fetcher for ${definition.slug}`);
}

export async function verifyCodaApiToken(token: string): Promise<AccountProfile> {
  const normalizedToken = normalizeBearerToken(token);
  if (!normalizedToken) {
    throw new Error("Coda token is empty");
  }

  const response = await fetch("https://coda.io/apis/v1/whoami", {
    headers: { Authorization: `Bearer ${normalizedToken}` },
    cache: "no-store",
  });
  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const details = asRecord(raw);
    const apiMessage =
      getString(details ?? {}, "message") ||
      getString(details ?? {}, "error") ||
      getString(details ?? {}, "detail");
    throw new Error(
      apiMessage
        ? `Coda token verification failed (${response.status}): ${apiMessage}`
        : `Coda token verification failed (${response.status})`
    );
  }
  const profile = asRecord(raw);
  if (!profile) {
    throw new Error("Coda whoami response was invalid");
  }

  const providerAccountId =
    getString(profile, "id") ||
    getString(profile, "loginId") ||
    getString(profile, "email");
  if (!providerAccountId) {
    throw new Error("Coda profile did not include an account identifier");
  }

  return {
    providerAccountId,
    accountLabel:
      getString(profile, "loginId") ||
      getString(profile, "name") ||
      getString(profile, "email"),
    metadata: {
      name: getString(profile, "name"),
      loginId: getString(profile, "loginId"),
      email: getString(profile, "email"),
    },
  };
}

export function compactErrorMessage(error: unknown): string {
  const fallback = "Integration request failed";
  if (!error) return fallback;
  if (typeof error === "string") return error.slice(0, 300);
  if (error instanceof Error) return error.message.slice(0, 300);
  return fallback;
}

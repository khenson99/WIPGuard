import { IntegrationConnectionStatus, IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ENV_MANAGED_TOKEN_PLACEHOLDER,
  isEnvManagedTokenPlaceholder,
  unprotectIntegrationSecret,
} from "@/lib/integrations/token-crypto";
import { verifyCodaApiToken, verifyPylonApiToken } from "@/lib/integrations/oauth";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";
import {
  getProviderRegistryEntry,
  type ProviderAuthType,
} from "@/lib/integrations/provider-registry";
import {
  getCredentials,
  hasIntegrationCredential,
  type AnalyticsCredentials,
} from "@/lib/analytics/credentials";
import {
  fetchGoogleAdsData,
  fetchMetaAdsData,
  fetchMetaInstagramData,
  fetchMetaPageData,
  fetchRedditAdsData,
} from "@/lib/analytics/fetchers-ads";
import { fetchGAData } from "@/lib/analytics/fetchers-ga-webflow";
import { fetchGoogleSearchConsoleData } from "@/lib/analytics/fetchers-google-search-console";

type HealthCheckResult = {
  provider: IntegrationProvider;
  ok: boolean;
  message: string | null;
};

const HEALTH_CHECK_TIMEOUT_MS = 10_000;
const ENV_MANAGED_HEALTH_PROVIDERS = [
  IntegrationProvider.GOOGLE_WORKSPACE,
  IntegrationProvider.HUBSPOT,
  IntegrationProvider.SLACK,
  IntegrationProvider.CODA,
  IntegrationProvider.POSTHOG,
  IntegrationProvider.LINEAR,
  IntegrationProvider.GITHUB,
  IntegrationProvider.SEMRUSH,
  IntegrationProvider.UNIFY,
  IntegrationProvider.PYLON,
  IntegrationProvider.STRIPE,
  IntegrationProvider.MERCURY,
  IntegrationProvider.WEBFLOW,
  IntegrationProvider.REDDIT,
  IntegrationProvider.GOOGLE_ADS,
  IntegrationProvider.META_ADS,
  IntegrationProvider.META_PAGE,
  IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
  IntegrationProvider.GOOGLE_ANALYTICS,
] as const;

type HealthConnection = {
  userId: string;
  provider: IntegrationProvider;
  accessToken: string | null;
  envManaged?: boolean;
};

async function checkSlackHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const accessToken = credentials.slackAccessToken ?? fallbackToken;
  if (!accessToken) {
    throw new Error("Missing Slack access token");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({}).toString(),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !payload || payload.ok !== true) {
      const error = payload?.error ? `: ${payload.error}` : "";
      throw new Error(`Slack auth.test failed (${response.status})${error}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function checkGoogleWorkspaceHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const accessToken = credentials.googleWorkspaceAccessToken ?? fallbackToken;
  if (!accessToken) {
    throw new Error("Missing Google Workspace access token");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    await readHealthJson(response, "Google Workspace");
  } finally {
    clearTimeout(timeout);
  }
}

async function readHealthJson(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "message" in payload
        ? `: ${String((payload as { message?: unknown }).message)}`
        : text
          ? `: ${text.slice(0, 200)}`
          : "";
    throw new Error(`${label} health check failed (${response.status})${detail}`);
  }
  return payload;
}

function normalizePostHogHost(host: string | null | undefined): string {
  return host?.trim().replace(/\/+$/g, "") || "https://app.posthog.com";
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

async function checkHubSpotHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const accessToken = credentials.hubspotToken ?? fallbackToken;
  if (!accessToken) {
    throw new Error("Missing HubSpot access token");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.hubapi.com/account-info/v3/details", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    await readHealthJson(response, "HubSpot");
  } finally {
    clearTimeout(timeout);
  }
}

async function checkPostHogHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const apiKey = credentials.posthogApiKey ?? fallbackToken;
  const projectId = credentials.posthogProjectId;
  if (!apiKey || !projectId) {
    throw new Error("Missing PostHog API key or project ID");
  }

  const host = normalizePostHogHost(credentials.posthogHost);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`${host}/api/projects/${encodeURIComponent(projectId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    await readHealthJson(response, "PostHog");
  } finally {
    clearTimeout(timeout);
  }
}

async function checkSemrushHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const apiKey = credentials.semrushApiToken ?? fallbackToken;
  const domain = trimOrNull(credentials.semrushDomain);
  if (!apiKey || !domain) {
    throw new Error("Missing SEMrush API key or domain");
  }

  const params = new URLSearchParams({
    type: "domain_ranks",
    key: apiKey,
    export_columns: "Or,Ot",
    domain,
    database: "us",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.semrush.com/?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok || text.includes("ERROR")) {
      throw new Error(
        `SEMrush health check failed (${response.status}): ${text.slice(0, 200) || response.statusText}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function checkUnifyHealth(fallbackToken: string): Promise<void> {
  const apiKey = trimOrNull(process.env.UNIFY_DATA_API_KEY) ?? fallbackToken;
  const objectName = trimOrNull(process.env.UNIFY_FUNNEL_OBJECT_NAME);
  if (!apiKey || !objectName) {
    throw new Error("Missing Unify API key or object name");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.unifygtm.com/data/v1/objects/${encodeURIComponent(objectName)}/records`,
      {
        headers: {
          "x-api-key": apiKey,
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    await readHealthJson(response, "Unify");
  } finally {
    clearTimeout(timeout);
  }
}

async function checkPylonHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const apiKey = credentials.pylonApiKey ?? fallbackToken;
  if (!apiKey) {
    throw new Error("Missing Pylon API key");
  }

  await verifyPylonApiToken(apiKey);
}

async function checkCodaHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const apiKey = credentials.codaApiToken ?? fallbackToken;
  if (!apiKey) {
    throw new Error("Missing Coda API token");
  }

  await verifyCodaApiToken(apiKey);
}

async function checkStripeHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const apiKey = credentials.stripeKey ?? fallbackToken;
  if (!apiKey) {
    throw new Error("Missing Stripe API key");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.stripe.com/v1/account", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    await readHealthJson(response, "Stripe");
  } finally {
    clearTimeout(timeout);
  }
}

async function checkMercuryHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const apiKey = credentials.mercuryKey ?? fallbackToken;
  if (!apiKey) {
    throw new Error("Missing Mercury API token");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.mercury.com/api/v1/accounts?limit=1", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    await readHealthJson(response, "Mercury");
  } finally {
    clearTimeout(timeout);
  }
}

async function checkWebflowHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const apiToken = credentials.webflowApiToken ?? fallbackToken;
  const siteId = trimOrNull(credentials.webflowSiteId);
  if (!apiToken || !siteId) {
    throw new Error("Missing Webflow API token or site ID");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.webflow.com/v2/sites/${encodeURIComponent(siteId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    await readHealthJson(response, "Webflow");
  } finally {
    clearTimeout(timeout);
  }
}

async function checkRedditHealth(userId: string): Promise<void> {
  const credentials = await getCredentials(userId);
  if (
    !credentials.redditClientId ||
    !credentials.redditClientSecret ||
    !credentials.redditRefreshToken ||
    !credentials.redditAdAccountId
  ) {
    throw new Error("Missing Reddit Ads credential");
  }

  const toDate = new Date();
  toDate.setUTCHours(23, 59, 59, 999);
  const fromDate = new Date(toDate);
  fromDate.setUTCHours(0, 0, 0, 0);

  await fetchRedditAdsData(
    credentials.redditClientId,
    credentials.redditClientSecret,
    credentials.redditRefreshToken,
    credentials.redditAdAccountId,
    credentials.redditUserAgent,
    { fromDate, toDate },
  );
}

async function checkGoogleAdsHealth(userId: string): Promise<void> {
  const credentials = await getCredentials(userId);
  if (
    !credentials.googleAdsDevToken ||
    !credentials.googleAdsCustomerId ||
    !credentials.googleAdsRefreshToken ||
    !credentials.googleAdsClientId ||
    !credentials.googleAdsClientSecret
  ) {
    throw new Error("Missing Google Ads credential");
  }

  const toDate = new Date();
  toDate.setUTCHours(23, 59, 59, 999);
  const fromDate = new Date(toDate);
  fromDate.setUTCHours(0, 0, 0, 0);

  await fetchGoogleAdsData(
    credentials.googleAdsDevToken,
    credentials.googleAdsCustomerId,
    credentials.googleAdsRefreshToken,
    credentials.googleAdsClientId,
    credentials.googleAdsClientSecret,
    credentials.googleAdsLoginCustomerId,
    { fromDate, toDate },
  );
}

async function checkMetaAdsHealth(userId: string): Promise<void> {
  const credentials = await getCredentials(userId);
  if (!credentials.metaAdsAccessToken || !credentials.metaAdAccountId) {
    throw new Error("Missing Meta Ads credential");
  }

  const toDate = new Date();
  toDate.setUTCHours(23, 59, 59, 999);
  const fromDate = new Date(toDate);
  fromDate.setUTCHours(0, 0, 0, 0);

  await fetchMetaAdsData(credentials.metaAdsAccessToken, credentials.metaAdAccountId, {
    fromDate,
    toDate,
  });
}

async function checkMetaPageHealth(userId: string): Promise<void> {
  const credentials = await getCredentials(userId);
  if (!credentials.metaPageAccessToken) {
    throw new Error("Missing Meta Page credential");
  }

  const toDate = new Date();
  toDate.setUTCHours(23, 59, 59, 999);
  const fromDate = new Date(toDate);
  fromDate.setUTCHours(0, 0, 0, 0);

  if (credentials.metaPageId) {
    await fetchMetaPageData(credentials.metaPageAccessToken, credentials.metaPageId, {
      fromDate,
      toDate,
    });
    return;
  }

  if (credentials.metaInstagramAccountId) {
    await fetchMetaInstagramData(
      credentials.metaPageAccessToken,
      credentials.metaInstagramAccountId,
      { pageId: credentials.metaPageId ?? undefined },
      fromDate,
      toDate,
    );
    return;
  }

  throw new Error("Missing Meta Page credential");
}

async function checkGoogleSearchConsoleHealth(userId: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const siteUrl = trimOrNull(credentials.searchConsoleSiteUrl);
  if (!siteUrl) {
    throw new Error("Missing Google Search Console site URL");
  }

  const toDate = new Date();
  toDate.setUTCHours(23, 59, 59, 999);
  const fromDate = new Date(toDate);
  fromDate.setUTCHours(0, 0, 0, 0);

  await fetchGoogleSearchConsoleData({
    accessToken: credentials.searchConsoleAccessToken,
    siteUrl,
    clientEmail: credentials.gaClientEmail,
    privateKey: credentials.gaPrivateKey,
    refreshToken: process.env.GA_REFRESH_TOKEN?.trim() || null,
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || null,
    fromDate,
    toDate,
  });
}

async function checkGoogleAnalyticsHealth(userId: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const propertyId = trimOrNull(credentials.gaPropertyId);
  if (!propertyId) {
    throw new Error("Missing Google Analytics property ID");
  }

  const toDate = new Date();
  toDate.setUTCHours(23, 59, 59, 999);
  const fromDate = new Date(toDate);
  fromDate.setUTCHours(0, 0, 0, 0);

  await fetchGAData(
    propertyId,
    credentials.gaClientEmail ?? "",
    credentials.gaPrivateKey ?? "",
    { fromDate, toDate },
  );
}

async function checkLinearHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const apiKey = credentials.linearApiKey ?? fallbackToken;
  if (!apiKey) {
    throw new Error("Missing Linear API key");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query ImladrisHealthCheck { viewer { id } }",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await readHealthJson(response, "Linear");
    const errors =
      payload && typeof payload === "object" && Array.isArray((payload as { errors?: unknown }).errors)
        ? (payload as { errors: unknown[] }).errors
        : [];
    if (errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(errors.slice(0, 3))}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function checkGitHubHealth(userId: string, fallbackToken: string): Promise<void> {
  const credentials = await getCredentials(userId);
  const token = credentials.githubToken ?? fallbackToken;
  const owner = credentials.githubOwner;
  const repo = credentials.githubRepo;
  if (!token || !owner || !repo) {
    throw new Error("Missing GitHub token, owner, or repository");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    await readHealthJson(response, "GitHub");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lightweight health check for OAuth providers: verifies the token can be
 * refreshed (or is still valid) by triggering the shared token lifecycle.
 * This catches expired refresh tokens and revoked grants without needing
 * a provider-specific API endpoint.
 */
async function checkOAuthTokenHealth(userId: string, provider: IntegrationProvider): Promise<void> {
  await getValidIntegrationAccessToken({ userId, provider });
}

async function persistConnectionHealth(input: {
  userId: string;
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  lastError: string | null;
  lastSyncedAt: Date | null;
  createIfMissing?: boolean;
  accessToken?: string | null;
}): Promise<string | null> {
  const data = {
    status: input.status,
    lastError: input.lastError,
    lastSyncedAt: input.lastSyncedAt,
  };
  const create = {
    userId: input.userId,
    provider: input.provider,
    status: input.status,
    // Never persist the in-memory env-managed placeholder: a stored
    // non-null accessToken reads as a real credential and would shadow the
    // env fallback in credential resolution.
    accessToken: isEnvManagedTokenPlaceholder(input.accessToken)
      ? null
      : input.accessToken ?? null,
    lastError: input.lastError,
    lastSyncedAt: input.lastSyncedAt,
  };
  try {
    if (input.createIfMissing) {
      await prisma.integrationConnection.upsert({
        where: {
          userId_provider: { userId: input.userId, provider: input.provider },
        },
        create,
        update: data,
      });
      return null;
    }

    await prisma.integrationConnection.update({
      where: {
        userId_provider: { userId: input.userId, provider: input.provider },
      },
      data,
    });
    return null;
  } catch (error) {
    if (isMissingConnectionUpdateError(error)) {
      try {
        await prisma.integrationConnection.upsert({
          where: {
            userId_provider: { userId: input.userId, provider: input.provider },
          },
          create,
          update: data,
        });
        return null;
      } catch (upsertError) {
        error = upsertError;
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("integration.health_check.status_persist_failed", {
      userId: input.userId,
      provider: input.provider,
      intendedStatus: input.status,
      intendedLastError: input.lastError,
      error: message,
    });
    return `Health status persistence failed: ${message}`;
  }
}

function isMissingConnectionUpdateError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "P2025" ||
    (typeof record.message === "string" &&
      record.message.toLowerCase().includes("record to update not found"))
  );
}

const ENV_MANAGED_HEALTH_PROVIDER_SET = new Set<IntegrationProvider>(
  ENV_MANAGED_HEALTH_PROVIDERS,
);

function holdsRealAccessToken(accessToken: string | null): boolean {
  const token = unprotectIntegrationSecret(accessToken);
  return Boolean(token) && !isEnvManagedTokenPlaceholder(token);
}

function addEnvManagedHealthConnections(input: {
  userId: string;
  connections: HealthConnection[];
  credentials: AnalyticsCredentials;
}): HealthConnection[] {
  // Existing rows that hold no real secret (placeholder rows persisted by a
  // previous env-managed run, or stubs created by metadata discovery) are
  // health-checked through env credentials, exactly like providers with no
  // row at all. Without this, the row persisted by the first run would fail
  // the "Missing access token" gate on every later run.
  const connections: HealthConnection[] = input.connections.map((connection) => {
    if (
      !holdsRealAccessToken(connection.accessToken) &&
      ENV_MANAGED_HEALTH_PROVIDER_SET.has(connection.provider) &&
      hasIntegrationCredential(connection.provider, input.credentials)
    ) {
      return {
        ...connection,
        accessToken: ENV_MANAGED_TOKEN_PLACEHOLDER,
        envManaged: true,
      };
    }
    return connection;
  });

  const providers = new Set(connections.map((connection) => connection.provider));

  for (const provider of ENV_MANAGED_HEALTH_PROVIDERS) {
    if (providers.has(provider)) {
      continue;
    }
    if (!hasIntegrationCredential(provider, input.credentials)) {
      continue;
    }
    connections.push({
      userId: input.userId,
      provider,
      accessToken: ENV_MANAGED_TOKEN_PLACEHOLDER,
      envManaged: true,
    });
    providers.add(provider);
  }

  return connections;
}

export async function runIntegrationHealthChecks(input: { userId: string }): Promise<{
  checked: number;
  ok: number;
  failed: number;
  results: HealthCheckResult[];
}> {
  // Check ALL connected integrations, not just a subset
  const connections = await prisma.integrationConnection.findMany({
    where: {
      userId: input.userId,
      status: { in: [IntegrationConnectionStatus.CONNECTED, IntegrationConnectionStatus.ERROR] },
    },
  });
  const credentials = await getCredentials(input.userId);
  const healthConnections = addEnvManagedHealthConnections({
    userId: input.userId,
    connections,
    credentials,
  });

  const results: HealthCheckResult[] = [];

  for (const connection of healthConnections) {
    const token = unprotectIntegrationSecret(connection.accessToken);
    if (!token) {
      const message = "Missing access token";
      const persistError = await persistConnectionHealth({
        userId: input.userId,
        provider: connection.provider,
        status: IntegrationConnectionStatus.ERROR,
        lastError: message,
        lastSyncedAt: null,
        createIfMissing: connection.envManaged,
        accessToken: connection.accessToken,
      });
      results.push({ provider: connection.provider, ok: false, message: persistError ?? message });
      continue;
    }

    try {
      // Providers with dedicated health-check endpoints
      if (connection.provider === IntegrationProvider.SLACK) {
        await checkSlackHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.CODA) {
        await checkCodaHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.GOOGLE_WORKSPACE) {
        await checkGoogleWorkspaceHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.HUBSPOT) {
        await checkHubSpotHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.PYLON) {
        await checkPylonHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.STRIPE) {
        await checkStripeHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.MERCURY) {
        await checkMercuryHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.WEBFLOW) {
        await checkWebflowHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.REDDIT) {
        await checkRedditHealth(input.userId);
      } else if (connection.provider === IntegrationProvider.GOOGLE_ADS) {
        await checkGoogleAdsHealth(input.userId);
      } else if (connection.provider === IntegrationProvider.META_ADS) {
        await checkMetaAdsHealth(input.userId);
      } else if (connection.provider === IntegrationProvider.META_PAGE) {
        await checkMetaPageHealth(input.userId);
      } else if (connection.provider === IntegrationProvider.GOOGLE_SEARCH_CONSOLE) {
        await checkGoogleSearchConsoleHealth(input.userId);
      } else if (connection.provider === IntegrationProvider.GOOGLE_ANALYTICS) {
        await checkGoogleAnalyticsHealth(input.userId);
      } else if (connection.provider === IntegrationProvider.POSTHOG) {
        await checkPostHogHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.LINEAR) {
        await checkLinearHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.GITHUB) {
        await checkGitHubHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.SEMRUSH) {
        await checkSemrushHealth(input.userId, token);
      } else if (connection.provider === IntegrationProvider.UNIFY) {
        await checkUnifyHealth(token);
      } else {
        // For all other OAuth providers, verify token lifecycle health
        const registryEntry = getProviderRegistryEntry(connection.provider);
        const authType: ProviderAuthType = registryEntry?.authType ?? "oauth";
        if (authType === "oauth") {
          await checkOAuthTokenHealth(input.userId, connection.provider);
        }
        // Token-based providers without a verify endpoint are assumed healthy
        // if their access token is present (already checked above).
      }

      const persistError = await persistConnectionHealth({
        userId: input.userId,
        provider: connection.provider,
        status: IntegrationConnectionStatus.CONNECTED,
        lastError: null,
        lastSyncedAt: new Date(),
        createIfMissing: connection.envManaged,
        accessToken: connection.accessToken,
      });
      results.push({
        provider: connection.provider,
        ok: persistError ? false : true,
        message: persistError,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Health check failed";
      const persistError = await persistConnectionHealth({
        userId: input.userId,
        provider: connection.provider,
        status: IntegrationConnectionStatus.ERROR,
        lastError: message,
        lastSyncedAt: null,
        createIfMissing: connection.envManaged,
        accessToken: connection.accessToken,
      });
      results.push({ provider: connection.provider, ok: false, message: persistError ?? message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return { checked: results.length, ok, failed: results.length - ok, results };
}

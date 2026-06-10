/**
 * Regression tests for env-credential fallback vs. placeholder connection rows.
 *
 * Env-managed health checks persist connection rows that hold no real secret
 * (accessToken NULL, or the legacy "env-managed" literal). Those rows must
 * never disable the env fallback in getCredentials — otherwise the first
 * persisted health status starves every later check of the credential it was
 * monitoring (self-perpetuating ERROR: "Missing Meta Page credential").
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IntegrationConnectionStatus,
  IntegrationProvider,
} from "@/generated/prisma/client";

const {
  mockIntegrationConnectionFindMany,
  mockIntegrationConnectionUpsert,
  mockIntegrationConnectionUpdateMany,
  mockIntegrationConnectionUpdate,
} = vi.hoisted(() => ({
  mockIntegrationConnectionFindMany: vi.fn(),
  mockIntegrationConnectionUpsert: vi.fn(),
  mockIntegrationConnectionUpdateMany: vi.fn(),
  mockIntegrationConnectionUpdate: vi.fn(),
}));

const {
  mockDiscoverMetaAdAccountId,
  mockDiscoverMetaPageAndInstagram,
  mockExchangeMetaForLongLivedToken,
} = vi.hoisted(() => ({
  mockDiscoverMetaAdAccountId: vi.fn(),
  mockDiscoverMetaPageAndInstagram: vi.fn(),
  mockExchangeMetaForLongLivedToken: vi.fn(),
}));

const { mockGetValidIntegrationAccessToken } = vi.hoisted(() => ({
  mockGetValidIntegrationAccessToken: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: mockIntegrationConnectionFindMany,
      upsert: mockIntegrationConnectionUpsert,
      updateMany: mockIntegrationConnectionUpdateMany,
      update: mockIntegrationConnectionUpdate,
    },
  },
}));

vi.mock("@/lib/integrations/meta-auth", () => ({
  discoverMetaAdAccountId: mockDiscoverMetaAdAccountId,
  discoverMetaPageAndInstagram: mockDiscoverMetaPageAndInstagram,
  exchangeMetaForLongLivedToken: mockExchangeMetaForLongLivedToken,
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: mockGetValidIntegrationAccessToken,
}));

const ENV_KEYS = [
  "INTEGRATION_OWNER_USER_ID",
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_PAGE_ID",
  "META_INSTAGRAM_ACCOUNT_ID",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_CLIENT_ID",
  "META_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "REDDIT_REFRESH_TOKEN",
  "MERCURY_API_TOKEN",
  "SEMRUSH_API_TOKEN",
  "SEMRUSH_API_KEY",
  "SEMRUSH_DOMAIN",
  "LINEAR_API_KEY",
  "LINEAR_TOKEN",
] as const;

function connectionRow(overrides: {
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  accessToken?: string | null;
  refreshToken?: string | null;
  metadata?: Record<string, unknown> | null;
  lastError?: string | null;
}) {
  return {
    userId: "user_1",
    provider: overrides.provider,
    status: overrides.status,
    accessToken: overrides.accessToken ?? null,
    refreshToken: overrides.refreshToken ?? null,
    tokenType: "Bearer",
    expiresAt: null,
    scopes: [],
    metadata: overrides.metadata ?? null,
    connectedAt: new Date("2026-06-01T00:00:00.000Z"),
    lastSyncedAt: null,
    lastError: overrides.lastError ?? null,
  };
}

describe("analytics credentials env fallback vs placeholder rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    mockGetValidIntegrationAccessToken.mockResolvedValue("oauth-token-from-refresh");
  });

  it("keeps the Meta env fallback engaged when only placeholder rows exist", async () => {
    // Exact shape persisted by buggy health-check runs: META_ADS flipped to
    // ERROR with no token at all, META_PAGE created with the literal
    // "env-managed" placeholder.
    process.env.META_ACCESS_TOKEN = "meta-env-token";
    process.env.META_AD_ACCOUNT_ID = "act_env";
    process.env.META_PAGE_ID = "417375498119621";
    process.env.META_INSTAGRAM_ACCOUNT_ID = "ig_env";
    // Real OAuth app credentials present, as on a configured deployment.
    process.env.META_APP_ID = "app_id";
    process.env.META_APP_SECRET = "app_secret";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      connectionRow({
        provider: IntegrationProvider.META_ADS,
        status: IntegrationConnectionStatus.ERROR,
        accessToken: null,
        lastError: "Missing Meta access token",
      }),
      connectionRow({
        provider: IntegrationProvider.META_PAGE,
        status: IntegrationConnectionStatus.ERROR,
        accessToken: "env-managed",
        lastError: "Missing Meta Page credential",
      }),
    ]);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.metaAdsAccessToken).toBe("meta-env-token");
    expect(creds.metaPageAccessToken).toBe("meta-env-token");
    expect(creds.metaAccessToken).toBe("meta-env-token");
    expect(creds.metaAdAccountId).toBe("act_env");
    expect(creds.metaPageId).toBe("417375498119621");

    // Placeholder rows hold no real token, so no OAuth lookup should happen.
    expect(mockGetValidIntegrationAccessToken).not.toHaveBeenCalled();
    // And no bogus "Missing Meta access token" refresh failure may be
    // persisted back onto the row (that is what kept re-poisoning it).
    expect(mockIntegrationConnectionUpdateMany).not.toHaveBeenCalled();
    expect(mockExchangeMetaForLongLivedToken).not.toHaveBeenCalled();

    expect(creds.freshness[IntegrationProvider.META_PAGE].source).toBe("env");
    expect(creds.freshness[IntegrationProvider.META_ADS].source).toBe("env");
  });

  it("still prefers a real connected Meta row over env credentials", async () => {
    process.env.META_ACCESS_TOKEN = "meta-env-token";
    process.env.META_AD_ACCOUNT_ID = "act_env";
    process.env.META_PAGE_ID = "page_env";
    process.env.META_INSTAGRAM_ACCOUNT_ID = "ig_env";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      connectionRow({
        provider: IntegrationProvider.META_PAGE,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "plainv1.real-page-token",
        metadata: { pageId: "page_real", instagramAccountId: "ig_real" },
      }),
    ]);
    mockGetValidIntegrationAccessToken.mockResolvedValue("real-page-oauth-token");

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.metaPageAccessToken).toBe("real-page-oauth-token");
    expect(creds.metaPageId).toBe("page_real");
    expect(mockGetValidIntegrationAccessToken).toHaveBeenCalledWith({
      userId: "user_1",
      provider: IntegrationProvider.META_PAGE,
    });
  });

  it("keeps the Stripe env fallback engaged when only a placeholder row exists", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_env";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      connectionRow({
        provider: IntegrationProvider.STRIPE,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "env-managed",
      }),
    ]);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.stripeKey).toBe("sk_env");
    expect(mockGetValidIntegrationAccessToken).not.toHaveBeenCalled();
    expect(creds.freshness[IntegrationProvider.STRIPE].source).toBe("env");
  });

  it("keeps the Reddit env fallback engaged when only a placeholder row exists", async () => {
    process.env.REDDIT_REFRESH_TOKEN = "reddit-env-refresh";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      connectionRow({
        provider: IntegrationProvider.REDDIT,
        status: IntegrationConnectionStatus.CONNECTED,
        accessToken: "env-managed",
        refreshToken: null,
      }),
    ]);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.redditRefreshToken).toBe("reddit-env-refresh");
    expect(creds.freshness[IntegrationProvider.REDDIT].source).toBe("env");
  });

  it("keeps the Linear env fallback engaged when only a placeholder row exists", async () => {
    // Production shape (Railway, 2026-06-10): LINEAR row held the literal
    // "env-managed" placeholder in ERROR state after the checker sent that
    // placeholder as the API key and got a 401 back.
    process.env.LINEAR_API_KEY = "lin_api_env";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      connectionRow({
        provider: IntegrationProvider.LINEAR,
        status: IntegrationConnectionStatus.ERROR,
        accessToken: "env-managed",
        lastError: "Linear health check failed (401)",
      }),
    ]);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.linearApiKey).toBe("lin_api_env");
    expect(creds.freshness[IntegrationProvider.LINEAR].source).toBe("env");
  });

  it("keeps the Mercury env fallback engaged when only a placeholder row exists", async () => {
    // Production shape: MERCURY placeholder row in ERROR with "Refresh token
    // is missing" — the blocked-env path routed the placeholder row into the
    // OAuth refresh lookup instead of using MERCURY_API_TOKEN.
    process.env.MERCURY_API_TOKEN = "mercury-env-key";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      connectionRow({
        provider: IntegrationProvider.MERCURY,
        status: IntegrationConnectionStatus.ERROR,
        accessToken: "env-managed",
        lastError: "Refresh token is missing",
      }),
    ]);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.mercuryKey).toBe("mercury-env-key");
    // Placeholder rows must not be routed into the OAuth token lookup.
    expect(mockGetValidIntegrationAccessToken).not.toHaveBeenCalled();
    expect(creds.freshness[IntegrationProvider.MERCURY].source).toBe("env");
  });

  it("keeps the SEMrush env fallback engaged when only a placeholder row exists", async () => {
    // Production shape: SEMRUSH placeholder row whose literal token was sent
    // as the API key ("ERROR 120 :: WRONG KEY"), masking the API's real state.
    process.env.SEMRUSH_API_TOKEN = "semrush-env-key";
    process.env.SEMRUSH_DOMAIN = "arda.cards";

    mockIntegrationConnectionFindMany.mockResolvedValueOnce([
      connectionRow({
        provider: IntegrationProvider.SEMRUSH,
        status: IntegrationConnectionStatus.ERROR,
        accessToken: "env-managed",
        lastError: "SEMrush health check failed (200): ERROR 120 :: WRONG KEY",
      }),
    ]);

    const { getCredentials } = await import("@/lib/analytics/credentials");
    const creds = await getCredentials("user_1");

    expect(creds.semrushApiToken).toBe("semrush-env-key");
    expect(creds.semrushDomain).toBe("arda.cards");
    expect(creds.freshness[IntegrationProvider.SEMRUSH].source).toBe("env");
  });
});

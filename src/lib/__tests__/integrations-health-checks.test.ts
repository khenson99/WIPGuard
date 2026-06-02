/**
 * Tests for the extended health checks (P1 fix).
 *
 * Verifies that health checks now cover ALL connected providers, not just
 * Slack/Coda/Pylon. OAuth providers get token lifecycle verification via
 * the shared token-refresh module.
 */

import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const mockConnections = new Map<string, { provider: string; accessToken: string; status: string }>();
const mockUpdatedConnections = new Map<string, { status: string; lastError: string | null }>();
const mockUpsertedConnections = new Map<string, { status: string; lastError: string | null; accessToken: string | null }>();
const mockGetCredentials = vi.fn();
const mockUpdateFailureProviders = new Set<string>();
const mockMissingUpdateProviders = new Set<string>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: vi.fn(async (args: { where: { userId: string; status: unknown } }) => {
        const statusClause = args.where.status as { in?: string[] } | string;
        const allowed =
          typeof statusClause === "string"
            ? [statusClause]
            : Array.isArray(statusClause?.in)
              ? statusClause.in
              : [];
        return Array.from(mockConnections.values())
          .filter((c) => allowed.includes(c.status))
          .map((c) => ({
            ...c,
            userId: "user_1",
          }));
      }),
      update: vi.fn(async (args: {
        where: { userId_provider: { userId: string; provider: string } };
        data: { status: string; lastError: string | null; lastSyncedAt: Date | null };
      }) => {
        if (mockMissingUpdateProviders.has(args.where.userId_provider.provider)) {
          const error = new Error("Record to update not found");
          (error as Error & { code?: string }).code = "P2025";
          throw error;
        }
        if (mockUpdateFailureProviders.has(args.where.userId_provider.provider)) {
          throw new Error("health status write failed");
        }
        mockUpdatedConnections.set(args.where.userId_provider.provider, {
          status: args.data.status,
          lastError: args.data.lastError,
        });
        return {};
      }),
      upsert: vi.fn(async (args: {
        where: { userId_provider: { userId: string; provider: string } };
        create: { provider: string; accessToken?: string | null; status: string; lastError: string | null };
        update: { status: string; lastError: string | null };
      }) => {
        const provider = args.where.userId_provider.provider;
        mockUpsertedConnections.set(provider, {
          status: args.update.status,
          lastError: args.update.lastError,
          accessToken: args.create.accessToken ?? null,
        });
        return {};
      }),
    },
  },
}));

vi.mock("@/lib/integrations/token-crypto", () => ({
  unprotectIntegrationSecret: vi.fn((token: string | null) => {
    if (!token) return null;
    return token.startsWith("enc") ? "decrypted_token" : token;
  }),
}));

vi.mock("@/lib/integrations/oauth", () => ({
  verifyCodaApiToken: vi.fn(async () => {}),
  verifyPylonApiToken: vi.fn(async () => {}),
}));

const mockGetValidToken = vi.fn();
vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidIntegrationAccessToken: (...args: unknown[]) => mockGetValidToken(...args),
}));

vi.mock("@/lib/integrations/provider-registry", () => ({
  getProviderRegistryEntry: vi.fn((provider: string) => {
    const oauthProviders = ["HUBSPOT", "SLACK", "STRIPE", "MERCURY", "GOOGLE_ADS", "META_ADS", "META_PAGE", "REDDIT", "WEBFLOW", "GOOGLE_WORKSPACE"];
    const tokenProviders = ["CODA", "PYLON", "SEMRUSH", "POSTHOG", "LINEAR", "GITHUB", "UNIFY"];
    if (oauthProviders.includes(provider)) return { authType: "oauth" };
    if (tokenProviders.includes(provider)) return { authType: "token" };
    return null;
  }),
}));

vi.mock("@/lib/analytics/credentials", () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
  hasIntegrationCredential: (provider: string, credentials: Record<string, unknown>) => {
    switch (provider) {
      case "HUBSPOT":
        return Boolean(credentials.hubspotToken);
      case "GOOGLE_WORKSPACE":
        return Boolean(credentials.googleWorkspaceAccessToken);
      case "SLACK":
        return Boolean(credentials.slackAccessToken);
      case "CODA":
        return Boolean(credentials.codaApiToken && credentials.codaDocId);
      case "POSTHOG":
        return Boolean(credentials.posthogApiKey && credentials.posthogProjectId);
      case "LINEAR":
        return Boolean(credentials.linearApiKey);
      case "GITHUB":
        return Boolean(credentials.githubToken && credentials.githubOwner && credentials.githubRepo);
      case "SEMRUSH":
        return Boolean(credentials.semrushApiToken);
      case "UNIFY":
        return Boolean(process.env.UNIFY_DATA_API_KEY && process.env.UNIFY_FUNNEL_OBJECT_NAME);
      case "PYLON":
        return Boolean(credentials.pylonApiKey);
      case "STRIPE":
        return Boolean(credentials.stripeKey);
      case "MERCURY":
        return Boolean(credentials.mercuryKey);
      case "GOOGLE_ADS":
        return Boolean(
          credentials.googleAdsDevToken &&
            credentials.googleAdsCustomerId &&
            credentials.googleAdsRefreshToken &&
            credentials.googleAdsClientId &&
            credentials.googleAdsClientSecret,
        );
      case "GOOGLE_SEARCH_CONSOLE":
        return Boolean(
          credentials.searchConsoleSiteUrl && credentials.searchConsoleAccessToken,
        );
      case "GOOGLE_ANALYTICS":
        return Boolean(
          credentials.gaPropertyId &&
            ((credentials.gaClientEmail && credentials.gaPrivateKey) ||
              (process.env.GA_REFRESH_TOKEN &&
                process.env.GOOGLE_CLIENT_ID &&
                process.env.GOOGLE_CLIENT_SECRET)),
        );
      case "META_ADS":
        return Boolean(credentials.metaAdsAccessToken && credentials.metaAdAccountId);
      case "META_PAGE":
        return Boolean(
          credentials.metaPageAccessToken &&
            (credentials.metaPageId || credentials.metaInstagramAccountId),
        );
      case "WEBFLOW":
        return Boolean(credentials.webflowApiToken && credentials.webflowSiteId);
      case "REDDIT":
        return Boolean(
          credentials.redditClientId &&
            credentials.redditClientSecret &&
            credentials.redditRefreshToken &&
            credentials.redditAdAccountId,
        );
      default:
        return false;
    }
  },
}));

describe("runIntegrationHealthChecks (extended)", () => {
  const originalFetch = global.fetch;
  const originalUnifyObjectName = process.env.UNIFY_FUNNEL_OBJECT_NAME;
  const originalGaRefreshToken = process.env.GA_REFRESH_TOKEN;
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    mockConnections.clear();
    mockUpdatedConnections.clear();
    mockUpsertedConnections.clear();
    mockUpdateFailureProviders.clear();
    mockMissingUpdateProviders.clear();
    mockGetValidToken.mockReset();
    mockGetCredentials.mockReset();
    mockGetCredentials.mockResolvedValue({});
    vi.clearAllMocks();

    // Mock global.fetch so checkSlack() doesn't hit the real Slack API
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ) as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUnifyObjectName === undefined) {
      delete process.env.UNIFY_FUNNEL_OBJECT_NAME;
    } else {
      process.env.UNIFY_FUNNEL_OBJECT_NAME = originalUnifyObjectName;
    }
    if (originalGaRefreshToken === undefined) {
      delete process.env.GA_REFRESH_TOKEN;
    } else {
      process.env.GA_REFRESH_TOKEN = originalGaRefreshToken;
    }
    if (originalGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
    }
    if (originalGoogleClientSecret === undefined) {
      delete process.env.GOOGLE_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret;
    }
  });

  it("checks ALL connected providers, not just Slack/Coda/Pylon", async () => {
    mockConnections.set("SLACK", { provider: "SLACK", accessToken: "enc_slack", status: "CONNECTED" });
    mockConnections.set("HUBSPOT", { provider: "HUBSPOT", accessToken: "enc_hubspot", status: "CONNECTED" });
    mockConnections.set("STRIPE", { provider: "STRIPE", accessToken: "enc_stripe", status: "CONNECTED" });
    mockConnections.set("CODA", { provider: "CODA", accessToken: "enc_coda", status: "CONNECTED" });

    mockGetValidToken.mockResolvedValue("valid_token");

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    // Should check all 4 providers, not just Slack and Coda
    expect(result.checked).toBe(4);
    expect(result.ok).toBe(4);
    expect(result.failed).toBe(0);
    expect(result.results.map((r) => r.provider).sort()).toEqual(
      ["CODA", "HUBSPOT", "SLACK", "STRIPE"].sort()
    );
  });

  it("probes Google Workspace OAuth connections with the Gmail profile endpoint", async () => {
    mockConnections.set("GOOGLE_WORKSPACE", { provider: "GOOGLE_WORKSPACE", accessToken: "enc_google_workspace", status: "CONNECTED" });
    mockGetCredentials.mockResolvedValue({ googleWorkspaceAccessToken: "google-workspace-token" });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ emailAddress: "founder@example.com" }), { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.failed).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer google-workspace-token",
        }),
      }),
    );
    expect(mockGetValidToken).not.toHaveBeenCalled();
  });

  it("marks Google Workspace as ERROR when the profile probe fails", async () => {
    mockConnections.set("GOOGLE_WORKSPACE", { provider: "GOOGLE_WORKSPACE", accessToken: "enc_google_workspace", status: "CONNECTED" });
    mockGetCredentials.mockResolvedValue({ googleWorkspaceAccessToken: "google-workspace-token" });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Request had insufficient authentication scopes." }), { status: 403 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      provider: "GOOGLE_WORKSPACE",
      ok: false,
      message: "Google Workspace health check failed (403): Request had insufficient authentication scopes.",
    });

    expect(mockUpdatedConnections.get("GOOGLE_WORKSPACE")).toEqual({
      status: "ERROR",
      lastError: "Google Workspace health check failed (403): Request had insufficient authentication scopes.",
    });
  });

  it("marks connection as ERROR when access token is missing", async () => {
    mockConnections.set("HUBSPOT", { provider: "HUBSPOT", accessToken: "", status: "CONNECTED" });

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.failed).toBe(1);
    expect(result.results[0].message).toBe("Missing access token");
  });

  it("probes PostHog token providers with an authenticated project request", async () => {
    mockConnections.set("POSTHOG", { provider: "POSTHOG", accessToken: "enc_posthog", status: "CONNECTED" });
    mockGetCredentials.mockResolvedValue({
      posthogApiKey: "posthog-token",
      posthogProjectId: "12345",
      posthogHost: "https://us.posthog.com",
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 12345 }), { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.ok).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://us.posthog.com/api/projects/12345",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer posthog-token",
        }),
      }),
    );
  });

  it("probes Linear token providers with GraphQL viewer", async () => {
    mockConnections.set("LINEAR", { provider: "LINEAR", accessToken: "enc_linear", status: "CONNECTED" });
    mockGetCredentials.mockResolvedValue({ linearApiKey: "linear-token" });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: { viewer: { id: "viewer_1" } } }), { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.ok).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.linear.app/graphql",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "linear-token",
        }),
      }),
    );
  });

  it("probes GitHub token providers against the configured repository", async () => {
    mockConnections.set("GITHUB", { provider: "GITHUB", accessToken: "enc_github", status: "CONNECTED" });
    mockGetCredentials.mockResolvedValue({
      githubToken: "github-token",
      githubOwner: "example",
      githubRepo: "imladris",
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ full_name: "example/imladris" }), { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.ok).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/imladris",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer github-token",
        }),
      }),
    );
  });

  it("probes SEMrush token providers with the configured domain", async () => {
    mockConnections.set("SEMRUSH", { provider: "SEMRUSH", accessToken: "enc_semrush", status: "CONNECTED" });
    mockGetCredentials.mockResolvedValue({
      semrushApiToken: "semrush-token",
      semrushDomain: "example.com",
    });
    global.fetch = vi.fn(async () =>
      new Response("Or;Ot\n10;250", { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.ok).toBe(1);
    const calledUrl = String(vi.mocked(global.fetch).mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("https://api.semrush.com/");
    expect(calledUrl).toContain("key=semrush-token");
    expect(calledUrl).toContain("domain=example.com");
  });

  it("checks env-managed token providers without existing connection rows", async () => {
    mockGetCredentials.mockResolvedValue({
      semrushApiToken: "semrush-token",
      semrushDomain: "example.com",
    });
    global.fetch = vi.fn(async () =>
      new Response("Or;Ot\n10;250", { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "SEMRUSH",
        ok: true,
        message: null,
      },
    ]);
    expect(mockUpsertedConnections.get("SEMRUSH")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Pylon credentials without an existing connection row", async () => {
    const { verifyPylonApiToken } = await import("@/lib/integrations/oauth");
    mockGetCredentials.mockResolvedValue({
      pylonApiKey: "pylon-env-token",
    });

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "PYLON",
        ok: true,
        message: null,
      },
    ]);
    expect(verifyPylonApiToken).toHaveBeenCalledWith("pylon-env-token");
    expect(mockUpsertedConnections.get("PYLON")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Coda credentials without an existing connection row", async () => {
    const { verifyCodaApiToken } = await import("@/lib/integrations/oauth");
    mockGetCredentials.mockResolvedValue({
      codaApiToken: "coda-env-token",
      codaDocId: "dCoda123",
    });

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "CODA",
        ok: true,
        message: null,
      },
    ]);
    expect(verifyCodaApiToken).toHaveBeenCalledWith("coda-env-token");
    expect(mockUpsertedConnections.get("CODA")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Stripe credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      stripeKey: "sk_test_env",
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "acct_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "STRIPE",
        ok: true,
        message: null,
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/account",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_env",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("STRIPE")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed HubSpot credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      hubspotToken: "pat-na1-env",
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ portalId: 123456 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "HUBSPOT",
        ok: true,
        message: null,
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/account-info/v3/details",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer pat-na1-env",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("HUBSPOT")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed collaboration credentials without existing connection rows", async () => {
    mockGetCredentials.mockResolvedValue({
      googleWorkspaceAccessToken: "google-workspace-token",
      slackAccessToken: "slack-token",
    });
    mockGetValidToken.mockRejectedValue(new Error("Integration is not connected"));
    global.fetch = vi.fn(async (input: string | URL | Request) =>
      new Response(
        JSON.stringify(
          String(input).includes("gmail.googleapis.com")
            ? { emailAddress: "founder@example.com", messagesTotal: 10, threadsTotal: 4 }
            : { ok: true },
        ),
        {
        status: 200,
        headers: { "Content-Type": "application/json" },
        },
      ),
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results.map((entry) => entry.provider).sort()).toEqual([
      "GOOGLE_WORKSPACE",
      "SLACK",
    ]);
    expect(mockGetValidToken).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer google-workspace-token",
        }),
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "https://slack.com/api/auth.test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer slack-token",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("GOOGLE_WORKSPACE")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
    expect(mockUpsertedConnections.get("SLACK")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Mercury credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      mercuryKey: "mercury-env-token",
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ accounts: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "MERCURY",
        ok: true,
        message: null,
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.mercury.com/api/v1/accounts?limit=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mercury-env-token",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("MERCURY")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Google Ads credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      googleAdsDevToken: "google-ads-dev-token",
      googleAdsCustomerId: "123-456-7890",
      googleAdsRefreshToken: "google-ads-refresh-token",
      googleAdsClientId: "google-client-id",
      googleAdsClientSecret: "google-client-secret",
      googleAdsLoginCustomerId: "999-888-7777",
    });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlText = String(url);
      if (urlText === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "google-ads-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify([{ results: [] }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "GOOGLE_ADS",
        ok: true,
        message: null,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://googleads.googleapis.com/v21/customers/1234567890/googleAds:searchStream",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer google-ads-access-token",
          "developer-token": "google-ads-dev-token",
          "login-customer-id": "9998887777",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("GOOGLE_ADS")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Google Search Console credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      searchConsoleAccessToken: "gsc-env-token",
      searchConsoleSiteUrl: "https://example.com/",
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ rows: [] }), { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "GOOGLE_SEARCH_CONSOLE",
        ok: true,
        message: null,
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gsc-env-token",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("GOOGLE_SEARCH_CONSOLE")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Google Analytics credentials without an existing connection row", async () => {
    process.env.GA_REFRESH_TOKEN = "ga-refresh-token";
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    mockGetCredentials.mockResolvedValue({
      gaPropertyId: "123456",
      gaClientEmail: null,
      gaPrivateKey: null,
    });

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const urlText = String(url);
      if (urlText === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "ga-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "GOOGLE_ANALYTICS",
        ok: true,
        message: null,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer ga-access-token",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("GOOGLE_ANALYTICS")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Meta Ads credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      metaAdsAccessToken: "meta-ads-env-token",
      metaAdAccountId: "act_12345",
    });
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/act_12345/insights")) {
        return new Response(JSON.stringify({ data: [{ spend: "0", impressions: "0", clicks: "0" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "META_ADS",
        ok: true,
        message: null,
      },
    ]);
    expect(String(vi.mocked(global.fetch).mock.calls[0]?.[0])).toContain(
      "https://graph.facebook.com/v21.0/act_12345/insights",
    );
    expect(vi.mocked(global.fetch).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: {
          Authorization: "Bearer meta-ads-env-token",
        },
      }),
    );
    expect(mockUpsertedConnections.get("META_ADS")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Meta Page credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      metaPageAccessToken: "meta-page-env-token",
      metaPageId: "page_123",
    });
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/me/accounts")) {
        return new Response(
          JSON.stringify({ data: [{ id: "page_123", access_token: "page-scoped-token" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname.endsWith("/page_123") && !url.pathname.endsWith("/page_123/posts")) {
        return new Response(JSON.stringify({ fan_count: 10, followers_count: 12 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "META_PAGE",
        ok: true,
        message: null,
      },
    ]);
    expect(String(vi.mocked(global.fetch).mock.calls[0]?.[0])).toContain(
      "https://graph.facebook.com/v21.0/me/accounts",
    );
    expect(vi.mocked(global.fetch).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: {
          Authorization: "Bearer meta-page-env-token",
        },
      }),
    );
    expect(mockUpsertedConnections.get("META_PAGE")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Meta Instagram credentials without requiring a Page ID", async () => {
    mockGetCredentials.mockResolvedValue({
      metaPageAccessToken: "meta-page-env-token",
      metaPageId: null,
      metaInstagramAccountId: "ig_123",
    });
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/ig_123")) {
        return new Response(
          JSON.stringify({
            id: "ig_123",
            username: "imladris",
            followers_count: 42,
            media_count: 3,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.pathname.endsWith("/ig_123/media")) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "META_PAGE",
        ok: true,
        message: null,
      },
    ]);
    expect(String(vi.mocked(global.fetch).mock.calls[0]?.[0])).toContain(
      "https://graph.facebook.com/v21.0/ig_123",
    );
    expect(vi.mocked(global.fetch).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: {
          Authorization: "Bearer meta-page-env-token",
        },
      }),
    );
    expect(mockUpsertedConnections.get("META_PAGE")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Webflow credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      webflowApiToken: "webflow-env-token",
      webflowSiteId: "site_123",
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "site_123", displayName: "Imladris" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "WEBFLOW",
        ok: true,
        message: null,
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.webflow.com/v2/sites/site_123",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer webflow-env-token",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("WEBFLOW")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("checks env-managed Reddit Ads credentials without an existing connection row", async () => {
    mockGetCredentials.mockResolvedValue({
      redditClientId: "reddit-client",
      redditClientSecret: "reddit-secret",
      redditRefreshToken: "reddit-refresh-token",
      redditAdAccountId: "t2_account",
      redditUserAgent: "imladris-health-test/1.0",
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const urlText = String(input);
      if (urlText === "https://www.reddit.com/api/v1/access_token") {
        return new Response(JSON.stringify({ access_token: "reddit-access-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: urlText.endsWith("/reports") ? { metrics: [] } : [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "REDDIT",
        ok: true,
        message: null,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.reddit.com/api/v1/access_token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Basic cmVkZGl0LWNsaWVudDpyZWRkaXQtc2VjcmV0",
          "User-Agent": "imladris-health-test/1.0",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ads-api.reddit.com/api/v3/ad_accounts/t2_account/campaigns",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer reddit-access-token",
          "User-Agent": "imladris-health-test/1.0",
        }),
      }),
    );
    expect(mockUpsertedConnections.get("REDDIT")).toEqual({
      status: "CONNECTED",
      lastError: null,
      accessToken: "env-managed",
    });
  });

  it("probes Unify token providers with an authenticated records request", async () => {
    process.env.UNIFY_FUNNEL_OBJECT_NAME = "Contact";
    mockConnections.set("UNIFY", { provider: "UNIFY", accessToken: "enc_unify", status: "CONNECTED" });
    mockGetCredentials.mockResolvedValue({});
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.ok).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.unifygtm.com/data/v1/objects/Contact/records",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "decrypted_token",
        }),
      }),
    );
  });

  it("marks token provider as ERROR when its authenticated probe fails", async () => {
    mockConnections.set("LINEAR", { provider: "LINEAR", accessToken: "enc_linear", status: "CONNECTED" });
    mockGetCredentials.mockResolvedValue({ linearApiKey: "linear-token" });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ errors: [{ message: "Invalid API key" }] }), { status: 200 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      provider: "LINEAR",
      ok: false,
      message: expect.stringContaining("Linear GraphQL error"),
    });
    expect(mockUpdatedConnections.get("LINEAR")).toEqual({
      status: "ERROR",
      lastError: expect.stringContaining("Linear GraphQL error"),
    });
  });

  it("recreates a missing connection row when health status persistence races a deleted row", async () => {
    mockConnections.set("GOOGLE_WORKSPACE", { provider: "GOOGLE_WORKSPACE", accessToken: "enc_google_workspace", status: "CONNECTED" });
    mockMissingUpdateProviders.add("GOOGLE_WORKSPACE");
    mockGetCredentials.mockResolvedValue({ googleWorkspaceAccessToken: "google-workspace-token" });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Request had insufficient authentication scopes." }), { status: 403 })
    ) as typeof global.fetch;

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      provider: "GOOGLE_WORKSPACE",
      ok: false,
      message: "Google Workspace health check failed (403): Request had insufficient authentication scopes.",
    });
    expect(mockUpsertedConnections.get("GOOGLE_WORKSPACE")).toEqual({
      status: "ERROR",
      lastError: "Google Workspace health check failed (403): Request had insufficient authentication scopes.",
      accessToken: "enc_google_workspace",
    });
  });

  it("continues checking providers when persisting one provider health status fails", async () => {
    mockConnections.set("SLACK", { provider: "SLACK", accessToken: "enc_slack", status: "CONNECTED" });
    mockConnections.set("HUBSPOT", { provider: "HUBSPOT", accessToken: "enc_hubspot", status: "CONNECTED" });
    mockUpdateFailureProviders.add("SLACK");
    mockGetValidToken.mockResolvedValue("valid_token");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(2);
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results).toEqual([
      {
        provider: "SLACK",
        ok: false,
        message: "Health status persistence failed: health status write failed",
      },
      {
        provider: "HUBSPOT",
        ok: true,
        message: null,
      },
    ]);
    expect(mockUpdatedConnections.get("HUBSPOT")).toEqual({
      status: "CONNECTED",
      lastError: null,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "integration.health_check.status_persist_failed",
      expect.objectContaining({
        userId: "user_1",
        provider: "SLACK",
        error: "health status write failed",
      }),
    );
    consoleError.mockRestore();
  });
});

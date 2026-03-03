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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: vi.fn(async (args: { where: { userId: string; status: string } }) => {
        return Array.from(mockConnections.values())
          .filter((c) => c.status === args.where.status)
          .map((c) => ({
            ...c,
            userId: "user_1",
          }));
      }),
      update: vi.fn(async (args: {
        where: { userId_provider: { userId: string; provider: string } };
        data: { status: string; lastError: string | null; lastSyncedAt: Date | null };
      }) => {
        mockUpdatedConnections.set(args.where.userId_provider.provider, {
          status: args.data.status,
          lastError: args.data.lastError,
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
    const tokenProviders = ["CODA", "PYLON", "SEMRUSH"];
    if (oauthProviders.includes(provider)) return { authType: "oauth" };
    if (tokenProviders.includes(provider)) return { authType: "token" };
    return null;
  }),
}));

describe("runIntegrationHealthChecks (extended)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockConnections.clear();
    mockUpdatedConnections.clear();
    mockGetValidToken.mockReset();
    vi.clearAllMocks();

    // Mock global.fetch so checkSlack() doesn't hit the real Slack API
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ) as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
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

  it("uses token lifecycle check for OAuth providers without dedicated endpoint", async () => {
    mockConnections.set("HUBSPOT", { provider: "HUBSPOT", accessToken: "enc_hubspot", status: "CONNECTED" });
    mockGetValidToken.mockResolvedValue("refreshed_token");

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    await runIntegrationHealthChecks({ userId: "user_1" });

    expect(mockGetValidToken).toHaveBeenCalledWith({
      userId: "user_1",
      provider: "HUBSPOT",
    });
  });

  it("marks OAuth provider as ERROR when token refresh fails", async () => {
    mockConnections.set("STRIPE", { provider: "STRIPE", accessToken: "enc_stripe", status: "CONNECTED" });
    mockGetValidToken.mockRejectedValue(new Error("Refresh token is missing"));

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.checked).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      provider: "STRIPE",
      ok: false,
      message: "Refresh token is missing",
    });

    expect(mockUpdatedConnections.get("STRIPE")).toEqual({
      status: "ERROR",
      lastError: "Refresh token is missing",
    });
  });

  it("marks connection as ERROR when access token is missing", async () => {
    mockConnections.set("HUBSPOT", { provider: "HUBSPOT", accessToken: "", status: "CONNECTED" });

    const { runIntegrationHealthChecks } = await import("@/lib/integrations/health-checks");
    const result = await runIntegrationHealthChecks({ userId: "user_1" });

    expect(result.failed).toBe(1);
    expect(result.results[0].message).toBe("Missing access token");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationConnection: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("Imladris provider analytics credentials", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.POSTHOG_API_KEY = "phx_env";
    process.env.POSTHOG_PROJECT_ID = "12345";
    process.env.POSTHOG_HOST = "https://us.posthog.com";
    process.env.LINEAR_API_KEY = "lin_env";
    process.env.GITHUB_TOKEN = "ghp_env";
    process.env.GITHUB_REPO_OWNER = "example";
    process.env.GITHUB_REPO_NAME = "imladris";
    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL = "https://example.com/";
    process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN = "gsc_env";
  });

  afterEach(() => {
    delete process.env.POSTHOG_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;
    delete process.env.POSTHOG_HOST;
    delete process.env.LINEAR_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPO_OWNER;
    delete process.env.GITHUB_REPO_NAME;
    delete process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL;
    delete process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN;
  });

  it("resolves Imladris env credentials for scheduled source sync", async () => {
    const { getCredentials, hasIntegrationCredential } = await import(
      "@/lib/analytics/credentials"
    );

    const credentials = await getCredentials();

    expect(credentials).toEqual(expect.objectContaining({
      posthogApiKey: "phx_env",
      posthogProjectId: "12345",
      posthogHost: "https://us.posthog.com",
      linearApiKey: "lin_env",
      githubToken: "ghp_env",
      githubOwner: "example",
      githubRepo: "imladris",
      searchConsoleSiteUrl: "https://example.com/",
      searchConsoleAccessToken: "gsc_env",
    }));
    for (const provider of [
      IntegrationProvider.POSTHOG,
      IntegrationProvider.LINEAR,
      IntegrationProvider.GITHUB,
      IntegrationProvider.GOOGLE_SEARCH_CONSOLE,
    ]) {
      expect(hasIntegrationCredential(provider, credentials)).toBe(true);
      expect(credentials.freshness[provider]).toEqual(expect.objectContaining({
        provider,
        source: "env",
      }));
    }
  });

  it("requires the full Reddit Ads credential set before marking Reddit configured", async () => {
    const { hasIntegrationCredential } = await import("@/lib/analytics/credentials");

    expect(
      hasIntegrationCredential(IntegrationProvider.REDDIT, {
        redditRefreshToken: "refresh-only",
      } as never),
    ).toBe(false);
    expect(
      hasIntegrationCredential(IntegrationProvider.REDDIT, {
        redditClientId: "client-id",
        redditClientSecret: "client-secret",
        redditRefreshToken: "refresh-token",
        redditAdAccountId: "ad-account",
      } as never),
    ).toBe(true);
  });

  it("requires both a Coda API token and doc ID before marking Coda configured", async () => {
    const { hasIntegrationCredential } = await import("@/lib/analytics/credentials");

    expect(
      hasIntegrationCredential(IntegrationProvider.CODA, {
        codaApiToken: "token-only",
        codaDocId: null,
      } as never),
    ).toBe(false);
    expect(
      hasIntegrationCredential(IntegrationProvider.CODA, {
        codaApiToken: "coda-token",
        codaDocId: "dCoda123",
      } as never),
    ).toBe(true);
  });

  it("requires provider-specific resource IDs before marking SEMrush and Webflow configured", async () => {
    const { hasIntegrationCredential } = await import("@/lib/analytics/credentials");

    expect(
      hasIntegrationCredential(IntegrationProvider.SEMRUSH, {
        semrushApiToken: "semrush-token",
        semrushDomain: null,
      } as never),
    ).toBe(false);
    expect(
      hasIntegrationCredential(IntegrationProvider.SEMRUSH, {
        semrushApiToken: "semrush-token",
        semrushDomain: "example.com",
      } as never),
    ).toBe(true);

    expect(
      hasIntegrationCredential(IntegrationProvider.WEBFLOW, {
        webflowApiToken: "webflow-token",
        webflowSiteId: null,
      } as never),
    ).toBe(false);
    expect(
      hasIntegrationCredential(IntegrationProvider.WEBFLOW, {
        webflowApiToken: "webflow-token",
        webflowSiteId: "site_123",
      } as never),
    ).toBe(true);
  });
});
